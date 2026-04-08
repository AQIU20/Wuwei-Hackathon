from __future__ import annotations

import argparse
import json
import queue
import threading
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import paho.mqtt.client as mqtt  # pyright: ignore[reportMissingImports]


@dataclass(frozen=True)
class MqttMessage:
    topic: str
    payload: str
    qos: int
    retain: bool


class C3MqttClient:
    def __init__(
        self,
        broker_uri: str = "mqtt://broker.emqx.io",
        node_id: Optional[str] = None,
        root_topic: str = "aihub",
        publish_topic: Optional[str] = None,
        subscribe_topic: Optional[str] = None,
        client_id: str = "",
    ) -> None:
        parsed = urlparse(broker_uri)
        if not parsed.scheme:
            parsed = urlparse(f"mqtt://{broker_uri}")

        default_ports = {
            "mqtt": 1883,
            "tcp": 1883,
            "mqtts": 8883,
            "ssl": 8883,
            "ws": 80,
            "wss": 443,
        }
        transport = "websockets" if parsed.scheme in {"ws", "wss"} else "tcp"

        normalized_root = root_topic.strip().strip("/") or "aihub"
        normalized_node_id = (node_id or "").strip()
        resolved_publish_topic = publish_topic
        resolved_subscribe_topic = subscribe_topic

        if resolved_publish_topic is None and normalized_node_id:
            resolved_publish_topic = self.build_topic(normalized_root, "cmd", normalized_node_id, "info")
        if resolved_subscribe_topic is None and normalized_node_id:
            resolved_subscribe_topic = self.build_subscription_filter(normalized_root, normalized_node_id)
        if resolved_publish_topic is None:
            raise ValueError("publish_topic or node_id is required")

        self.broker_uri = broker_uri
        self.node_id = normalized_node_id
        self.root_topic = normalized_root
        self.publish_topic = resolved_publish_topic
        self.subscribe_topic = resolved_subscribe_topic or ""
        self._host = parsed.hostname or "broker.emqx.io"
        self._port = parsed.port or default_ports.get(parsed.scheme, 1883)
        self._transport = transport
        self._use_tls = parsed.scheme in {"mqtts", "ssl", "wss"}
        self._connected = threading.Event()
        self._last_error: Optional[str] = None
        self._messages: queue.Queue[MqttMessage] = queue.Queue()

        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            transport=self._transport,
        )
        if self._use_tls:
            self._client.tls_set()

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

    @staticmethod
    def build_topic(root_topic: str, scope: str, node_id: str, subject: str) -> str:
        return f"{root_topic.strip('/')}/{scope.strip('/')}/{node_id.strip('/')}/{subject.strip('/')}"

    @staticmethod
    def build_subscription_filter(root_topic: str, node_id: str) -> str:
        return f"{root_topic.strip('/')}/+/{node_id.strip('/')}/#"

    @staticmethod
    def _reason_code_value(reason_code: object) -> object:
        value = getattr(reason_code, "value", reason_code)
        return value

    @classmethod
    def _is_success_reason_code(cls, reason_code: object) -> bool:
        is_failure = getattr(reason_code, "is_failure", None)
        if is_failure is not None:
            return not bool(is_failure)

        value = cls._reason_code_value(reason_code)
        if isinstance(value, (int, float)):
            return int(value) == 0

        return str(value).lower() in {"success", "0"}

    @classmethod
    def _format_reason_code(cls, reason_code: object) -> str:
        value = cls._reason_code_value(reason_code)
        if value == reason_code:
            return str(reason_code)
        return f"{reason_code} ({value})"

    def _on_connect(self, client: mqtt.Client, userdata: object, flags: mqtt.ConnectFlags, reason_code: mqtt.ReasonCode, properties: mqtt.Properties) -> None:
        del userdata, flags, properties

        if self._is_success_reason_code(reason_code):
            self._connected.set()
            self._last_error = None
            if self.subscribe_topic:
                client.subscribe(self.subscribe_topic, qos=0)
            return

        self._last_error = f"MQTT connect failed: {self._format_reason_code(reason_code)}"
        self._connected.clear()

    def _on_disconnect(self, client: mqtt.Client, userdata: object, disconnect_flags: mqtt.DisconnectFlags, reason_code: mqtt.ReasonCode, properties: mqtt.Properties) -> None:
        del client, userdata, disconnect_flags, properties
        self._connected.clear()
        if not self._is_success_reason_code(reason_code):
            self._last_error = f"MQTT disconnected unexpectedly: {self._format_reason_code(reason_code)}"

    def _on_message(self, client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        del client, userdata
        payload = message.payload.decode("utf-8", errors="replace")
        self._messages.put(
            MqttMessage(
                topic=message.topic,
                payload=payload,
                qos=message.qos,
                retain=bool(message.retain),
            )
        )

    def connect(self, timeout: float = 10.0) -> None:
        self._client.connect(self._host, self._port, keepalive=60)
        self._client.loop_start()

        if self._connected.wait(timeout):
            return

        self.disconnect()
        raise TimeoutError(self._last_error or f"Timed out connecting to {self.broker_uri}")

    def publish_message(self, payload: str, topic: Optional[str] = None, qos: int = 0, retain: bool = False, timeout: float = 5.0) -> None:
        if not self._connected.is_set():
            raise RuntimeError("MQTT client is not connected")

        publish_info = self._client.publish(topic or self.publish_topic, payload=payload, qos=qos, retain=retain)
        publish_info.wait_for_publish(timeout=timeout)
        if not publish_info.is_published():
            raise TimeoutError("Timed out waiting for MQTT publish acknowledgement")

    def publish_command(self, subject: str, payload: str, qos: int = 0, retain: bool = False, timeout: float = 5.0) -> str:
        if not self.node_id:
            raise RuntimeError("node_id is required for command publishing")

        topic = self.build_topic(self.root_topic, "cmd", self.node_id, subject)
        self.publish_message(payload, topic=topic, qos=qos, retain=retain, timeout=timeout)
        return topic

    @staticmethod
    def build_led_payload(state: str, payload_format: str = "json") -> str:
        normalized_state = state.strip().lower()
        if normalized_state not in {"on", "off", "toggle"}:
            raise ValueError("LED state must be one of: on, off, toggle")

        normalized_format = payload_format.strip().lower()
        if normalized_format == "string":
            return normalized_state
        if normalized_format == "json":
            return json.dumps({"led": normalized_state})

        raise ValueError("payload_format must be 'json' or 'string'")

    @staticmethod
    def build_ws2812_payload(
        effect: str,
        payload_format: str = "json",
        speed_ms: Optional[int] = None,
        brightness: Optional[int] = None,
        hue: Optional[int] = None,
    ) -> str:
        normalized_effect = effect.strip().lower()
        valid_effects = {"off", "rainbow", "particles", "siri", "boot", "wifi_connecting", "mqtt_online", "status"}

        if normalized_effect not in valid_effects:
            raise ValueError(
                "WS2812 effect must be one of: off, rainbow, particles, siri, boot, wifi_connecting, mqtt_online, status"
            )

        payload_dict = {"effect": normalized_effect}
        if speed_ms is not None:
            payload_dict["speed_ms"] = speed_ms
        if brightness is not None:
            payload_dict["brightness"] = brightness
        if hue is not None:
            payload_dict["hue"] = hue

        normalized_format = payload_format.strip().lower()
        if normalized_format == "string":
            parts = [normalized_effect]
            if speed_ms is not None:
                parts.append(f"speed={speed_ms}")
            if brightness is not None:
                parts.append(f"brightness={brightness}")
            if hue is not None:
                parts.append(f"hue={hue}")
            return " ".join(parts)
        if normalized_format == "json":
            return json.dumps(payload_dict)

        raise ValueError("payload_format must be 'json' or 'string'")

    def set_led(self, state: str, payload_format: str = "json") -> str:
        payload = self.build_led_payload(state, payload_format=payload_format)
        self.publish_command("led", payload)
        return payload

    def set_ws2812_effect(
        self,
        effect: str,
        payload_format: str = "json",
        speed_ms: Optional[int] = None,
        brightness: Optional[int] = None,
        hue: Optional[int] = None,
    ) -> str:
        payload = self.build_ws2812_payload(
            effect,
            payload_format=payload_format,
            speed_ms=speed_ms,
            brightness=brightness,
            hue=hue,
        )
        self.publish_command("ws2812", payload)
        return payload

    def request_info(self) -> str:
        payload = json.dumps({"request": "info"})
        self.publish_command("info", payload)
        return payload

    def wait_for_message(self, timeout: float = 1.0) -> Optional[MqttMessage]:
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None

    def disconnect(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()
        self._connected.clear()

    def __enter__(self) -> "C3MqttClient":
        self.connect()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        del exc_type, exc, tb
        self.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish MQTT commands to the ESP32-C3 node")
    parser.add_argument("message", nargs="?", default='{"request":"info"}', help="Payload sent to the selected command subject")
    parser.add_argument("--broker-uri", default="mqtt://broker.emqx.io", help="Broker URI, for example mqtt://broker.emqx.io")
    parser.add_argument("--node-id", help="Target node id, for example led_a1b2c3")
    parser.add_argument("--root-topic", default="aihub", help="Root topic prefix used by the firmware")
    parser.add_argument("--publish-topic", help="Override the publish topic explicitly")
    parser.add_argument("--subscribe-topic", help="Override the subscribe topic or filter explicitly")
    parser.add_argument("--command-subject", default="info", help="Command subject used for raw payloads, for example info or led")
    parser.add_argument("--led", choices=["on", "off", "toggle"], help="Send an LED control command instead of a raw message")
    parser.add_argument(
        "--ws2812-effect",
        choices=["off", "rainbow", "particles", "siri", "boot", "wifi_connecting", "mqtt_online", "status"],
        help="Send a WS2812 effect command",
    )
    parser.add_argument("--ws2812-speed", type=int, help="Optional WS2812 effect frame interval in milliseconds")
    parser.add_argument("--ws2812-brightness", type=int, help="Optional WS2812 effect brightness override (0-255)")
    parser.add_argument("--ws2812-hue", type=int, help="Optional WS2812 effect primary hue (0-360)")
    parser.add_argument("--info", action="store_true", help="Request an info response from the node")
    parser.add_argument("--payload-format", choices=["json", "string"], default="json", help="Payload format used for LED commands")
    parser.add_argument("--listen-seconds", type=float, default=5.0, help="How long to wait for response messages after publishing")
    args = parser.parse_args()

    if args.node_id is None and args.publish_topic is None:
        parser.error("--node-id is required unless --publish-topic is provided explicitly")

    with C3MqttClient(
        broker_uri=args.broker_uri,
        node_id=args.node_id,
        root_topic=args.root_topic,
        publish_topic=args.publish_topic,
        subscribe_topic=args.subscribe_topic,
    ) as client:
        if args.led is not None:
            payload = client.set_led(args.led, payload_format=args.payload_format)
            publish_topic = client.build_topic(client.root_topic, "cmd", client.node_id, "led")
        elif args.ws2812_effect is not None:
            payload = client.set_ws2812_effect(
                args.ws2812_effect,
                payload_format=args.payload_format,
                speed_ms=args.ws2812_speed,
                brightness=args.ws2812_brightness,
                hue=args.ws2812_hue,
            )
            publish_topic = client.build_topic(client.root_topic, "cmd", client.node_id, "ws2812")
        elif args.info:
            payload = client.request_info()
            publish_topic = client.build_topic(client.root_topic, "cmd", client.node_id, "info")
        else:
            payload = args.message
            if client.node_id:
                publish_topic = client.publish_command(args.command_subject, payload)
            else:
                publish_topic = client.publish_topic
                client.publish_message(payload)

        print(f"Published to {publish_topic}: {payload}")

        deadline = time.monotonic() + max(args.listen_seconds, 0.0)
        while time.monotonic() < deadline:
            message = client.wait_for_message(timeout=min(1.0, deadline - time.monotonic()))
            if message is None:
                continue
            print(f"Received from {message.topic}: {message.payload}")


if __name__ == "__main__":
    main()