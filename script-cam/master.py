from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass, field
import datetime
import ipaddress
import json
import logging
from pathlib import Path
import socket
import threading
import time
from typing import Optional
import uuid

_BEIJING_TZ = datetime.timezone(datetime.timedelta(hours=8))

try:
    import requests as _requests
except ImportError:  # pragma: no cover
    _requests = None  # type: ignore

from protocol import (
    FRAME_STRUCT,
    PIXEL_FORMAT_JPEG,
    REGISTER_STRUCT,
    FramePacketHeader,
    RegisterPacket,
    build_announcement,
    mac_to_text,
    recv_exact,
)

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    cv2 = None
    np = None


@dataclass
class DeviceInfo:
    mac_text: str
    width: int
    height: int
    session_id: int
    address: tuple[str, int]
    last_registration: float = field(default_factory=time.time)
    last_frame_at: float = field(default_factory=time.time)
    frames_received: int = 0
    bytes_received: int = 0
    queue_drops: int = 0
    last_frame_sequence: int = 0


class DeviceRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._devices: dict[str, DeviceInfo] = {}

    def upsert(self, registration: RegisterPacket, address: tuple[str, int]) -> DeviceInfo:
        mac_text = mac_to_text(registration.mac)
        with self._lock:
            device = self._devices.get(mac_text)
            if device is None:
                device = DeviceInfo(
                    mac_text=mac_text,
                    width=registration.width,
                    height=registration.height,
                    session_id=registration.session_id,
                    address=address,
                )
                self._devices[mac_text] = device
            else:
                device.width = registration.width
                device.height = registration.height
                device.session_id = registration.session_id
                device.address = address
                device.last_registration = time.time()
            return device

    def record_frame(self, mac_text: str, frame_sequence: int, payload_length: int) -> None:
        with self._lock:
            device = self._devices.get(mac_text)
            if device is None:
                return
            device.last_frame_at = time.time()
            device.frames_received += 1
            device.bytes_received += payload_length
            device.last_frame_sequence = frame_sequence

    def record_queue_drop(self, mac_text: str) -> None:
        with self._lock:
            device = self._devices.get(mac_text)
            if device is None:
                return
            device.queue_drops += 1

    def snapshot(self) -> list[DeviceInfo]:
        with self._lock:
            return [DeviceInfo(**vars(device)) for device in self._devices.values()]


@dataclass
class FrameEnvelope:
    mac_text: str
    header: FramePacketHeader
    jpeg_payload: bytes
    received_at_ns: int


class FrameProcessor(threading.Thread):
    def __init__(self, registry: DeviceRegistry, preview_enabled: bool, save_dir: Optional[Path], queue_size: int, ingress_url: Optional[str] = None, push_interval: float = 5.0) -> None:
        super().__init__(daemon=True)
        self._registry = registry
        self._preview_enabled = preview_enabled and cv2 is not None and np is not None
        self._save_dir = save_dir.resolve() if save_dir is not None else None
        self._stop_event = threading.Event()
        self._ingress_url = ingress_url
        self._push_interval = push_interval
        self._last_push_at: dict[str, float] = {}
        # Single-slot latest-frame holder: O(1) submit, no queue drain needed.
        self._slot_lock = threading.Lock()
        self._slot: Optional[FrameEnvelope] = None
        self._slot_event = threading.Event()

    def submit(self, envelope: FrameEnvelope) -> bool:
        with self._slot_lock:
            if self._slot is not None:
                # Overwrite stale frame.
                self._registry.record_queue_drop(envelope.mac_text)
            self._slot = envelope
        self._slot_event.set()
        return True

    def stop(self) -> None:
        self._stop_event.set()
        self._slot_event.set()  # Wake the processing thread so it can exit.

    def run(self) -> None:
        while not self._stop_event.is_set():
            signaled = self._slot_event.wait(timeout=0.25)
            if not signaled:
                continue
            with self._slot_lock:
                envelope = self._slot
                self._slot = None
                self._slot_event.clear()
            if envelope is not None:
                self._handle_frame(envelope)

    def _push_to_ingress(self, envelope: FrameEnvelope) -> None:
        if self._ingress_url is None or _requests is None:
            return
        header = envelope.header
        payload = {
            "node_id": envelope.mac_text,
            "snapshot_id": f"snap-{uuid.uuid4().hex[:12]}",
            "event_id": f"evt-{uuid.uuid4().hex[:12]}",
            "analysis_text": "",
            "image_base64": base64.b64encode(envelope.jpeg_payload).decode(),
            "mime_type": "image/jpeg",
            "width": header.width,
            "height": header.height,
            "size_bytes": header.payload_length,
            "confidence": 1.0,
            "trigger": True,
            "timestamp_ms": int(datetime.datetime.now(_BEIJING_TZ).timestamp() * 1000),
        }
        try:
            resp = _requests.post(
                self._ingress_url,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                timeout=5,
            )
            if not resp.ok:
                logging.warning(
                    "Ingress push failed for %s seq=%s: HTTP %s %s",
                    envelope.mac_text,
                    header.frame_sequence,
                    resp.status_code,
                    resp.text[:200],
                )
            else:
                logging.info(
                    "Ingress push OK for %s seq=%s HTTP %s",
                    envelope.mac_text,
                    header.frame_sequence,
                    resp.status_code,
                )
        except Exception as exc:
            logging.warning(
                "Ingress push error for %s seq=%s: %s",
                envelope.mac_text,
                header.frame_sequence,
                exc,
            )

    def _handle_frame(self, envelope: FrameEnvelope) -> None:
        header = envelope.header
        now = time.time()
        last_push = self._last_push_at.get(envelope.mac_text, 0.0)
        elapsed = now - last_push
        due_for_push = elapsed >= self._push_interval
        logging.info(
            "Frame received: device=%s seq=%s size=%s bytes ts=%sms%s",
            envelope.mac_text,
            header.frame_sequence,
            header.payload_length,
            header.timestamp_ms,
            "" if due_for_push else f" (skip push, next in {self._push_interval - elapsed:.1f}s)",
        )
        if self._save_dir is not None:
            device_dir = self._save_dir / envelope.mac_text.replace(":", "-")
            device_dir.mkdir(parents=True, exist_ok=True)
            frame_path = device_dir / (
                f"frame_{envelope.received_at_ns}_{envelope.header.frame_sequence:08d}.jpg"
            )
            frame_path.write_bytes(envelope.jpeg_payload)

        if due_for_push:
            self._last_push_at[envelope.mac_text] = now
            threading.Thread(target=self._push_to_ingress, args=(envelope,), daemon=True).start()
        
        if not self._preview_enabled:
            return

        frame_array = np.frombuffer(envelope.jpeg_payload, dtype=np.uint8)
        image = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        if image is None:
            logging.warning("Failed to decode frame from %s", envelope.mac_text)
            return
        title = f"ESP32-CAM {envelope.mac_text}"
        overlay = f"seq={envelope.header.frame_sequence} ts={envelope.header.timestamp_ms}ms"
        cv2.putText(image, overlay, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.imshow(title, image)
        cv2.waitKey(1)


class HostAnnouncer(threading.Thread):
    def __init__(self, broadcast_address: str, discovery_port: int, tcp_port: int, interval_seconds: float, lease_seconds: int) -> None:
        super().__init__(daemon=True)
        self._broadcast_address = broadcast_address
        self._discovery_port = discovery_port
        self._tcp_port = tcp_port
        self._interval_seconds = interval_seconds
        self._lease_seconds = lease_seconds
        self._stop_event = threading.Event()
        self._sequence = 0
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    def stop(self) -> None:
        self._stop_event.set()
        self._socket.close()

    def run(self) -> None:
        while not self._stop_event.is_set():
            self._sequence += 1
            packet = build_announcement(self._tcp_port, self._sequence, self._lease_seconds)
            try:
                self._socket.sendto(packet, (self._broadcast_address, self._discovery_port))
                logging.debug(
                    "Broadcast seq=%s to %s:%s",
                    self._sequence,
                    self._broadcast_address,
                    self._discovery_port,
                )
            except OSError as exc:
                logging.warning("Broadcast failed: %s", exc)
            self._stop_event.wait(self._interval_seconds)


class SessionHandler(threading.Thread):
    def __init__(self, conn: socket.socket, address: tuple[str, int], registry: DeviceRegistry, processor: FrameProcessor) -> None:
        super().__init__(daemon=True)
        self._conn = conn
        self._address = address
        self._registry = registry
        self._processor = processor

    def run(self) -> None:
        mac_text = "unknown"
        try:
            self._conn.settimeout(10.0)
            registration = RegisterPacket.from_bytes(recv_exact(self._conn, REGISTER_STRUCT.size))
            mac_text = mac_to_text(registration.mac)
            self._registry.upsert(registration, self._address)
            logging.info("Device %s connected from %s:%s (%sx%s)", mac_text, self._address[0], self._address[1], registration.width, registration.height)

            while True:
                header = FramePacketHeader.from_bytes(recv_exact(self._conn, FRAME_STRUCT.size))
                if mac_to_text(header.mac) != mac_text:
                    raise ValueError("frame MAC does not match registered device")
                jpeg_payload = recv_exact(self._conn, header.payload_length)
                self._registry.record_frame(mac_text, header.frame_sequence, header.payload_length)
                self._processor.submit(FrameEnvelope(mac_text, header, jpeg_payload, time.time_ns()))
        except (ConnectionError, OSError, ValueError) as exc:
            logging.info("Session for %s at %s:%s closed: %s", mac_text, self._address[0], self._address[1], exc)
        finally:
            try:
                self._conn.close()
            except OSError:
                pass


class Supervisor(threading.Thread):
    def __init__(self, registry: DeviceRegistry, interval_seconds: float = 5.0) -> None:
        super().__init__(daemon=True)
        self._registry = registry
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            snapshot = self._registry.snapshot()
            if snapshot:
                summary = ", ".join(
                    f"{device.mac_text} frames={device.frames_received} drops={device.queue_drops} last_seq={device.last_frame_sequence}"
                    for device in snapshot
                )
                logging.info("Devices: %s", summary)
            self._stop_event.wait(self._interval_seconds)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ESP32-CAM UDP discovery and TCP frame collector")
    default_save_dir = Path(__file__).resolve().parent / "captures"
    parser.add_argument("--bind-ip", default="0.0.0.0", help="TCP bind address")
    parser.add_argument("--tcp-port", type=int, default=5000, help="TCP port for device callbacks")
    parser.add_argument("--discovery-port", type=int, default=40000, help="UDP broadcast listen port on devices")
    parser.add_argument("--broadcast-address", default="255.255.255.255", help="UDP broadcast destination")
    parser.add_argument("--broadcast-interval", type=float, default=2.0, help="Seconds between broadcasts")
    parser.add_argument("--lease-seconds", type=int, default=6, help="Lease duration announced to devices")
    parser.add_argument("--queue-size", type=int, default=128, help="Frame processing queue size")
    parser.add_argument("--save-dir", type=Path, default=default_save_dir, help="Directory to store every incoming JPEG frame")
    parser.add_argument("--no-save", action="store_true", help="Disable saving incoming JPEG frames to disk")
    parser.add_argument("--no-preview", action="store_true", help="Disable OpenCV preview windows")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Logging verbosity")
    parser.add_argument(
        "--ingress-url",
        default="https://wuwei-hackathon-production.up.railway.app/v1/camera/ingress",
        help="HTTP endpoint to push each frame to (set empty string to disable)",
    )
    parser.add_argument("--no-push", action="store_true", help="Disable HTTP ingress push")
    parser.add_argument("--push-interval", type=float, default=12.0, help="Minimum seconds between ingress pushes per device (default: 12.0)")
    return parser.parse_args()


def resolve_broadcast_address(bind_ip: str, broadcast_address: str) -> str:
    if broadcast_address != "255.255.255.255":
        return broadcast_address
    if bind_ip in {"0.0.0.0", "127.0.0.1"}:
        return broadcast_address

    network = ipaddress.IPv4Network(f"{bind_ip}/24", strict=False)
    return str(network.broadcast_address)


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level), format="%(asctime)s %(levelname)s %(message)s")
    resolved_broadcast_address = resolve_broadcast_address(args.bind_ip, args.broadcast_address)
    save_dir = None if args.no_save else args.save_dir

    if not args.no_preview and (cv2 is None or np is None):
        logging.warning("OpenCV preview disabled because opencv-python or numpy is not installed")

    ingress_url: Optional[str] = None if (args.no_push or not args.ingress_url) else args.ingress_url
    if ingress_url is not None and _requests is None:
        logging.warning("'requests' library not installed; HTTP ingress push is disabled. Run: pip install requests")
        ingress_url = None

    registry = DeviceRegistry()
    processor = FrameProcessor(registry, preview_enabled=not args.no_preview, save_dir=save_dir, queue_size=args.queue_size, ingress_url=ingress_url, push_interval=args.push_interval)
    announcer = HostAnnouncer(resolved_broadcast_address, args.discovery_port, args.tcp_port, args.broadcast_interval, args.lease_seconds)
    supervisor = Supervisor(registry)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.bind_ip, args.tcp_port))
    server.listen()
    server.settimeout(1.0)

    processor.start()
    announcer.start()
    supervisor.start()

    logging.info(
        "Master listening on %s:%s and broadcasting to %s:%s; saving frames to %s",
        args.bind_ip,
        args.tcp_port,
        resolved_broadcast_address,
        args.discovery_port,
        save_dir if save_dir is not None else "disabled",
    )

    try:
        while True:
            try:
                conn, address = server.accept()
            except socket.timeout:
                continue
            SessionHandler(conn, address, registry, processor).start()
    except KeyboardInterrupt:
        logging.info("Shutting down master")
    finally:
        announcer.stop()
        supervisor.stop()
        processor.stop()
        server.close()
        if cv2 is not None:
            cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())