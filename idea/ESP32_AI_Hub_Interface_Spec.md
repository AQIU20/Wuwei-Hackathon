# ESP32 AI Hub — 数据接口规范文档

**版本：** v1.0  
**日期：** 2026-04-08  
**作者：** GloveAI Lab  

---

## 目录

1. [系统架构概览](#1-系统架构概览)
2. [节点分类与公共属性](#2-节点分类与公共属性)
3. [MQTT 接口规范](#3-mqtt-接口规范)
   - 3.1 Topic 命名规则
   - 3.2 公共消息格式（信封结构）
   - 3.3 心跳 / 上线 / 下线
   - 3.4 传感器数据上报（各节点）
   - 3.5 控制指令下发
   - 3.6 WS2812 灯环控制
   - 3.7 节点信息查询响应
4. [RESTful 接口规范（AI层 ↔ 中台层）](#4-restful-接口规范)
   - 4.1 基础约定
   - 4.2 节点管理
   - 4.3 传感器数据查询
   - 4.4 控制指令下发
   - 4.5 音视频流接入
   - 4.6 AI 推理结果写回
5. [流媒体接口（非MQTT）](#5-流媒体接口非mqtt)
6. [错误码定义](#6-错误码定义)
7. [数据字典 / 枚举值](#7-数据字典--枚举值)
8. [安全与鉴权建议](#8-安全与鉴权建议)
9. [附录：完整 Topic 速查表](#9-附录完整-topic-速查表)

---

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        AI 服务层                             │
│   LLM / CV模型 / 语音识别 / 健康分析 / 行为推理引擎           │
│               ↕  RESTful API (JSON/HTTP)                     │
├─────────────────────────────────────────────────────────────┤
│                      中台服务层（远程服务器）                  │
│   MQTT Broker │ REST API Server │ 时序数据库 │ 流媒体入口     │
│        ↕ MQTT (传感/控制)           ↕ TCP/HTTP (流媒体)       │
├──────────────────────────┬──────────────────────────────────┤
│      ESP32-C3 节点群      │         ESP32-S3 节点群           │
│  传统传感器 (MQTT上报)    │  CAM + MIC + Speaker (流媒体)    │
│  MPU6050 / PIR / BMP     │  OV2640 摄像头 → TCP/RTSP        │
│  MAX30102 / AHT / SGP30  │  I2S MIC → TCP 音频流            │
│  语音唤醒节点             │  I2S Speaker ← TTS 音频流        │
└──────────────────────────┴──────────────────────────────────┘
```

**数据流向原则：**
- 传感器数据：节点 → MQTT Broker → 服务器订阅消费 → 存储/推送AI层
- 控制指令：AI层/业务层 → REST API → 服务器 → MQTT Publish → 节点执行
- 音视频流：节点 → TCP/HTTP 直连服务器流媒体入口（不走MQTT）
- AI推理结果：AI层 → REST API 写回 → 服务器 → MQTT 下发至相关节点

---

## 2. 节点分类与公共属性

### 2.1 节点 ID 规则

```
node_id = "{type}_{mac_suffix_6}"
示例：
  c3_a1b2c3   ← ESP32-C3 节点
  s3_d4e5f6   ← ESP32-S3 节点
```

### 2.2 节点类型枚举

| type_code | 描述 | 芯片 |
|-----------|------|------|
| `imu` | 姿态节点 MPU6050 | C3 |
| `pir` | 人体红外感测 | C3 |
| `baro` | 气压计节点 BMP280/BMP388 | C3 |
| `hrox` | 心率血氧 MAX30102 | C3 |
| `env` | 温湿度 AHT20 | C3 |
| `gas` | 空气质量 SGP30 | C3 |
| `vad` | 语音唤醒/音频采集 | C3 |
| `cam` | 摄像头节点 OV2640 | S3 |
| `avhub` | 音视频综合节点（CAM+MIC+SPK）| S3 |

### 2.3 节点公共信息结构

每个节点均维护以下公共状态，随心跳或查询响应上报：

```json
{
  "node_id": "imu_a1b2c3",
  "node_type": "imu",
  "fw_version": "1.2.0",
  "net": {
    "ip": "192.168.1.105",
    "ssid": "HomeNet_5G",
    "rssi": -62,
    "mac": "AA:BB:CC:A1:B2:C3"
  },
  "last_online": "2026-04-08T10:23:45Z",
  "uptime_s": 3620,
  "led": {
    "mode": "heartbeat",
    "color": "#00FF88",
    "brightness": 128
  },
  "battery_mv": 3850
}
```

---

## 3. MQTT 接口规范

### 3.1 Topic 命名规则

```
基础格式：
  aihub/{scope}/{node_id}/{subject}

scope:
  status    ← 节点状态/心跳
  sensor    ← 传感器数据上报
  cmd       ← 控制指令（服务器→节点）
  resp      ← 节点响应指令结果
  event     ← 节点主动上报事件
  ai        ← AI推理结果下发

示例：
  aihub/status/imu_a1b2c3/heartbeat
  aihub/sensor/hrox_d4e5f6/data
  aihub/cmd/imu_a1b2c3/led
  aihub/event/pir_b3c4d5/trigger
  aihub/ai/imu_a1b2c3/gesture_result
```

**通配订阅（服务器侧）：**

```
aihub/sensor/#          ← 订阅所有节点传感器数据
aihub/status/#          ← 订阅所有节点状态
aihub/event/#           ← 订阅所有事件
aihub/resp/imu_a1b2c3/# ← 订阅特定节点响应
```

### 3.2 公共消息信封结构

所有 MQTT 消息 payload 均为 **UTF-8 编码 JSON**，遵循以下信封：

```json
{
  "v": 1,
  "ts": 1744123456789,
  "node_id": "imu_a1b2c3",
  "msg_id": "a1b2c3d4",
  "type": "sensor_data",
  "payload": { }
}
```

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `v` | int | ✅ | 协议版本，当前为 1 |
| `ts` | int64 | ✅ | Unix 时间戳（毫秒） |
| `node_id` | string | ✅ | 发送节点 ID |
| `msg_id` | string | ✅ | 消息唯一ID（8位hex），用于去重/响应关联 |
| `type` | string | ✅ | 消息类型，见枚举 |
| `payload` | object | ✅ | 具体数据，各类型定义见下文 |

**消息 QoS 策略：**

| 场景 | QoS | Retain |
|------|-----|--------|
| 传感器周期上报 | 0 | false |
| 心跳 | 0 | false |
| 上线 LWT | 1 | true |
| 控制指令 | 1 | false |
| 事件告警 | 1 | false |
| AI推理结果 | 1 | false |

---

### 3.3 心跳 / 上线 / 下线

#### 3.3.1 节点上线（LWT + 主动上线）

**Topic：** `aihub/status/{node_id}/online`  
**QoS：** 1，**Retain：** true

```json
{
  "v": 1,
  "ts": 1744123456789,
  "node_id": "imu_a1b2c3",
  "msg_id": "00000001",
  "type": "online",
  "payload": {
    "node_type": "imu",
    "fw_version": "1.2.0",
    "net": {
      "ip": "192.168.1.105",
      "ssid": "HomeNet_5G",
      "rssi": -62,
      "mac": "AA:BB:CC:A1:B2:C3"
    },
    "led": { "mode": "boot", "color": "#FFFFFF", "brightness": 100 },
    "reset_reason": "power_on"
  }
}
```

#### 3.3.2 节点下线（LWT遗嘱）

**Topic：** `aihub/status/{node_id}/offline`  
**QoS：** 1，**Retain：** true  
（节点连接时预设 LWT，断线由 Broker 自动发布）

```json
{
  "v": 1,
  "ts": 0,
  "node_id": "imu_a1b2c3",
  "msg_id": "00000000",
  "type": "offline",
  "payload": {
    "reason": "lwt"
  }
}
```

#### 3.3.3 心跳

**Topic：** `aihub/status/{node_id}/heartbeat`  
**QoS：** 0，周期：30s

```json
{
  "v": 1,
  "ts": 1744123486789,
  "node_id": "imu_a1b2c3",
  "msg_id": "a1b2c301",
  "type": "heartbeat",
  "payload": {
    "uptime_s": 3620,
    "free_heap": 142336,
    "rssi": -65,
    "battery_mv": 3820,
    "led": { "mode": "heartbeat", "color": "#00FF88", "brightness": 80 }
  }
}
```

---

### 3.4 传感器数据上报

#### 3.4.1 姿态节点 — MPU6050

**Topic：** `aihub/sensor/imu_{id}/data`  
**上报周期：** 100ms（可配置）

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "mpu6050",
    "accel": { "x": 0.12, "y": -0.03, "z": 9.81 },
    "gyro":  { "x": 0.002, "y": -0.001, "z": 0.005 },
    "temp_c": 28.5,
    "attitude": {
      "roll":  2.1,
      "pitch": -0.5,
      "yaw":   178.3
    }
  }
}
```

> 单位：加速度 m/s²，角速度 rad/s，角度 degrees

#### 3.4.2 人体红外感测节点 — PIR

**Topic：** `aihub/event/pir_{id}/trigger`（事件驱动，非周期）  
**上报周期：** 状态变化时触发

```json
{
  "type": "event",
  "payload": {
    "sensor": "pir",
    "detected": true,
    "state_changed_at": 1744123456789
  }
}
```

**周期状态上报（60s一次）：**  
**Topic：** `aihub/sensor/pir_{id}/data`

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "pir",
    "detected": false,
    "last_trigger_ts": 1744123400000
  }
}
```

#### 3.4.3 气压计节点 — BMP280/BMP388

**Topic：** `aihub/sensor/baro_{id}/data`  
**上报周期：** 5s

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "bmp388",
    "pressure_hpa": 1013.25,
    "temp_c": 25.3,
    "altitude_m": 42.1
  }
}
```

#### 3.4.4 心率血氧节点 — MAX30102

**Topic：** `aihub/sensor/hrox_{id}/data`  
**上报周期：** 1s（手指在位时）

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "max30102",
    "finger_detected": true,
    "heart_rate_bpm": 72,
    "spo2_pct": 98.5,
    "ir_raw": 180234,
    "red_raw": 152890,
    "signal_quality": "good"
  }
}
```

`signal_quality` 枚举：`"good"` | `"fair"` | `"poor"` | `"invalid"`

#### 3.4.5 温湿度节点 — AHT20

**Topic：** `aihub/sensor/env_{id}/data`  
**上报周期：** 10s

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "aht20",
    "temp_c": 23.6,
    "humidity_pct": 58.2
  }
}
```

#### 3.4.6 空气质量节点 — SGP30

**Topic：** `aihub/sensor/gas_{id}/data`  
**上报周期：** 1s（预热后）

```json
{
  "type": "sensor_data",
  "payload": {
    "sensor": "sgp30",
    "tvoc_ppb": 42,
    "eco2_ppm": 512,
    "h2_raw": 13172,
    "ethanol_raw": 18234,
    "baseline_tvoc": 36864,
    "baseline_eco2": 36864,
    "warm_up": false
  }
}
```

#### 3.4.7 语音节点 — v1 摘要事件

v1 约定:
- 原始音频流不进入当前 cloud agent runtime。
- 节点本地完成 VAD / 语音识别。
- 服务器只接收 MQTT 事件摘要，直接复用 `aihub/event/#` 链路。

#### 3.4.7.1 VAD 事件

**Topic：** `aihub/event/vad_{id}/vad`

```json
{
  "v": 1,
  "ts": 1744123456789,
  "node_id": "vad_a1b2c3",
  "msg_id": "a1b2c3d4",
  "type": "vad",
  "payload": {
    "active": true,
    "confidence": 0.92,
    "rms": 0.021,
    "duration_ms": 1640,
    "sample_rate": 16000,
    "channel_count": 1,
    "node_type": "vad"
  }
}
```

#### 3.4.7.2 Transcript 事件

**Topic：** `aihub/event/vad_{id}/transcript`

```json
{
  "v": 1,
  "ts": 1744123456891,
  "node_id": "vad_a1b2c3",
  "msg_id": "b2c3d4e5",
  "type": "transcript",
  "payload": {
    "text": "turn the lights into sunset mode",
    "confidence": 0.91,
    "language": "en",
    "duration_ms": 1640,
    "rms": 0.021,
    "node_type": "vad"
  }
}
```

#### 3.4.7.3 可选唤醒词事件

**Topic：** `aihub/event/vad_{id}/wakeword`

```json
{
  "v": 1,
  "ts": 1744123456901,
  "node_id": "vad_a1b2c3",
  "msg_id": "c3d4e5f6",
  "type": "wakeword",
  "payload": {
    "wakeword": "hey_hub",
    "confidence": 0.94,
    "node_type": "vad"
  }
}
```

> 当前版本不要求上传原始 PCM / WebSocket 音频。
> 如果需要实时回放、双向语音或 TTS 下行，再启用单独的流媒体接口版本。

---

### 3.5 控制指令下发

**Topic：** `aihub/cmd/{node_id}/{action}`  
**QoS：** 1，节点收到后发布响应至 `aihub/resp/{node_id}/{action}`

#### 3.5.1 通用指令格式

```json
{
  "v": 1,
  "ts": 1744123456789,
  "node_id": "imu_a1b2c3",
  "msg_id": "cmd000001",
  "type": "cmd",
  "payload": {
    "action": "set_report_interval",
    "params": { "interval_ms": 200 }
  }
}
```

#### 3.5.2 常用指令列表

| action | 适用节点 | 说明 | params 示例 |
|--------|----------|------|-------------|
| `set_report_interval` | 所有 | 设置上报间隔 | `{"interval_ms": 500}` |
| `set_led` | 所有 | 控制灯环 | 见3.6节 |
| `reboot` | 所有 | 重启节点 | `{"delay_ms": 1000}` |
| `ota_update` | 所有 | 触发OTA | `{"url": "http://..."}` |
| `get_info` | 所有 | 主动获取节点信息 | `{}` |
| `set_threshold` | pir/hrox | 设置告警阈值 | `{"hr_min": 50, "hr_max": 120}` |
| `sgp30_set_baseline` | gas | 设置基准值 | `{"tvoc": 36864, "eco2": 36864}` |
| `cam_set_quality` | cam/avhub | 设置摄像头参数 | `{"res": "VGA", "fps": 15, "quality": 10}` |
| `cam_snapshot` | cam/avhub | 请求单帧截图 | `{"upload_url": "http://..."}` |

#### 3.5.3 指令响应格式

**Topic：** `aihub/resp/{node_id}/{action}`

```json
{
  "v": 1,
  "ts": 1744123456999,
  "node_id": "imu_a1b2c3",
  "msg_id": "cmd000001",
  "type": "cmd_resp",
  "payload": {
    "action": "set_report_interval",
    "success": true,
    "code": 0,
    "message": "ok",
    "data": {}
  }
}
```

失败响应示例：

```json
{
  "payload": {
    "action": "cam_set_quality",
    "success": false,
    "code": 4003,
    "message": "unsupported resolution",
    "data": {}
  }
}
```

---

### 3.6 WS2812 灯环控制

**Topic：** `aihub/cmd/{node_id}/set_led`

灯环共 8 颗 LED，支持以下模式：

```json
{
  "type": "cmd",
  "payload": {
    "action": "set_led",
    "params": {
      "mode": "static",
      "color": "#FF0000",
      "brightness": 128,
      "segment": null
    }
  }
}
```

**mode 枚举说明：**

| mode | 描述 | 附加参数 |
|------|------|----------|
| `off` | 全部熄灭 | — |
| `static` | 静态颜色 | `color`, `brightness` |
| `heartbeat` | 慢闪（心跳） | `color`, `brightness` |
| `blink` | 快闪 | `color`, `brightness`, `period_ms` |
| `breathe` | 呼吸灯 | `color`, `brightness`, `period_ms` |
| `rainbow` | 彩虹轮转 | `brightness`, `speed` |
| `progress` | 进度条（1-8颗） | `color`, `count: 1~8` |
| `alert` | 告警红闪 | `brightness` |
| `custom` | 逐颗自定义 | `leds: [{idx,color,brightness}, ...]` |

**segment 字段：** 可选，指定只控制部分 LED，格式：`[0, 3]`（索引0~7，含头尾）。

**预定义状态映射（节点侧实现）：**

| 系统状态 | 灯效 | 颜色 |
|----------|------|------|
| 启动中 | breathe | 蓝 `#0066FF` |
| 正常运行 | heartbeat | 绿 `#00FF66` |
| 数据上报 | 单次闪 | 青 `#00FFFF` |
| OTA升级 | progress滚动 | 黄 `#FFAA00` |
| 告警/错误 | alert | 红 `#FF0000` |
| AI推理中 | rainbow | — |
| 待机 | off | — |

---

### 3.7 AI 推理结果下发

**Topic：** `aihub/ai/{node_id}/{result_type}`

```json
{
  "v": 1,
  "ts": 1744123456789,
  "node_id": "imu_a1b2c3",
  "msg_id": "ai000042",
  "type": "ai_result",
  "payload": {
    "result_type": "gesture",
    "inference_id": "inf_20260408_001",
    "model": "gesture_v2",
    "latency_ms": 82,
    "result": {
      "label": "wave",
      "confidence": 0.91,
      "action": "toggle_light"
    }
  }
}
```

常用 `result_type`：

| result_type | 场景 |
|-------------|------|
| `gesture` | 姿态/动作识别结果 |
| `health_alert` | 健康异常告警 |
| `air_quality_alert` | 空气质量分析结论 |
| `presence` | 人体存在综合判断 |
| `face_id` | 人脸识别结果 |
| `speech_cmd` | 语音指令识别结果 |
| `tts_play` | 控制节点播报TTS音频 |

---

## 4. RESTful 接口规范

### 4.1 基础约定

```
Base URL:  https://api.aihub.local/v1

Content-Type: application/json
Authorization: Bearer <token>

响应格式：
{
  "code": 0,
  "message": "ok",
  "data": { },
  "ts": 1744123456789
}

分页参数（列表接口）：
  ?page=1&page_size=20
  响应中包含：{"total": 100, "page": 1, "page_size": 20}
```

### 4.2 节点管理

#### GET /nodes

获取所有节点列表。

**请求参数（Query）：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 过滤节点类型，如 `imu` |
| `online` | bool | `true` 只返回在线节点 |

**响应示例：**

```json
{
  "code": 0,
  "data": {
    "total": 6,
    "nodes": [
      {
        "node_id": "imu_a1b2c3",
        "node_type": "imu",
        "online": true,
        "last_online": "2026-04-08T10:23:45Z",
        "fw_version": "1.2.0",
        "net": { "ip": "192.168.1.105", "ssid": "HomeNet_5G", "rssi": -62 },
        "led": { "mode": "heartbeat", "color": "#00FF88", "brightness": 80 },
        "battery_mv": 3820
      }
    ]
  }
}
```

#### GET /nodes/{node_id}

获取单个节点详情（含完整传感器能力描述）。

```json
{
  "code": 0,
  "data": {
    "node_id": "hrox_c4d5e6",
    "node_type": "hrox",
    "capabilities": ["heart_rate", "spo2", "temperature"],
    "config": {
      "report_interval_ms": 1000,
      "hr_alert_min": 50,
      "hr_alert_max": 120,
      "spo2_alert_min": 95
    },
    "online": true,
    "last_online": "2026-04-08T10:23:45Z",
    "net": { "ip": "192.168.1.108", "ssid": "HomeNet_5G", "rssi": -55, "mac": "..." },
    "led": { "mode": "heartbeat", "color": "#00FF88", "brightness": 80 },
    "uptime_s": 7200,
    "free_heap": 130000,
    "battery_mv": 3900,
    "fw_version": "1.2.0"
  }
}
```

#### PATCH /nodes/{node_id}/config

更新节点配置（将通过 MQTT cmd 下发至设备，异步生效）。

**请求体：**

```json
{
  "report_interval_ms": 500,
  "hr_alert_max": 130
}
```

**响应：**

```json
{
  "code": 0,
  "data": {
    "cmd_msg_id": "cmd000099",
    "status": "dispatched"
  }
}
```

#### POST /nodes/{node_id}/reboot

重启节点。

```json
请求体：{ "delay_ms": 2000 }
```

#### POST /nodes/{node_id}/ota

触发 OTA 升级。

```json
请求体：{ "firmware_url": "https://cdn.aihub.local/fw/imu_v1.3.0.bin", "md5": "abc123..." }
```

---

### 4.3 传感器数据查询

#### GET /sensor-data/{node_id}/latest

获取节点最新一次传感器数据（从时序库实时查询）。

```json
{
  "code": 0,
  "data": {
    "node_id": "imu_a1b2c3",
    "ts": 1744123456789,
    "sensor": "mpu6050",
    "accel": { "x": 0.12, "y": -0.03, "z": 9.81 },
    "gyro":  { "x": 0.002, "y": -0.001, "z": 0.005 },
    "attitude": { "roll": 2.1, "pitch": -0.5, "yaw": 178.3 }
  }
}
```

#### GET /sensor-data/{node_id}/history

查询历史时序数据。

**请求参数（Query）：**

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `start` | ISO8601 | ✅ | 开始时间 |
| `end` | ISO8601 | ✅ | 结束时间 |
| `fields` | string | ❌ | 逗号分隔字段，如 `heart_rate_bpm,spo2_pct` |
| `downsample` | string | ❌ | 降采样规则，如 `1m:mean` |

```json
{
  "code": 0,
  "data": {
    "node_id": "hrox_c4d5e6",
    "start": "2026-04-08T09:00:00Z",
    "end": "2026-04-08T10:00:00Z",
    "points": [
      { "ts": 1744119600000, "heart_rate_bpm": 72, "spo2_pct": 98.5 },
      { "ts": 1744119601000, "heart_rate_bpm": 73, "spo2_pct": 98.4 }
    ]
  }
}
```

#### GET /sensor-data/all/latest

批量获取所有节点最新数据快照（用于AI层轮询或仪表盘）。

```json
{
  "code": 0,
  "data": {
    "snapshot_ts": 1744123456789,
    "nodes": {
      "imu_a1b2c3": { "ts": 1744123456600, "attitude": {...} },
      "env_b2c3d4": { "ts": 1744123455000, "temp_c": 23.6, "humidity_pct": 58.2 },
      "gas_e5f6a7": { "ts": 1744123456100, "tvoc_ppb": 42, "eco2_ppm": 512 }
    }
  }
}
```

---

### 4.4 控制指令下发

#### POST /cmd/{node_id}

向指定节点下发控制指令（服务器 → MQTT → 节点）。

**请求体：**

```json
{
  "action": "set_led",
  "params": {
    "mode": "rainbow",
    "brightness": 128
  },
  "timeout_ms": 3000
}
```

**响应（同步等待节点ACK，超时返回dispatched）：**

```json
{
  "code": 0,
  "data": {
    "cmd_msg_id": "cmd000100",
    "status": "acked",
    "node_resp": {
      "success": true,
      "code": 0,
      "message": "ok"
    }
  }
}
```

`status` 枚举：`"acked"` | `"dispatched"` | `"timeout"` | `"node_offline"`

#### POST /cmd/broadcast

向多个节点或所有节点广播指令。

```json
{
  "target": "all",
  "action": "set_led",
  "params": { "mode": "alert" }
}
```

或指定部分节点：

```json
{
  "target": ["imu_a1b2c3", "env_b2c3d4"],
  "action": "set_report_interval",
  "params": { "interval_ms": 1000 }
}
```

---

### 4.5 音视频流接入

> 音视频流节点不走 MQTT，以下接口用于 AI 层获取流地址、控制参数。

#### GET /stream/{node_id}/info

获取流媒体节点当前状态及流入口信息。

```json
{
  "code": 0,
  "data": {
    "node_id": "avhub_d4e5f6",
    "online": true,
    "streams": {
      "video": {
        "type": "mjpeg",
        "url": "http://192.168.1.112:8080/stream",
        "resolution": "640x480",
        "fps": 15,
        "bitrate_kbps": 800
      },
      "audio": {
        "type": "pcm_tcp",
        "host": "192.168.1.112",
        "port": 8888,
        "sample_rate": 16000,
        "channels": 1,
        "bit_depth": 16
      }
    }
  }
}
```

#### POST /stream/{node_id}/video/config

调整摄像头参数（异步下发至节点）。

```json
请求体：{
  "resolution": "VGA",
  "fps": 20,
  "quality": 10,
  "awb": true,
  "aec": true
}
```

#### POST /stream/{node_id}/tts

向节点扬声器推送 TTS 播报任务。

```json
请求体：{
  "text": "检测到有人进入，欢迎回来",
  "lang": "zh-CN",
  "speed": 1.0,
  "volume": 0.8
}
```

或推送音频文件（WAV/MP3 URL）：

```json
请求体：{
  "audio_url": "https://cdn.aihub.local/audio/alert_001.wav",
  "volume": 1.0
}
```

#### POST /stream/{node_id}/snapshot

请求摄像头节点拍摄并上传单帧截图。

```json
请求体：{ "upload_to": "s3://bucket/snapshots/{node_id}/{ts}.jpg" }
响应体：{ "code": 0, "data": { "url": "https://cdn.../snapshot.jpg", "ts": 1744123456789 } }
```

---

### 4.6 AI 推理结果写回

AI 层完成推理后，通过以下接口将结果回写到中台，中台再通过 MQTT 下发至相关节点或存储。

#### POST /ai/inference-result

```json
{
  "inference_id": "inf_20260408_001",
  "source_node": "imu_a1b2c3",
  "model": "gesture_v2",
  "result_type": "gesture",
  "latency_ms": 82,
  "result": {
    "label": "wave",
    "confidence": 0.91
  },
  "actions": [
    {
      "type": "mqtt_publish",
      "topic": "aihub/ai/imu_a1b2c3/gesture_result",
      "payload": { "label": "wave", "action": "toggle_light" }
    },
    {
      "type": "node_cmd",
      "node_id": "avhub_d4e5f6",
      "action": "tts_play",
      "params": { "text": "检测到挥手，正在执行操作" }
    }
  ]
}
```

`actions` 字段可选，支持同时触发多个联动动作，中台统一执行。

#### POST /ai/health-report

健康分析专用写回（MAX30102 / AHT / SGP30 综合分析结论）。

```json
{
  "report_id": "health_20260408_0923",
  "node_id": "hrox_c4d5e6",
  "ts_start": "2026-04-08T09:00:00Z",
  "ts_end": "2026-04-08T10:00:00Z",
  "metrics": {
    "avg_hr": 73.2,
    "min_hr": 60,
    "max_hr": 98,
    "avg_spo2": 98.3,
    "hrv_ms": 42.5
  },
  "alerts": [
    { "level": "warn", "code": "HR_HIGH", "message": "心率短时偏高，建议休息" }
  ],
  "actions": []
}
```

---

## 5. 流媒体接口（非MQTT）

音视频流数据因实时性和带宽要求，不经过 MQTT，采用以下方案：

### 5.1 视频流（ESP32-S3 → 服务器）

| 方案 | 协议 | 端口 | 说明 |
|------|------|------|------|
| MJPEG HTTP | HTTP | 8080 | 节点起HTTP Server，服务器主动拉流 |
| JPEG over TCP | TCP | 8080 | 自定义帧格式，服务器连接拉取 |

**TCP 帧格式（自定义协议）：**

```
+--------+--------+--------+--------+--------+--- ... ---+
| Magic  | TS(8B) | Frame# | Len(4B)|  JPEG Payload      |
| 0xABCD | uint64 | uint32 | uint32 |  <Len bytes>       |
+--------+--------+--------+--------+--------+--- ... ---+
```

### 5.2 音频流（ESP32 MIC → 服务器）

**协议：** TCP，服务器监听，节点主动连接

**帧格式：**

```
+--------+--------+--------+--------+--- ... ---+
| Magic  | TS(8B) | SeqNum | Len(4B)| PCM Data  |
| 0xA1B2 | uint64 | uint32 | uint32 | <Len bytes>|
+--------+--------+--------+--------+--- ... ---+
```

参数约定：16000Hz，单声道，16-bit PCM（小端）

### 5.3 TTS 音频流（服务器 → ESP32 Speaker）

- 服务器将 TTS 合成后的 WAV/PCM 通过 TCP 推送至节点
- 节点接收完毕后通过 I2S DAC 播放
- 控制通过 REST POST /stream/{id}/tts 触发（见4.5节）

### 5.4 节点流地址注册

节点上线时，若具备流能力，在 MQTT 上线消息 `payload` 中额外附带：

```json
"streams": {
  "video": { "port": 8080, "type": "tcp_jpeg" },
  "audio_in": { "port": 8888, "type": "pcm_tcp" },
  "audio_out": { "port": 9000, "type": "pcm_tcp_push" }
}
```

服务器根据节点 IP + port 建立流连接。

---

## 6. 错误码定义

### MQTT 指令响应错误码

| code | 说明 |
|------|------|
| 0 | 成功 |
| 1001 | 未知 action |
| 1002 | 参数缺失 |
| 1003 | 参数值非法 |
| 2001 | 传感器读取失败 |
| 2002 | 传感器未就绪 |
| 3001 | OTA URL不可访问 |
| 3002 | OTA MD5校验失败 |
| 3003 | OTA写入Flash失败 |
| 4001 | 摄像头初始化失败 |
| 4002 | 流媒体连接断开 |
| 4003 | 不支持的分辨率 |
| 5001 | LED参数非法 |
| 9999 | 内部错误 |

### REST API 错误码

| code | HTTP Status | 说明 |
|------|-------------|------|
| 0 | 200 | 成功 |
| 40001 | 400 | 请求参数错误 |
| 40101 | 401 | 未授权 |
| 40301 | 403 | 无权限 |
| 40401 | 404 | 节点不存在 |
| 40901 | 409 | 节点离线，指令无法下发 |
| 50001 | 500 | 服务器内部错误 |
| 50401 | 504 | 等待节点ACK超时 |

---

## 7. 数据字典 / 枚举值

### signal_quality

`"good"` — 信号质量良好，数据可信  
`"fair"` — 信号一般，数据供参考  
`"poor"` — 信号差，数据不可靠  
`"invalid"` — 无效（手指未放置等）

### reset_reason

`"power_on"` | `"hw_reset"` | `"sw_reset"` | `"wdt"` | `"brownout"` | `"unknown"`

### cam_resolution

`"QQVGA"` (160x120) | `"QVGA"` (320x240) | `"VGA"` (640x480) | `"SVGA"` (800x600) | `"XGA"` (1024x768) | `"SXGA"` (1280x1024)

### 时间格式

- 所有 REST 接口时间字段使用 **ISO 8601 UTC** 格式：`2026-04-08T10:23:45Z`
- 所有 MQTT payload 内 `ts` 字段使用 **Unix 时间戳（毫秒）**

---

## 8. 安全与鉴权建议

### MQTT 安全

- Broker 启用 **TLS（端口8883）**，节点使用 CA 证书验证
- 每个节点配置独立 **ClientID + 用户名/密码**
- 使用 ACL 规则限制节点只能发布自身 topic，不能发布他人的
- 敏感指令（OTA/reboot）增加 **HMAC-SHA256 签名验证字段**

```json
"security": {
  "nonce": "a1b2c3d4",
  "sig": "hmac_sha256(secret, node_id + action + nonce + ts)"
}
```

### REST API 安全

- 所有接口走 **HTTPS**，服务端证书 TLS 1.2+
- 使用 **JWT Bearer Token** 鉴权，AI 层和业务层分配不同权限 scope
- 控制类接口（POST /cmd, POST /nodes/*/reboot）需 `scope: control`
- 数据查询接口需 `scope: read`
- Rate Limiting：控制接口 10 req/s，数据查询 100 req/s

---

## 9. 附录：完整 Topic 速查表

| Topic | 方向 | QoS | 触发 |
|-------|------|-----|------|
| `aihub/status/{node_id}/online` | 节点→服务器 | 1 | 上线 |
| `aihub/status/{node_id}/offline` | Broker→服务器 | 1 | LWT |
| `aihub/status/{node_id}/heartbeat` | 节点→服务器 | 0 | 30s周期 |
| `aihub/sensor/imu_{id}/data` | 节点→服务器 | 0 | 100ms周期 |
| `aihub/sensor/baro_{id}/data` | 节点→服务器 | 0 | 5s周期 |
| `aihub/sensor/hrox_{id}/data` | 节点→服务器 | 0 | 1s周期 |
| `aihub/sensor/env_{id}/data` | 节点→服务器 | 0 | 10s周期 |
| `aihub/sensor/gas_{id}/data` | 节点→服务器 | 0 | 1s周期 |
| `aihub/sensor/pir_{id}/data` | 节点→服务器 | 0 | 60s周期 |
| `aihub/event/pir_{id}/trigger` | 节点→服务器 | 1 | 状态变化 |
| `aihub/event/vad_{id}/wakeword` | 节点→服务器 | 1 | 唤醒词触发 |
| `aihub/cmd/{node_id}/set_led` | 服务器→节点 | 1 | 主动下发 |
| `aihub/cmd/{node_id}/set_report_interval` | 服务器→节点 | 1 | 主动下发 |
| `aihub/cmd/{node_id}/reboot` | 服务器→节点 | 1 | 主动下发 |
| `aihub/cmd/{node_id}/ota_update` | 服务器→节点 | 1 | 主动下发 |
| `aihub/cmd/{node_id}/get_info` | 服务器→节点 | 1 | 主动下发 |
| `aihub/resp/{node_id}/{action}` | 节点→服务器 | 1 | 指令ACK |
| `aihub/ai/{node_id}/gesture_result` | 服务器→节点 | 1 | AI推理完成 |
| `aihub/ai/{node_id}/health_alert` | 服务器→节点 | 1 | AI推理完成 |
| `aihub/ai/{node_id}/speech_cmd` | 服务器→节点 | 1 | ASR完成 |
| `aihub/ai/{node_id}/tts_play` | 服务器→节点 | 1 | TTS触发 |

---

*文档版本：v1.0 | 最后更新：2026-04-08*  
*如需扩展节点类型或新增传感器，请在本文档基础上追加章节，保持 topic 命名与信封格式一致。*
