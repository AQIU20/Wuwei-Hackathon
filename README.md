# Unforce Make / 无为创造

Modular IoT blocks that magnetically snap together, auto-join Wi-Fi, and let a cloud AI agent understand and control your space.

> Hackathon 2026 project — expect frequent changes.

## Repo Structure

```text
.
├── app/               # Next.js app router frontend
├── src/main/          # Bun + Hono agent server
├── scripts/           # Local utility scripts
└── idea/              # Notes and planning docs
```

## Local Development

### Agent Server

```bash
bun install
HARDWARE_MODE=mqtt OPENAI_API_KEY=... bun run dev
```

Mode:
- `HARDWARE_MODE=mqtt`: the server connects directly to the MQTT broker and ingests AI Hub topics.

Server endpoints:
- `GET /health`
- `GET /ready`
- `GET /v1/blocks`
- `GET /v1/blocks/:blockId/history`
- `GET /v1/history`
- `GET /v1/hardware-events`
- `GET /v1/hardware/ws`
- `POST /v1/chat/sessions`
- `POST /v1/chat/sessions/:sessionId/messages`

### Frontend

```bash
bun install
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:8787 bun run dev
```

## Railway Deployment

Deploy the agent server from this repo as a Railway service:
- `agent-server`

### 1. Agent Server Service

Service settings:
- Root Directory: repo root
- Builder: Dockerfile
- Dockerfile Path: `Dockerfile`

Environment variables:
- `OPENAI_API_KEY`
- `AGENT_MODEL=openai/gpt-5-mini`
- `CORS_ORIGIN=https://<your-web-domain>`
- `HARDWARE_MODE=mqtt`
- `AGENT_DATA_DIR=/data`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_HISTORY_TABLE=hardware_history`
- `SUPABASE_HARDWARE_EVENTS_TABLE=hardware_events`
- `SUPABASE_PERSIST_INTERVAL_MS=15000`

Optional:
- `MQTT_BROKER_URI`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_ROOT_TOPIC=aihub`
- `TAVILY_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `PORT` is provided by Railway automatically

Recommended Railway settings:
- Add a volume mounted at `/data`
- Healthcheck path: `/health`
- Readiness path: `/ready`

Deploy check:
- `GET https://<agent-domain>/health` should return `ok: true`
- `GET https://<agent-domain>/ready` should return `200` once `OPENAI_API_KEY` and an active model are available
- `GET https://<agent-domain>/v1/blocks` should show AI Hub nodes after they publish MQTT status/sensor messages
- `GET https://<agent-domain>/v1/history?limit=5` should return rows after hardware snapshots start flowing
- `GET https://<agent-domain>/v1/hardware-events?limit=5` should return MQTT raw event rows after broker messages start flowing
- `GET https://<agent-domain>/v1/blocks/heart_01/history?minutes=60&limit=10` should return recent rows for that block

## Notes

- The agent server is now the single runtime for both coding tools and hardware tools.
- Hardware updates are distributed over WebSocket through the shared `HardwareStore`.
- Raw MQTT envelopes can be persisted into Supabase `hardware_events` through the built-in AI Hub MQTT bridge.
- Set `HARDWARE_MODE=mqtt` to subscribe to `aihub/status/#`, `aihub/sensor/#`, `aihub/event/#`, and `aihub/resp/#` and map them into the in-memory hardware graph.
- Direct hardware writes over `/v1/hardware/ws` are rejected, so MQTT remains the only ingress path.
- Persistent session/memory/config data lives under `AGENT_DATA_DIR`.

## Hardware Events Schema

- Apply `idea/hardware-events-memory-schema.sql` in Supabase before enabling the MQTT bridge.
- `hardware_events` stores the original AI Hub MQTT envelope plus normalized routing fields like `scope`, `subject`, `node_type`, `capability`, `status`, and `confidence`.
- `context_episodes` is reserved for scheduler-built context episodes such as `resting_at_home`.
- `agent_memories` is reserved for long-lived memory distilled from repeated episodes.

## Testing

```bash
bun test
```

- `bun run mqtt:test:hello` publishes test MQTT envelopes into the configured broker.
- `bun run mqtt:test:railway` is the primary end-to-end ingest test. It publishes a synthetic MQTT envelope to the broker, waits for the Railway agent-server to ingest it, and verifies the row through `GET /v1/hardware-events?msg_id=...`.
- `bun run hardware-events:test:write` is only a direct Supabase write/read sanity check for the table itself. It bypasses the MQTT -> Railway ingest path.

## Voice STT Module

v1 microphone ingestion does not send raw audio into the agent server. Instead, local audio is transcribed on the hardware-side machine and only MQTT summary events are published:
- `aihub/event/<node_id>/vad`
- `aihub/event/<node_id>/transcript`

The repo includes a local helper:

```bash
bun run voice:stt
```

It watches [`data/voice-inbox`](./data/voice-inbox) for `.wav` files, runs simple VAD, then executes an external STT CLI and publishes MQTT events.

Recommended STT CLI: `whisper.cpp`

Setup example:

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
./models/download-ggml-model.sh base
cmake -B build
cmake --build build -j --config Release
```

Environment example:

```bash
export MQTT_BROKER_URI=mqtt://localhost:1883
export MQTT_ROOT_TOPIC=aihub
export VOICE_NODE_ID=vad_demo_01
export VOICE_STT_COMMAND='/absolute/path/to/whisper.cpp/build/bin/whisper-cli -m /absolute/path/to/whisper.cpp/models/ggml-base.bin -f {input} -l auto -nt -of {output_base} -oj'
bun run voice:stt
```

Command placeholders:
- `{input}`: absolute path to the wav file being processed
- `{output_base}`: output prefix for CLIs like `whisper-cli` that write `json/txt` files

Quick smoke test:

```bash
cp /path/to/sample.wav data/voice-inbox/turn_the_lights_on.wav
```

If `VOICE_STT_COMMAND` is unset, the module falls back to using the file name stem as transcript text, which is only useful for MQTT pipeline testing.

## Direct Voice Ingress

For lower-latency microphone command entry, transcript text can bypass MQTT and be posted directly to the agent server:

```bash
curl -X POST http://localhost:8787/v1/voice/ingress \
  -H 'Content-Type: application/json' \
  -d '{
    "node_id": "mic_01",
    "utterance_id": "utt-0001",
    "event_id": "evt-0001",
    "text": "turn on the desk light",
    "is_final": true,
    "confidence": 0.91,
    "language": "en",
    "wakeword": "hey hub",
    "trigger": true,
    "timestamp_ms": 1744123456891
  }'
```

Behavior:
- updates the live `HardwareStore` immediately so tools can read the newest microphone state
- writes an async `hardware_events` row when Supabase is configured
- if `is_final=true` and `trigger=true`, the text is injected directly into the agent as a user query

Recommended request fields:
- `node_id`: stable microphone ID, for example `mic_01`
- `utterance_id`: stable per spoken utterance, used for prompt de-duplication
- `event_id`: stable per POST event, used for event persistence de-duplication
- `text`: transcript text
- `is_final`: `true` only for the finalized transcript
- `trigger`: `true` only when this utterance should become a user command
- `confidence`, `language`, `wakeword`, `timestamp_ms`: optional metadata

## Tech Stack

- Hardware: ESP32-S3 / ESP32-C3, POGO-pin magnetic connectors
- Server: Bun + Hono + `pi-coding-agent`
- Frontend: Next.js 16 + React 19 + Tailwind CSS 4 + Three.js
- AI: OpenAI / other providers via `pi-ai`

## Team

Team Unforce Make (无为创造)
