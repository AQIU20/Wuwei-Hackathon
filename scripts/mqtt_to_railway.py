"""
mqtt_to_railway.py  — MQTT → Railway WebSocket 桥接器
在「连着硬件的那台电脑」上运行，把 ESP32 传来的 MQTT 数据推到 Railway。

用法:
  pip install paho-mqtt websocket-client

  python scripts/mqtt_to_railway.py \
    --railway-ws wss://your-agent.up.railway.app/v1/hardware/ws \
    --broker-uri mqtt://broker.emqx.io \
    --root-topic aihub

  如果知道特定节点 ID:
  python scripts/mqtt_to_railway.py \
    --railway-ws wss://your-agent.up.railway.app/v1/hardware/ws \
    --node-id heart_01

ESP32 固件发布数据的 Topic 规则（参考 mqtt_bridge_client.py 的约定）:
  aihub/data/{node_id}/telemetry   → 传感器数值，payload: {"bpm": 72.3, ...}
  aihub/data/{node_id}/status      → 状态，payload: {"status": "online", "battery": 85}
  aihub/data/{node_id}/announce    → 注册，payload: {"capability": "heart_rate", "type": "sensor", ...}
  aihub/cmd/{node_id}/info         → 硬件响应 info 请求，payload: 同 announce

如果你的固件用的是不同 topic 结构，在下方 `parse_mqtt_message()` 里改映射即可。
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from typing import Optional
from urllib.parse import urlparse

import paho.mqtt.client as mqtt  # pip install paho-mqtt
import websocket  # pip install websocket-client

# ── 传感器能力 → block_id 字段名映射 ──────────────────────────────────────────
# ESP32 上报的 payload key → Railway telemetry data key
# 根据你的固件实际字段名调整
CAPABILITY_DATA_KEYS: dict[str, list[str]] = {
    "heart_rate": ["bpm", "heart_rate"],
    "temperature": ["temp_c", "temperature", "temp"],
    "humidity": ["rh", "humidity"],
    "formaldehyde": ["hcho_mg", "hcho", "formaldehyde"],
    "imu": ["ax", "ay", "az", "gx", "gy", "gz", "pitch", "roll", "yaw"],
    "light": ["lux", "brightness"],
    "microphone": ["db", "volume"],
}

# ── Railway WebSocket 推送 ────────────────────────────────────────────────────

class RailwayConnection:
    def __init__(self, url: str) -> None:
        self.url = url
        self._ws: Optional[websocket.WebSocketApp] = None
        self._ws_thread: Optional[threading.Thread] = None
        self._connected = threading.Event()
        self._lock = threading.Lock()
        self._alive = True
        self._connect()

    def _connect(self) -> None:
        def on_open(ws: websocket.WebSocketApp) -> None:
            print(f"[railway] ✅ Connected to {self.url}")
            self._connected.set()

        def on_close(ws: websocket.WebSocketApp, code: int, msg: str) -> None:
            self._connected.clear()
            if self._alive:
                print(f"[railway] ⚠️  Disconnected (code={code}), reconnecting in 5s…")
                time.sleep(5)
                self._connect()

        def on_error(ws: websocket.WebSocketApp, error: Exception) -> None:
            print(f"[railway] WS error: {error}")

        def on_message(ws: websocket.WebSocketApp, data: str) -> None:
            try:
                msg = json.loads(data)
                if msg.get("type") == "error":
                    print(f"[railway] Server error: {msg.get('message')}")
            except Exception:
                pass

        self._ws = websocket.WebSocketApp(
            self.url,
            on_open=on_open,
            on_close=on_close,
            on_error=on_error,
            on_message=on_message,
        )
        self._ws_thread = threading.Thread(
            target=self._ws.run_forever,
            kwargs={"ping_interval": 20, "ping_timeout": 10},
            daemon=True,
        )
        self._ws_thread.start()

    def send(self, payload: dict) -> bool:
        if not self._connected.wait(timeout=10):
            print("[railway] Not connected, dropping message")
            return False
        try:
            with self._lock:
                self._ws.send(json.dumps(payload))  # type: ignore[union-attr]
            return True
        except Exception as e:
            print(f"[railway] Send failed: {e}")
            self._connected.clear()
            return False

    def stop(self) -> None:
        self._alive = False
        self._ws.close()  # type: ignore[union-attr]


# ── MQTT 消息解析 → Railway IngressMessage ───────────────────────────────────

def parse_mqtt_message(topic: str, payload_str: str, root_topic: str) -> Optional[dict]:
    """
    把 MQTT topic + payload 转成 Railway HardwareIngressMessage。
    返回 None 表示忽略该消息。

    Topic 格式约定（可按固件实际情况修改）:
      {root}/data/{node_id}/telemetry
      {root}/data/{node_id}/status
      {root}/data/{node_id}/announce
      {root}/data/{node_id}/snapshot      (摄像头)
    """
    try:
        payload = json.loads(payload_str)
    except json.JSONDecodeError:
        payload = {"raw": payload_str}

    # 剥掉 root_topic 前缀
    prefix = root_topic.rstrip("/") + "/"
    if not topic.startswith(prefix):
        return None
    rest = topic[len(prefix):]  # e.g. "data/heart_01/telemetry"

    parts = rest.split("/")
    if len(parts) < 3:
        return None

    scope, node_id, subject = parts[0], parts[1], "/".join(parts[2:])

    # data/*/telemetry → telemetry ingress
    if scope == "data" and subject == "telemetry":
        if not isinstance(payload, dict):
            return None
        # 过滤掉非数字字段
        numeric_data = {k: v for k, v in payload.items() if isinstance(v, (int, float))}
        if not numeric_data:
            return None
        return {
            "type": "telemetry",
            "block_id": node_id,
            "data": numeric_data,
            "timestamp": int(time.time() * 1000),
        }

    # data/*/status → status ingress
    if scope == "data" and subject == "status":
        status = payload.get("status", "online") if isinstance(payload, dict) else "online"
        battery = payload.get("battery") if isinstance(payload, dict) else None
        msg: dict = {"type": "status", "block_id": node_id, "status": status}
        if battery is not None:
            msg["battery"] = int(battery)
        return msg

    # data/*/announce 或 cmd/*/info (硬件响应 info 请求) → announce ingress
    if (scope == "data" and subject == "announce") or (scope == "cmd" and subject == "info"):
        if not isinstance(payload, dict):
            return None
        capability = payload.get("capability") or payload.get("cap") or "unknown"
        block_type = payload.get("type") or "sensor"
        return {
            "type": "announce",
            "block": {
                "block_id": node_id,
                "capability": str(capability),
                "type": str(block_type),
                "chip": str(payload.get("chip", "ESP32-C3")),
                "firmware": str(payload.get("firmware", "unknown")),
                "battery": int(payload.get("battery", 100)),
            },
        }

    # data/*/snapshot → camera snapshot ingress
    if scope == "data" and subject == "snapshot":
        scene = payload.get("scene") or payload.get("image") or ""
        if not scene:
            return None
        return {
            "type": "snapshot",
            "block_id": node_id,
            "scene": str(scene),
            "timestamp": int(time.time() * 1000),
        }

    # 忽略其他 topic
    return None


# ── 主桥接逻辑 ────────────────────────────────────────────────────────────────

def run_bridge(
    railway_ws_url: str,
    broker_uri: str = "mqtt://broker.emqx.io",
    root_topic: str = "aihub",
    node_id: Optional[str] = None,
) -> None:
    railway = RailwayConnection(railway_ws_url)

    # 订阅 topic：所有节点 or 特定节点
    if node_id:
        subscribe_topic = f"{root_topic}/data/{node_id}/#"
    else:
        subscribe_topic = f"{root_topic}/data/#"

    print(f"[mqtt] Subscribing to: {subscribe_topic}")
    print(f"[mqtt] Broker: {broker_uri}")

    stats = {"received": 0, "forwarded": 0, "ignored": 0}

    parsed = urlparse(broker_uri if "://" in broker_uri else f"mqtt://{broker_uri}")
    host = parsed.hostname or "broker.emqx.io"
    port = parsed.port or 1883
    transport = "websockets" if parsed.scheme in ("ws", "wss") else "tcp"
    use_tls = parsed.scheme in ("mqtts", "ssl", "wss")

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        transport=transport,
    )
    if use_tls:
        client.tls_set()

    def on_connect(c: mqtt.Client, userdata, flags, reason_code, properties) -> None:
        if not reason_code.is_failure:
            print(f"[mqtt] ✅ Connected to broker {host}:{port}")
            c.subscribe(subscribe_topic, qos=0)
        else:
            print(f"[mqtt] ❌ Connect failed: {reason_code}")

    def on_disconnect(c, userdata, disconnect_flags, reason_code, properties) -> None:
        print("[mqtt] Disconnected, will auto-reconnect…")

    def on_message(c: mqtt.Client, userdata, message: mqtt.MQTTMessage) -> None:
        stats["received"] += 1
        payload_str = message.payload.decode("utf-8", errors="replace")

        ingress = parse_mqtt_message(message.topic, payload_str, root_topic)

        if ingress is None:
            stats["ignored"] += 1
            return

        ok = railway.send(ingress)
        if ok:
            stats["forwarded"] += 1
            print(f"[bridge] ↑ {ingress['type']} | {ingress.get('block_id', '')} "
                  f"| forwarded={stats['forwarded']} received={stats['received']}")
        else:
            print(f"[bridge] ✗ Failed to forward {ingress['type']}")

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=2, max_delay=30)

    print(f"[mqtt] Connecting to {host}:{port}…")
    client.connect(host, port, keepalive=60)

    try:
        client.loop_forever()
    except KeyboardInterrupt:
        print(f"\n[bridge] Stopped. Stats: {stats}")
    finally:
        client.disconnect()
        railway.stop()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bridge MQTT hardware data → Railway agent-server WebSocket"
    )
    parser.add_argument(
        "--railway-ws",
        required=True,
        help="Railway WebSocket URL, e.g. wss://your-agent.up.railway.app/v1/hardware/ws",
    )
    parser.add_argument(
        "--broker-uri",
        default="mqtt://broker.emqx.io",
        help="MQTT broker URI (default: mqtt://broker.emqx.io)",
    )
    parser.add_argument(
        "--root-topic",
        default="aihub",
        help="Root MQTT topic prefix used by the firmware (default: aihub)",
    )
    parser.add_argument(
        "--node-id",
        default=None,
        help="Subscribe only to this node ID. Omit to subscribe to ALL nodes.",
    )
    args = parser.parse_args()

    run_bridge(
        railway_ws_url=args.railway_ws,
        broker_uri=args.broker_uri,
        root_topic=args.root_topic,
        node_id=args.node_id,
    )


if __name__ == "__main__":
    main()
