import asyncio
import websockets
import opuslib
import struct
from enum import Enum
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("AudioServer")

# 协议定义
class Flag(Enum):
    START = 0
    STOP = 1
    DATA = 2

def pack_message(flag, buffer=None):
    if buffer is None:
        buffer = b""
    return struct.pack("B", flag.value) + buffer


def unpack_message(data):
    flag = Flag(data[0])
    buffer = data[1:] if len(data) > 1 else b""
    return flag, buffer

class AudioServer:

    def __init__(self):
        # 音频配置
        self.sample_rate = 16000
        self.chunk_size = 320  # 60ms @ 16kHz = 16000 * 0.06 = 960 samples
        # 存储连接的客户端
        self.clients = set()
        # Opus编解码器(为每个客户端创建)
        self.encoders = {}
        self.decoders = {}
        # 音频缓冲区(为每个客户端创建)
        self.audio_buffers = {}
        # 客户端状态
        self.client_recording = {}

    async def handle_client(self, websocket, path):
        # 添加新客户端
        client_id = id(websocket)
        self.clients.add(websocket)
        # 为客户端创建编解码器和缓冲区
        self.encoders[client_id] = opuslib.Encoder(
            self.sample_rate, 1, opuslib.APPLICATION_AUDIO
        )

        self.decoders[client_id] = opuslib.Decoder(self.sample_rate, 1)
        self.audio_buffers[client_id] = []  # 使用列表存储原始PCM数据块
        self.client_recording[client_id] = False
        client_info = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        logger.info(f"New client connected: {client_info} (ID: {client_id})")

        try:
            async for message in websocket:
                flag, buffer = unpack_message(message)
                if flag == Flag.START:
                    logger.info(f"Client {client_info} started recording")
                    self.client_recording[client_id] = True
                    # 清空缓冲区
                    self.audio_buffers[client_id] = []

                elif flag == Flag.STOP:
                    logger.info(f"Client {client_info} stopped recording")
                    self.client_recording[client_id] = False
                    # 客户端停止录音，将缓存的音频发送回客户端
                    await self.send_buffered_audio(websocket, client_id, client_info)

                elif flag == Flag.DATA:
                    if not self.client_recording[client_id]:
                        continue
                    # 解码音频并存储在缓冲区
                    try:
                        decoded_data = self.decoders[client_id].decode(
                            buffer, self.chunk_size
                        )
                        # 存储原始PCM数据块
                        self.audio_buffers[client_id].append(decoded_data)
                    except Exception as e:
                        logger.error(
                            f"Error decoding audio from client {client_info}: {e}"
                        )

        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"Connection closed for client {client_info}: {e}")
        except Exception as e:
            logger.error(f"Error handling client {client_info}: {e}")

        finally:
            # 清理客户端资源
            self.clients.remove(websocket)
            if client_id in self.encoders:
                del self.encoders[client_id]
            if client_id in self.decoders:
                del self.decoders[client_id]
            if client_id in self.audio_buffers:
                del self.audio_buffers[client_id]
            if client_id in self.client_recording:
                del self.client_recording[client_id]
            logger.info(f"Client {client_info} disconnected")

    async def send_buffered_audio(self, websocket, client_id, client_info):

        buffer_chunks = self.audio_buffers[client_id]
        if not buffer_chunks:

            logger.warning(f"No audio data to send back to client {client_info}")
            return

        total_bytes = sum(len(chunk) for chunk in buffer_chunks)
        logger.info(
            f"Sending buffered audio back to client {client_info} ({total_bytes} bytes)"
        )

        # 发送START信号
        await websocket.send(pack_message(Flag.START))
        logger.info(f"Sent START signal to client {client_info}")
        # 直接发送每个60ms的音频块
        logger.info(
            f"Sending {len(buffer_chunks)} audio chunks to client {client_info}"
        )

        for raw_chunk in buffer_chunks:
            try:
                # 确保数据是字节类型
                if not isinstance(raw_chunk, bytes):
                    raw_chunk = bytes(raw_chunk)
                # 编码音频块
                encoded_data = self.encoders[client_id].encode(
                    raw_chunk, self.chunk_size
                )

                # 发送编码后的音频
                await websocket.send(pack_message(Flag.DATA, encoded_data))
                # 短暂延迟以模拟实时播放
                await asyncio.sleep(0.01)  # 10ms延迟，保持流畅度
            except Exception as e:
                logger.error(
                    f"Error encoding/sending audio to client {client_info}: {e}",
                    exc_info=True,
                )

        # 发送STOP信号
        await websocket.send(pack_message(Flag.STOP))
        logger.info(f"Sent STOP signal to client {client_info}")


async def main():
    server = AudioServer()
    host = "0.0.0.0"
    port = 8765
    # 启动WebSocket服务器
    async with websockets.serve(server.handle_client, host, port):
        logger.info(f"Server started on {host}:{port}")
        await asyncio.Future()  # 运行直到被中断

if __name__ == "__main__":

    try:

        asyncio.run(main())

    except KeyboardInterrupt:

        logger.info("Server stopped by user")

    except Exception as e:

        logger.error(f"Server error: {e}")
