---
name: hardware-output-module-skill
description: Use when adding or updating an output hardware module in this repo, especially actuator devices like lights, vibration blocks, or other controllable modules. Covers how a new output block is recognized from MQTT, how commands are mapped and published, how actuator state is stored, when to create generic versus device-specific tools, and how to validate the full control path from agent tool call to hardware response and Supabase records.
---

# Hardware Output Module Skill

Use this skill when integrating a new output module such as:

- a new light block
- a vibration block
- a relay or switch-like actuator
- any other hardware the agent should actively control

This skill is for the current Bun + Hono + MQTT + Supabase repo.

## Outcome

After following this skill, an output module should satisfy all of these:

- the module appears as an actuator block in `HardwareStore`
- the agent can discover it through tools
- the server can publish the correct MQTT command for it
- command and response events land in `hardware_events`
- the current actuator state is reflected in block snapshots and `hardware_history`
- if needed, the device has its own dedicated tool

## Canonical Mental Model

For output modules, there are three linked layers:

1. block registration and current state
2. command publication
3. agent tool exposure

In repo terms:

- `HardwareStore` holds current actuator state
- `AihubMqttBridge.publishActuatorCommand(...)` turns tool actions into MQTT publishes
- `device-tools` or generic hardware tools expose the capability to the agent

## Source Of Truth In Code

Read these files first:

- `src/main/hardware/mqtt-bridge.ts`
- `src/main/hardware/mqtt-protocol.ts`
- `src/main/hardware/store.ts`
- `src/main/tools/hardware/index.ts`
- `src/main/tools/device-tools/index.ts`
- `src/main/history/hardware-event-service.ts`
- `src/main/history/supabase-history-service.ts`
- `src/main/agent.ts`

## Workflow

### 1. Confirm the module's command contract

Before writing code, pin down:

- `node_id`
- `node_type`
- command topic shape
- accepted payload shape
- response topic shape
- response payload shape

For a light-like module in the current repo, the existing bridge already assumes firmware-native topics such as:

- `aihub/cmd/{nodeId}/ws2812`
- `aihub/cmd/{nodeId}/led`

If the new module uses the same protocol, the bridge may already be sufficient.

If the module requires a new command subject or a new action vocabulary, extend the bridge first.

### 2. Make the module recognizable as an actuator block

The server must infer all of these:

- `node_type`
- `capability`
- `type = actuator`

Update these files when introducing a truly new actuator type:

- `src/main/hardware/mqtt-protocol.ts`
- `src/main/hardware/mqtt-bridge.ts`

Typical work:

- add the new node type if needed
- map the node type to a canonical capability
- map the node type to actuator block type
- if needed, add chip-family inference

If the module is just another light block using `led`, you usually do not need to change this layer.

### 3. Make command publication explicit

All agent-side control eventually reaches:

- `AihubMqttBridge.publishActuatorCommand(...)`

This function is the command router.

When adding a new output module type, define:

- supported actions
- how action params are normalized
- which MQTT topic each action publishes to
- exact payload JSON for firmware

Rules:

- keep actions semantic on the tool side, such as `on`, `off`, `set_color`, `pulse`
- do protocol translation inside the bridge
- do not force the agent to know raw firmware payload structure

If you need multiple firmware compatibility publishes, keep them inside the bridge, not in tools.

### 4. Make actuator state readable in `HardwareStore`

Publishing a command is not enough. The system also needs a current state model.

Current state is updated in two ways:

- optimistic local update through `HardwareStore.controlActuator(...)`
- real hardware feedback through `HardwareStore.applyMessage(...)` from MQTT responses

When adding a new actuator type, update:

- `src/main/hardware/store.ts`

Typical work:

- define how local state should look
- update `controlActuator(...)` for the new action set
- update `getActuatorStateForBlock(...)`
- if the device reports back state, merge response payload into the right actuator state branch

Keep the state minimal and queryable. Only store fields the UI or agent can actually use.

### 5. Decide whether the module needs a dedicated device tool

There are two patterns.

#### A. Generic actuator tool

Use the generic hardware tool path when:

- the module is one of many similar devices
- users are expected to refer to it by `block_id`
- there is no stable human-facing name

Current generic actuator entry points live in:

- `src/main/tools/hardware/index.ts`

#### B. Device-specific tool

Use `src/main/tools/device-tools/index.ts` when:

- the device is physically fixed and named
- users refer to it naturally, such as "桌面上的灯"
- you want the model to prefer a bound tool over a generic one

For each dedicated output device define:

- `blockId`
- `label`
- `description`

The repo will generate a tool named:

- `device_<blockId>`

For a second light block, usually this is the only code you need to touch.

### 6. Keep tool schemas semantic, not protocol-specific

The tool schema should describe user intent, not MQTT JSON.

Good examples:

- `on`
- `off`
- `set_color`
- `set_pattern`
- `set_speed`
- `pulse`

Bad examples:

- asking the model for raw `topic`
- asking the model for raw firmware `effect` field when that field is only protocol glue

The bridge should translate semantic tool actions into low-level protocol payloads.

### 7. Make sure the command path also persists evidence

For output modules, command observability matters.

You want:

- publish intent reflected in current state
- hardware response reflected in `hardware_events`
- if state changes materially, snapshots reflected in `hardware_history`

Current repo guidance:

- `hardware_events` is the raw command/response evidence layer
- `hardware_history` is the block state history layer

For questions like:

- did the command go out
- did the device respond
- how many times was the light turned on

prefer `hardware_events`

For questions like:

- what is the current light state
- how has brightness/state changed over time

use current state or `hardware_history`

## Common Scenarios

### Scenario A. Add another light block with the same firmware protocol

Usually do only this:

1. ensure the device publishes recognizable `led` messages
2. add a device definition in `src/main/tools/device-tools/index.ts`
3. verify the block appears in `/v1/blocks`
4. verify `device_<blockId>` shows up and can control it

### Scenario B. Add a new actuator type

Usually touch all of these:

1. `mqtt-protocol.ts`
2. `mqtt-bridge.ts`
3. `store.ts`
4. generic hardware tool schema if users need generic access
5. optional device-specific tool if the device has a stable name

## Validation Checklist

Run these after integrating a new output module.

### A. Static validation

```bash
bun run typecheck:node
bun test
```

### B. Runtime validation

Start the server and verify:

- `GET /v1/blocks` includes the actuator block
- the block shows `type=actuator`
- the block has the expected `capability`

### C. Command-path validation

Issue one real command through the correct tool and verify all of these:

1. the tool succeeds
2. the MQTT publish goes to the expected topic
3. the block state updates in memory
4. the device responds if applicable
5. a raw response row appears in `hardware_events`
6. a later snapshot row reflects the updated actuator state in `hardware_history`

### D. Agent validation

Ask one direct control question and one follow-up question.

Examples:

- "打开桌面上的灯"
- "现在这个灯是什么状态"
- "过去十分钟这个灯收到过几次控制响应"

Expected behavior:

- direct control should use a device-specific tool if one exists
- state questions should use current block state or `get_hardware_history`
- event/audit questions should use `get_hardware_events`

## What To Avoid

- do not make the agent construct raw MQTT payloads itself
- do not put protocol glue into the tool schema unless unavoidable
- do not create a dedicated tool for every output block unless users will name it directly
- do not answer command-audit questions from `hardware_history`
- do not assume a successful optimistic local state update means the hardware actually executed the command

## Completion Criteria

An output module integration is not done until all are true:

- the module is visible as an actuator block
- at least one control action publishes correctly
- the module has a usable current state model
- command or response evidence lands in `hardware_events`
- the agent can control it through the correct tool path
- if it is a named physical device, the dedicated tool exists and is preferred
