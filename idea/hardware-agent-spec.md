# AI 硬件 Agent 软件方案

> 硬件模块化感知/执行系统 → PC Host 服务 → MCP Server → OpenClaw Agent

---

## 1. 系统总览

### 1.1 目标

将分布式 ESP32 硬件模块（传感器 + 执行器 + 音视频流）接入 OpenClaw 个人 AI Agent，实现：

- 用户通过 Telegram / WeChat / WebChat 等渠道与 Agent 对话
- Agent 能感知所有在线硬件模块状态
- Agent 能读取传感器数据（心率、姿态、环境、甲醛等）
- Agent 能控制执行器（灯光颜色、振动模式）
- Agent 能获取摄像头快照并结合视觉模型推理
- Agent 能通过语音模块与用户实时对话

### 1.2 架构分层

```
┌─────────────────────────────────────────────────┐
│  Layer 4: OpenClaw Agent                        │
│  SOUL.md + SKILL.md + Gateway + LLM             │
│  ↕  MCP (stdio / SSE)                           │
├─────────────────────────────────────────────────┤
│  Layer 3: MCP Server                            │
│  将硬件能力封装为标准 MCP tools                   │
│  ↕  内部 Python API 调用                         │
├─────────────────────────────────────────────────┤
│  Layer 2: PC Host Service                       │
│  设备接入 · 生命周期管理 · 事件总线 · AI 管道     │
│  ↕  MQTT / UDP / WebSocket                      │
├─────────────────────────────────────────────────┤
│  Layer 1: Hardware Modules (ESP32-S3/C3)        │
│  传感器 · 执行器 · 摄像头 · 麦克风               │
└─────────────────────────────────────────────────┘
```

### 1.3 技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| 语言 | Python 3.11+ | asyncio 原生支持 |
| MQTT Broker | Mosquitto | 独立进程, 端口 1883 |
| MQTT 客户端 | aiomqtt | asyncio 原生 |
| WebSocket | websockets | 语音双向流 + 前端推送 |
| UDP | asyncio.DatagramProtocol | 视频帧接收 |
| MCP Server | mcp (Python SDK) | OpenClaw 集成 |
| 持久化 | SQLite + aiosqlite | 传感器时序数据 + 关键快照 |
| 前端 | FastAPI + WebSocket | 可视化调试面板 (可选) |
| ASR | Whisper API / FunASR | 语音转文字 |
| Vision | Claude Vision / GPT-4o | 图像理解 |
| OpenClaw | Gateway + SKILL.md | Agent 运行时 |

---

## 2. 协议约定 (与硬件对齐)

### 2.1 MQTT Topic 规范

```
blocks/{block_id}/announce     # 模块上线自报属性 (QoS 1)
blocks/{block_id}/config       # Host 下发配置指令 (QoS 1)
blocks/{block_id}/data         # 传感器数据上报 (QoS 1)
blocks/{block_id}/status       # LWT 离线通知 (QoS 1)
blocks/{block_id}/heartbeat    # 心跳 (QoS 0)
```

### 2.2 Announce 消息格式

模块上电连接 WiFi + MQTT 后, 立即 publish 到 `blocks/{block_id}/announce`:

```json
{
  "block_id": "heart_01",
  "type": "sensor",
  "capability": "heart_rate",
  "firmware": "1.0.3",
  "chip": "ESP32-C3",
  "battery": 85
}
```

`type` 枚举值:
- `sensor` — 传感器类 (心率、姿态、温湿度、甲醛)
- `stream` — 流媒体类 (摄像头、麦克风)
- `actuator` — 执行器类 (灯光、振动)

`capability` 枚举值:

| capability | type | chip | 通信方式 |
|-----------|------|------|---------|
| `heart_rate` | sensor | C3 | MQTT pub |
| `imu` | sensor | C3 | MQTT pub |
| `temperature` | sensor | C3 | MQTT pub |
| `humidity` | sensor | C3 | MQTT pub |
| `formaldehyde` | sensor | C3 | MQTT pub |
| `camera` | stream | S3 | UDP / 动态 WS |
| `microphone` | stream | S3 | 动态 WS (双向) |
| `light` | actuator | C3 | MQTT sub |
| `vibration` | actuator | C3 | MQTT sub |

### 2.3 Config 消息格式

Host 解析 announce 后, publish 到 `blocks/{block_id}/config`:

传感器类:
```json
{
  "channel": "mqtt",
  "interval": 100
}
```

流媒体类:
```json
{
  "channel": "ws",
  "port": 8801
}
```

或 UDP 模式:
```json
{
  "channel": "udp",
  "port": 5601
}
```

### 2.4 传感器数据格式

publish 到 `blocks/{block_id}/data`:

```json
{
  "ts": 1712345678123,
  "values": {
    "bpm": 72
  }
}
```

各传感器 `values` 字段:

| capability | values 示例 |
|-----------|------------|
| heart_rate | `{"bpm": 72, "spo2": 98}` |
| imu | `{"ax": 0.1, "ay": -0.3, "az": 9.8, "gx": 0, "gy": 0, "gz": 0}` |
| temperature | `{"temp_c": 24.5}` |
| humidity | `{"rh": 55.2}` |
| formaldehyde | `{"hcho_mg": 0.03}` |

### 2.5 执行器控制格式

Host publish 到 `blocks/{block_id}/data`:

```json
{
  "action": "set_color",
  "params": {"r": 255, "g": 0, "b": 0, "brightness": 80}
}
```

| capability | action | params |
|-----------|--------|--------|
| light | `set_color` | `{"r":0-255, "g":0-255, "b":0-255, "brightness":0-100}` |
| light | `set_pattern` | `{"pattern": "breathing", "color": "red", "speed": 1.0}` |
| light | `off` | `{}` |
| vibration | `pulse` | `{"intensity": 0-100, "duration_ms": 500}` |
| vibration | `pattern` | `{"pattern": "heartbeat", "duration_ms": 2000}` |
| vibration | `off` | `{}` |

### 2.6 LWT (遗嘱) 约定

模块连接 MQTT Broker 时注册:

- Will Topic: `blocks/{block_id}/status`
- Will Payload: `offline`
- Will QoS: 1
- Will Retain: true

---

## 3. PC Host Service (Layer 2)

### 3.1 项目结构

```
host/
├── main.py                  # 入口, asyncio 事件循环
├── config.py                # 全局配置
├── transport/
│   ├── __init__.py
│   ├── mqtt_client.py       # MQTT 接入
│   ├── udp_server.py        # UDP 视频帧接收
│   └── ws_server.py         # WebSocket 音频流 + 动态端口
├── registry/
│   ├── __init__.py
│   ├── models.py            # 数据模型
│   ├── node_registry.py     # 节点注册表
│   └── port_pool.py         # 端口池
├── bus/
│   ├── __init__.py
│   └── event_bus.py         # 内部事件总线
├── storage/
│   ├── __init__.py
│   ├── db.py                # SQLite 初始化 + 连接管理
│   ├── sensor_store.py      # 传感器时序数据存储
│   └── snapshot_store.py    # 关键快照存储 (摄像头帧 + AI 推理结果)
├── pipeline/
│   ├── __init__.py
│   ├── asr.py               # 语音识别
│   ├── vision.py            # 视觉推理
│   └── intent.py            # 意图编排
├── mcp_server/
│   ├── __init__.py
│   └── server.py            # MCP Server (Layer 3)
├── frontend/
│   ├── __init__.py
│   └── ws_push.py           # 前端 WebSocket :3000
├── skill/
│   └── hardware-bridge/
│       └── SKILL.md         # OpenClaw Skill 定义
└── requirements.txt
```

### 3.2 全局配置

```python
# config.py
from dataclasses import dataclass, field

@dataclass
class Config:
    # MQTT
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic_root: str = "blocks"

    # UDP
    udp_port: int = 5600

    # 动态端口池
    port_range_start: int = 8800
    port_range_end: int = 8899

    # 前端
    frontend_ws_port: int = 3000

    # 持久化
    db_path: str = "data/hardware.db"
    snapshot_dir: str = "data/snapshots"
    # 传感器数据保留天数 (超过自动清理)
    sensor_retention_days: int = 30
    # 传感器数据降采样: 原始数据保留小时数, 之后自动聚合为分钟级
    sensor_raw_retention_hours: int = 24

    # 心跳超时 (秒)
    heartbeat_timeout: float = 30.0

    # 传感器默认采集间隔 (ms)
    default_intervals: dict = field(default_factory=lambda: {
        "heart_rate": 500,
        "imu": 50,
        "temperature": 2000,
        "humidity": 2000,
        "formaldehyde": 5000,
    })

    # AI Pipeline
    asr_provider: str = "whisper"   # whisper / funASR
    vision_provider: str = "claude"  # claude / gpt4o
    llm_provider: str = "claude"     # claude / openai
```

### 3.3 数据模型

```python
# registry/models.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Any
import time

class ModuleType(str, Enum):
    SENSOR = "sensor"
    STREAM = "stream"
    ACTUATOR = "actuator"

class ModuleStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    STALE = "stale"      # 心跳超时但未收到 LWT

@dataclass
class ModuleInfo:
    block_id: str
    module_type: ModuleType
    capability: str
    chip: str
    firmware: str
    battery: int
    status: ModuleStatus = ModuleStatus.ONLINE
    last_heartbeat: float = field(default_factory=time.time)
    last_data: Optional[dict] = None
    last_data_ts: Optional[float] = None
    assigned_port: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "block_id": self.block_id,
            "type": self.module_type.value,
            "capability": self.capability,
            "chip": self.chip,
            "firmware": self.firmware,
            "battery": self.battery,
            "status": self.status.value,
            "last_heartbeat": self.last_heartbeat,
            "last_data": self.last_data,
            "assigned_port": self.assigned_port,
        }

@dataclass
class Event:
    event_type: str   # module_online, module_offline, sensor_data,
                      # video_frame, audio_frame, control_cmd
    block_id: str
    timestamp: float = field(default_factory=time.time)
    payload: Any = None
```

### 3.4 端口池

```python
# registry/port_pool.py
import asyncio

class PortPool:
    def __init__(self, start: int, end: int):
        self._available: set[int] = set(range(start, end + 1))
        self._in_use: dict[str, int] = {}  # block_id -> port
        self._lock = asyncio.Lock()

    async def acquire(self, block_id: str) -> int:
        async with self._lock:
            if block_id in self._in_use:
                return self._in_use[block_id]
            if not self._available:
                raise RuntimeError("No available ports")
            port = self._available.pop()
            self._in_use[block_id] = port
            return port

    async def release(self, block_id: str) -> Optional[int]:
        async with self._lock:
            port = self._in_use.pop(block_id, None)
            if port is not None:
                self._available.add(port)
            return port

    @property
    def usage(self) -> dict:
        return {
            "available": len(self._available),
            "in_use": len(self._in_use),
            "assignments": dict(self._in_use),
        }
```

### 3.5 节点注册表

```python
# registry/node_registry.py
import asyncio
import time
import logging
from typing import Optional
from .models import ModuleInfo, ModuleType, ModuleStatus
from .port_pool import PortPool

logger = logging.getLogger(__name__)

class NodeRegistry:
    def __init__(self, port_pool: PortPool, heartbeat_timeout: float = 30.0):
        self._nodes: dict[str, ModuleInfo] = {}
        self._port_pool = port_pool
        self._heartbeat_timeout = heartbeat_timeout
        self._lock = asyncio.Lock()

    async def register(self, announce: dict) -> ModuleInfo:
        """处理 announce 消息, 注册新模块或更新已有模块."""
        block_id = announce["block_id"]
        async with self._lock:
            node = ModuleInfo(
                block_id=block_id,
                module_type=ModuleType(announce["type"]),
                capability=announce["capability"],
                chip=announce.get("chip", "unknown"),
                firmware=announce.get("firmware", "unknown"),
                battery=announce.get("battery", -1),
                status=ModuleStatus.ONLINE,
                last_heartbeat=time.time(),
            )
            # 流媒体类分配端口
            if node.module_type == ModuleType.STREAM:
                port = await self._port_pool.acquire(block_id)
                node.assigned_port = port
                logger.info(f"Assigned port {port} to stream module {block_id}")

            self._nodes[block_id] = node
            logger.info(f"Registered: {block_id} ({node.capability})")
            return node

    async def unregister(self, block_id: str) -> Optional[ModuleInfo]:
        """处理模块下线."""
        async with self._lock:
            node = self._nodes.get(block_id)
            if node is None:
                return None
            node.status = ModuleStatus.OFFLINE
            if node.assigned_port is not None:
                await self._port_pool.release(block_id)
                logger.info(f"Released port for {block_id}")
            logger.info(f"Unregistered: {block_id}")
            return node

    def update_heartbeat(self, block_id: str):
        node = self._nodes.get(block_id)
        if node:
            node.last_heartbeat = time.time()

    def update_data(self, block_id: str, data: dict):
        node = self._nodes.get(block_id)
        if node:
            node.last_data = data
            node.last_data_ts = time.time()

    def get(self, block_id: str) -> Optional[ModuleInfo]:
        return self._nodes.get(block_id)

    def list_online(self) -> list[ModuleInfo]:
        return [n for n in self._nodes.values()
                if n.status == ModuleStatus.ONLINE]

    def list_by_type(self, module_type: ModuleType) -> list[ModuleInfo]:
        return [n for n in self._nodes.values()
                if n.module_type == module_type
                and n.status == ModuleStatus.ONLINE]

    def list_by_capability(self, capability: str) -> list[ModuleInfo]:
        return [n for n in self._nodes.values()
                if n.capability == capability
                and n.status == ModuleStatus.ONLINE]

    async def check_stale(self):
        """定时任务: 检查心跳超时的模块."""
        now = time.time()
        async with self._lock:
            for node in self._nodes.values():
                if (node.status == ModuleStatus.ONLINE
                    and now - node.last_heartbeat > self._heartbeat_timeout):
                    node.status = ModuleStatus.STALE
                    logger.warning(f"Stale: {node.block_id} "
                                   f"(no heartbeat for "
                                   f"{now - node.last_heartbeat:.0f}s)")
```

### 3.6 事件总线

```python
# bus/event_bus.py
import asyncio
import logging
from typing import Callable, Awaitable
from registry.models import Event

logger = logging.getLogger(__name__)

# 订阅者回调类型
Subscriber = Callable[[Event], Awaitable[None]]

class EventBus:
    def __init__(self):
        # event_type -> [subscriber_callback, ...]
        self._subscribers: dict[str, list[Subscriber]] = {}
        self._queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=10000)

    def subscribe(self, event_type: str, callback: Subscriber):
        """注册某个 event_type 的消费者."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(callback)
        logger.debug(f"Subscriber added for '{event_type}'")

    def subscribe_all(self, callback: Subscriber):
        """注册接收所有事件的消费者 (用 '*' 作 key)."""
        self.subscribe("*", callback)

    async def publish(self, event: Event):
        """发布事件到总线."""
        await self._queue.put(event)

    async def run(self):
        """主循环: 从队列取事件, 分发给订阅者."""
        logger.info("EventBus started")
        while True:
            event = await self._queue.get()
            # 类型匹配的订阅者
            subscribers = self._subscribers.get(event.event_type, [])
            # 通配订阅者
            subscribers += self._subscribers.get("*", [])
            for cb in subscribers:
                try:
                    await cb(event)
                except Exception as e:
                    logger.error(f"Subscriber error on {event.event_type}: {e}")
            self._queue.task_done()
```

### 3.7 MQTT 接入

```python
# transport/mqtt_client.py
import json
import logging
import aiomqtt
from config import Config
from registry.node_registry import NodeRegistry
from bus.event_bus import EventBus
from registry.models import Event

logger = logging.getLogger(__name__)

class MQTTTransport:
    def __init__(self, config: Config, registry: NodeRegistry, bus: EventBus):
        self._config = config
        self._registry = registry
        self._bus = bus
        self._client: aiomqtt.Client | None = None

    async def run(self):
        """主循环: 连接 Broker, subscribe, 处理消息."""
        async with aiomqtt.Client(
            self._config.mqtt_host,
            self._config.mqtt_port,
        ) as client:
            self._client = client
            await client.subscribe(f"{self._config.mqtt_topic_root}/#", qos=1)
            logger.info(f"MQTT connected, subscribed to "
                        f"{self._config.mqtt_topic_root}/#")

            async for msg in client.messages:
                try:
                    await self._handle(msg)
                except Exception as e:
                    logger.error(f"MQTT handle error: {e}")

    async def _handle(self, msg: aiomqtt.Message):
        topic = str(msg.topic)
        parts = topic.split("/")
        if len(parts) < 3:
            return

        block_id = parts[1]
        msg_type = parts[2]

        if msg_type == "announce":
            payload = json.loads(msg.payload)
            node = await self._registry.register(payload)
            # 回复 config
            await self._send_config(node)
            # 发布上线事件
            await self._bus.publish(Event(
                event_type="module_online",
                block_id=block_id,
                payload=node.to_dict(),
            ))

        elif msg_type == "data":
            payload = json.loads(msg.payload)
            self._registry.update_data(block_id, payload.get("values", {}))
            await self._bus.publish(Event(
                event_type="sensor_data",
                block_id=block_id,
                payload=payload,
            ))

        elif msg_type == "status":
            text = msg.payload.decode()
            if text == "offline":
                node = await self._registry.unregister(block_id)
                await self._bus.publish(Event(
                    event_type="module_offline",
                    block_id=block_id,
                    payload=node.to_dict() if node else None,
                ))

        elif msg_type == "heartbeat":
            self._registry.update_heartbeat(block_id)

    async def _send_config(self, node):
        """根据模块类型下发配置."""
        topic = f"{self._config.mqtt_topic_root}/{node.block_id}/config"

        if node.module_type.value == "sensor":
            interval = self._config.default_intervals.get(
                node.capability, 1000
            )
            config = {"channel": "mqtt", "interval": interval}

        elif node.module_type.value == "stream":
            channel = "udp" if node.capability == "camera" else "ws"
            config = {"channel": channel, "port": node.assigned_port}

        elif node.module_type.value == "actuator":
            config = {"channel": "mqtt", "mode": "subscribe"}

        else:
            return

        await self._client.publish(topic, json.dumps(config), qos=1)
        logger.info(f"Config sent to {node.block_id}: {config}")

    async def publish_control(self, block_id: str, action: str, params: dict):
        """下发执行器控制指令."""
        topic = f"{self._config.mqtt_topic_root}/{block_id}/data"
        payload = json.dumps({"action": action, "params": params})
        await self._client.publish(topic, payload, qos=1)
        logger.info(f"Control sent to {block_id}: {action} {params}")
```

### 3.8 UDP 视频接收

```python
# transport/udp_server.py
import asyncio
import logging
from config import Config
from bus.event_bus import EventBus
from registry.models import Event

logger = logging.getLogger(__name__)

class VideoProtocol(asyncio.DatagramProtocol):
    def __init__(self, bus: EventBus):
        self._bus = bus
        self._loop = asyncio.get_event_loop()
        # 最新帧缓存: source_addr -> bytes
        self.latest_frames: dict[str, bytes] = {}

    def datagram_received(self, data: bytes, addr: tuple):
        source = f"{addr[0]}:{addr[1]}"
        self.latest_frames[source] = data
        # 异步发布事件
        self._loop.create_task(self._bus.publish(Event(
            event_type="video_frame",
            block_id=source,  # 后续可通过 registry 映射到 block_id
            payload={"size": len(data), "raw": data},
        )))

class UDPTransport:
    def __init__(self, config: Config, bus: EventBus):
        self._config = config
        self._bus = bus
        self._protocol: VideoProtocol | None = None

    async def run(self):
        loop = asyncio.get_event_loop()
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: VideoProtocol(self._bus),
            local_addr=("0.0.0.0", self._config.udp_port),
        )
        self._protocol = protocol
        logger.info(f"UDP server listening on :{self._config.udp_port}")
        # 保持运行
        try:
            await asyncio.Future()  # 永远不完成
        finally:
            transport.close()

    def get_latest_frame(self, source: str) -> bytes | None:
        if self._protocol:
            return self._protocol.latest_frames.get(source)
        return None
```

### 3.9 WebSocket 音频流

```python
# transport/ws_server.py
import asyncio
import logging
import websockets
from bus.event_bus import EventBus
from registry.models import Event

logger = logging.getLogger(__name__)

class WSTransport:
    def __init__(self, bus: EventBus):
        self._bus = bus
        # block_id -> websockets.WebSocketServerProtocol
        self._connections: dict[str, websockets.WebSocketServerProtocol] = {}
        # block_id -> server instance
        self._servers: dict[str, websockets.WebSocketServer] = {}

    async def start_stream_server(self, block_id: str, port: int):
        """为某个流媒体模块启动专用 WS server."""

        async def handler(ws):
            self._connections[block_id] = ws
            logger.info(f"Stream connected: {block_id} on :{port}")
            try:
                async for frame in ws:
                    await self._bus.publish(Event(
                        event_type="audio_frame",
                        block_id=block_id,
                        payload={"size": len(frame), "raw": frame},
                    ))
            except websockets.ConnectionClosed:
                pass
            finally:
                self._connections.pop(block_id, None)
                logger.info(f"Stream disconnected: {block_id}")

        server = await websockets.serve(handler, "0.0.0.0", port)
        self._servers[block_id] = server
        logger.info(f"WS stream server started for {block_id} on :{port}")

    async def stop_stream_server(self, block_id: str):
        server = self._servers.pop(block_id, None)
        if server:
            server.close()
            await server.wait_closed()
            logger.info(f"WS stream server stopped for {block_id}")
        self._connections.pop(block_id, None)

    async def send_to(self, block_id: str, data: bytes):
        """向某个模块的 WS 连接发送数据 (比如 TTS 音频下行)."""
        ws = self._connections.get(block_id)
        if ws:
            await ws.send(data)
```

### 3.10 持久化存储

#### 3.10.1 数据库初始化

```python
# storage/db.py
import aiosqlite
import os
import logging

logger = logging.getLogger(__name__)

async def init_db(db_path: str) -> aiosqlite.Connection:
    """初始化 SQLite 数据库, 创建表结构."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = await aiosqlite.connect(db_path)
    # WAL 模式: 允许读写并发, 不互相阻塞
    await db.execute("PRAGMA journal_mode=WAL")
    # 创建传感器数据表
    await db.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT NOT NULL,
            capability TEXT NOT NULL,
            ts REAL NOT NULL,
            values_json TEXT NOT NULL
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_sensor_block_ts
        ON sensor_data (block_id, ts DESC)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_sensor_cap_ts
        ON sensor_data (capability, ts DESC)
    """)
    # 创建聚合表 (分钟级)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data_agg (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT NOT NULL,
            capability TEXT NOT NULL,
            ts_minute REAL NOT NULL,
            avg_json TEXT NOT NULL,
            min_json TEXT NOT NULL,
            max_json TEXT NOT NULL,
            count INTEGER NOT NULL
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_agg_block_ts
        ON sensor_data_agg (block_id, ts_minute DESC)
    """)
    # 创建快照表
    await db.execute("""
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT NOT NULL,
            ts REAL NOT NULL,
            file_path TEXT NOT NULL,
            trigger TEXT NOT NULL,
            inference_result TEXT
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_snap_block_ts
        ON snapshots (block_id, ts DESC)
    """)
    # 创建模块上下线事件表
    await db.execute("""
        CREATE TABLE IF NOT EXISTS module_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            ts REAL NOT NULL,
            detail_json TEXT
        )
    """)
    await db.commit()
    logger.info(f"Database initialized: {db_path}")
    return db
```

#### 3.10.2 传感器数据存储

```python
# storage/sensor_store.py
import json
import time
import asyncio
import logging
from typing import Optional
import aiosqlite

logger = logging.getLogger(__name__)

class SensorStore:
    def __init__(self, db: aiosqlite.Connection, batch_size: int = 100,
                 flush_interval: float = 5.0):
        self._db = db
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._buffer: list[tuple] = []
        self._lock = asyncio.Lock()

    async def insert(self, block_id: str, capability: str,
                     ts: float, values: dict):
        """缓冲写入, 攒够一批或定时 flush."""
        async with self._lock:
            self._buffer.append((
                block_id, capability, ts, json.dumps(values)
            ))
            if len(self._buffer) >= self._batch_size:
                await self._flush()

    async def _flush(self):
        """批量写入数据库."""
        if not self._buffer:
            return
        batch = self._buffer[:]
        self._buffer.clear()
        await self._db.executemany(
            "INSERT INTO sensor_data (block_id, capability, ts, values_json) "
            "VALUES (?, ?, ?, ?)",
            batch,
        )
        await self._db.commit()
        logger.debug(f"Flushed {len(batch)} sensor records")

    async def flush_loop(self):
        """定时 flush 协程, 保证低频传感器的数据也能及时落盘."""
        while True:
            await asyncio.sleep(self._flush_interval)
            async with self._lock:
                await self._flush()

    async def query_latest(self, block_id: str) -> Optional[dict]:
        """查询某个传感器的最新一条数据."""
        cursor = await self._db.execute(
            "SELECT ts, values_json FROM sensor_data "
            "WHERE block_id = ? ORDER BY ts DESC LIMIT 1",
            (block_id,),
        )
        row = await cursor.fetchone()
        if row:
            return {"ts": row[0], "values": json.loads(row[1])}
        return None

    async def query_history(self, block_id: str,
                            start_ts: float, end_ts: float,
                            limit: int = 1000) -> list[dict]:
        """查询某个传感器在时间范围内的历史数据."""
        cursor = await self._db.execute(
            "SELECT ts, values_json FROM sensor_data "
            "WHERE block_id = ? AND ts >= ? AND ts <= ? "
            "ORDER BY ts ASC LIMIT ?",
            (block_id, start_ts, end_ts, limit),
        )
        rows = await cursor.fetchall()
        return [{"ts": r[0], "values": json.loads(r[1])} for r in rows]

    async def query_history_by_capability(self, capability: str,
                                          start_ts: float, end_ts: float,
                                          limit: int = 1000) -> list[dict]:
        """按 capability 查询所有同类传感器的历史数据."""
        cursor = await self._db.execute(
            "SELECT block_id, ts, values_json FROM sensor_data "
            "WHERE capability = ? AND ts >= ? AND ts <= ? "
            "ORDER BY ts ASC LIMIT ?",
            (capability, start_ts, end_ts, limit),
        )
        rows = await cursor.fetchall()
        return [{"block_id": r[0], "ts": r[1],
                 "values": json.loads(r[2])} for r in rows]

    async def get_stats(self, block_id: str,
                        start_ts: float, end_ts: float) -> Optional[dict]:
        """计算某个传感器在时间范围内的统计摘要 (count, 时间跨度)."""
        cursor = await self._db.execute(
            "SELECT COUNT(*), MIN(ts), MAX(ts) FROM sensor_data "
            "WHERE block_id = ? AND ts >= ? AND ts <= ?",
            (block_id, start_ts, end_ts),
        )
        row = await cursor.fetchone()
        if row and row[0] > 0:
            return {
                "count": row[0],
                "earliest": row[1],
                "latest": row[2],
                "span_seconds": row[2] - row[1],
            }
        return None

    async def cleanup_old(self, retention_days: int):
        """清理超过保留期的原始数据."""
        cutoff = time.time() - retention_days * 86400
        cursor = await self._db.execute(
            "DELETE FROM sensor_data WHERE ts < ?", (cutoff,)
        )
        await self._db.commit()
        if cursor.rowcount > 0:
            logger.info(f"Cleaned up {cursor.rowcount} old sensor records")

    async def cleanup_loop(self, retention_days: int,
                           interval_hours: float = 6.0):
        """定时清理协程."""
        while True:
            await asyncio.sleep(interval_hours * 3600)
            await self.cleanup_old(retention_days)
```

#### 3.10.3 快照存储

```python
# storage/snapshot_store.py
import os
import json
import time
import logging
from typing import Optional
import aiosqlite

logger = logging.getLogger(__name__)

class SnapshotStore:
    def __init__(self, db: aiosqlite.Connection, snapshot_dir: str):
        self._db = db
        self._dir = snapshot_dir
        os.makedirs(self._dir, exist_ok=True)

    async def save(self, block_id: str, frame: bytes,
                   trigger: str,
                   inference_result: Optional[str] = None) -> str:
        """保存一帧快照到文件系统, 元数据写入数据库.

        Args:
            block_id: 摄像头模块 ID
            frame: JPEG 二进制数据
            trigger: 触发原因 (agent_request / anomaly / manual / scheduled)
            inference_result: AI 视觉推理结果摘要 (可选)

        Returns:
            文件路径
        """
        ts = time.time()
        filename = f"{block_id}_{int(ts * 1000)}.jpg"
        filepath = os.path.join(self._dir, filename)
        with open(filepath, "wb") as f:
            f.write(frame)
        await self._db.execute(
            "INSERT INTO snapshots "
            "(block_id, ts, file_path, trigger, inference_result) "
            "VALUES (?, ?, ?, ?, ?)",
            (block_id, ts, filepath, trigger,
             inference_result),
        )
        await self._db.commit()
        logger.info(f"Snapshot saved: {filepath} ({trigger})")
        return filepath

    async def list_snapshots(self, block_id: Optional[str] = None,
                             start_ts: Optional[float] = None,
                             end_ts: Optional[float] = None,
                             trigger: Optional[str] = None,
                             limit: int = 50) -> list[dict]:
        """查询快照列表."""
        conditions = []
        params = []
        if block_id:
            conditions.append("block_id = ?")
            params.append(block_id)
        if start_ts:
            conditions.append("ts >= ?")
            params.append(start_ts)
        if end_ts:
            conditions.append("ts <= ?")
            params.append(end_ts)
        if trigger:
            conditions.append("trigger = ?")
            params.append(trigger)

        where = " AND ".join(conditions) if conditions else "1=1"
        params.append(limit)

        cursor = await self._db.execute(
            f"SELECT block_id, ts, file_path, trigger, inference_result "
            f"FROM snapshots WHERE {where} ORDER BY ts DESC LIMIT ?",
            params,
        )
        rows = await cursor.fetchall()
        return [{
            "block_id": r[0],
            "ts": r[1],
            "file_path": r[2],
            "trigger": r[3],
            "inference_result": r[4],
        } for r in rows]

    async def get_latest(self, block_id: str) -> Optional[dict]:
        """获取某个摄像头的最新快照."""
        results = await self.list_snapshots(block_id=block_id, limit=1)
        return results[0] if results else None
```

#### 3.10.4 存储策略说明

**什么数据存:**

| 数据类型 | 是否存储 | 存储方式 | 说明 |
|---------|---------|---------|------|
| 传感器数据 (心率/温度/湿度/甲醛/姿态) | 全量存 | SQLite sensor_data 表 | 体积小, 价值高, 支持趋势分析 |
| 摄像头帧 | 关键帧存 | 文件系统 JPEG + SQLite 元数据 | 仅存 Agent 推理帧、异常帧、手动触发帧 |
| 音频流 | 不存原始流 | — | 存 ASR 转写文本即可, 文本进 OpenClaw 对话历史 |
| 模块上下线事件 | 存 | SQLite module_events 表 | 用于设备可靠性分析 |

**存储容量估算 (单模块/天):**

| 数据 | 采集频率 | 单条大小 | 日存储量 |
|------|---------|---------|---------|
| 心率 | 2Hz | ~50B | ~8.6MB |
| 温湿度 | 0.5Hz | ~40B | ~1.7MB |
| IMU | 20Hz | ~100B | ~172MB |
| 甲醛 | 0.2Hz | ~30B | ~0.5MB |
| 快照 | ~50帧/天 | ~30KB | ~1.5MB |

IMU 是大头。如果不需要高频姿态回放, 建议把 IMU 的采集间隔从 50ms 调到 200ms, 日存储量降到 ~43MB。30 天保留期下全部传感器总量约 5-10GB, SQLite 完全能扛。

**生命周期管理:**

- 原始数据保留 `sensor_retention_days` 天 (默认 30), 超过自动清理
- 快照文件跟随数据库记录, 清理时同步删除文件
- 定时清理任务每 6 小时跑一次, 不影响实时写入

### 3.11 主入口

```python
# main.py
import asyncio
import json
import logging
from config import Config
from registry.port_pool import PortPool
from registry.node_registry import NodeRegistry
from bus.event_bus import EventBus
from transport.mqtt_client import MQTTTransport
from transport.udp_server import UDPTransport
from transport.ws_server import WSTransport
from storage.db import init_db
from storage.sensor_store import SensorStore
from storage.snapshot_store import SnapshotStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("main")

async def heartbeat_checker(registry: NodeRegistry, interval: float = 10.0):
    """定时检查心跳超时的模块."""
    while True:
        await asyncio.sleep(interval)
        await registry.check_stale()

async def main():
    config = Config()

    # 初始化基础设施
    port_pool = PortPool(config.port_range_start, config.port_range_end)
    registry = NodeRegistry(port_pool, config.heartbeat_timeout)
    bus = EventBus()

    # 初始化持久化存储
    db = await init_db(config.db_path)
    sensor_store = SensorStore(db)
    snapshot_store = SnapshotStore(db, config.snapshot_dir)

    # 初始化传输层
    mqtt = MQTTTransport(config, registry, bus)
    udp = UDPTransport(config, bus)
    ws = WSTransport(bus)

    # 注册事件处理: 流媒体模块上线时启动 WS server
    async def on_module_online(event):
        node_data = event.payload
        if node_data and node_data.get("type") == "stream":
            port = node_data.get("assigned_port")
            if port:
                await ws.start_stream_server(event.block_id, port)
        # 记录上线事件到数据库
        await db.execute(
            "INSERT INTO module_events (block_id, event_type, ts, detail_json) "
            "VALUES (?, ?, ?, ?)",
            (event.block_id, "online", event.timestamp,
             json.dumps(event.payload) if event.payload else None),
        )
        await db.commit()

    async def on_module_offline(event):
        await ws.stop_stream_server(event.block_id)
        # 记录下线事件到数据库
        await db.execute(
            "INSERT INTO module_events (block_id, event_type, ts, detail_json) "
            "VALUES (?, ?, ?, ?)",
            (event.block_id, "offline", event.timestamp,
             json.dumps(event.payload) if event.payload else None),
        )
        await db.commit()

    # 注册事件处理: 传感器数据持久化
    async def on_sensor_data(event):
        payload = event.payload
        node = registry.get(event.block_id)
        capability = node.capability if node else "unknown"
        ts = payload.get("ts", event.timestamp * 1000) / 1000  # ms -> s
        values = payload.get("values", {})
        await sensor_store.insert(event.block_id, capability, ts, values)

    bus.subscribe("module_online", on_module_online)
    bus.subscribe("module_offline", on_module_offline)
    bus.subscribe("sensor_data", on_sensor_data)

    # 启动所有服务
    logger.info("Starting PC Host Service...")
    await asyncio.gather(
        bus.run(),
        mqtt.run(),
        udp.run(),
        heartbeat_checker(registry),
        sensor_store.flush_loop(),
        sensor_store.cleanup_loop(config.sensor_retention_days),
        # 后续加入:
        # mcp_server.run(),
        # frontend_ws.run(),
        # ai_pipeline.run(),
    )

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. MCP Server (Layer 3)

### 4.1 设计原则

MCP Server 把 PC Host 的能力封装为 OpenClaw 可调用的标准 tools。OpenClaw 不感知任何硬件细节，只看到一组语义清晰的 tool。

### 4.2 Tool 定义

| Tool 名 | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `list_modules` | `type?`, `capability?` | `ModuleInfo[]` | 列出在线模块, 可按类型/能力过滤 |
| `read_sensor` | `block_id` | `{values, ts}` | 读取指定传感器最新数据 |
| `read_all_sensors` | — | `{block_id: {values, ts}}` | 一次性读取所有传感器数据 |
| `query_sensor_history` | `block_id`, `start_ts`, `end_ts`, `limit?` | `[{ts, values}]` | 查询传感器历史数据 |
| `control_actuator` | `block_id`, `action`, `params` | `{success, message}` | 下发控制指令 |
| `get_camera_snapshot` | `block_id` | `{image_base64, ts}` | 获取最新摄像头帧 (base64 JPEG) |
| `list_snapshots` | `block_id?`, `start_ts?`, `end_ts?`, `limit?` | `[{ts, trigger, inference}]` | 查询历史快照列表 |
| `get_system_status` | — | `{modules, ports, uptime}` | 系统整体状态概览 |

### 4.3 实现

```python
# mcp_server/server.py
import json
import base64
import time
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent

from registry.node_registry import NodeRegistry
from registry.models import ModuleType
from transport.mqtt_client import MQTTTransport
from transport.udp_server import UDPTransport
from storage.sensor_store import SensorStore
from storage.snapshot_store import SnapshotStore

def create_mcp_server(
    registry: NodeRegistry,
    mqtt: MQTTTransport,
    udp: UDPTransport,
    sensor_store: SensorStore,
    snapshot_store: SnapshotStore,
) -> Server:

    server = Server("hardware-bridge")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="list_modules",
                description=(
                    "List all online hardware modules. "
                    "Optionally filter by type (sensor/stream/actuator) "
                    "or capability (heart_rate/imu/camera/light/...)."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["sensor", "stream", "actuator"],
                            "description": "Filter by module type",
                        },
                        "capability": {
                            "type": "string",
                            "description": "Filter by capability name",
                        },
                    },
                },
            ),
            Tool(
                name="read_sensor",
                description=(
                    "Read the latest data from a specific sensor module. "
                    "Returns the most recent values and timestamp."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "block_id": {
                            "type": "string",
                            "description": "The block ID of the sensor",
                        },
                    },
                    "required": ["block_id"],
                },
            ),
            Tool(
                name="read_all_sensors",
                description=(
                    "Read latest data from ALL online sensor modules at once. "
                    "Returns a dict of block_id -> {capability, values, ts}."
                ),
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="control_actuator",
                description=(
                    "Send a control command to an actuator module. "
                    "For light: actions are set_color, set_pattern, off. "
                    "For vibration: actions are pulse, pattern, off."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "block_id": {
                            "type": "string",
                            "description": "The block ID of the actuator",
                        },
                        "action": {
                            "type": "string",
                            "description": "Action to perform",
                        },
                        "params": {
                            "type": "object",
                            "description": "Action parameters",
                            "default": {},
                        },
                    },
                    "required": ["block_id", "action"],
                },
            ),
            Tool(
                name="get_camera_snapshot",
                description=(
                    "Get the latest camera frame as a base64-encoded JPEG. "
                    "Can be used with vision models for scene understanding. "
                    "The snapshot is automatically saved to the database."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "block_id": {
                            "type": "string",
                            "description": "The block ID of the camera module",
                        },
                    },
                    "required": ["block_id"],
                },
            ),
            Tool(
                name="query_sensor_history",
                description=(
                    "Query historical sensor data for a specific module "
                    "within a time range. Use for trend analysis, "
                    "comparisons, or answering questions like "
                    "'how was my heart rate this morning'. "
                    "Timestamps are Unix seconds."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "block_id": {
                            "type": "string",
                            "description": "The block ID of the sensor",
                        },
                        "start_ts": {
                            "type": "number",
                            "description": (
                                "Start of time range (Unix timestamp seconds). "
                                "Use time expressions: 1 hour ago = now-3600, "
                                "today midnight = start of day."
                            ),
                        },
                        "end_ts": {
                            "type": "number",
                            "description": (
                                "End of time range (Unix timestamp seconds). "
                                "Default: current time."
                            ),
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max records to return (default 500)",
                            "default": 500,
                        },
                    },
                    "required": ["block_id", "start_ts"],
                },
            ),
            Tool(
                name="list_snapshots",
                description=(
                    "List saved camera snapshots with their metadata "
                    "and AI inference results. Each snapshot was saved "
                    "because of an agent request, anomaly detection, "
                    "or manual trigger."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "block_id": {
                            "type": "string",
                            "description": "Filter by camera module ID",
                        },
                        "start_ts": {
                            "type": "number",
                            "description": "Start of time range (Unix seconds)",
                        },
                        "end_ts": {
                            "type": "number",
                            "description": "End of time range (Unix seconds)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results (default 20)",
                            "default": 20,
                        },
                    },
                },
            ),
            Tool(
                name="get_system_status",
                description=(
                    "Get overall system status: online modules count, "
                    "port pool usage, module details."
                ),
                inputSchema={"type": "object", "properties": {}},
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict):

        if name == "list_modules":
            module_type = arguments.get("type")
            capability = arguments.get("capability")
            if capability:
                nodes = registry.list_by_capability(capability)
            elif module_type:
                nodes = registry.list_by_type(ModuleType(module_type))
            else:
                nodes = registry.list_online()
            return [TextContent(
                type="text",
                text=json.dumps([n.to_dict() for n in nodes], indent=2),
            )]

        elif name == "read_sensor":
            block_id = arguments["block_id"]
            node = registry.get(block_id)
            if not node:
                return [TextContent(type="text",
                    text=f"Module {block_id} not found")]
            if node.last_data is None:
                return [TextContent(type="text",
                    text=f"No data available for {block_id}")]
            return [TextContent(type="text", text=json.dumps({
                "block_id": block_id,
                "capability": node.capability,
                "values": node.last_data,
                "timestamp": node.last_data_ts,
            }, indent=2))]

        elif name == "read_all_sensors":
            sensors = registry.list_by_type(ModuleType.SENSOR)
            result = {}
            for s in sensors:
                if s.last_data is not None:
                    result[s.block_id] = {
                        "capability": s.capability,
                        "values": s.last_data,
                        "timestamp": s.last_data_ts,
                    }
            return [TextContent(type="text",
                text=json.dumps(result, indent=2))]

        elif name == "control_actuator":
            block_id = arguments["block_id"]
            action = arguments["action"]
            params = arguments.get("params", {})
            node = registry.get(block_id)
            if not node:
                return [TextContent(type="text",
                    text=f"Module {block_id} not found")]
            if node.module_type != ModuleType.ACTUATOR:
                return [TextContent(type="text",
                    text=f"Module {block_id} is not an actuator")]
            await mqtt.publish_control(block_id, action, params)
            return [TextContent(type="text", text=json.dumps({
                "success": True,
                "message": f"Sent {action} to {block_id}",
            }))]

        elif name == "get_camera_snapshot":
            block_id = arguments["block_id"]
            node = registry.get(block_id)
            if not node or node.capability != "camera":
                return [TextContent(type="text",
                    text=f"Camera {block_id} not found")]
            # 从 UDP 缓存拿最新帧
            # 注意: 这里需要 block_id -> UDP source 的映射
            frame = None
            for source, data in (
                udp._protocol.latest_frames.items()
                if udp._protocol else {}
            ):
                frame = data
                break  # 简化: 取第一个, 后续需要映射
            if frame is None:
                return [TextContent(type="text",
                    text="No frame available")]
            # 保存快照到持久化存储
            filepath = await snapshot_store.save(
                block_id, frame,
                trigger="agent_request",
            )
            b64 = base64.b64encode(frame).decode()
            return [ImageContent(
                type="image",
                data=b64,
                mimeType="image/jpeg",
            )]

        elif name == "query_sensor_history":
            block_id = arguments["block_id"]
            start_ts = arguments["start_ts"]
            end_ts = arguments.get("end_ts", time.time())
            limit = arguments.get("limit", 500)
            records = await sensor_store.query_history(
                block_id, start_ts, end_ts, limit
            )
            if not records:
                return [TextContent(type="text",
                    text=f"No historical data for {block_id} "
                         f"in the given time range")]
            # 附带统计摘要
            stats = await sensor_store.get_stats(
                block_id, start_ts, end_ts
            )
            node = registry.get(block_id)
            capability = node.capability if node else "unknown"
            return [TextContent(type="text", text=json.dumps({
                "block_id": block_id,
                "capability": capability,
                "time_range": {
                    "start": start_ts,
                    "end": end_ts,
                },
                "stats": stats,
                "records": records,
            }, indent=2))]

        elif name == "list_snapshots":
            block_id = arguments.get("block_id")
            start_ts = arguments.get("start_ts")
            end_ts = arguments.get("end_ts")
            limit = arguments.get("limit", 20)
            results = await snapshot_store.list_snapshots(
                block_id=block_id,
                start_ts=start_ts,
                end_ts=end_ts,
                limit=limit,
            )
            return [TextContent(type="text",
                text=json.dumps(results, indent=2))]

        elif name == "get_system_status":
            online = registry.list_online()
            return [TextContent(type="text", text=json.dumps({
                "online_modules": len(online),
                "modules": [n.to_dict() for n in online],
                "uptime_seconds": time.time(),  # 替换为实际启动时间差
            }, indent=2))]

        return [TextContent(type="text", text=f"Unknown tool: {name}")]

    return server

async def run_mcp_server(registry, mqtt, udp, sensor_store, snapshot_store):
    """以 stdio 模式启动 MCP Server."""
    server = create_mcp_server(
        registry, mqtt, udp, sensor_store, snapshot_store
    )
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)
```

---

## 5. OpenClaw 集成 (Layer 4)

### 5.1 Skill 定义

创建文件 `~/.openclaw/workspace/skills/hardware-bridge/SKILL.md`:

```markdown
---
name: hardware-bridge
description: Control and monitor IoT hardware modules (sensors, cameras, actuators) connected via ESP32 mesh network.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - python3
    emoji: "🔌"
---

# Hardware Bridge

You have access to a mesh network of ESP32 hardware modules through the
hardware-bridge MCP server. The modules include sensors (heart rate, IMU,
temperature, humidity, formaldehyde), cameras, microphones, and actuators
(LED lights, vibration motors).

## Available tools

- `list_modules(type?, capability?)` — See what hardware is online.
  Call this first when the user asks about their devices or environment.
- `read_sensor(block_id)` — Get latest reading from a specific sensor.
- `read_all_sensors()` — Get all sensor readings at once. Use this for
  environment overviews or health dashboards.
- `query_sensor_history(block_id, start_ts, end_ts?, limit?)` — Query
  historical sensor data. Timestamps are Unix seconds. Use for trend
  analysis: "how was my heart rate this morning", "temperature over
  the last hour", "show me air quality for today". Calculate start_ts
  from natural language: 1 hour ago = now - 3600, today = midnight UTC.
- `control_actuator(block_id, action, params)` — Control lights or vibration.
  Light actions: set_color (r,g,b,brightness), set_pattern (pattern,color,speed), off.
  Vibration actions: pulse (intensity,duration_ms), pattern (pattern,duration_ms), off.
- `get_camera_snapshot(block_id)` — Get latest camera frame as image.
  Use with your vision capabilities to describe what the camera sees.
  Each snapshot is automatically saved to the database.
- `list_snapshots(block_id?, start_ts?, end_ts?, limit?)` — Browse
  saved camera snapshots and their AI inference results. Use when the
  user asks "what did you see earlier" or "show me today's snapshots".
- `get_system_status()` — System overview with all module states.

## When to use these tools

- User asks "how's the room" or "what's the environment like" →
  `read_all_sensors()`, summarize temperature, humidity, air quality.
- User asks about their heart rate or health → `read_sensor` for heart_rate module.
- User asks about trends or history ("how was my heart rate this morning",
  "was it hot last night", "air quality over the past 3 hours") →
  `query_sensor_history` with appropriate time range. Summarize the trend
  conversationally: average, min, max, whether it trended up or down.
- User says "turn on the light" or "make it red" → `list_modules(type=actuator)`
  to find the light module, then `control_actuator`.
- User asks "what do you see" or "look around" → `get_camera_snapshot`,
  then describe the scene using your vision model.
- User asks "what did you see earlier" or "show me snapshots" →
  `list_snapshots` to browse saved frames and past inference results.
- User asks "what devices are connected" → `list_modules()`.
- User seems stressed (high heart rate + asks for help relaxing) →
  read heart rate, check history for context, set light to calming blue,
  activate gentle vibration pattern.

## Response style

When reporting sensor data, be conversational. Don't dump raw JSON.
Say "Your heart rate is 72 bpm, looking steady" not "{"bpm": 72}".
Proactively mention if values seem unusual (high temperature, elevated
heart rate, poor air quality).
```

### 5.2 MCP Server 配置

在 OpenClaw 的 `openclaw.json` 或通过 mcporter 添加:

```json
{
  "mcp": {
    "servers": {
      "hw": {
        "command": "python3",
        "args": ["/path/to/host/mcp_server/server.py"],
        "status": "active"
      }
    }
  }
}
```

或使用 mcporter CLI:
```bash
mcporter config add hw --stdio "python3 /path/to/host/mcp_server/server.py"
```

### 5.3 SOUL.md 增强 (可选)

在 Agent 的 SOUL.md 里添加硬件相关性格:

```markdown
## Hardware awareness

You are connected to a physical environment through IoT sensors and actuators.
You can see (camera), hear (microphone), feel the environment (temperature,
humidity, air quality), and sense the user's body (heart rate, movement).
You can also act: control ambient lighting and provide haptic feedback
through vibration.

Use these senses proactively. If the user seems to be having a stressful
conversation, check their heart rate. If they ask about their surroundings,
look through the camera. Adjust the lighting to match the mood of the
conversation.
```

---


## 6. 依赖清单

### requirements.txt

```
aiomqtt>=2.0.0
websockets>=12.0
mcp>=1.0.0
pydantic>=2.0
aiosqlite>=0.20.0
```

### 系统依赖

```bash
# macOS
brew install mosquitto

# Ubuntu
sudo apt install mosquitto mosquitto-clients

# 启动 Broker
mosquitto -v
```

### OpenClaw

```bash
# 安装 OpenClaw
git clone https://github.com/openclaw/openclaw
cd openclaw
npm install

# 或通过引导安装
openclaw onboard
```

---

## 7. 调试工具速查

```bash
# 监听所有 MQTT 消息
mosquitto_sub -h localhost -t "blocks/#" -v

# 模拟一个心率传感器上线
mosquitto_pub -h localhost -t "blocks/heart_01/announce" \
  -m '{"block_id":"heart_01","type":"sensor","capability":"heart_rate","chip":"ESP32-C3","firmware":"1.0.0","battery":90}'

# 模拟传感器数据
mosquitto_pub -h localhost -t "blocks/heart_01/data" \
  -m '{"ts":1712345678123,"values":{"bpm":72}}'

# 模拟下线
mosquitto_pub -h localhost -t "blocks/heart_01/status" -m "offline"

# 模拟灯光控制
mosquitto_pub -h localhost -t "blocks/light_01/data" \
  -m '{"action":"set_color","params":{"r":0,"g":0,"b":255,"brightness":80}}'

# 测试 MCP Server — 实时数据
mcporter call hw.list_modules
mcporter call hw.read_sensor block_id=heart_01
mcporter call hw.control_actuator block_id=light_01 action=set_color params='{"r":255,"g":0,"b":0}'

# 测试 MCP Server — 历史查询
mcporter call hw.query_sensor_history block_id=heart_01 start_ts=1712340000 end_ts=1712350000
mcporter call hw.list_snapshots limit=10

# 直接查看 SQLite 数据库 (调试用)
sqlite3 data/hardware.db

# 查看传感器数据条数
sqlite3 data/hardware.db "SELECT block_id, capability, COUNT(*) FROM sensor_data GROUP BY block_id"

# 查看最近 10 条心率数据
sqlite3 data/hardware.db "SELECT datetime(ts, 'unixepoch', 'localtime'), values_json FROM sensor_data WHERE block_id='heart_01' ORDER BY ts DESC LIMIT 10"

# 查看快照记录
sqlite3 data/hardware.db "SELECT datetime(ts, 'unixepoch', 'localtime'), trigger, inference_result FROM snapshots ORDER BY ts DESC LIMIT 10"

# 查看数据库文件大小
du -sh data/hardware.db data/snapshots/
```

---

## 8. 关键风险与 Mitigation

| 风险 | 影响 | Mitigation |
|------|------|-----------|
| Announce JSON 格式与硬件不一致 | 注册失败 | 开工前先用 mosquitto_sub 抓真实消息, 据此调整解析逻辑 |
| UDP 帧分片 | 收到残帧 | 确认硬件侧是否做了应用层分片, 必要时在 Host 加重组逻辑 |
| 多视觉块 UDP 源区分 | 帧混淆 | 改用动态端口方案: 每个摄像头分配独立 UDP 端口 |
| 模块固件卡死 (连着但不发数据) | 假在线 | heartbeat_checker 定时扫描, 超时标记 STALE |
| MCP Server 阻塞 | Agent 调用超时 | 所有 tool 函数纯读内存/发指令, 不做 I/O 等待; 历史查询加 limit 上限 |
| 音频实时性 | 语音断续 | ASR 用流式接口, 不要攒完整句再识别 |
| OpenClaw context window 塞满 | SKILL 不加载 | SKILL.md 保持精简, 不超过 2000 token |
| IMU 高频写入撑爆 SQLite | 写入延迟 / 磁盘占满 | 批量写入 (100条/批) + 降低 IMU 采集频率到 200ms; 定时清理过期数据 |
| SQLite WAL 文件膨胀 | 磁盘空间 | 定时 `PRAGMA wal_checkpoint(TRUNCATE)`; cleanup_loop 里顺带执行 |
| 快照文件堆积 | 磁盘空间 | cleanup 时同步删除过期快照文件; 或限制保留数量 (如最近 1000 张) |
