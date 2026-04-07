import { randomUUID } from 'node:crypto'
import {
  type ActuatorState,
  type BlockState,
  BLOCKS,
  getCameraSnapshot,
  readSensor,
} from '../tools/hardware-mock/data'

export interface BlockSnapshot extends BlockState {
  latest?: Record<string, number>
  actuator?: Record<string, unknown>
  scene?: string
}

export interface HardwareMetrics {
  bpm: number | null
  hcho: number | null
  humidity: number | null
  temp: number | null
}

export interface HardwareSnapshot {
  actuatorState: ActuatorState
  blocks: BlockSnapshot[]
  metrics: HardwareMetrics
  updatedAt: string
}

export type HardwareIngressMessage =
  | { type: 'announce'; block: Partial<BlockState> & Pick<BlockState, 'block_id' | 'capability' | 'type'> }
  | { type: 'status'; block_id: string; status: BlockState['status']; battery?: number }
  | { type: 'telemetry'; block_id: string; data: Record<string, number>; timestamp?: number }
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

function cloneActuatorState(state: ActuatorState): ActuatorState {
  return {
    light: state.light ? { ...state.light } : undefined,
    vibration: state.vibration ? { ...state.vibration } : undefined,
  }
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export class HardwareStore {
  private actuatorState: ActuatorState = {
    light: { r: 0, g: 0, b: 0, brightness: 0, pattern: null },
    vibration: { active: false, pattern: null, intensity: 0 },
  }
  private blocks = new Map<string, BlockSnapshot>()
  private cameraScenes = new Map<string, string>()
  private listeners = new Set<Listener>()
  private sensorReadings = new Map<string, Record<string, number>>()

  constructor() {
    for (const block of BLOCKS) {
      this.blocks.set(block.block_id, { ...block })

      if (block.type === 'sensor') {
        this.sensorReadings.set(block.block_id, readSensor(block.capability))
      }

      if (block.capability === 'camera') {
        this.cameraScenes.set(block.block_id, getCameraSnapshot())
      }
    }
  }

  startSimulation(intervalMs = 3000): () => void {
    const timer = setInterval(() => {
      for (const block of this.blocks.values()) {
        if (block.status !== 'online') continue

        block.last_seen_ms = Date.now()

        if (block.type === 'sensor') {
          this.sensorReadings.set(block.block_id, readSensor(block.capability))
        }

        if (block.capability === 'camera') {
          this.cameraScenes.set(block.block_id, getCameraSnapshot())
        }
      }

      this.broadcast({ type: 'update', payload: this.getSnapshot() })
    }, intervalMs)

    return () => clearInterval(timer)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener({ type: 'snapshot', payload: this.getSnapshot() })
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): HardwareSnapshot {
    const blocks = [...this.blocks.values()].map((block) => ({
      ...block,
      latest: this.sensorReadings.get(block.block_id),
      actuator: this.getActuatorStateForBlock(block.block_id),
      scene: this.cameraScenes.get(block.block_id),
    }))

    const env = this.sensorReadings.get('env_01')
    const humidity = this.sensorReadings.get('env_02')
    const bpm = this.sensorReadings.get('heart_01')
    const hcho = this.sensorReadings.get('air_01')

    return {
      blocks,
      actuatorState: cloneActuatorState(this.actuatorState),
      updatedAt: new Date().toISOString(),
      metrics: {
        temp: toNumber(env?.temp_c),
        humidity: toNumber(humidity?.rh),
        bpm: toNumber(bpm?.bpm),
        hcho: toNumber(hcho?.hcho_mg),
      },
    }
  }

  listBlocks(): BlockSnapshot[] {
    return this.getSnapshot().blocks
  }

  getBlock(blockId: string): BlockSnapshot | null {
    return this.getSnapshot().blocks.find((block) => block.block_id === blockId) ?? null
  }

  getSensorData(blockId: string): { block: BlockSnapshot; data: Record<string, number> } | null {
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

  getCameraScene(blockId: string): { block: BlockSnapshot; scene: string } | null {
    const block = this.blocks.get(blockId)
    if (!block || block.capability !== 'camera') return null

    return {
      block,
      scene: this.cameraScenes.get(blockId) ?? getCameraSnapshot(),
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

  private broadcast(event: HardwareBroadcast): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
