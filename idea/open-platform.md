# Open Platform Architecture

## Positioning

Unforce Make should be built as an open ambient intelligence platform, not as a closed hardware product.

The platform should allow:

- any hardware vendor to connect devices
- any agent or app to consume context and invoke actions
- the community to co-create adapters, capabilities, tools, and experiences

Our own business should come from delivering the best default hardware modules, firmware, cloud hosting, and operational experience, not from locking down protocol access.

In one sentence:

**Core platform open, integration standards open, default implementations commercial-grade, official hardware best-in-class.**

## Why This Model Fits Us

The current repo already has the right early boundaries:

- hardware ingress and normalization
- in-memory context state
- tool registration
- provider abstraction
- history and memory services

Today those pieces exist mostly as implementation details. The next step is to promote them into stable platform contracts.

That means the future system should not be centered around:

- one fixed app
- one fixed agent
- one fixed hardware protocol
- one fixed vendor

It should be centered around:

- a shared context model
- capability-based hardware abstraction
- pluggable adapters
- pluggable consumers

## Architectural Principle

Everything below the context layer can vary.

- device brand can vary
- firmware can vary
- transport protocol can vary
- deployment mode can vary

Everything above the context layer should stay stable.

- blocks should look like blocks
- capabilities should look like capabilities
- events should look like events
- tools should be generated from capability contracts
- apps and agents should read one platform model

This is the core move that makes "compatible with everything" realistic.

## Future Stack

### 1. Physical Device Layer

This is the world of real devices:

- official Unforce Make hardware modules
- third-party modules
- DIY ESP32 devices
- phone sensors
- cameras
- microphones
- Home Assistant or ESPHome bridged devices

These devices do not need to speak one single native protocol, but they must become compatible through an adapter contract.

### 2. Adapter Layer

Adapters translate external hardware or systems into platform-native events and actions.

Examples:

- AI Hub MQTT adapter
- HTTP webhook adapter
- WebSocket stream adapter
- serial / BLE / local USB adapter
- Home Assistant adapter
- ESPHome adapter

Responsibilities:

- device discovery
- identity mapping
- data normalization
- command translation
- delivery guarantees and retries
- protocol-specific auth and connection management

This layer is where protocol diversity lives. It should be open and extensible.

### 3. Context Layer

This is the real core of the platform.

The job of the context layer is to expose a stable system model regardless of where data came from.

It should own:

- block registry
- current state
- capability registry
- event stream
- historical snapshots
- room / home / user relationships
- semantic labels and metadata

The context layer should expose two canonical shapes:

1. `Context Event`
   For append-only facts such as telemetry, state changes, command results, transcript events, and camera snapshots.

2. `Context Snapshot`
   For current readable state of a block, room, or whole environment.

This lets all upper layers work with one consistent resource model.

### 4. Capability Layer

A device should not primarily be integrated as "brand X API".

It should be integrated as a set of capabilities such as:

- `light`
- `camera`
- `presence`
- `heart_rate`
- `temperature_humidity`
- `display`
- `microphone`
- `speaker`
- `air_quality`

Each capability should define:

- readable state schema
- writable action schema
- event schema
- validation rules
- UI rendering hints
- LLM tool generation hints
- permission scopes
- history retention hints

This becomes the main extension surface for both official hardware and the community.

### 5. Experience Layer

Multiple consumers should coexist on top of the same platform:

- official web app
- official mobile app
- default agent runtime
- MCP server for external agents
- automation engine
- community dashboards
- partner apps

No single experience should be the platform itself.

The platform should outlive any one app or one agent shell.

## Core Platform Contracts

The future depends on stabilizing three contracts.

### Contract 1: Block Model

A `Block` is the canonical identity of a device-like unit in the system.

Suggested minimum fields:

```ts
type Block = {
  block_id: string
  display_name: string | null
  vendor: string | null
  model: string | null
  type: 'sensor' | 'stream' | 'actuator' | 'hub' | 'virtual'
  capabilities: string[]
  status: 'online' | 'offline' | 'degraded' | 'unknown'
  home_id: string | null
  room_id: string | null
  last_seen_at: string | null
  labels?: Record<string, string>
  meta?: Record<string, unknown>
}
```

Important rule:

`Block` identity must remain stable even if the transport adapter changes.

If a device moves from one adapter implementation to another, upper layers should not need to be rewritten.

### Contract 2: Capability Schema

This is the main openness primitive of the platform.

Each capability should be declared by schema, not hard-coded into the agent or UI.

Suggested shape:

```ts
type CapabilitySchema = {
  id: string
  version: string
  title: string
  description: string
  state?: JsonSchema
  actions?: Array<{
    name: string
    title: string
    description: string
    input?: JsonSchema
    output?: JsonSchema
    side_effects?: string[]
  }>
  events?: Array<{
    name: string
    description: string
    payload: JsonSchema
  }>
  ui?: {
    category?: 'sensor' | 'stream' | 'actuator'
    preferred_widget?: string
    chartable_fields?: string[]
  }
  llm?: {
    tool_title?: string
    tool_description?: string
    guidance?: string[]
  }
  permissions?: string[]
}
```

The same schema should drive:

- UI rendering
- generated tools
- docs
- validation
- permission prompts
- compatibility tests

This is how we avoid rewriting the system for every new device type.

### Contract 3: Context Event / Snapshot Model

Every ingress path should normalize into shared event and snapshot contracts.

Suggested event shape:

```ts
type ContextEvent = {
  event_id: string
  source: 'mqtt' | 'http' | 'ws' | 'local' | 'bridge'
  adapter_id: string
  block_id: string
  capability: string | null
  event_type: string
  recorded_at: string
  payload: Record<string, unknown>
  confidence?: number | null
  room_id?: string | null
  home_id?: string | null
  meta?: Record<string, unknown>
}
```

Suggested snapshot shape:

```ts
type ContextSnapshot = {
  block: Block
  state: Record<string, unknown>
  latest_events?: ContextEvent[]
  updated_at: string
}
```

The important design decision is:

Adapters are allowed to differ internally.
They are not allowed to expose incompatible shapes to apps, agents, or plugins.

## How This Maps To The Current Repo

The current code already contains early forms of these layers:

- `src/main/hardware/mqtt-protocol.ts`
  Normalizes AI Hub MQTT into a structured event shape.

- `src/main/hardware/store.ts`
  Maintains the current in-memory block and state view.

- `src/main/tools/index.ts`
  Aggregates platform tools presented to the agent.

- `src/main/providers/registry.ts`
  Separates the model provider layer from the rest of runtime logic.

This is a good foundation, but several things are still too coupled to one implementation:

- MQTT topic semantics are still close to platform semantics
- capability modeling is still implicit
- some tools are still device-specific rather than capability-first
- external openness is still more vision than formal interface

The next architecture step is not a rewrite.
It is to formalize these boundaries and let current code become the first official adapter/runtime implementation.

## Open Source Boundary

The platform should be open where ecosystem growth matters.

Open source:

- context model
- block and capability schemas
- adapter SDK
- official adapters
- default local runtime
- MCP server
- web console
- community plugin interfaces
- test fixtures and compatibility kit

This encourages:

- more hardware integrations
- more community experimentation
- more agent interoperability
- faster standard adoption

## Commercial Boundary

Revenue should come from the parts where trust, convenience, reliability, and polish matter.

Commercial:

- official hardware modules
- official firmware images and provisioning flow
- premium hosted cloud
- fleet management
- multi-user / team features
- enterprise auth and permissions
- advanced memory, analytics, and automations
- official compatibility certification
- premium support and integration services

This is the right separation because it scales better than trying to lock down the protocol.

If protocol access is closed, the ecosystem stays small.
If protocol access is open, official hardware can still win on experience.

## Product Strategy Implication

We should not try to win by making third-party hardware impossible.

We should try to win by making official hardware:

- easiest to set up
- best documented
- best integrated
- most reliable
- best-looking
- best supported

That creates a strong commercial position without weakening the platform story.

The role of official hardware is:

- reference implementation
- premium default
- fastest path to value

Not:

- gatekeeper of the ecosystem

## Capability-First Tooling

One major future risk is overfitting the system around per-device custom tools.

That approach works for a demo, but it fragments quickly:

- tool names become inconsistent
- behavior varies by device
- third-party compatibility gets harder
- UI generation gets harder
- permission control gets messy

The better pattern is:

1. device declares capabilities
2. capability schemas define readable and writable interfaces
3. runtime generates standard tools from those capabilities
4. optional device-specific tools exist only when truly necessary

This gives us:

- consistent agent behavior
- consistent UI behavior
- predictable permissions
- lower integration cost for community hardware

In other words:

**Capability-specific by default, device-specific only by exception.**

## MCP And External Agent Access

The long-term platform should treat MCP as a first-class external interface.

MCP should expose:

- block discovery
- current context snapshots
- capability-generated tools
- historical queries
- optional event subscriptions

This matters because it makes the platform usable by:

- Claude Desktop
- Cursor
- Aila
- community agents
- partner applications

The strategic benefit is important:

Our own agent becomes one consumer of the platform, not the only one.

That keeps the architecture future-proof even if the agent landscape changes.

## Plugin And Community Model

To support co-creation, the platform needs explicit extension points.

Recommended plugin surfaces:

- adapter plugins
- capability packages
- UI widget packages
- automation recipes
- MCP extensions
- analytics processors

Each plugin should declare:

- name and version
- compatibility range
- permissions needed
- resources used
- capabilities added or consumed

This should eventually grow into a registry model, but initially a local package-based plugin system is enough.

## Suggested Package Boundaries

Over time, the repo can evolve toward these conceptual packages:

- `platform-core`
  Block model, context model, capability schemas, shared types

- `platform-adapters`
  MQTT and other ingress/egress adapters

- `platform-runtime`
  Context store, orchestration, scheduling, event distribution

- `platform-agent`
  Default agent runtime and tool generation

- `platform-mcp`
  MCP server exposing context and tools

- `platform-web`
  Official app and console

- `platform-cloud`
  Hosted sync, fleet management, identity, premium services

This does not need to become a monorepo split immediately.
The point is to keep responsibilities clear so the architecture can scale without confusion.

## Twelve-Month Direction

### Phase 1: Formalize the Core Contracts

Goal:
Make the open platform legible.

Deliverables:

- stable `Block` model
- first `CapabilitySchema` draft
- shared `ContextEvent` and `ContextSnapshot` contracts
- adapter interface definition
- architecture and contribution docs

Success condition:
An external developer can understand what to implement without reading the entire codebase.

### Phase 2: Make Current Runtime The First Official Implementation

Goal:
Turn current internals into a reference platform runtime.

Deliverables:

- current AI Hub MQTT path promoted into an official adapter
- capability registry for existing devices
- generated tool metadata from capability definitions
- generated UI hints from capability definitions
- cleaner block discovery API

Success condition:
Existing hardware works through the new contracts without a platform rewrite.

### Phase 3: Open External Consumption

Goal:
Let other agents and apps use the platform.

Deliverables:

- MCP server
- third-party app API docs
- event subscription model
- permissions model draft
- local developer quickstart for external consumers

Success condition:
A third-party agent can discover blocks and use tools without bespoke integration code.

### Phase 4: Open Ecosystem Growth

Goal:
Enable co-creation beyond our own team.

Deliverables:

- adapter SDK
- compatibility test kit
- example community adapter
- example community capability pack
- plugin packaging format

Success condition:
A community member can add hardware support without touching core runtime code.

### Phase 5: Strengthen Commercial Differentiation

Goal:
Monetize without closing the platform.

Deliverables:

- official module lineup
- premium hosted cloud
- remote fleet management
- certification program
- premium analytics and automations

Success condition:
The business gets stronger as the platform gets more open, not weaker.

## Non-Goals

To stay disciplined, these should not become architectural requirements too early:

- forcing full multi-tenant cloud complexity into the hackathon build
- solving every permission edge case before defining the core schemas
- inventing a fully custom protocol when existing transports already work
- building many bespoke device tools instead of stabilizing capability contracts
- tightly coupling the platform to one frontend or one agent shell

## Design Heuristics

When making future decisions, use these checks:

1. If this adapter disappeared tomorrow, would the rest of the platform still make sense?
2. If a third-party hardware maker joined tomorrow, could they integrate without private knowledge?
3. If a different agent became dominant next year, would the platform still be usable?
4. If community contributions doubled, would the extension surface stay understandable?
5. If official hardware remains the best experience, do we still need to lock anything down?

If the answer to the last question is "yes", the architecture is probably too closed.

## Working Definition

Unforce Make is an open context platform for ambient intelligence.

Official hardware is the best default path into the platform.
It is not the boundary of the platform.

The platform wins when:

- any hardware can connect through adapters
- any capability can be described through schema
- any agent can consume context through standard interfaces
- the community can extend the system safely
- official hardware and cloud remain the easiest, strongest default choice

That is the future shape worth building toward.
