from __future__ import annotations

from dataclasses import dataclass
import socket
import struct

DISCOVERY_MAGIC = b"ECAM"
REGISTER_MAGIC = b"ECRG"
FRAME_MAGIC = b"ECFR"

PROTOCOL_VERSION = 1

OPCODE_HOST_ANNOUNCE = 1
MESSAGE_TYPE_REGISTER = 1
MESSAGE_TYPE_FRAME = 2

PIXEL_FORMAT_JPEG = 1
BOARD_TYPE_ESP32_CAM = 1

DISCOVERY_STRUCT = struct.Struct(">4sBBHHIH4s")
REGISTER_STRUCT = struct.Struct(">4sBBH6sHHHBBI6s")
FRAME_STRUCT = struct.Struct(">4sBBH6sIIHHBBI")

MAX_JPEG_PAYLOAD = 512 * 1024


def mac_to_text(mac: bytes) -> str:
    return ":".join(f"{byte:02X}" for byte in mac)


def build_announcement(tcp_port: int, sequence: int, lease_seconds: int, flags: int = 0) -> bytes:
    return DISCOVERY_STRUCT.pack(
        DISCOVERY_MAGIC,
        PROTOCOL_VERSION,
        OPCODE_HOST_ANNOUNCE,
        flags,
        tcp_port,
        sequence,
        lease_seconds,
        b"\x00" * 4,
    )


@dataclass(frozen=True)
class RegisterPacket:
    mac: bytes
    capability_flags: int
    width: int
    height: int
    pixel_format: int
    board_type: int
    session_id: int

    @classmethod
    def from_bytes(cls, payload: bytes) -> "RegisterPacket":
        values = REGISTER_STRUCT.unpack(payload)
        magic, version, message_type, header_len, mac, capability_flags, width, height, pixel_format, board_type, session_id, _reserved = values
        if magic != REGISTER_MAGIC:
            raise ValueError("invalid register magic")
        if version != PROTOCOL_VERSION:
            raise ValueError(f"unsupported protocol version: {version}")
        if message_type != MESSAGE_TYPE_REGISTER:
            raise ValueError(f"unexpected register message type: {message_type}")
        if header_len != REGISTER_STRUCT.size:
            raise ValueError(f"unexpected register header size: {header_len}")
        return cls(mac, capability_flags, width, height, pixel_format, board_type, session_id)


@dataclass(frozen=True)
class FramePacketHeader:
    mac: bytes
    frame_sequence: int
    timestamp_ms: int
    width: int
    height: int
    pixel_format: int
    flags: int
    payload_length: int

    @classmethod
    def from_bytes(cls, payload: bytes) -> "FramePacketHeader":
        values = FRAME_STRUCT.unpack(payload)
        magic, version, message_type, header_len, mac, frame_sequence, timestamp_ms, width, height, pixel_format, flags, payload_length = values
        if magic != FRAME_MAGIC:
            raise ValueError("invalid frame magic")
        if version != PROTOCOL_VERSION:
            raise ValueError(f"unsupported protocol version: {version}")
        if message_type != MESSAGE_TYPE_FRAME:
            raise ValueError(f"unexpected frame message type: {message_type}")
        if header_len != FRAME_STRUCT.size:
            raise ValueError(f"unexpected frame header size: {header_len}")
        if payload_length <= 0 or payload_length > MAX_JPEG_PAYLOAD:
            raise ValueError(f"invalid payload length: {payload_length}")
        return cls(mac, frame_sequence, timestamp_ms, width, height, pixel_format, flags, payload_length)


def recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sock.recv(size - len(chunks))
        if not chunk:
            raise ConnectionError("socket closed while receiving data")
        chunks.extend(chunk)
    return bytes(chunks)