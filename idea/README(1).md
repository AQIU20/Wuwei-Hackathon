| Supported Targets | ESP32 | ESP32-C2 | ESP32-C3 | ESP32-C5 | ESP32-C6 | ESP32-C61 | ESP32-H2 | ESP32-H21 | ESP32-H4 | ESP32-P4 | ESP32-S2 | ESP32-S3 | Linux |
| ----------------- | ----- | -------- | -------- | -------- | -------- | --------- | -------- | --------- | -------- | -------- | -------- | -------- | ----- |

# S3 Node

ESP32-S3 application migrated from the C3 node framework. It keeps the same MQTT topic model, sensor framework, WS2812 effect layer, heartbeat publishing, and resource monitoring, while targeting an ESP32-S3 project skeleton.

## How to use

Build this project as an ESP32-S3 firmware and then configure the board-specific GPIOs in `menuconfig` or in `sdkconfig.defaults.esp32s3`.


## Project layout

The project uses [main.c](main/main.c) as the application entry file. The file is located in folder [main](main).

ESP-IDF projects are built using CMake. The project build configuration is contained in `CMakeLists.txt` files that provide set of directives and instructions describing the project's source files and targets (executable, library, or both).

Below is short explanation of remaining files in the project folder.

```
├── CMakeLists.txt
├── pytest_hello_world.py      Python script used for automated testing
├── main
│   ├── CMakeLists.txt
│   ├── Kconfig.projbuild
│   └── main.c
└── README.md                  This is the file you are currently reading
```

For more information on structure and contents of ESP-IDF projects, please refer to Section [Build System](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/build-system.html) of the ESP-IDF Programming Guide.

## Troubleshooting

* Program upload failure

    * Hardware connection is not correct: run `idf.py -p PORT monitor`, and reboot your board to see if there are any output logs.
    * The baud rate for downloading is too high: lower your baud rate in the `menuconfig` menu, and try again.

## Python MQTT Client

This workspace includes a small Python MQTT helper in `mqtt_bridge_client.py` that publishes commands using the `aihub/...` topic convention and listens for the node's `status` and `resp` messages.

Install the dependency:

```bash
pip install -r requirements-mqtt-client.txt
```

Request device info from one node and listen for responses for 5 seconds:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --info
```

Turn the LED on GPIO8 on or off with JSON payloads:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --led on
python mqtt_bridge_client.py --node-id led_a1b2c3 --led off
```

Send plain string commands instead of JSON:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --led toggle --payload-format string
```

Trigger one of the built-in WS2812 ring effects:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect rainbow
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect particles
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect siri
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect boot
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect wifi_connecting
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect mqtt_online
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect off
```

Pass optional effect parameters:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --ws2812-effect siri --ws2812-speed 25 --ws2812-brightness 180 --ws2812-hue 260
```

Send a raw payload to a command subject explicitly:

```bash
python mqtt_bridge_client.py --node-id led_a1b2c3 --command-subject info '{"request":"info"}'
```

The defaults match the firmware configuration in `main/Kconfig.projbuild`:

- broker: `mqtt://broker.emqx.io`
- root topic: `aihub`
- command topic: `aihub/cmd/{node_id}/{subject}`
- sensor topic: `aihub/sensor/{node_id}/data`
- subscribe filter: `aihub/+/{node_id}/#`
- sensor profile: `C3_SENSOR_PROFILE`
- sensor report interval: `CONFIG_C3_SENSOR_REPORT_INTERVAL_SECONDS` default `5`
- heartbeat interval: `CONFIG_C3_HEARTBEAT_INTERVAL_SECONDS` default `5`
- resource monitor interval: `CONFIG_C3_RESOURCE_MONITOR_INTERVAL_SECONDS` default `5`

## Sensor Framework

The project now includes a compile-time sensor framework for ESP32-C3 nodes.

Current structure:

- `components/sensor_common`: unified sensor driver interface and active-profile registry
- `components/sensor_led`: sample sensor profile that exposes the onboard LED as a sensor node
- `components/sensor_pir`: PIR motion sensor profile using one GPIO input
- `components/sensor_env_aht20`: AHT20 environment sensor profile using the shared I2C bus
- `components/sensor_imu_mpu6050`: MPU6050 IMU profile using the shared I2C bus
- `components/c3_platform/c3_i2c_service.c`: shared I2C bus setup for I2C-based sensors
- `components/c3_platform/c3_ws2812_service.c`: common 8-pixel WS2812 ring service shared by all node profiles
- `components/c3_platform/c3_ws2812_apps.c`: common WS2812 effect runner with built-in animated presets controllable over MQTT

The active sensor profile is selected at build time in `menuconfig` through `C3_SENSOR_PROFILE`.

Current implemented profile:

- `C3_SENSOR_PROFILE_LED`: sample LED node used to validate the common sensor architecture
- `C3_SENSOR_PROFILE_PIR`: real PIR motion node
- `C3_SENSOR_PROFILE_ENV_AHT20`: real AHT20 temperature and humidity node
- `C3_SENSOR_PROFILE_IMU_MPU6050`: real MPU6050 acceleration and gyroscope node

Important per-profile configuration in `menuconfig`:

- `C3_PIR_GPIO`
- `C3_PIR_ACTIVE_HIGH`
- `C3_I2C_SDA_GPIO`
- `C3_I2C_SCL_GPIO`
- `C3_I2C_CLOCK_HZ`
- `C3_AHT20_ADDRESS`
- `C3_MPU6050_ADDRESS`
- `C3_WS2812_ENABLE`
- `C3_WS2812_GPIO`
- `C3_WS2812_LED_COUNT`
- `C3_WS2812_BRIGHTNESS`

The runtime flow is:

1. `main/main.c` loads the active sensor driver from the registry
2. the sensor driver is initialized and started during boot
3. sensor data is published periodically to `aihub/sensor/{node_id}/data`
4. sensor-specific commands are routed from `aihub/cmd/{node_id}/{subject}` to the active sensor driver

This means later real sensors such as MPU6050 can be added without rewriting the common Wi-Fi, MQTT, heartbeat, and resource-monitoring logic.

## Third-Party MQTT Client Testing

If you want to test with MQTTX, MQTT Explorer, EMQX Dashboard, `mosquitto_pub`, or any other third-party MQTT client, use the same public broker configured in the firmware:

```text
Broker: mqtt://broker.emqx.io
```

The firmware generates `node_id` as:

```text
{C3_NODE_TYPE}_{last_3_bytes_of_mac_in_lowercase_hex}
```

For example, if `C3_NODE_TYPE=led` and the device MAC is `A4:CB:8F:21:E6:C8`, then the node id is:

```text
led_21e6c8
```

### What to subscribe to

To see all messages for one node, subscribe to:

```text
aihub/+/led_21e6c8/#
```

Common topics are:

- online status: `aihub/status/led_21e6c8/online`
- heartbeat: `aihub/status/led_21e6c8/heartbeat`
- sensor data: `aihub/sensor/led_21e6c8/data`
- offline last will: `aihub/status/led_21e6c8/offline`
- info response: `aihub/resp/led_21e6c8/info`
- LED response: `aihub/resp/led_21e6c8/led`
- WS2812 response: `aihub/resp/led_21e6c8/ws2812`

Status and response messages sent by the firmware use a unified envelope like this:

```json
{
    "v": 1,
    "ts": 1744000000000,
    "node_id": "led_21e6c8",
    "msg_id": "00000001",
    "type": "heartbeat",
    "payload": {
        "node_type": "led",
        "fw_version": "0.1.0",
        "chip_uid": "esp32c3-a4cb8f21e6c8",
        "net": {
            "ip": "192.168.1.23",
            "ssid": "ladygag",
            "rssi": -52,
            "mac": "A4:CB:8F:21:E6:C8"
        },
        "uptime_s": 37,
        "free_heap": 183456,
        "led": {
            "state": "off",
            "pin": 8
        },
        "ws2812": {
            "enabled": true,
            "ready": true,
            "gpio": 2,
            "count": 8,
            "brightness": 64,
            "effect": "siri",
            "running": true,
            "speed_ms": 25,
            "effect_brightness": 180,
            "hue": 260
        },
        "resources": {
            "heap": {
                "free": 183456,
                "min_free": 172104,
                "largest_block": 120832,
                "internal_free": 181920
            },
            "flash": {
                "total_size": 4194304,
                "app_partition_size": 1048576,
                "app_partition_address": 65536
            }
        }
    }
}
```

The `heartbeat` payload includes the current cached resource snapshot from a background monitor task. At the moment it reports:

- heap free bytes
- heap minimum free bytes since boot
- largest allocatable heap block
- free internal heap bytes
- total detected flash size
- current app partition size
- current app partition address

Sensor data messages are also wrapped in the same envelope and are published to `aihub/sensor/{node_id}/data`.

Current `sensor_led` example payload:

```json
{
    "v": 1,
    "ts": 1744000005000,
    "node_id": "led_21e6c8",
    "msg_id": "00000002",
    "type": "sensor_data",
    "payload": {
        "sensor": "led",
        "state": "off",
        "pin": 8
    }
}
```

Current `sensor_pir` example payload:

```json
{
    "v": 1,
    "ts": 1744000005000,
    "node_id": "pir_21e6c8",
    "msg_id": "00000002",
    "type": "sensor_data",
    "payload": {
        "sensor": "pir",
        "motion": true,
        "gpio": 3,
        "raw_level": 1
    }
}
```

Current `sensor_env_aht20` example payload:

```json
{
    "v": 1,
    "ts": 1744000005000,
    "node_id": "env_21e6c8",
    "msg_id": "00000002",
    "type": "sensor_data",
    "payload": {
        "sensor": "aht20",
        "temperature_c": 24.58,
        "humidity_percent": 51.42
    }
}
```

Current `sensor_imu_mpu6050` example payload:

```json
{
    "v": 1,
    "ts": 1744000005000,
    "node_id": "imu_21e6c8",
    "msg_id": "00000002",
    "type": "sensor_data",
    "payload": {
        "sensor": "mpu6050",
        "accel": {
            "x": 0.12,
            "y": -0.03,
            "z": 9.81
        },
        "gyro": {
            "x": 0.0020,
            "y": -0.0010,
            "z": 0.0050
        },
        "temp_c": 28.50,
        "attitude": {
            "roll": 2.10,
            "pitch": -0.50,
            "yaw": 0.00
        }
    }
}
```

### What to publish

The current firmware does not parse the envelope on `cmd` topics. For command topics, publish the raw command payload directly.

LED control topic:

```text
aihub/cmd/led_21e6c8/led
```

Supported payload examples:

```text
on
off
toggle
```

or JSON:

```json
{"led":"on"}
{"led":"off"}
{"led":"toggle"}
```

WS2812 effect topic:

```text
aihub/cmd/led_21e6c8/ws2812
```

Supported payload examples:

```text
rainbow
particles
siri
boot
wifi_connecting
mqtt_online
off
status
```

or JSON:

```json
{"effect":"rainbow"}
{"effect":"particles"}
{"effect":"siri"}
{"effect":"boot"}
{"effect":"wifi_connecting"}
{"effect":"mqtt_online"}
{"effect":"off"}
{"effect":"siri","speed_ms":25,"brightness":180,"hue":260}
```

Current built-in effects:

- `rainbow`: rotating rainbow ring with a breathing brightness envelope
- `particles`: random moving spark particles around the ring
- `siri`: multi-color flowing band inspired by Siri-style gradients
- `boot`: startup sweep effect with a configurable accent hue
- `wifi_connecting`: rotating chase effect for network connection state
- `mqtt_online`: breathing halo effect for connected state

Info query topic:

```text
aihub/cmd/led_21e6c8/info
```

Payload examples:

```json
{}
{"request":"info"}
```

### `mosquitto` examples

Subscribe to all messages for the node:

```bash
mosquitto_sub -h broker.emqx.io -t "aihub/+/led_21e6c8/#" -v
```

Turn LED on:

```bash
mosquitto_pub -h broker.emqx.io -t "aihub/cmd/led_21e6c8/led" -m "on"
```

Turn LED off with JSON:

```bash
mosquitto_pub -h broker.emqx.io -t "aihub/cmd/led_21e6c8/led" -m '{"led":"off"}'
```

Request device info:

```bash
mosquitto_pub -h broker.emqx.io -t "aihub/cmd/led_21e6c8/info" -m '{"request":"info"}'
```

Start the Siri-style WS2812 effect:

```bash
mosquitto_pub -h broker.emqx.io -t "aihub/cmd/led_21e6c8/ws2812" -m '{"effect":"siri"}'
```

Start a Wi-Fi-connecting style effect with custom parameters:

```bash
mosquitto_pub -h broker.emqx.io -t "aihub/cmd/led_21e6c8/ws2812" -m '{"effect":"wifi_connecting","speed_ms":60,"brightness":200,"hue":36}'
```

## Technical support and feedback

Please use the following feedback channels:

* For technical queries, go to the [esp32.com](https://esp32.com/) forum
* For a feature request or bug report, create a [GitHub issue](https://github.com/espressif/esp-idf/issues)

We will get back to you as soon as possible.
