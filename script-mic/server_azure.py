import asyncio
import websockets
import opuslib
import struct
from enum import Enum
import logging
import sys

from component.azure_speech_service import AzureSpeechService

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("AudioServer")

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
    def __init__(self, azure_speech_key, azure_speech_region):
        self.sample_rate = 16000
        self.chunk_size = 320  # 20ms @ 16kHz = 16000 * 0.02 = 320 samples
        self.clients = set()
        self.decoders = {}
        self.client_recording = {}
        self.azure_speech = AzureSpeechService(azure_speech_key, azure_speech_region)

    async def handle_client(self, websocket, path):
        client_id = id(websocket)
        self.clients.add(websocket)

        self.decoders[client_id] = opuslib.Decoder(self.sample_rate, 1)
        self.client_recording[client_id] = False
        client_info = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        logger.info(f"新客户端连接: {client_info} (ID: {client_id})")

        try:
            async for message in websocket:
                flag, buffer = unpack_message(message)
                if flag == Flag.START:
                    logger.info(f"客户端 {client_info} 开始录音")
                    self.client_recording[client_id] = True
                    # 初始化Azure语音识别
                    self.azure_speech.initialize_client(client_id)

                elif flag == Flag.STOP:
                    logger.info(f"客户端 {client_info} 停止录音")
                    self.client_recording[client_id] = False
                    # 停止Azure语音识别
                    self.azure_speech.stop_recognition(client_id)

                elif flag == Flag.DATA:
                    if not self.client_recording[client_id]:
                        continue
                    # 解码音频并发送到Azure语音识别
                    try:
                        decoded_data = self.decoders[client_id].decode(
                            buffer, self.chunk_size
                        )
                        # 发送到Azure进行识别
                        self.azure_speech.process_audio(client_id, decoded_data)
                    except Exception as e:
                        logger.error(
                            f"处理客户端 {client_info} 的音频时出错: {e}"
                        )

        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"客户端 {client_info} 连接关闭: {e}")
        except Exception as e:
            logger.error(f"处理客户端 {client_info} 时出错: {e}")

        finally:
            # 清理客户端资源
            self.clients.remove(websocket)
            if client_id in self.decoders:
                del self.decoders[client_id]
            if client_id in self.client_recording:
                del self.client_recording[client_id]
            # 清理Azure语音识别资源
            self.azure_speech.cleanup_client(client_id)
            logger.info(f"客户端 {client_info} 已断开连接")


async def main():
    # Azure服务配置
    azure_speech_key = ""    # Azure Speech密钥
    azure_speech_region = "eastasia"             
    
    server = AudioServer(azure_speech_key, azure_speech_region)
    host = "0.0.0.0"
    port = 8765
    # 启动WebSocket服务器
    async with websockets.serve(server.handle_client, host, port):
        logger.info(f"服务器已启动，监听地址 {host}:{port}")
        await asyncio.Future()  

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器被用户停止")
    except Exception as e:
        logger.error(f"服务器错误: {e}")