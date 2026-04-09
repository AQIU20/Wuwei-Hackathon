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

interface SupabaseHistoryServiceOptions {
  fetchImpl?: typeof fetch
  persistIntervalMs?: number
  serviceRoleKey?: string | null
  supabaseUrl?: string | null
  tableName?: string
}

interface HistoryPersistEvent {
  rowCount: number
  source: string
}

type PersistListener = (event: HistoryPersistEvent) => void

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
  private readonly fetchImpl: typeof fetch
  private readonly persistIntervalMs: number
  private readonly tableName: string
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private readonly lastPersistAtByBlock = new Map<string, number>()
  private readonly persistListeners = new Set<PersistListener>()

  constructor(options: SupabaseHistoryServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL ?? null
    this.serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName = options.tableName ?? (process.env.SUPABASE_HISTORY_TABLE || 'hardware_history')
    this.persistIntervalMs =
      options.persistIntervalMs ?? Number(process.env.SUPABASE_PERSIST_INTERVAL_MS || 15_000)
    this.enabled = Boolean(this.supabaseUrl && this.serviceRoleKey)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getStatus() {
    return {
      enabled: this.enabled,
      mode: 'mqtt',
      persistIntervalMs: this.persistIntervalMs,
      tableName: this.tableName,
    }
  }

  onRowsPersisted(listener: PersistListener): () => void {
    this.persistListeners.add(listener)
    return () => this.persistListeners.delete(listener)
  }

  async persistSnapshot(snapshot: HardwareSnapshot, source = 'server_snapshot'): Promise<void> {
    if (!this.enabled) return

    const now = Date.now()

    const eligibleRows = snapshot.blocks
      .map((block) => {
        const payload = buildRowPayload(block)
        if (Object.keys(payload).length === 0) {
          return null
        }

        const lastPersistAt = this.lastPersistAtByBlock.get(block.block_id) ?? 0
        if (now - lastPersistAt < this.persistIntervalMs) {
          return null
        }

        const recordedAt = new Date(
          Number.isFinite(block.last_seen_ms) && block.last_seen_ms > 0
            ? block.last_seen_ms
            : Date.parse(snapshot.updatedAt),
        ).toISOString()

        return {
          battery: block.battery,
          block_capability: block.capability,
          block_id: block.block_id,
          block_type: block.type,
          payload,
          recorded_at: recordedAt,
          source,
          status: block.status,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (eligibleRows.length === 0) return

    const inserted = await this.insertRows(eligibleRows)
    if (!inserted) return

    for (const row of eligibleRows) {
      this.lastPersistAtByBlock.set(row.block_id, now)
    }

    this.emitPersisted({
      rowCount: eligibleRows.length,
      source,
    })
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

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    url.searchParams.set(
      'select',
      'id,block_id,block_type,block_capability,status,battery,recorded_at,source,payload',
    )
    url.searchParams.set('order', 'recorded_at.desc')
    url.searchParams.set('limit', String(params.limit))
    url.searchParams.set('recorded_at', `gte.${toIsoTime(params.minutes)}`)

    if (params.blockId) {
      url.searchParams.set('block_id', `eq.${params.blockId}`)
    }

    if (params.capability) {
      url.searchParams.set('block_capability', `eq.${params.capability}`)
    }

    const response = await this.fetchImpl(url, {
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

  private async insertRows(rows: SupabaseHistoryRow[]): Promise<boolean> {
    const response = await this.fetchImpl(
      new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl()),
      {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      },
    )

    if (!response.ok) {
      const message = await response.text()
      console.error('[history] supabase insert failed:', response.status, message)
      return false
    }

    return true
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

  private emitPersisted(event: HistoryPersistEvent): void {
    for (const listener of this.persistListeners) {
      listener(event)
    }
  }
}
