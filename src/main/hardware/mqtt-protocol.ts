function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type AihubScope = 'status' | 'sensor' | 'cmd' | 'resp' | 'event' | 'ai'

export type AihubNodeType =
  | 'imu'
  | 'pir'
  | 'baro'
  | 'hr'
  | 'hrox'
  | 'env'
  | 'gas'
  | 'vad'
  | 'cam'
  | 'avhub'
  | 'led'

export interface AihubMqttEnvelope {
  msg_id: string
  node_id: string
  payload: Record<string, unknown>
  ts: number
  type: string
  v: number
}

export interface ParsedAihubTopic {
  nodeId: string
  scope: AihubScope
  subject: string
  topic: string
}

export interface HardwareEventInsert {
  capability: string | null
  chip_family: string | null
  confidence: number | null
  event_ts_ms: number
  home_id: string | null
  ingest_trace_id: string | null
  mac_suffix: string | null
  meta: Record<string, unknown>
  msg_id: string
  node_id: string
  node_type: string | null
  payload: Record<string, unknown>
  protocol_version: number
  recorded_at: string
  room_id: string | null
  scope: string
  signal_name: string | null
  source: string
  status: string | null
  subject: string
  success: boolean | null
  topic: string
  type: string
}

export interface NormalizeMqttEnvelopeOptions {
  homeId?: string | null
  ingestTraceId?: string | null
  meta?: Record<string, unknown>
  rootTopic?: string
  roomId?: string | null
  source?: string
}

const NODE_TYPE_TO_CAPABILITY: Record<AihubNodeType, string> = {
  avhub: 'audio_video_hub',
  baro: 'barometric_pressure',
  cam: 'camera',
  env: 'environment',
  gas: 'air_quality',
  hr: 'heart_rate_oximeter',
  hrox: 'heart_rate_oximeter',
  imu: 'imu',
  led: 'light',
  pir: 'presence',
  vad: 'voice_activity',
}

function inferNodeType(nodeId: string, payload?: Record<string, unknown>): AihubNodeType | null {
  const fromPayload = typeof payload?.node_type === 'string' ? payload.node_type : null
  const prefix = (fromPayload ?? nodeId.split('_')[0]).toLowerCase()
  switch (prefix) {
    case 'imu':
    case 'pir':
    case 'baro':
    case 'hr':
    case 'hrox':
    case 'env':
    case 'gas':
    case 'vad':
    case 'cam':
    case 'avhub':
    case 'led':
      return prefix
    default:
      return null
  }
}

function inferChipFamily(nodeType: AihubNodeType | null): string | null {
  if (!nodeType) return null
  if (nodeType === 'cam' || nodeType === 'avhub') return 's3'
  return 'c3'
}

function inferMacSuffix(nodeId: string): string | null {
  const [, suffix] = nodeId.split('_')
  return suffix ?? null
}

function inferCapability(nodeType: AihubNodeType | null): string | null {
  if (!nodeType) return null
  return NODE_TYPE_TO_CAPABILITY[nodeType]
}

function inferStatus(
  scope: AihubScope,
  type: string,
  payload: Record<string, unknown>,
): string | null {
  if (type === 'online' || type === 'offline') return type
  if (scope === 'resp') {
    return payload.success === true ? 'ok' : payload.success === false ? 'error' : null
  }
  return null
}

function inferConfidence(payload: Record<string, unknown>): number | null {
  const direct = payload.confidence
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct

  const result = payload.result
  if (
    isRecord(result) &&
    typeof result.confidence === 'number' &&
    Number.isFinite(result.confidence)
  ) {
    return result.confidence
  }

  return null
}

function inferSignalName(
  scope: AihubScope,
  subject: string,
  payload: Record<string, unknown>,
): string | null {
  if (scope === 'status') return subject
  if (scope === 'event') return subject
  if (scope === 'resp' && typeof payload.action === 'string') return payload.action
  if (scope === 'ai' && typeof payload.result_type === 'string') return payload.result_type

  const keys = Object.keys(payload).filter((key) => key !== 'sensor')
  if (keys.length === 1) return keys[0]
  return subject === 'data' ? null : subject
}

export function parseAihubTopic(topic: string, rootTopic = 'aihub'): ParsedAihubTopic {
  const parts = topic.split('/')
  if (parts.length !== 4 || parts[0] !== rootTopic) {
    throw new Error(`Invalid AI Hub topic: ${topic}`)
  }

  const scope = parts[1]
  if (
    scope !== 'status' &&
    scope !== 'sensor' &&
    scope !== 'cmd' &&
    scope !== 'resp' &&
    scope !== 'event' &&
    scope !== 'ai'
  ) {
    throw new Error(`Unsupported AI Hub scope: ${scope}`)
  }

  return {
    topic,
    scope,
    nodeId: parts[2],
    subject: parts[3],
  }
}

export function normalizeAihubMqttEnvelope(
  topic: string,
  envelope: AihubMqttEnvelope,
  options: NormalizeMqttEnvelopeOptions = {},
): HardwareEventInsert {
  const parsed = parseAihubTopic(topic, options.rootTopic)
  const payload = isRecord(envelope.payload) ? envelope.payload : {}
  const nodeType = inferNodeType(envelope.node_id, payload)

  if (parsed.nodeId !== envelope.node_id) {
    throw new Error(
      `Topic node_id ${parsed.nodeId} does not match payload node_id ${envelope.node_id}`,
    )
  }

  return {
    protocol_version: envelope.v,
    event_ts_ms: envelope.ts,
    recorded_at: new Date(envelope.ts).toISOString(),
    msg_id: envelope.msg_id,
    topic: parsed.topic,
    scope: parsed.scope,
    subject: parsed.subject,
    type: envelope.type,
    node_id: envelope.node_id,
    node_type: nodeType,
    chip_family: inferChipFamily(nodeType),
    mac_suffix: inferMacSuffix(envelope.node_id),
    capability: inferCapability(nodeType),
    signal_name: inferSignalName(parsed.scope, parsed.subject, payload),
    status: inferStatus(parsed.scope, envelope.type, payload),
    success: typeof payload.success === 'boolean' ? payload.success : null,
    confidence: inferConfidence(payload),
    payload,
    meta: options.meta ?? {},
    source: options.source ?? 'mqtt',
    ingest_trace_id: options.ingestTraceId ?? null,
    home_id: options.homeId ?? null,
    room_id: options.roomId ?? null,
  }
}
