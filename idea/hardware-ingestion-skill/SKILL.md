---
name: hardware-ingestion-skill
description: Use when adding or updating a hardware module in this repo and you need the full path from MQTT ingress to Supabase persistence, agent tool design, and validation. Covers how a new block is recognized, how data enters hardware_events and hardware_history, when to define generic versus device-specific tools, and how to verify the end-to-end query path for agent answers.
---

# Hardware Ingestion Skill

Use this skill when integrating a new hardware block into the current Bun + Hono + MQTT + Supabase stack.

This skill is for the current repo architecture, not the older mock or PC-host designs.

## Outcome

After following this skill, a new hardware module should satisfy all of these:

- MQTT messages are accepted by the server
- the block appears in `HardwareStore`
- raw events are written to `hardware_events`
- block snapshots are written to `hardware_history`
- the agent can query the data through the right tool
- if needed, the device has its own dedicated tool

## Canonical Mental Model

There are two storage layers. Do not mix them up.

- `hardware_events`: raw event log from MQTT ingress
- `hardware_history`: block-level historical snapshots derived from `HardwareStore`

Use this rule:

- ask "what happened / how many times / did this event arrive / what did AI detect" -> query `hardware_events`
- ask "how did this block's state change over time" -> query `hardware_history`

## Source Of Truth In Code

Read only these files first:

- `src/main/hardware/mqtt-bridge.ts`
- `src/main/hardware/mqtt-protocol.ts`
- `src/main/hardware/store.ts`
- `src/main/history/hardware-event-service.ts`
- `src/main/history/supabase-history-service.ts`
- `src/main/tools/hardware-events/index.ts`
- `src/main/tools/hardware-history/index.ts`
- `src/main/tools/device-tools/index.ts`
- `src/main/agent.ts`

## Workflow

### 1. Confirm the hardware message contract

Before changing code, write down:

- `node_id` format, for example `env_hello01`
- `node_type`, for example `env`, `cam`, `led`
- MQTT topic shape, for example `aihub/sensor/{node_id}/data`
- envelope type, for example `sensor_data`, `online`, `offline`, `cmd`
- payload fields that matter to the agent

If the device does not fit the current AI Hub envelope:

- `msg_id`
- `node_id`
- `payload`
- `ts`
- `type`
- `v`

then fix the device-side or bridge-side contract first. Do not patch downstream tools until ingress shape is stable.

### 2. Make the block recognizable

The server must be able to infer:

- `node_type`
- `capability`
- `block type` = `sensor` / `stream` / `actuator`

Update:

- `src/main/hardware/mqtt-protocol.ts`
- `src/main/hardware/mqtt-bridge.ts`

Typical work:

- add new `AihubNodeType` if needed
- map `node_type -> capability`
- map `node_type -> block type`
- if needed, map `node_type -> chip family`

If the device sends camera- or actuator-specific payloads, extend the extraction logic in `mqtt-bridge.ts`.

### 3. Ensure raw ingress lands in `hardware_events`

Raw event persistence should happen before any higher-level interpretation.

Current path:

`MQTT -> AihubMqttBridge.handleMessage -> HardwareEventService.insertMqttEnvelope -> Supabase hardware_events`

Check:

- the topic parses under `parseAihubTopic(...)`
- the envelope normalizes correctly under `normalizeAihubMqttEnvelope(...)`
- fields needed later for querying are preserved in `payload`
- `capability`, `scope`, `subject`, `type`, `msg_id`, and `recorded_at` are correct

If the new hardware introduces new semantics such as person detection, gesture detection, occupancy count, or ASR transcript events, prefer storing that directly in `payload` and query it later from `hardware_events`.

### 4. Ensure the block updates `HardwareStore`

Raw events are not enough. The block also needs a usable current state.

Current path:

`MQTT -> AihubMqttBridge.toIngressMessages -> HardwareStore.applyMessage`

Check which `HardwareIngressMessage` variants the device should produce:

- `announce`
- `status`
- `telemetry`
- `snapshot`
- `actuator_state`
- `command_result`

Rules:

- sensors should usually emit `telemetry`
- camera/scene-like inputs should emit `snapshot` or telemetry with clearly queryable fields
- actuators should update `actuator_state` and `command_result`

If the device is input-only and you want the agent to read the latest state directly, make sure `HardwareStore.getSensorData(...)` or `HardwareStore.getCameraScene(...)` can serve it.

### 5. Ensure block history lands in `hardware_history`

Current path:

`HardwareStore update -> hardware.subscribe(...) -> SupabaseHistoryService.persistSnapshot(...) -> Supabase hardware_history`

Important repo-specific rules:

- `hardware_history` stores block snapshots, not raw MQTT envelopes
- `recorded_at` should reflect each block's `last_seen_ms`
- writes are throttled per block, not globally

Only data present in the snapshot payload is persisted, so verify the block contributes meaningful `latest`, `scene`, or `actuator` data.

If a device's important information exists only as transient events and should not be flattened into a block snapshot, query it from `hardware_events` instead of forcing it into `hardware_history`.

### 6. Choose the right agent tool

There are three tool layers in this repo.

#### A. Generic state/history tools

Use existing tools when the device fits standard behavior:

- `list_blocks`
- `get_sensor_data`
- `get_camera_snapshot`
- `get_hardware_history`
- `get_hardware_events`

Choose this path when:

- the hardware is one of many similar blocks
- the agent can identify it by `block_id`
- no special natural-language affordance is needed

#### B. Device-specific tools

Use `src/main/tools/device-tools/index.ts` when a specific physical device should be directly callable by name.

Use this when:

- users refer to the device by natural language label
- it is a fixed real device such as "桌面上的灯"
- you want the agent to prefer a bound tool over a generic tool

For each dedicated device tool define:

- `blockId`
- `label`
- `description`
- the smallest parameter schema that matches user intent

Do not create device-specific tools for every sensor by default. Add them when direct naming materially improves reliability.

#### C. Event-aggregation tools

If the new hardware answers event questions such as:

- how many people appeared
- how many times motion was detected
- whether a command response returned
- whether a message reached the server

then do not rely on the model to count raw rows freehand.

Create a specialized tool on top of `hardware_events` for that device or event type.

Examples:

- `count_people_detected_last_minutes`
- `get_presence_events`
- `get_latest_asr_transcript`

## Tool Design Rules

When adding a new tool, encode the table choice into the description.

Good pattern:

- history tool: "state trends over time for a block"
- events tool: "raw event records, detections, command responses, ingress tracing"

Do not expose table names to end users. Expose semantics.

Keep these boundaries:

- trend/state questions -> `hardware_history`
- event/count/detection questions -> `hardware_events`

## Validation Checklist

Run these in order after integrating a new hardware block.

### A. Type and unit validation

```bash
bun run typecheck:node
bun test
```

### B. Runtime status validation

Start the server and inspect:

- `GET /ready`
- `GET /v1/blocks`
- `GET /v1/hardware-events`
- `GET /v1/history`

Confirm:

- the block appears in `/v1/blocks`
- `hardware_events` contains raw MQTT rows for the block
- `hardware_history` contains snapshot rows for the block if the block contributes snapshot-worthy state

### C. End-to-end ingress validation

Use the existing scripts when applicable:

- `bun run mqtt:test:railway`
- `bun run hardware-events:test:write`

For a real new device, publish one known-good message and verify:

1. the row exists in `hardware_events`
2. the block appears in `HardwareStore`
3. if applicable, a row appears in `hardware_history`
4. the correct agent tool can answer a query about it

## Decision Rules For Common Device Types

### Environment / scalar sensors

- write raw envelopes to `hardware_events`
- update `telemetry` in `HardwareStore`
- rely on `get_sensor_data`
- use `get_hardware_history` for trends

### Camera / AI detection inputs

- keep raw detection facts in `hardware_events`
- only put stable latest scene/state into `hardware_history`
- create event-specific aggregation tools for counting or detection questions

### Actuators

- persist command and response events in `hardware_events`
- keep current actuator state in `HardwareStore`
- use device-specific tools when users name the physical device directly

## What To Avoid

- do not reintroduce mock-only assumptions
- do not answer event-counting questions from `hardware_history`
- do not force every device to have a device-specific tool
- do not let the model guess stored capability names from natural language; prefer canonical enums or `block_id`
- do not treat a successful in-memory update as proof that `hardware_events` was persisted

## Completion Criteria

A hardware integration is not done until all are true:

- the block is discoverable in `list_blocks`
- at least one real message lands in `hardware_events`
- the correct query path is chosen for the device's question type
- the agent can answer one real question about the device using tools
- for named real devices, the dedicated tool is available and preferred
