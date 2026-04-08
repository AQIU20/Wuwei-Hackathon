export interface AgentMemoryRow {
  id: string
  home_id: string | null
  memory_type: string
  memory_key: string
  memory_value: string
  confidence: number
  evidence_count: number
  last_observed_at: string
  source_episode_ids: string[]
  reason: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface AgentMemoryUpsert {
  home_id: string | null
  memory_type: string
  memory_key: string
  memory_value: string
  confidence: number
  evidence_count: number
  last_observed_at: string
  reason: string | null
  status: string
}

export interface SupabaseMemoryServiceOptions {
  fetchImpl?: typeof fetch
  serviceRoleKey?: string | null
  supabaseUrl?: string | null
  tableName?: string
}

const DEFAULT_MEMORY_HOME_ID = '__global__'

export class SupabaseMemoryService {
  private readonly enabled: boolean
  private readonly fetchImpl: typeof fetch
  private readonly serviceRoleKey: string | null
  private readonly supabaseUrl: string | null
  private readonly tableName: string

  constructor(options: SupabaseMemoryServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL ?? null
    this.serviceRoleKey =
      options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
    this.tableName = options.tableName ?? 'agent_memories'
    this.enabled = Boolean(this.supabaseUrl && this.serviceRoleKey)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  // 列出所有 active 的 memory
  async listMemories(homeId?: string | null): Promise<AgentMemoryRow[]> {
    if (!this.enabled) throw new Error('Supabase memory is not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set(
      'select',
      'id,home_id,memory_type,memory_key,memory_value,confidence,evidence_count,last_observed_at,source_episode_ids,reason,status,created_at,updated_at',
    )
    url.searchParams.set('status', 'eq.active')
    url.searchParams.set('order', 'updated_at.desc')
    url.searchParams.set('limit', '100')
    url.searchParams.set('home_id', `eq.${this.normalizeHomeId(homeId)}`)

    const res = await this.fetchImpl(url.toString(), { headers: this.buildHeaders() })
    if (!res.ok) throw new Error(`Supabase query failed (${res.status})`)
    return (await res.json()) as AgentMemoryRow[]
  }

  // 写入或更新一条 memory（upsert on memory_key）
  async upsertMemory(row: AgentMemoryUpsert): Promise<void> {
    if (!this.enabled) return

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('on_conflict', 'home_id,memory_key')

    const res = await this.fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        ...row,
        home_id: this.normalizeHomeId(row.home_id),
        updated_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase upsert failed (${res.status}): ${msg}`)
    }
  }

  // 软删除一条 memory（status -> deleted）
  async deleteMemory(id: string): Promise<void> {
    if (!this.enabled) throw new Error('Supabase memory is not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('id', `eq.${id}`)

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'deleted', updated_at: new Date().toISOString() }),
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase delete failed (${res.status}): ${msg}`)
    }
  }

  async deleteMemoryByKey(memoryKey: string, homeId?: string | null): Promise<void> {
    if (!this.enabled) throw new Error('Supabase memory is not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('home_id', `eq.${this.normalizeHomeId(homeId)}`)
    url.searchParams.set('memory_key', `eq.${memoryKey}`)
    url.searchParams.set('status', 'eq.active')

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'deleted', updated_at: new Date().toISOString() }),
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase delete by key failed (${res.status}): ${msg}`)
    }
  }

  // 更新一条 memory 的值和原因
  async updateMemory(id: string, value: string, reason: string | null): Promise<void> {
    if (!this.enabled) throw new Error('Supabase memory is not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('id', `eq.${id}`)

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memory_value: value,
        reason,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase update failed (${res.status}): ${msg}`)
    }
  }

  async updateMemoryByKey(
    memoryKey: string,
    value: string,
    reason: string | null,
    homeId?: string | null,
  ): Promise<void> {
    if (!this.enabled) throw new Error('Supabase memory is not configured')

    const url = new URL(`/rest/v1/${this.tableName}`, this.supabaseUrl!)
    url.searchParams.set('home_id', `eq.${this.normalizeHomeId(homeId)}`)
    url.searchParams.set('memory_key', `eq.${memoryKey}`)
    url.searchParams.set('status', 'eq.active')

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memory_value: value,
        reason,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Supabase update by key failed (${res.status}): ${msg}`)
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey!,
      Authorization: `Bearer ${this.serviceRoleKey!}`,
    }
  }

  private normalizeHomeId(homeId?: string | null): string {
    return homeId ?? DEFAULT_MEMORY_HOME_ID
  }
}
