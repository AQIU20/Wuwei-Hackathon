# AI Integration Guide

This document describes the smallest stable interface an upper-layer AI system should use to interact with the ESP32-C3 node in this repository.

The recommended entrypoint is [aht20xxx.py](aht20xxx.py), not raw MQTT topic construction inside the AI layer.

## Goal

Expose these AI-callable capabilities:

1. Get current device status
2. Get latest temperature and humidity
3. Set WS2812 effect and parameters
4. Set raw WS2812 pixel colors
5. Watch live node events

## Default Connection

Current defaults:

1. Broker host: `96.47.238.33`
2. Broker port: `1883`
3. Root topic: `aihub`

The script defaults match the current firmware configuration.

## Required Input

Every command needs a node ID.

Example:

`heap_c13de8`

The firmware generates node IDs in this format:

`{node_type}_{last_3_bytes_of_mac_in_lowercase_hex}`

## AI-Facing Commands

### 1. Get Full Status

Use this when the AI wants one call that includes:

1. device identity
2. network information
3. current WS2812 state
4. latest AHT20 reading
5. heap/resource metrics

Command:

```bash
python aht20xxx.py status --node-id heap_c13de8 --json-only
```

Returns one JSON object containing the MQTT envelope and the embedded device payload.

### 2. Get Only Temperature and Humidity

Use this when the AI only needs environment data.

Command:

```bash
python aht20xxx.py env --node-id heap_c13de8 --json-only
```

Typical output:

```json
{"ready": true, "temperature_c": 19.78, "humidity_percent": 62.77}
```

### 3. Set WS2812 Effect

Use this when the AI needs to actively control the light ring.

Command:

```bash
python aht20xxx.py ws2812 --node-id heap_c13de8 --effect rainbow --json-only
```

With parameters:

```bash
python aht20xxx.py ws2812 --node-id heap_c13de8 --effect siri --speed 25 --brightness 180 --hue 260 --json-only
```

Returns one JSON object containing the WS2812 command response.

### 4. Watch Live Events

Use this when the AI needs direct pixel-level control of the ring.

Set individual pixels:

```bash
python aht20xxx.py raw --node-id heap_c13de8 --pixels '0:255,0,0;1:0,255,0;2:0,0,255' --json-only
```

Set the entire ring to one color:

```bash
python aht20xxx.py raw --node-id heap_c13de8 --fill 255,32,0 --json-only
```

Returns one JSON object containing the WS2812 command response.

### 5. Watch Live Events

Use this when the AI or tool wants to stream node events.

Command:

```bash
python aht20xxx.py watch --node-id heap_c13de8 --watch-seconds 30 --json-only
```

Each line is emitted as a compact JSON object.

## Supported WS2812 Effects

Valid effect names:

1. `off`
2. `raw`
3. `rainbow`
4. `particles`
5. `siri`
6. `boot`
7. `wifi_connecting`
8. `mqtt_online`
9. `status`

Parameter ranges:

1. `speed`: 10-1000
2. `brightness`: 0-255
3. `hue`: 0-360

## Recommended Tool Mapping For AI

If you wrap the Python script for an AI agent, keep the interface small and explicit.

Recommended tool names:

1. `get_device_status(node_id)`
2. `get_env(node_id)`
3. `set_ws2812(node_id, effect, speed=None, brightness=None, hue=None)`
4. `set_ws2812_raw(node_id, pixels=None, fill=None)`
5. `watch_node(node_id, seconds=30)`

## Recommended Execution Examples

### Ask current room conditions

```bash
python aht20xxx.py env --node-id heap_c13de8 --json-only
```

### Ask whether the light is already running

```bash
python aht20xxx.py status --node-id heap_c13de8 --json-only
```

Read:

1. `payload.ws2812.effect`
2. `payload.ws2812.running`
3. `payload.ws2812.speed_ms`
4. `payload.ws2812.brightness`
5. `payload.ws2812.hue`

### Set a calm blue Siri-like mode

```bash
python aht20xxx.py ws2812 --node-id heap_c13de8 --effect siri --speed 40 --brightness 160 --hue 220 --json-only
```

### Turn the ring off

```bash
python aht20xxx.py ws2812 --node-id heap_c13de8 --effect off --json-only
```

### Set individual pixels directly

```bash
python aht20xxx.py raw --node-id heap_c13de8 --pixels '0:255,0,0;1:0,255,0;2:0,0,255' --json-only
```

### Fill the whole ring with one raw RGB color

```bash
python aht20xxx.py raw --node-id heap_c13de8 --fill 255,32,0 --json-only
```

## Why Use `--json-only`

For AI and automation, `--json-only` avoids human-oriented log text and makes downstream parsing stable.

Without it, the script prints helper lines like:

1. published topic
2. payload text
3. watch banners

With it, stdout contains machine-friendly JSON only.

## Related Files

1. [aht20xxx.py](aht20xxx.py)
2. [README.md](README.md)
3. [src/main.cpp](src/main.cpp)
4. [src/c3_ws2812_apps.cpp](src/c3_ws2812_apps.cpp)
5. [src/sensor_env_aht20_node.cpp](src/sensor_env_aht20_node.cpp)