export interface ContextEpisodeRow {
  id: string
  home_id: string | null
  room_id: string | null
  context_type: string
  start_at: string
  end_at: string
  confidence: number
  summary: string
  source: string
  evidence: Record<string, unknown>
  status: string
  created_at: string
  updated_at: string
}

export interface ContextEpisodeInsert {
  home_id: string | null
  room_id: string | null
  context_type: string
  start_at: string
  end_at: string
  confidence: number
  summary: string
  source: string
  evidence: Record<string, unknown>
  status: string
}

export interface ContextEpisodeServiceOptions {
  fetchImpl?: typeof fetch
  serviceRoleKey?: string | null
  supabaseUrl?: string | null
  tableName?: string
}

interface ContextEpisodeChangeEvent {
  id: string
  type: 'insert' | 'update'
}

type EpisodeChangeListener = (event: ContextEpisodeChangeEvent) => void

const DEFAULT_HOME_ID = '__global__'

export class ContextEpisodeService {
  private readonly enabled: boolean
  private readonly fetchImpl: typeof fetch
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private readonly tableName: string
  private readonly changeListeners = new Set<EpisodeChangeListener>()

  constructor(options: ContextEpisodeServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL ?? null
    this.serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName = options.tableName ?? 'context_episodes'
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

  onEpisodeChanged(listener: EpisodeChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  async listEpisodes(params?: {
    contextType?: string
    homeId?: string | null
    limit?: number
    minutes?: number
    source?: string
  }): Promise<ContextEpisodeRow[]> {
    if (!this.enabled) throw new Error('Supabase context episodes are not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    url.searchParams.set(
      'select',
      'id,home_id,room_id,context_type,start_at,end_at,confidence,summary,source,evidence,status,created_at,updated_at',
    )
    url.searchParams.set('status', 'eq.active')
    url.searchParams.set('order', 'end_at.desc')
    url.searchParams.set('limit', String(params?.limit ?? 100))
    url.searchParams.set('home_id', `eq.${this.normalizeHomeId(params?.homeId)}`)

    if (
      typeof params?.minutes === 'number' &&
      Number.isFinite(params.minutes) &&
      params.minutes > 0
    ) {
      url.searchParams.set(
        'end_at',
        `gte.${new Date(Date.now() - params.minutes * 60_000).toISOString()}`,
      )
    }

    if (params?.contextType) {
      url.searchParams.set('context_type', `eq.${params.contextType}`)
    }

    if (params?.source) {
      url.searchParams.set('source', `eq.${params.source}`)
    }

    const res = await this.fetchImpl(url.toString(), { headers: this.buildHeaders() })
    if (!res.ok) {
      throw new Error(`Supabase context episode query failed (${res.status})`)
    }

    return (await res.json()) as ContextEpisodeRow[]
  }

  async insertEpisode(row: ContextEpisodeInsert): Promise<ContextEpisodeRow> {
    if (!this.enabled) throw new Error('Supabase context episodes are not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    const res = await this.fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        ...row,
        home_id: this.normalizeHomeId(row.home_id),
      }),
    })

    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase context episode insert failed (${res.status}): ${msg}`)
    }

    const rows = (await res.json()) as ContextEpisodeRow[]
    const created = rows[0]
    if (!created) {
      throw new Error('Supabase context episode insert returned no rows')
    }
    this.emitChanged({
      id: created.id,
      type: 'insert',
    })
    return created
  }

  async updateEpisode(id: string, patch: Partial<ContextEpisodeInsert>): Promise<void> {
    if (!this.enabled) throw new Error('Supabase context episodes are not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.getSupabaseUrl())
    url.searchParams.set('id', `eq.${id}`)

    const payload: Record<string, unknown> = {
      ...patch,
      updated_at: new Date().toISOString(),
    }

    if ('home_id' in payload) {
      payload.home_id = this.normalizeHomeId((payload.home_id as string | null | undefined) ?? null)
    }

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase context episode update failed (${res.status}): ${msg}`)
    }

    this.emitChanged({
      id,
      type: 'update',
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

  private normalizeHomeId(homeId?: string | null): string {
    return homeId ?? DEFAULT_HOME_ID
  }

  private emitChanged(event: ContextEpisodeChangeEvent): void {
    for (const listener of this.changeListeners) {
      listener(event)
    }
  }
}
