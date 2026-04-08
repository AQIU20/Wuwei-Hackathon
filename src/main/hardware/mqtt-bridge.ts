import { randomUUID } from 'node:crypto'
import mqtt, { type IClientOptions, type MqttClient, type Packet } from 'mqtt'
import type { HardwareEventService } from '../history/hardware-event-service'
import { type AihubMqttEnvelope, type AihubNodeType, parseAihubTopic } from './mqtt-protocol'
import type { HardwareIngressMessage, HardwareStore } from './store'

type BridgeConnectionState = 'disabled' | 'connecting' | 'connected' | 'error'
type HardwareBlockType = 'sensor' | 'stream' | 'actuator'

export interface MqttBridgeStatus {
  brokerUri: string | null
  clientId: string | null
  connectedAt: string | null
  enabled: boolean
  lastError: string | null
  lastMessageAt: string | null
  rootTopic: string
  state: BridgeConnectionState
  subscriptions: string[]
}

interface MqttBridgeOptions {
  eventService?: HardwareEventService | null
  hardware: HardwareStore
}

interface PublishResult {
  compatibilityTopics?: string[]
  payload: string
  topic: string
}

function getPacketMeta(packet: Packet): { qos?: number; retain?: boolean } {
  const meta: { qos?: number; retain?: boolean } = {}

  if ('qos' in packet && typeof packet.qos === 'number') {
    meta.qos = packet.qos
  }

  if ('retain' in packet && typeof packet.retain === 'boolean') {
    meta.retain = packet.retain
  }

  return meta
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asEnvelope(value: unknown): AihubMqttEnvelope | null {
  if (!isRecord(value)) return null
  if (
    typeof value.msg_id !== 'string' ||
    typeof value.node_id !== 'string' ||
    typeof value.ts !== 'number' ||
    typeof value.type !== 'string' ||
    typeof value.v !== 'number' ||
    !isRecord(value.payload)
  ) {
    return null
  }

  return {
    msg_id: value.msg_id,
    node_id: value.node_id,
    payload: value.payload,
    ts: value.ts,
    type: value.type,
    v: value.v,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function rgbToHue(r: number, g: number, b: number): number {
  const rn = clamp(r, 0, 255) / 255
  const gn = clamp(g, 0, 255) / 255
  const bn = clamp(b, 0, 255) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  if (delta === 0) return 0

  let hue = 0
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2
  } else {
    hue = (rn - gn) / delta + 4
  }

  return Math.round((hue * 60 + 360) % 360)
}

function batteryMvToPercent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(clamp(((value - 3300) / 900) * 100, 0, 100))
}

function inferNodeType(nodeId: string, payload: Record<string, unknown>): AihubNodeType | null {
  const raw = typeof payload.node_type === 'string' ? payload.node_type : nodeId.split('_')[0]
  switch (raw.toLowerCase()) {
    case 'imu':
    case 'pir':
    case 'baro':
    case 'hrox':
    case 'env':
    case 'gas':
    case 'vad':
    case 'cam':
    case 'avhub':
    case 'led':
      return raw.toLowerCase() as AihubNodeType
    default:
      return null
  }
}

function inferBlockType(nodeType: AihubNodeType | null): HardwareBlockType {
  if (nodeType === 'cam' || nodeType === 'avhub') return 'stream'
  if (nodeType === 'led') return 'actuator'
  return 'sensor'
}

function inferCapability(nodeType: AihubNodeType | null): string {
  switch (nodeType) {
    case 'env':
      return 'environment'
    case 'gas':
      return 'air_quality'
    case 'hrox':
      return 'heart_rate_oximeter'
    case 'pir':
      return 'presence'
    case 'baro':
      return 'barometric_pressure'
    case 'cam':
      return 'camera'
    case 'avhub':
      return 'audio_video_hub'
    case 'vad':
      return 'voice_activity'
    case 'led':
      return 'light'
    case 'imu':
      return 'imu'
    default:
      return 'unknown'
  }
}

function inferChip(nodeType: AihubNodeType | null): string {
  if (nodeType === 'cam' || nodeType === 'avhub') return 'ESP32-S3'
  return 'ESP32-C3'
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue

    if (typeof value === 'boolean') {
      next[key] = value ? 1 : 0
      continue
    }

    if (Array.isArray(value)) {
      next[key] = value
      continue
    }

    if (isRecord(value)) {
      next[key] = sanitizePayload(value)
      continue
    }

    next[key] = value
  }

  return next
}

function extractActuatorState(
  nodeType: AihubNodeType | null,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (nodeType !== 'led') return null

  const led = isRecord(payload.led) ? payload.led : null
  const ws2812 = isRecord(payload.ws2812) ? payload.ws2812 : null

  if (!led && !ws2812) return null

  return {
    ...(led ?? {}),
    ...(ws2812 ?? {}),
  }
}

function buildCommandEnvelope(nodeId: string, action: string, params: Record<string, unknown>) {
  return JSON.stringify({
    v: 1,
    ts: Date.now(),
    node_id: nodeId,
    msg_id: randomUUID().replaceAll('-', '').slice(0, 8),
    type: 'cmd',
    payload: {
      action,
      params,
    },
  })
}

export class AihubMqttBridge {
  private readonly brokerUri = (process.env.MQTT_BROKER_URI || '').trim() || null
  private readonly clientId = `unforce-agent-${randomUUID().slice(0, 8)}`
  private client: MqttClient | null = null
  private connectedAt: string | null = null
  private lastError: string | null = null
  private lastMessageAt: string | null = null
  private readonly password = process.env.MQTT_PASSWORD || undefined
  private readonly publishLegacyCommands =
    (process.env.MQTT_PUBLISH_LEGACY_COMMANDS || 'true').trim().toLowerCase() !== 'false'
  private readonly rootTopic = (process.env.MQTT_ROOT_TOPIC || 'aihub').trim() || 'aihub'
  private state: BridgeConnectionState = this.brokerUri ? 'disabled' : 'disabled'
  private readonly subscriptions: string[]
  private readonly username = process.env.MQTT_USERNAME || undefined

  constructor(private readonly options: MqttBridgeOptions) {
    this.subscriptions = [
      `${this.rootTopic}/status/#`,
      `${this.rootTopic}/sensor/#`,
      `${this.rootTopic}/event/#`,
      `${this.rootTopic}/resp/#`,
    ]
  }

  isEnabled(): boolean {
    return Boolean(this.brokerUri)
  }

  getStatus(): MqttBridgeStatus {
    return {
      brokerUri: this.brokerUri,
      clientId: this.isEnabled() ? this.clientId : null,
      connectedAt: this.connectedAt,
      enabled: this.isEnabled(),
      lastError: this.lastError,
      lastMessageAt: this.lastMessageAt,
      rootTopic: this.rootTopic,
      state: this.state,
      subscriptions: [...this.subscriptions],
    }
  }

  async start(): Promise<void> {
    if (!this.brokerUri || this.client) {
      return
    }

    this.state = 'connecting'

    const clientOptions: IClientOptions = {
      clientId: this.clientId,
      password: this.password,
      reconnectPeriod: 5000,
      username: this.username,
    }

    const client = await mqtt.connectAsync(this.brokerUri, clientOptions)
    this.client = client
    this.connectedAt = new Date().toISOString()
    this.lastError = null
    this.state = 'connected'

    client.on('connect', () => {
      this.connectedAt = new Date().toISOString()
      this.lastError = null
      this.state = 'connected'
    })

    client.on('reconnect', () => {
      this.state = 'connecting'
    })

    client.on('close', () => {
      if (this.state !== 'error') {
        this.state = 'connecting'
      }
    })

    client.on('error', (error) => {
      this.lastError = error.message
      this.state = 'error'
      console.error('[mqtt] client error:', error)
    })

    client.on('message', (topic, payload, packet) => {
      void this.handleMessage(topic, payload, packet).catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error)
        console.error('[mqtt] message handling failed:', error)
      })
    })

    await Promise.all(this.subscriptions.map((topic) => client.subscribeAsync(topic, { qos: 1 })))
    console.log(
      `[mqtt] connected to ${this.brokerUri} and subscribed to ${this.subscriptions.join(', ')}`,
    )
  }

  async stop(): Promise<void> {
    const client = this.client
    this.client = null

    if (!client) {
      return
    }

    await client.endAsync()
    this.state = 'disabled'
  }

  async requestInfo(nodeId: string): Promise<PublishResult> {
    const payload = buildCommandEnvelope(nodeId, 'get_info', {})
    const compatibilityTopics = this.publishLegacyCommands
      ? [
          await this.publishLegacy(nodeId, 'info', JSON.stringify({ request: 'info' })).then(
            (r) => r.topic,
          ),
        ]
      : undefined

    const result = await this.publishEnvelope(nodeId, 'get_info', payload)
    return {
      ...result,
      compatibilityTopics,
    }
  }

  async publishActuatorCommand(
    blockId: string,
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<PublishResult | null> {
    const normalizedAction = action.trim().toLowerCase()

    // 固件只认 aihub/cmd/{nodeId}/ws2812 和 aihub/cmd/{nodeId}/led
    // 不解析 envelope，直接发原始 JSON payload

    if (normalizedAction === 'on') {
      const brt = typeof params.brightness === 'number'
        ? Math.round(clamp(params.brightness, 0, 100) * 2.55)
        : 180
      return this.publishLegacy(blockId, 'ws2812', JSON.stringify({ effect: 'rainbow', brightness: brt }))
    }

    if (normalizedAction === 'off') {
      await this.publishLegacy(blockId, 'led', JSON.stringify({ led: 'off' }))
      return this.publishLegacy(blockId, 'ws2812', JSON.stringify({ effect: 'off' }))
    }

    if (normalizedAction === 'set_color') {
      const brightness = typeof params.brightness === 'number' && Number.isFinite(params.brightness)
        ? params.brightness : 100
      const r = clamp(Number(params.r ?? 255), 0, 255)
      const g = clamp(Number(params.g ?? 255), 0, 255)
      const b = clamp(Number(params.b ?? 255), 0, 255)
      const wsBrightness = Math.round(clamp(brightness, 0, 100) * 2.55)
      const hue = rgbToHue(r, g, b)
      return this.publishLegacy(blockId, 'ws2812', JSON.stringify({ effect: 'siri', brightness: wsBrightness, hue }))
    }

    if (normalizedAction === 'set_pattern') {
      const pattern = String(params.pattern ?? 'rainbow')
      const payload: Record<string, unknown> = { effect: pattern }
      if (typeof params.brightness === 'number' && Number.isFinite(params.brightness)) {
        payload.brightness = Math.round(clamp(params.brightness, 0, 100) * 2.55)
      }
      if (typeof params.hue === 'number' && Number.isFinite(params.hue)) {
        payload.hue = params.hue
      }
      if (typeof params.speed_ms === 'number' && Number.isFinite(params.speed_ms)) {
        payload.speed_ms = params.speed_ms
      }
      return this.publishLegacy(blockId, 'ws2812', JSON.stringify(payload))
    }

    return null
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.client !== null
  }

  private async publishEnvelope(
    nodeId: string,
    action: string,
    payload: string,
  ): Promise<PublishResult> {
    return this.publish(`${this.rootTopic}/cmd/${nodeId}/${action}`, payload)
  }

  private async publishLegacy(
    nodeId: string,
    subject: string,
    payload: string,
  ): Promise<PublishResult> {
    return this.publish(`${this.rootTopic}/cmd/${nodeId}/${subject}`, payload)
  }

  private async publish(topic: string, payload: string): Promise<PublishResult> {
    const client = this.client
    if (!client) {
      throw new Error('MQTT bridge is not connected')
    }

    await client.publishAsync(topic, payload, { qos: 1, retain: false })
    return { payload, topic }
  }

  private async handleMessage(topic: string, payloadBuffer: Buffer, packet: Packet): Promise<void> {
    this.lastMessageAt = new Date().toISOString()

    const parsedTopic = parseAihubTopic(topic, this.rootTopic)

    const rawPayload = payloadBuffer.toString('utf-8')
    const envelope = asEnvelope(JSON.parse(rawPayload))
    if (!envelope) {
      throw new Error(`Invalid AI Hub envelope on topic ${topic}`)
    }

    if (this.options.eventService?.isEnabled()) {
      const packetMeta = getPacketMeta(packet)
      void this.options.eventService.insertMqttEnvelope(topic, envelope, {
        meta: {
          ...packetMeta,
        },
        rootTopic: this.rootTopic,
      })
    }

    const messages = this.toIngressMessages(
      parsedTopic.nodeId,
      parsedTopic.scope,
      parsedTopic.subject,
      envelope,
    )
    for (const message of messages) {
      const result = this.options.hardware.applyMessage(message)
      if (!result.ok) {
        console.warn('[mqtt] failed to apply hardware message:', result.error)
      }
    }
  }

  private toIngressMessages(
    nodeId: string,
    scope: string,
    subject: string,
    envelope: AihubMqttEnvelope,
  ): HardwareIngressMessage[] {
    const payload = sanitizePayload(envelope.payload)
    const nodeType = inferNodeType(nodeId, payload)
    const existing = this.options.hardware.getBlock(nodeId)
    const battery = batteryMvToPercent(payload.battery_mv)
    const messages: HardwareIngressMessage[] = []

    if (
      !existing ||
      scope === 'status' ||
      (scope === 'resp' && (subject === 'info' || subject === 'get_info'))
    ) {
      messages.push({
        type: 'announce',
        block: {
          block_id: nodeId,
          battery: battery ?? existing?.battery ?? 100,
          capability: inferCapability(nodeType),
          chip: inferChip(nodeType),
          firmware:
            typeof payload.fw_version === 'string'
              ? payload.fw_version
              : (existing?.firmware ?? 'unknown'),
          status: envelope.type === 'offline' ? 'offline' : 'online',
          type: inferBlockType(nodeType),
        },
      })
    }

    if (scope === 'status') {
      messages.push({
        type: 'status',
        block_id: nodeId,
        status: envelope.type === 'offline' ? 'offline' : 'online',
        battery,
      })

      if (envelope.type !== 'offline') {
        messages.push({
          type: 'telemetry',
          block_id: nodeId,
          data: payload,
          timestamp: envelope.ts,
        })
      }
    }

    if (scope === 'sensor' || scope === 'event' || scope === 'ai') {
      messages.push({
        type: 'status',
        block_id: nodeId,
        status: 'online',
        battery,
      })
      messages.push({
        type: 'telemetry',
        block_id: nodeId,
        data: {
          ...payload,
          _scope: scope,
          _subject: subject,
          _type: envelope.type,
        },
        timestamp: envelope.ts,
      })
    }

    if (scope === 'resp') {
      const responsePayload = isRecord(payload.data) ? payload.data : payload
      messages.push({
        type: 'command_result',
        action: typeof payload.action === 'string' ? payload.action : subject,
        accepted: payload.success !== false,
        block_id: nodeId,
        state: responsePayload,
        timestamp: envelope.ts,
      })

      if (subject === 'info' || subject === 'get_info' || payload.action === 'get_info') {
        messages.push({
          type: 'telemetry',
          block_id: nodeId,
          data: responsePayload,
          timestamp: envelope.ts,
        })
      }
    }

    const actuatorState = extractActuatorState(nodeType, payload)
    if (actuatorState) {
      messages.push({
        type: 'actuator_state',
        block_id: nodeId,
        state: actuatorState,
        timestamp: envelope.ts,
      })
    }

    return messages
  }

}
