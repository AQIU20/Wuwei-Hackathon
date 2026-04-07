# 硬件 Agent 接入 — 开发计划

> 最终目标：开放兼容一切硬件的 Context Platform（见 `open-source.md`）
> 当前目标：跑通自有 ESP32 硬件，完成黑客松 Demo

---

## 两阶段策略

```
黑客松（现在）          开源版（之后）
────────────────        ──────────────────────────────
写死的几种硬件    →     Capability Schema 驱动，零改代码接新硬件
8个手写 MCP tool  →     Schema 动态生成 tool
接 Aila           →     任何支持 MCP 的 Agent 都能接
```

**原则：黑客松阶段不走死路。** 凡是"写死"的部分，都要能在第二阶段用 Schema 替换，不提前过度设计，但也不埋下拆不掉的债。

---

## 黑客松阶段

### 架构

```
ESP32 硬件
  └── MQTT / UDP / WebSocket
        └── PC Host Service (Python asyncio)
              ├── Registry + EventBus
              ├── Storage (SQLite)
              └── MCP Server (stdio)
                    └── 任何 MCP 客户端（Aila / Claude Desktop / Cursor）
```

---

### Phase 1 — 项目骨架

```
host/
├── requirements.txt
├── config.py
├── main.py
├── registry/
│   ├── models.py
│   ├── node_registry.py
│   └── port_pool.py
├── bus/
│   └── event_bus.py
├── transport/
│   ├── mqtt_client.py
│   ├── udp_server.py
│   └── ws_server.py
├── storage/
│   ├── db.py
│   ├── sensor_store.py
│   └── snapshot_store.py
├── mcp_server/
│   └── server.py
├── schemas/              ← 提前建好，黑客松先手写，之后驱动系统
│   ├── heart_rate.json
│   ├── imu.json
│   ├── temperature.json
│   ├── humidity.json
│   ├── formaldehyde.json
│   ├── camera.json
│   ├── microphone.json
│   ├── light.json
│   └── vibration.json
└── skill/
    └── hardware-bridge/
        └── SKILL.md
```

**`schemas/` 目录现在不驱动任何逻辑**，但从第一天就要写好。它是黑客松现场展示开放性的证明，也是第二阶段的起点。

**系统依赖：**
```bash
brew install mosquitto
pip install aiomqtt websockets mcp aiosqlite pydantic
```

---

### Phase 2 — 核心基础设施

纯内存，无 I/O，可独立测试。

| 文件 | 说明 | Spec |
|------|------|------|
| `config.py` | 全局配置 | §3.2 |
| `registry/models.py` | ModuleInfo / ModuleType / Event | §3.3 |
| `registry/port_pool.py` | 动态端口分配 | §3.4 |
| `registry/node_registry.py` | 注册、下线、心跳、查询 | §3.5 |
| `bus/event_bus.py` | 发布/订阅，asyncio.Queue | §3.6 |

**完成标志：** register → heartbeat → unregister 流程能跑。

---

### Phase 3 — 传输层

| 文件 | 说明 | Spec |
|------|------|------|
| `transport/mqtt_client.py` | 订阅 `blocks/#`，处理 announce/data/status/heartbeat | §3.7 |
| `transport/udp_server.py` | 接收 UDP 视频帧，缓存最新帧 | §3.8 |
| `transport/ws_server.py` | 为每个流媒体模块动态开 WS server | §3.9 |

**注意：** 接到真实硬件前，先用 `mosquitto_sub -t "blocks/#" -v` 抓一遍原始消息，确认 announce 格式和 spec 一致再动代码。

**完成标志：** `mosquitto_pub` 发 announce → Host 控制台打印注册成功 + 回复 config。

---

### Phase 4 — 持久化存储

| 文件 | 说明 | Spec |
|------|------|------|
| `storage/db.py` | SQLite 初始化，WAL 模式 | §3.10.1 |
| `storage/sensor_store.py` | 批量写入，定时 flush，历史查询 | §3.10.2 |
| `storage/snapshot_store.py` | JPEG 存文件，元数据进 SQLite | §3.10.3 |

**IMU 注意：** 默认 50ms 采集，日存储 172MB。先在 `config.py` 里把 IMU interval 改成 200ms，降到 43MB/天。

**完成标志：** `mosquitto_pub` 发传感器数据，`sqlite3` 能查到记录。

---

### Phase 5 — 主入口串联

`main.py` 把所有组件组合起来（参考 spec §3.11）：

- config / port_pool / registry / bus / db / stores / transports 全部初始化
- 事件处理：module_online → 启 WS server + 写 DB；sensor_data → 写 sensor_store
- `asyncio.gather` 同时跑所有服务

**完成标志：** 传感器上线 → 上报数据 → 下线，全流程 DB 有记录。

---

### Phase 6 — MCP Server

8 个手写 tool（参考 spec §4.3），对接所有支持 MCP 的客户端：

| Tool | 说明 |
|------|------|
| `list_modules` | 列在线模块 |
| `read_sensor` | 读最新传感器数据（内存） |
| `read_all_sensors` | 读所有传感器 |
| `query_sensor_history` | 查历史数据 |
| `control_actuator` | 控制灯光/振动 |
| `get_camera_snapshot` | 取最新摄像头帧（base64 JPEG） |
| `list_snapshots` | 查历史快照 |
| `get_system_status` | 系统整体状态 |

**重要：MCP Server 不绑定任何特定 Agent。** Aila / Claude Desktop / Cursor 都能接，这本身就是开放性的证明。

**黑客松演示亮点：** 现场让 Claude Desktop 通过 MCP 接入，展示"第三方 Agent 也能用"。

**完成标志：** `mcporter call hw.list_modules` 返回在线模块。

---

### Phase 7 — Capability Schema（黑客松展示用）

在 `schemas/` 目录为每种已有硬件写 Schema，格式示例：

```json
{
  "capability": "heart_rate",
  "type": "sensor",
  "transport": "mqtt",
  "data": {
    "bpm": { "type": "number", "unit": "bpm", "description": "Heart rate" },
    "spo2": { "type": "number", "unit": "%", "description": "Blood oxygen" }
  },
  "ui": {
    "widget": "line_chart",
    "label": "Heart Rate"
  },
  "llm_description": "Real-time heart rate and blood oxygen sensor. Use read_sensor to get current values."
}
```

**黑客松阶段：** Schema 只是静态文件，不驱动代码。展示时说明"接入新硬件只需提交一个 Schema"。

**完成标志：** 9 个 Schema 文件写完，能在 Demo 时展示。

---

### Phase 8 — SKILL.md + Agent 接入

`skill/hardware-bridge/SKILL.md` 告诉 Agent 有哪些 tool、什么时候用（参考 spec §5.1）。

在 `openclaw.json` 加 MCP 配置（参考 spec §5.2）。

**完成标志：** 跟 Agent 说"现在心率多少"，Agent 返回口语化结果。

---

### 调试速查

```bash
# 启动 Broker
mosquitto -v

# 监听所有消息（接真实硬件前先跑这个）
mosquitto_sub -h localhost -t "blocks/#" -v

# 模拟心率传感器上线
mosquitto_pub -h localhost -t "blocks/heart_01/announce" \
  -m '{"block_id":"heart_01","type":"sensor","capability":"heart_rate","chip":"ESP32-C3","firmware":"1.0.0","battery":90}'

# 模拟数据上报
mosquitto_pub -h localhost -t "blocks/heart_01/data" \
  -m '{"ts":1712345678123,"values":{"bpm":72}}'

# 测试 MCP
mcporter call hw.list_modules
mcporter call hw.read_sensor block_id=heart_01
```

---

## 开源阶段（黑客松之后）

黑客松结束后，`schemas/` 目录里的 Schema 文件开始驱动系统，三件事依次做：

### Step 1 — Context Service

在现有 registry 上加一层统一 REST API：

```
GET /blocks/{id}/context
→ 返回统一格式的 Context Snapshot，屏蔽底层 MQTT/UDP/WS 差异
```

任何硬件、任何协议，对外永远是同一套格式。

### Step 2 — Schema 驱动的动态 Tool 生成

MCP Server 启动时读 `schemas/` 目录，自动生成对应的 tool：
- 有 heart_rate.json → 自动有 `read_heart_rate` tool
- 有 light.json → 自动有 `control_light` tool

接入新硬件：写一个 Schema 文件，重启服务，tool 自动出现。

### Step 3 — 被动触发（Context Stream）

Agent 订阅 Context Stream，心率超阈值时主动发起对话，不需要用户先问。

---

## 已知风险

| 风险 | 处理 |
|------|------|
| 真实硬件 announce 格式与 spec 不符 | 接硬件前先 `mosquitto_sub` 抓原始消息，对比后改解析 |
| UDP 多摄像头帧混淆 | 每个摄像头分配独立 UDP 端口，port_pool 已支持 |
| IMU 写入量大 | config 里 IMU interval 改 200ms |
| MCP Server 进程隔离 | stdio 模式需单独起进程，不能和 main.py 同跑 |

---

## 阶段总结

```
黑客松阶段（现在）
  Phase 1  骨架 + schemas/ 目录
  Phase 2  注册表 + 事件总线
  Phase 3  MQTT 传输层（最先验证的路径）
  Phase 4  持久化存储
  Phase 5  main.py 串联
  Phase 6  MCP Server（8个手写tool，不绑定Agent）
  Phase 7  Capability Schema 文件（展示用）
  Phase 8  SKILL.md + 接入 Aila

开源阶段（之后）
  Step 1   Context Service REST API
  Step 2   Schema 驱动动态生成 tool
  Step 3   被动触发 / Context Stream
```
