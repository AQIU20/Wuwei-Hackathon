import { randomUUID } from 'node:crypto'

export interface BlockState {
  block_id: string
  type: 'sensor' | 'stream' | 'actuator'
  capability: string
  chip: string
  firmware: string
  battery: number
  status: 'online' | 'offline'
  last_seen_ms: number
}

export interface ActuatorState {
  light?: { r: number; g: number; b: number; brightness: number; pattern: string | null }
  vibration?: { active: boolean; pattern: string | null; intensity: number }
}

export interface BlockSnapshot extends BlockState {
  latest?: Record<string, unknown>
  actuator?: Record<string, unknown>
  scene?: string
}

export interface HardwareMetrics {
  bpm: number | null
  hcho: number | null
  humidity: number | null
  temp: number | null
}

export interface VoiceState {
  confidence: number | null
  is_final: boolean
  language: string | null
  last_finalized_at: string | null
  partial_text: string | null
  text: string | null
  trigger: boolean
  triggered_at: string | null
  updated_at: string
  utterance_id: string
  wakeword: string | null
}

export interface HardwareSnapshot {
  actuatorState: ActuatorState
  blocks: BlockSnapshot[]
  metrics: HardwareMetrics
  updatedAt: string
}

export type HardwareIngressMessage =
  | {
      type: 'announce'
      block: Partial<BlockState> & Pick<BlockState, 'block_id' | 'capability' | 'type'>
    }
  | { type: 'status'; block_id: string; status: BlockState['status']; battery?: number }
  | { type: 'telemetry'; block_id: string; data: Record<string, unknown>; timestamp?: number }
  | { type: 'snapshot'; block_id: string; scene: string; timestamp?: number }
  | {
      type: 'actuator_state'
      block_id: string
      state: Record<string, unknown>
      timestamp?: number
    }
  | {
      type: 'command_result'
      block_id: string
      action: string
      accepted: boolean
      state?: Record<string, unknown>
      timestamp?: number
    }

export type HardwareBroadcast =
  | { type: 'snapshot'; payload: HardwareSnapshot }
  | { type: 'update'; payload: HardwareSnapshot }
  | { type: 'ack'; id: string }
  | { type: 'error'; message: string }

type Listener = (event: HardwareBroadcast) => void

function parseNodeMetaMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {}

  const normalize = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '')

  const fromPairs = (input: string): Record<string, string> => {
    const map: Record<string, string> = {}
    const chunks = input
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)

    for (const chunk of chunks) {
      const idx = chunk.indexOf(':')
      if (idx <= 0) continue
      const key = normalize(chunk.slice(0, idx))
      const value = normalize(chunk.slice(idx + 1))
      if (key && value) {
        map[key] = value
      }
    }

    return map
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return fromPairs(raw)
    }

    const entries = Object.entries(parsed)
    const map: Record<string, string> = {}
    for (const [key, value] of entries) {
      if (typeof value === 'string') {
        map[normalize(key)] = normalize(value)
      }
    }
    return map
  } catch {
    return fromPairs(raw)
  }
}

function cloneActuatorState(state: ActuatorState): ActuatorState {
  return {
    light: state.light ? { ...state.light } : undefined,
    vibration: state.vibration ? { ...state.vibration } : undefined,
  }
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNumber(source: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!source) return null

  for (const key of keys) {
    const value = toNumber(source[key])
    if (value !== null) {
      return value
    }
  }

  return null
}

function firstNumber(values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null) {
      return value
    }
  }

  return null
}

export class HardwareStore {
  private actuatorState: ActuatorState = {
    light: { r: 0, g: 0, b: 0, brightness: 0, pattern: null },
    vibration: { active: false, pattern: null, intensity: 0 },
  }
  private blocks = new Map<string, BlockSnapshot>()
  private cameraScenes = new Map<string, string>()
  private listeners = new Set<Listener>()
  private readonly nodeDescriptions: Record<string, string>
  private readonly nodeLabels: Record<string, string>
  private sensorReadings = new Map<string, Record<string, unknown>>()
  private voiceStates = new Map<string, VoiceState>()

  constructor() {
    this.nodeLabels = parseNodeMetaMap(
      process.env.HARDWARE_NODE_LABELS ??
        process.env.HARDWARE_NODE_NAMES ??
        process.env.HARDWARE_NODE_FRIENDLY_NAMES,
    )
    this.nodeDescriptions = parseNodeMetaMap(
      process.env.HARDWARE_NODE_DESCRIPTIONS ?? process.env.HARDWARE_NODE_DESC,
    )
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener({ type: 'snapshot', payload: this.getSnapshot() })
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): HardwareSnapshot {
    const blocks = [...this.blocks.values()].map((block) => ({
      ...block,
      latest: this.getLatestForBlock(block.block_id),
      actuator: this.getActuatorStateForBlock(block.block_id),
      scene: this.cameraScenes.get(block.block_id),
    }))

    const metricSource = blocks
      .map((block) => block.latest)
      .filter((latest): latest is Record<string, unknown> => Boolean(latest))

    return {
      blocks,
      actuatorState: cloneActuatorState(this.actuatorState),
      updatedAt: new Date().toISOString(),
      metrics: {
        temp: firstNumber(
          metricSource.map((latest) => readNumber(latest, 'temp_c', 'temperature_c')),
        ),
        humidity: firstNumber(
          metricSource.map((latest) => readNumber(latest, 'humidity_pct', 'rh', 'humidity')),
        ),
        bpm: firstNumber(metricSource.map((latest) => readNumber(latest, 'heart_rate_bpm', 'bpm'))),
        hcho: firstNumber(
          metricSource.map((latest) => readNumber(latest, 'hcho_mg', 'hcho_mg_m3')),
        ),
      },
    }
  }

  listBlocks(): BlockSnapshot[] {
    return this.getSnapshot().blocks
  }

  getBlock(blockId: string): BlockSnapshot | null {
    return this.getSnapshot().blocks.find((block) => block.block_id === blockId) ?? null
  }

  getNodeLabel(blockId: string): string {
    return this.nodeLabels[blockId] || blockId
  }

  getNodeDescription(blockId: string): string | null {
    return this.nodeDescriptions[blockId] || null
  }

  getSensorData(blockId: string): { block: BlockSnapshot; data: Record<string, unknown> } | null {
    const block = this.blocks.get(blockId)
    if (!block || block.type !== 'sensor') return null

    const data = this.sensorReadings.get(blockId) ?? {}
    return {
      block: {
        ...block,
        latest: data,
      },
      data,
    }
  }

  getVoiceState(blockId: string): { block: BlockSnapshot; state: VoiceState } | null {
    const block = this.blocks.get(blockId)
    const state = this.voiceStates.get(blockId)
    if (!block || !state) return null

    return {
      block: {
        ...block,
        latest: this.toVoiceLatest(state),
      },
      state: { ...state },
    }
  }

  getLatestVoiceState(): { block: BlockSnapshot; state: VoiceState } | null {
    let latestBlockId: string | null = null
    let latestState: VoiceState | null = null

    for (const [blockId, state] of this.voiceStates.entries()) {
      if (!latestState || state.updated_at > latestState.updated_at) {
        latestBlockId = blockId
        latestState = state
      }
    }

    if (!latestBlockId || !latestState) return null
    const block = this.blocks.get(latestBlockId)
    if (!block) return null

    return {
      block: {
        ...block,
        latest: this.toVoiceLatest(latestState),
      },
      state: { ...latestState },
    }
  }

  upsertVoiceState(args: {
    blockId: string
    chip?: string
    confidence?: number | null
    firmware?: string
    isFinal: boolean
    language?: string | null
    text?: string | null
    timestampMs?: number
    trigger?: boolean
    utteranceId: string
    wakeword?: string | null
  }): { block: BlockSnapshot; state: VoiceState } {
    const timestampMs =
      typeof args.timestampMs === 'number' && Number.isFinite(args.timestampMs)
        ? args.timestampMs
        : Date.now()
    const updatedAt = new Date(timestampMs).toISOString()
    const existingBlock = this.blocks.get(args.blockId)
    const existingState = this.voiceStates.get(args.blockId)
    const normalizedText = args.text?.trim() || null
    const voiceState: VoiceState = {
      confidence:
        typeof args.confidence === 'number' && Number.isFinite(args.confidence)
          ? args.confidence
          : (existingState?.confidence ?? null),
      is_final: args.isFinal,
      language: args.language?.trim() || existingState?.language || null,
      last_finalized_at: args.isFinal ? updatedAt : (existingState?.last_finalized_at ?? null),
      partial_text: args.isFinal ? null : normalizedText,
      text: args.isFinal ? normalizedText : (existingState?.text ?? null),
      trigger: args.trigger === true,
      triggered_at:
        args.trigger === true && args.isFinal ? updatedAt : (existingState?.triggered_at ?? null),
      updated_at: updatedAt,
      utterance_id: args.utteranceId,
      wakeword: args.wakeword?.trim() || existingState?.wakeword || null,
    }

    this.blocks.set(args.blockId, {
      block_id: args.blockId,
      battery: existingBlock?.battery ?? 100,
      capability: existingBlock?.capability ?? 'microphone',
      chip: args.chip ?? existingBlock?.chip ?? 'external',
      firmware: args.firmware ?? existingBlock?.firmware ?? 'voice-ingress@1',
      last_seen_ms: timestampMs,
      status: 'online',
      type: 'stream',
    })
    this.voiceStates.set(args.blockId, voiceState)
    this.broadcast({ type: 'update', payload: this.getSnapshot() })

    return {
      block: this.getBlock(args.blockId) as BlockSnapshot,
      state: { ...voiceState },
    }
  }

  getCameraScene(blockId: string): { block: BlockSnapshot; scene: string } | null {
    const block = this.blocks.get(blockId)
    if (!block || block.capability !== 'camera') return null

    const scene = this.cameraScenes.get(blockId)
    if (!scene) return null

    return {
      block,
      scene,
    }
  }

  controlActuator(
    blockId: string,
    action: string,
    params: Record<string, unknown> = {},
  ): { block: BlockSnapshot; state: Record<string, unknown> } | null {
    const block = this.blocks.get(blockId)
    if (!block || block.type !== 'actuator') return null

    if (block.capability === 'light') {
      if (action === 'set_color') {
        this.actuatorState.light = {
          r: Number(params.r ?? 255),
          g: Number(params.g ?? 255),
          b: Number(params.b ?? 255),
          brightness: Number(params.brightness ?? 100),
          pattern: null,
        }
      } else if (action === 'set_pattern') {
        this.actuatorState.light = {
          ...(this.actuatorState.light ?? { r: 255, g: 255, b: 255, brightness: 80 }),
          pattern: String(params.pattern ?? 'breathing'),
        }
      } else if (action === 'off') {
        this.actuatorState.light = { r: 0, g: 0, b: 0, brightness: 0, pattern: null }
      }

      this.broadcast({ type: 'update', payload: this.getSnapshot() })
      return { block, state: { ...(this.actuatorState.light ?? {}) } }
    }

    if (block.capability === 'vibration') {
      if (action === 'pulse') {
        this.actuatorState.vibration = {
          active: true,
          pattern: null,
          intensity: Number(params.intensity ?? 50),
        }
      } else if (action === 'pattern') {
        this.actuatorState.vibration = {
          active: true,
          pattern: String(params.pattern ?? 'heartbeat'),
          intensity: Number(params.intensity ?? 70),
        }
      } else if (action === 'off') {
        this.actuatorState.vibration = { active: false, pattern: null, intensity: 0 }
      }

      this.broadcast({ type: 'update', payload: this.getSnapshot() })
      return { block, state: { ...(this.actuatorState.vibration ?? {}) } }
    }

    return null
  }

  applyMessage(message: HardwareIngressMessage): { ok: boolean; error?: string; ackId: string } {
    const ackId = randomUUID()

    switch (message.type) {
      case 'announce': {
        const existing = this.blocks.get(message.block.block_id)
        this.blocks.set(message.block.block_id, {
          block_id: message.block.block_id,
          battery: message.block.battery ?? existing?.battery ?? 100,
          capability: message.block.capability,
          chip: message.block.chip ?? existing?.chip ?? 'unknown',
          firmware: message.block.firmware ?? existing?.firmware ?? 'unknown',
          last_seen_ms: Date.now(),
          status: message.block.status ?? 'online',
          type: message.block.type,
        })
        break
      }
      case 'status': {
        const block = this.blocks.get(message.block_id)
        if (!block) return { ok: false, error: `Unknown block: ${message.block_id}`, ackId }
        block.status = message.status
        block.last_seen_ms = Date.now()
        if (typeof message.battery === 'number') {
          block.battery = message.battery
        }
        break
      }
      case 'telemetry': {
        const block = this.blocks.get(message.block_id)
        if (!block) return { ok: false, error: `Unknown block: ${message.block_id}`, ackId }
        block.last_seen_ms = message.timestamp ?? Date.now()
        block.status = 'online'
        this.sensorReadings.set(message.block_id, message.data)
        break
      }
      case 'snapshot': {
        const block = this.blocks.get(message.block_id)
        if (!block) return { ok: false, error: `Unknown block: ${message.block_id}`, ackId }
        block.last_seen_ms = message.timestamp ?? Date.now()
        block.status = 'online'
        this.cameraScenes.set(message.block_id, message.scene)
        break
      }
      case 'actuator_state':
      case 'command_result': {
        const block = this.blocks.get(message.block_id)
        if (!block) return { ok: false, error: `Unknown block: ${message.block_id}`, ackId }
        block.last_seen_ms = message.timestamp ?? Date.now()
        block.status = 'online'

        if (block.capability === 'light' && message.state) {
          this.actuatorState.light = {
            ...(this.actuatorState.light ?? { r: 0, g: 0, b: 0, brightness: 0, pattern: null }),
            ...message.state,
          } as NonNullable<ActuatorState['light']>
        }

        if (block.capability === 'vibration' && message.state) {
          this.actuatorState.vibration = {
            ...(this.actuatorState.vibration ?? { active: false, pattern: null, intensity: 0 }),
            ...message.state,
          } as NonNullable<ActuatorState['vibration']>
        }

        break
      }
    }

    this.broadcast({ type: 'ack', id: ackId })
    this.broadcast({ type: 'update', payload: this.getSnapshot() })
    return { ok: true, ackId }
  }

  private getActuatorStateForBlock(blockId: string): Record<string, unknown> | undefined {
    const block = this.blocks.get(blockId)
    if (!block) return undefined

    if (block.capability === 'light') {
      return this.actuatorState.light ? { ...this.actuatorState.light } : undefined
    }

    if (block.capability === 'vibration') {
      return this.actuatorState.vibration ? { ...this.actuatorState.vibration } : undefined
    }

    return undefined
  }

  private getLatestForBlock(blockId: string): Record<string, unknown> | undefined {
    const voiceState = this.voiceStates.get(blockId)
    if (voiceState) {
      return this.toVoiceLatest(voiceState)
    }

    return this.sensorReadings.get(blockId)
  }

  private toVoiceLatest(state: VoiceState): Record<string, unknown> {
    return {
      confidence: state.confidence,
      is_final: state.is_final,
      language: state.language,
      last_finalized_at: state.last_finalized_at,
      partial_text: state.partial_text,
      text: state.text,
      trigger: state.trigger,
      triggered_at: state.triggered_at,
      updated_at: state.updated_at,
      utterance_id: state.utterance_id,
      wakeword: state.wakeword,
    }
  }

  private broadcast(event: HardwareBroadcast): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
