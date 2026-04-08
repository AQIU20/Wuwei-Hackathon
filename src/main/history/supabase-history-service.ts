import type { HardwareSnapshot } from '../hardware/store'

interface SupabaseHistoryRow {
  battery: number
  block_capability: string
  block_id: string
  block_type: 'sensor' | 'stream' | 'actuator'
  payload: Record<string, unknown>
  recorded_at: string
  source: string
  status: 'online' | 'offline'
}

interface SupabaseQueryRow extends SupabaseHistoryRow {
  id?: string
}

export interface HistorySample {
  battery: number
  blockCapability: string
  blockId: string
  blockType: string
  payload: Record<string, unknown>
  recordedAt: string
  source: string
  status: string
}

export interface HistoryQueryResult {
  count: number
  samples: HistorySample[]
}

function toIsoTime(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildRowPayload(block: HardwareSnapshot['blocks'][number]): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (isRecord(block.latest)) {
    payload.latest = block.latest
  }

  if (isRecord(block.actuator)) {
    payload.actuator = block.actuator
  }

  if (typeof block.scene === 'string' && block.scene.length > 0) {
    payload.scene = block.scene
  }

  return payload
}

export class SupabaseHistoryService {
  private readonly enabled: boolean
  private readonly persistIntervalMs: number
  private readonly tableName: string
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private lastPersistAt = 0

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL ?? null
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName = process.env.SUPABASE_HISTORY_TABLE || 'hardware_history'
    this.persistIntervalMs = Number(process.env.SUPABASE_PERSIST_INTERVAL_MS || 15_000)
    this.enabled = Boolean(this.supabaseUrl && this.serviceRoleKey)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getStatus() {
    return {
      enabled: this.enabled,
      mode: 'mock',
      persistIntervalMs: this.persistIntervalMs,
      tableName: this.tableName,
    }
  }

  async persistSnapshot(snapshot: HardwareSnapshot, source = 'server_snapshot'): Promise<void> {
    if (!this.enabled) return

    const now = Date.now()
    if (now - this.lastPersistAt < this.persistIntervalMs) return
    this.lastPersistAt = now

    const rows = snapshot.blocks
      .map((block) => {
        const payload = buildRowPayload(block)
        if (Object.keys(payload).length === 0) {
          return null
        }

        return {
          battery: block.battery,
          block_capability: block.capability,
          block_id: block.block_id,
          block_type: block.type,
          payload,
          recorded_at: snapshot.updatedAt,
          source,
          status: block.status,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (rows.length === 0) return

    await this.insertRows(rows)
  }

  async queryHistory(params: {
    blockId?: string
    capability?: string
    limit: number
    minutes: number
  }): Promise<HistoryQueryResult> {
    if (!this.enabled) {
      throw new Error('Supabase history is not configured')
    }

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('select', 'id,block_id,block_type,block_capability,status,battery,recorded_at,source,payload')
    url.searchParams.set('order', 'recorded_at.desc')
    url.searchParams.set('limit', String(params.limit))
    url.searchParams.set('recorded_at', `gte.${toIsoTime(params.minutes)}`)

    if (params.blockId) {
      url.searchParams.set('block_id', `eq.${params.blockId}`)
    }

    if (params.capability) {
      url.searchParams.set('block_capability', `eq.${params.capability}`)
    }

    const response = await fetch(url, {
      headers: this.buildHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Supabase query failed (${response.status})`)
    }

    const rows = (await response.json()) as SupabaseQueryRow[]

    return {
      count: rows.length,
      samples: rows.map((row) => ({
        battery: row.battery,
        blockCapability: row.block_capability,
        blockId: row.block_id,
        blockType: row.block_type,
        payload: isRecord(row.payload) ? row.payload : {},
        recordedAt: row.recorded_at,
        source: row.source,
        status: row.status,
      })),
    }
  }

  private async insertRows(rows: SupabaseHistoryRow[]): Promise<void> {
    const response = await fetch(new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!), {
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
      console.error('[history] supabase insert failed:', response.status, message)
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey!,
      Authorization: `Bearer ${this.serviceRoleKey!}`,
    }
  }
}
