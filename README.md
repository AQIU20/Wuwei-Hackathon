# Unforce Make / 无为创造

Modular IoT blocks that magnetically snap together, auto-join Wi-Fi, and let a cloud AI agent understand and control your space.

> Hackathon 2026 project — expect frequent changes.

## Repo Structure

```text
.
├── src/main/          # Bun + Hono agent server
├── web/               # Next.js website
├── scripts/           # Local utility scripts
└── idea/              # Notes and planning docs
```

## Local Development

### Agent Server

```bash
bun install
HARDWARE_MODE=mqtt OPENAI_API_KEY=... bun run dev
```

Modes:
- `HARDWARE_MODE=mqtt`: the only real hardware ingress mode. The server connects directly to the MQTT broker and ingests AI Hub topics.
- `HARDWARE_MODE=mock`: local demo mode only. It generates simulated sensor updates in memory.

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

### Website

```bash
cd web
bun install
cp .env.example .env.local
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:8787 bun run dev
```

## Railway Deployment

Deploy this repo as two Railway services:
- `agent-server`
- `web`

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

### 2. Web Service

Service settings:
- Root Directory: `web`
- Builder: Dockerfile
- Dockerfile Path: `Dockerfile`

Environment variables:
- `NEXT_PUBLIC_AGENT_SERVER_URL=https://<your-agent-domain>`

Deploy check:
- Open `/agent`
- Confirm the right panel shows live hardware data from the server WebSocket
- Send a prompt and confirm streamed tool calls and assistant text render correctly

## Notes

- The agent server is now the single runtime for both coding tools and hardware tools.
- Hardware updates are distributed over WebSocket through the shared `HardwareStore`.
- Raw MQTT envelopes can be persisted into Supabase `hardware_events` through the built-in AI Hub MQTT bridge.
- Set `HARDWARE_MODE=mqtt` to subscribe to `aihub/status/#`, `aihub/sensor/#`, `aihub/event/#`, and `aihub/resp/#` and map them into the in-memory hardware graph.
- Direct hardware writes over `/v1/hardware/ws` are rejected outside `mock` mode, so MQTT remains the only real ingress path.
- Persistent session/memory/config data lives under `AGENT_DATA_DIR`.
- The old `web/app/api/chat` path is no longer the active chat path for the website UI.

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

## Tech Stack

- Hardware: ESP32-S3 / ESP32-C3, POGO-pin magnetic connectors
- Server: Bun + Hono + `pi-coding-agent`
- Website: Next.js 16 + React 19 + Tailwind CSS 4 + Three.js
- AI: OpenAI / other providers via `pi-ai`

## Team

Team Unforce Make (无为创造)
