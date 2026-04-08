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

export class HardwareEventService {
  private readonly enabled: boolean
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private readonly tableName: string

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL ?? null
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName = process.env.SUPABASE_HARDWARE_EVENTS_TABLE || 'hardware_events'
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

  async queryEvents(params: {
    capability?: string
    limit: number
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

    if (params.capability) {
      url.searchParams.set('capability', `eq.${params.capability}`)
    }

    if (params.scope) {
      url.searchParams.set('scope', `eq.${params.scope}`)
    }

    if (params.type) {
      url.searchParams.set('type', `eq.${params.type}`)
    }

    const response = await fetch(url, {
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

    const response = await fetch(new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl()), {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })

    if (!response.ok) {
      const message = await response.text()
      console.error('[hardware-events] supabase insert failed:', response.status, message)
    }
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
}
