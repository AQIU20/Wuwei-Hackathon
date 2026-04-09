import type {
  AihubMqttEnvelope,
  HardwareEventInsert,
  NormalizeMqttEnvelopeOptions,
} from '../hardware/mqtt-protocol'
import { normalizeAihubMqttEnvelope } from '../hardware/mqtt-protocol'

interface HardwareEventQueryRow extends HardwareEventInsert {
  id?: string
  ingested_at?: string
}

interface HardwareEventServiceOptions {
  fetchImpl?: typeof fetch
  serviceRoleKey?: string | null
  supabaseUrl?: string | null
  tableName?: string
}

interface HardwareEventPersistEvent {
  rowCount: number
}

type PersistListener = (event: HardwareEventPersistEvent) => void

export interface HardwareEventSample {
  capability: string | null
  confidence: number | null
  eventTsMs: number
  msgId: string
  nodeId: string
  nodeType: string | null
  payload: Record<string, unknown>
  recordedAt: string
  scope: string
  signalName: string | null
  status: string | null
  subject: string
  success: boolean | null
  topic: string
  type: string
}

export interface HardwareEventQueryResult {
  count: number
  samples: HardwareEventSample[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toIsoTime(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function isDuplicateMsgIdConflict(status: number, message: string): boolean {
  if (status !== 409) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('duplicate key') ||
    normalized.includes('already exists') ||
    normalized.includes('23505') ||
    normalized.includes('hardware_events_msg_id_uidx') ||
    normalized.includes('msg_id')
  )
}

export class HardwareEventService {
  private readonly enabled: boolean
  private readonly fetchImpl: typeof fetch
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private readonly tableName: string
  private readonly persistListeners = new Set<PersistListener>()

  constructor(options: HardwareEventServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL ?? null
    this.serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName =
      options.tableName ?? (process.env.SUPABASE_HARDWARE_EVENTS_TABLE || 'hardware_events')
    this.enabled = Boolean(this.supabaseUrl && this.serviceRoleKey)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getStatus() {
    return {
      enabled: this.enabled,
      tableName: this.tableName,
    }
  }

  onRowsPersisted(listener: PersistListener): () => void {
    this.persistListeners.add(listener)
    return () => this.persistListeners.delete(listener)
  }

  async insertMqttEnvelope(
    topic: string,
    envelope: AihubMqttEnvelope,
    options: NormalizeMqttEnvelopeOptions = {},
  ): Promise<void> {
    const row = normalizeAihubMqttEnvelope(topic, envelope, options)
    await this.insertRows([row])
  }

  async insertMqttEnvelopes(
    messages: Array<{
      envelope: AihubMqttEnvelope
      options?: NormalizeMqttEnvelopeOptions
      topic: string
    }>,
  ): Promise<void> {
    const rows = messages.map(({ topic, envelope, options }) =>
      normalizeAihubMqttEnvelope(topic, envelope, options),
    )
    await this.insertRows(rows)
  }

  async insertDirectEvent(row: HardwareEventInsert): Promise<void> {
    await this.insertRows([row])
  }

  async getEventByMsgId(msgId: string): Promise<HardwareEventSample | null> {
    if (!this.enabled) {
      throw new Error('Supabase hardware events are not configured')
    }

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    url.searchParams.set(
      'select',
      'id,protocol_version,event_ts_ms,recorded_at,msg_id,topic,scope,subject,type,node_id,node_type,capability,signal_name,status,success,confidence,payload,ingested_at',
    )
    url.searchParams.set('msg_id', `eq.${msgId}`)
    url.searchParams.set('limit', '1')

    const response = await this.fetchImpl(url, {
      headers: this.buildHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Supabase query failed (${response.status})`)
    }

    const rows = (await response.json()) as HardwareEventQueryRow[]
    const row = rows[0]
    if (!row) return null

    return {
      capability: row.capability,
      confidence: row.confidence,
      eventTsMs: row.event_ts_ms,
      msgId: row.msg_id,
      nodeId: row.node_id,
      nodeType: row.node_type,
      payload: isRecord(row.payload) ? row.payload : {},
      recordedAt: row.recorded_at,
      scope: row.scope,
      signalName: row.signal_name,
      status: row.status,
      subject: row.subject,
      success: row.success,
      topic: row.topic,
      type: row.type,
    }
  }

  async queryEvents(params: {
    capability?: string
    limit: number
    msgId?: string
    minutes: number
    nodeId?: string
    scope?: string
    type?: string
  }): Promise<HardwareEventQueryResult> {
    if (!this.enabled) {
      throw new Error('Supabase hardware events are not configured')
    }

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    url.searchParams.set(
      'select',
      'id,protocol_version,event_ts_ms,recorded_at,msg_id,topic,scope,subject,type,node_id,node_type,capability,signal_name,status,success,confidence,payload,ingested_at',
    )
    url.searchParams.set('order', 'recorded_at.desc')
    url.searchParams.set('limit', String(params.limit))
    url.searchParams.set('recorded_at', `gte.${toIsoTime(params.minutes)}`)

    if (params.nodeId) {
      url.searchParams.set('node_id', `eq.${params.nodeId}`)
    }

    if (params.msgId) {
      url.searchParams.set('msg_id', `eq.${params.msgId}`)
    }

    if (params.capability) {
      url.searchParams.set('capability', `eq.${params.capability}`)
    }

    if (params.scope) {
      url.searchParams.set('scope', `eq.${params.scope}`)
    }

    if (params.type) {
      url.searchParams.set('type', `eq.${params.type}`)
    }

    const response = await this.fetchImpl(url, {
      headers: this.buildHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Supabase query failed (${response.status})`)
    }

    const rows = (await response.json()) as HardwareEventQueryRow[]

    return {
      count: rows.length,
      samples: rows.map((row) => ({
        capability: row.capability,
        confidence: row.confidence,
        eventTsMs: row.event_ts_ms,
        msgId: row.msg_id,
        nodeId: row.node_id,
        nodeType: row.node_type,
        payload: isRecord(row.payload) ? row.payload : {},
        recordedAt: row.recorded_at,
        scope: row.scope,
        signalName: row.signal_name,
        status: row.status,
        subject: row.subject,
        success: row.success,
        topic: row.topic,
        type: row.type,
      })),
    }
  }

  private async insertRows(rows: HardwareEventInsert[]): Promise<void> {
    if (!this.enabled || rows.length === 0) return

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    // msg_id has a unique index — use upsert (ON CONFLICT DO NOTHING) so that
    // ESP32 reboots with recycled msg_ids don't crash the service.
    url.searchParams.set('on_conflict', 'msg_id')

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(rows),
    })

    if (!response.ok) {
      const message = await response.text()
      if (isDuplicateMsgIdConflict(response.status, message)) {
        console.warn(
          '[hardware-events] duplicate msg_id ignored:',
          rows.map((row) => row.msg_id).join(','),
        )
        return
      }
      throw new Error(`Supabase insert failed (${response.status}): ${message}`)
    }

    this.emitPersisted({
      rowCount: rows.length,
    })
  }

  private buildHeaders(): Record<string, string> {
    const serviceRoleKey = this.getServiceRoleKey()
    return {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    }
  }

  private getSupabaseUrl(): string {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured')
    }

    return this.supabaseUrl
  }

  private getServiceRoleKey(): string {
    if (!this.serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    }

    return this.serviceRoleKey
  }

  private emitPersisted(event: HardwareEventPersistEvent): void {
    for (const listener of this.persistListeners) {
      listener(event)
    }
  }
}
