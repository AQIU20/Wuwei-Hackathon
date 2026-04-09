from __future__ import annotations

import argparse
import json
import queue
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

import paho.mqtt.client as mqtt


DEFAULT_BROKER_HOST = "96.47.238.33"
DEFAULT_BROKER_PORT = 1883
DEFAULT_ROOT_TOPIC = "aihub"
RAW_CONTROL_ENABLED = True


@dataclass(frozen=True)
class ReceivedMessage:
    topic: str
    payload_text: str

    def json(self) -> Optional[dict[str, Any]]:
        try:
            parsed = json.loads(self.payload_text)
        except json.JSONDecodeError:
            return None

        if isinstance(parsed, dict):
            return parsed
        return None


class NodeMqttClient:
    def __init__(
        self,
        host: str,
        port: int,
        root_topic: str,
        node_id: str,
        client_id: str,
    ) -> None:
        self.host = host
        self.port = port
        self.root_topic = root_topic.strip("/")
        self.node_id = node_id.strip()
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            transport="tcp",
        )
        self.connected = threading.Event()
        self.messages: queue.Queue[ReceivedMessage] = queue.Queue()
        self.last_error: Optional[str] = None

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _subscribe_filter(self) -> str:
        return f"{self.root_topic}/+/{self.node_id}/#"

    def build_topic(self, scope: str, subject: str) -> str:
        return f"{self.root_topic}/{scope}/{self.node_id}/{subject}"

    @staticmethod
    def _reason_value(reason_code: object) -> object:
        return getattr(reason_code, "value", reason_code)

    @classmethod
    def _reason_ok(cls, reason_code: object) -> bool:
        failure_flag = getattr(reason_code, "is_failure", None)
        if failure_flag is not None:
          return not bool(failure_flag)

        value = cls._reason_value(reason_code)
        if isinstance(value, (int, float)):
            return int(value) == 0
        return str(value).lower() in {"success", "0"}

    def _on_connect(self, client: mqtt.Client, userdata: object, flags: mqtt.ConnectFlags, reason_code: mqtt.ReasonCode, properties: mqtt.Properties) -> None:
        del userdata, flags, properties
        if self._reason_ok(reason_code):
            client.subscribe(self._subscribe_filter(), qos=0)
            self.connected.set()
            self.last_error = None
            return

        self.last_error = f"connect failed: {self._reason_value(reason_code)}"
        self.connected.clear()

    def _on_disconnect(self, client: mqtt.Client, userdata: object, disconnect_flags: mqtt.DisconnectFlags, reason_code: mqtt.ReasonCode, properties: mqtt.Properties) -> None:
        del client, userdata, disconnect_flags, properties
        self.connected.clear()
        if not self._reason_ok(reason_code):
            self.last_error = f"disconnect: {self._reason_value(reason_code)}"

    def _on_message(self, client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        del client, userdata
        self.messages.put(
            ReceivedMessage(
                topic=message.topic,
                payload_text=message.payload.decode("utf-8", errors="replace"),
            )
        )

    def connect(self, timeout: float) -> None:
        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()
        if self.connected.wait(timeout):
            return

        self.disconnect()
        raise TimeoutError(self.last_error or f"timed out connecting to {self.host}:{self.port}")

    def disconnect(self) -> None:
        try:
            self.client.loop_stop()
        finally:
            try:
                self.client.disconnect()
            finally:
                self.connected.clear()

    def publish(self, scope: str, subject: str, payload: str, qos: int = 0, retain: bool = False) -> str:
        if not self.connected.is_set():
            raise RuntimeError("MQTT client is not connected")

        topic = self.build_topic(scope, subject)
        info = self.client.publish(topic, payload=payload, qos=qos, retain=retain)
        info.wait_for_publish(timeout=5.0)
        if not info.is_published():
            raise TimeoutError(f"publish timeout for {topic}")
        return topic

    def publish_info_request(self) -> str:
        return self.publish("cmd", "info", '{"request":"info"}')

    def publish_ws2812(self, payload: str) -> str:
        return self.publish("cmd", "ws2812", payload)

    def publish_pixel(self, payload: str) -> str:
        return self.publish("cmd", "pixel", payload)

    def wait_for_topic_suffix(self, suffix: str, timeout: float) -> Optional[ReceivedMessage]:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                message = self.messages.get(timeout=min(0.5, remaining))
            except queue.Empty:
                continue

            if message.topic.endswith(suffix):
                return message
        return None

    def wait_for_any(self, timeout: float) -> Optional[ReceivedMessage]:
        try:
            return self.messages.get(timeout=timeout)
        except queue.Empty:
            return None


def pretty_print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def emit_output(data: Any, json_only: bool) -> None:
    if json_only:
        print(json.dumps(data, ensure_ascii=False))
        return

    pretty_print_json(data)


def extract_envelope_payload(message: ReceivedMessage) -> dict[str, Any]:
    parsed = message.json()
    if parsed is None:
        raise ValueError(f"message is not valid JSON: {message.payload_text}")

    payload = parsed.get("payload")
    if not isinstance(payload, dict):
        raise ValueError(f"message JSON does not contain object payload: {message.payload_text}")
    return parsed


def wait_for_envelope(client: NodeMqttClient, suffix: str, timeout: float) -> Optional[dict[str, Any]]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        remaining = max(0.0, deadline - time.monotonic())
        message = client.wait_for_topic_suffix(suffix, remaining)
        if message is None:
            return None

        try:
            return extract_envelope_payload(message)
        except ValueError:
            continue
    return None


def build_ws2812_payload(effect: str, speed: Optional[int], brightness: Optional[int], hue: Optional[int], as_string: bool) -> str:
    effect = effect.strip().lower()
    valid = {"off", "rainbow", "particles", "siri", "boot", "wifi_connecting", "mqtt_online", "status"}
    if effect not in valid:
        raise ValueError("effect must be one of: off, rainbow, particles, siri, boot, wifi_connecting, mqtt_online, status")

    if as_string:
        parts = [effect]
        if speed is not None:
            parts.append(f"speed={speed}")
        if brightness is not None:
            parts.append(f"brightness={brightness}")
        if hue is not None:
            parts.append(f"hue={hue}")
        return " ".join(parts)

    payload: dict[str, Any] = {"effect": effect}
    if speed is not None:
        payload["speed"] = speed
    if brightness is not None:
        payload["brightness"] = brightness
    if hue is not None:
        payload["hue"] = hue
    return json.dumps(payload, ensure_ascii=False)


def parse_rgb_triplet(text: str) -> tuple[int, int, int]:
    parts = [part.strip() for part in text.split(",")]
    if len(parts) != 3:
        raise ValueError("RGB triplet must be in the form r,g,b")

    values = []
    for part in parts:
        value = int(part)
        if value < 0 or value > 255:
            raise ValueError("RGB values must be in range 0-255")
        values.append(value)
    return values[0], values[1], values[2]


def parse_pixels_argument(text: str) -> list[dict[str, int]]:
    pixels: list[dict[str, int]] = []
    specs = [spec.strip() for spec in text.split(";") if spec.strip()]
    if not specs:
        raise ValueError("pixels argument cannot be empty")

    for spec in specs:
        if ":" not in spec:
            raise ValueError("pixel spec must be in the form index:r,g,b")

        index_text, rgb_text = spec.split(":", 1)
        index = int(index_text.strip())
        if index < 0:
            raise ValueError("pixel index must be >= 0")
        red, green, blue = parse_rgb_triplet(rgb_text)
        pixels.append({"index": index, "r": red, "g": green, "b": blue})

    return pixels


def build_raw_payload(fill: Optional[str], pixels: Optional[str]) -> str:
    payload: dict[str, Any] = {"effect": "raw"}

    if fill:
        red, green, blue = parse_rgb_triplet(fill)
        payload["fill"] = {"r": red, "g": green, "b": blue}

    if pixels:
        payload["pixels"] = parse_pixels_argument(pixels)

    if "fill" not in payload and "pixels" not in payload:
        raise ValueError("raw action requires --fill or --pixels")

    return json.dumps(payload, ensure_ascii=False)


def command_status(client: NodeMqttClient, timeout: float, json_only: bool) -> int:
    topic = client.publish_info_request()
    if not json_only:
        print(f"published: {topic}")

    envelope = wait_for_envelope(client, "/info", timeout)
    if envelope is None:
        print("timed out waiting for info response", file=sys.stderr)
        return 1

    emit_output(envelope, json_only)
    return 0


def command_env(client: NodeMqttClient, timeout: float, json_only: bool) -> int:
    topic = client.publish_info_request()
    if not json_only:
        print(f"published: {topic}")

    envelope = wait_for_envelope(client, "/info", timeout)
    if envelope is None:
        print("timed out waiting for info response", file=sys.stderr)
        return 1

    payload = envelope["payload"]
    env = payload.get("env")
    if not isinstance(env, dict):
        print("env payload missing in device status response", file=sys.stderr)
        return 1

    emit_output(env, json_only)
    return 0


def command_ws2812(
    client: NodeMqttClient,
    effect: str,
    speed: Optional[int],
    brightness: Optional[int],
    hue: Optional[int],
    as_string: bool,
    timeout: float,
    json_only: bool,
) -> int:
    payload = build_ws2812_payload(effect, speed, brightness, hue, as_string)
    topic = client.publish_ws2812(payload)
    if not json_only:
        print(f"published: {topic}")
        print(f"payload: {payload}")

    envelope = wait_for_envelope(client, "/ws2812", timeout)
    if envelope is None:
        print("timed out waiting for ws2812 response", file=sys.stderr)
        return 1

    emit_output(envelope, json_only)
    return 0


def command_watch(client: NodeMqttClient, seconds: float, json_only: bool) -> int:
    deadline = time.monotonic() + seconds
    if not json_only:
        print(f"watching {client._subscribe_filter()} for {seconds:.1f}s")
    while time.monotonic() < deadline:
        remaining = max(0.0, deadline - time.monotonic())
        message = client.wait_for_any(min(1.0, remaining))
        if message is None:
            continue
        if json_only:
            print(json.dumps({"topic": message.topic, "payload": message.json() or message.payload_text}, ensure_ascii=False))
        else:
            print(f"[{message.topic}] {message.payload_text}")
    return 0


def command_raw(client: NodeMqttClient, fill: Optional[str], pixels: Optional[str], timeout: float, json_only: bool) -> int:
    payload = build_raw_payload(fill, pixels)
    topic = client.publish_ws2812(payload)
    if not json_only:
        print(f"published: {topic}")
        print(f"payload: {payload}")

    envelope = wait_for_envelope(client, "/ws2812", timeout)
    if envelope is None:
        print("timed out waiting for ws2812 response", file=sys.stderr)
        return 1

    emit_output(envelope, json_only)
    return 0


def command_pixel(client: NodeMqttClient, fill: Optional[str], pixels: Optional[str], timeout: float, json_only: bool) -> int:
    payload = build_raw_payload(fill, pixels)
    topic = client.publish_pixel(payload)
    if not json_only:
        print(f"published: {topic}")
        print(f"payload: {payload}")

    envelope = wait_for_envelope(client, "/pixel", timeout)
    if envelope is None:
        print("timed out waiting for pixel response", file=sys.stderr)
        return 1

    emit_output(envelope, json_only)
    return 0



def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Query status/env data and actively control WS2812 for the ESP32-C3 MQTT node"
    )
    parser.add_argument("action", choices=["status", "env", "ws2812", "raw", "pixel", "watch"], help="Action to perform")
    parser.add_argument("--node-id", required=True, help="Target node id, for example heap_c13de8")
    parser.add_argument("--host", default=DEFAULT_BROKER_HOST, help=f"MQTT broker host, default {DEFAULT_BROKER_HOST}")
    parser.add_argument("--port", type=int, default=DEFAULT_BROKER_PORT, help=f"MQTT broker port, default {DEFAULT_BROKER_PORT}")
    parser.add_argument("--root-topic", default=DEFAULT_ROOT_TOPIC, help=f"MQTT root topic, default {DEFAULT_ROOT_TOPIC}")
    parser.add_argument("--timeout", type=float, default=8.0, help="Wait timeout in seconds for request/response actions")
    parser.add_argument("--effect", default="status", help="WS2812 effect name for ws2812 action")
    parser.add_argument("--speed", type=int, help="WS2812 speed in ms, valid range 10-1000")
    parser.add_argument("--brightness", type=int, help="WS2812 brightness, valid range 0-255")
    parser.add_argument("--hue", type=int, help="WS2812 hue, valid range 0-360")
    parser.add_argument("--string-payload", action="store_true", help="Send WS2812 payload as string instead of JSON")
    parser.add_argument("--watch-seconds", type=float, default=30.0, help="Seconds to watch messages when action=watch")
    parser.add_argument("--client-id", default="", help="Optional explicit MQTT client id")
    parser.add_argument("--json-only", action="store_true", help="Print machine-friendly compact JSON only")
    parser.add_argument("--fill", help="Raw fill color in the form r,g,b, for example 255,0,0")
    parser.add_argument("--pixels", help="Raw pixel list in the form index:r,g,b;index:r,g,b")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    client = NodeMqttClient(
        host=args.host,
        port=args.port,
        root_topic=args.root_topic,
        node_id=args.node_id,
        client_id=args.client_id,
    )

    try:
        client.connect(timeout=args.timeout)

        if args.action == "status":
            return command_status(client, args.timeout, args.json_only)
        if args.action == "env":
            return command_env(client, args.timeout, args.json_only)
        if args.action == "ws2812":
            return command_ws2812(
                client,
                effect=args.effect,
                speed=args.speed,
                brightness=args.brightness,
                hue=args.hue,
                as_string=args.string_payload,
                timeout=args.timeout,
                json_only=args.json_only,
            )
        if args.action == "watch":
            return command_watch(client, args.watch_seconds, args.json_only)
        if args.action == "raw":
            return command_raw(client, args.fill, args.pixels, args.timeout, args.json_only)
        if args.action == "pixel":
            return command_pixel(client, args.fill, args.pixels, args.timeout, args.json_only)

        parser.error(f"unsupported action: {args.action}")
        return 2
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        client.disconnect()


if __name__ == "__main__":
    raise SystemExit(main())
