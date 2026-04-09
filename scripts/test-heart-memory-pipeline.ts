import type { HardwareSnapshot } from '../src/main/hardware/store'
import { HardwareEventService } from '../src/main/history/hardware-event-service'
import { SupabaseHistoryService } from '../src/main/history/supabase-history-service'
import { AgentMemoryCurator } from '../src/main/memory/agent-memory-curator'
import { ContextEpisodeCurator } from '../src/main/memory/context-episode-curator'
import { ContextEpisodeService } from '../src/main/memory/context-episode-service'

type Row = Record<string, unknown>
type TableName = 'agent_memories' | 'context_episodes' | 'hardware_events' | 'hardware_history'

const tables: Record<TableName, Row[]> = {
  agent_memories: [],
  context_episodes: [],
  hardware_events: [],
  hardware_history: [],
}

function parseTable(url: URL): TableName {
  const parts = url.pathname.split('/')
  const table = parts[parts.length - 1]
  if (
    table !== 'agent_memories' &&
    table !== 'context_episodes' &&
    table !== 'hardware_events' &&
    table !== 'hardware_history'
  ) {
    throw new Error(`Unsupported table: ${table}`)
  }
  return table
}

function matchesEq(row: Row, key: string, value: string): boolean {
  if (!value.startsWith('eq.')) return true
  return String(row[key] ?? '') === value.slice(3)
}

const fetchImpl: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  const table = parseTable(url)
  const method = init?.method ?? 'GET'

  if (method === 'GET') {
    let rows = [...tables[table]]
    for (const [key, value] of url.searchParams.entries()) {
      if (['select', 'order', 'limit'].includes(key)) continue
      rows = rows.filter((row) => matchesEq(row, key, value))
    }

    if (url.searchParams.get('order') === 'recorded_at.desc') {
      rows.sort((a, b) => String(b.recorded_at ?? '').localeCompare(String(a.recorded_at ?? '')))
    }
    if (url.searchParams.get('order') === 'end_at.desc') {
      rows.sort((a, b) => String(b.end_at ?? '').localeCompare(String(a.end_at ?? '')))
    }
    if (url.searchParams.get('order') === 'updated_at.desc') {
      rows.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    }

    const limit = Number(url.searchParams.get('limit') || rows.length)
    return Response.json(rows.slice(0, limit))
  }

  if (method === 'POST') {
    const body = JSON.parse(String(init?.body ?? '[]')) as Row | Row[]
    const items = Array.isArray(body) ? body : [body]

    if (table === 'agent_memories') {
      for (const item of items) {
        const existingIndex = tables.agent_memories.findIndex(
          (row) => row.home_id === item.home_id && row.memory_key === item.memory_key,
        )
        const next = {
          id: String(item.memory_key),
          created_at: item.created_at ?? new Date().toISOString(),
          source_episode_ids: item.source_episode_ids ?? [],
          updated_at: item.updated_at ?? new Date().toISOString(),
          ...item,
        }
        if (existingIndex >= 0) {
          tables.agent_memories[existingIndex] = {
            ...tables.agent_memories[existingIndex],
            ...next,
          }
        } else {
          tables.agent_memories.push(next)
        }
      }
      return new Response('', { status: 201 })
    }

    if (table === 'context_episodes') {
      const inserted = items.map((item, index) => ({
        id: `episode-${tables.context_episodes.length + index + 1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...item,
      }))
      tables.context_episodes.push(...inserted)
      return Response.json(inserted, { status: 201 })
    }

    tables[table].push(...items)
    return new Response('', { status: 201 })
  }

  if (method === 'PATCH') {
    const body = JSON.parse(String(init?.body ?? '{}')) as Row
    const filters = [...url.searchParams.entries()]
    tables[table] = tables[table].map((row) => {
      const matched = filters.every(([key, value]) => matchesEq(row, key, value))
      return matched ? { ...row, ...body } : row
    })
    return new Response('', { status: 200 })
  }

  throw new Error(`Unsupported method: ${method}`)
}

function buildHeartSnapshot(recordedAt: string, bpm: number, spo2: number): HardwareSnapshot {
  return {
    actuatorState: {},
    blocks: [
      {
        battery: 82,
        block_id: 'heart_01',
        capability: 'heart_rate_oximeter',
        chip: 'ESP32-C3',
        firmware: '1.2.0',
        last_seen_ms: Date.parse(recordedAt),
        latest: {
          bpm,
          spo2,
        },
        status: 'online',
        type: 'sensor',
      },
    ],
    metrics: {
      bpm,
      hcho: null,
      humidity: null,
      temp: null,
    },
    updatedAt: recordedAt,
  }
}

const configService = {
  getActiveModelId: () => null,
  getProvider: () => null,
} as never

const registry = {
  createActiveModel: () => ({ error: 'mock' }),
} as never

process.env.MEMORY_CURATOR_MOCK = 'true'

const history = new SupabaseHistoryService({
  fetchImpl,
  serviceRoleKey: 'service-role',
  supabaseUrl: 'https://example.supabase.co',
  tableName: 'hardware_history',
  persistIntervalMs: 0,
})

const hardwareEvents = new HardwareEventService({
  fetchImpl,
  serviceRoleKey: 'service-role',
  supabaseUrl: 'https://example.supabase.co',
  tableName: 'hardware_events',
})

const contextEpisodes = new ContextEpisodeService({
  fetchImpl,
  serviceRoleKey: 'service-role',
  supabaseUrl: 'https://example.supabase.co',
  tableName: 'context_episodes',
})

const agentMemories = new AgentMemoryCurator({
  configService,
  contextEpisodes,
  registry,
  supabaseMemory: {
    isEnabled: () => true,
    listMemories: async () => tables.agent_memories as never,
    upsertMemory: async (row) => {
      await fetchImpl(
        'https://example.supabase.co/rest/v1/agent_memories?on_conflict=home_id,memory_key',
        {
          method: 'POST',
          body: JSON.stringify(row),
        },
      )
    },
  } as never,
})

const contextCurator = new ContextEpisodeCurator({
  configService,
  contextEpisodes,
  hardwareEvents,
  registry,
})

let pendingRows = 0
history.onRowsPersisted(({ rowCount }) => {
  pendingRows += rowCount
})

const heartSeries = [
  { bpm: 64, recordedAt: '2026-04-09T09:00:00.000Z', spo2: 98 },
  { bpm: 66, recordedAt: '2026-04-09T09:02:00.000Z', spo2: 98 },
  { bpm: 65, recordedAt: '2026-04-09T09:04:00.000Z', spo2: 97 },
  { bpm: 67, recordedAt: '2026-04-09T09:06:00.000Z', spo2: 97 },
  { bpm: 68, recordedAt: '2026-04-09T09:08:00.000Z', spo2: 98 },
  { bpm: 66, recordedAt: '2026-04-09T09:10:00.000Z', spo2: 97 },
  { bpm: 65, recordedAt: '2026-04-09T09:12:00.000Z', spo2: 98 },
  { bpm: 64, recordedAt: '2026-04-09T09:14:00.000Z', spo2: 99 },
  { bpm: 67, recordedAt: '2026-04-09T09:16:00.000Z', spo2: 98 },
  { bpm: 66, recordedAt: '2026-04-09T09:18:00.000Z', spo2: 98 },
]

for (const [index, sample] of heartSeries.entries()) {
  await hardwareEvents.insertDirectEvent({
    capability: 'heart_rate_oximeter',
    chip_family: null,
    confidence: 0.96,
    event_ts_ms: Date.parse(sample.recordedAt),
    home_id: null,
    ingest_trace_id: `trace-${index + 1}`,
    mac_suffix: null,
    meta: { source: 'mock_heart_test' },
    msg_id: `heart-msg-${index + 1}`,
    node_id: 'heart_01',
    node_type: 'hrox',
    payload: {
      bpm: sample.bpm,
      spo2: sample.spo2,
    },
    protocol_version: 1,
    recorded_at: sample.recordedAt,
    room_id: null,
    scope: 'sensor',
    signal_name: 'heart_sample',
    source: 'mock_heart_test',
    status: 'online',
    subject: 'data',
    success: true,
    topic: 'aihub/sensor/heart_01/data',
    type: 'sensor_data',
  })

  await history.persistSnapshot(
    buildHeartSnapshot(sample.recordedAt, sample.bpm, sample.spo2),
    'mock_heart_test',
  )
}

if (pendingRows >= 10) {
  await contextCurator.runOnce()
  await agentMemories.runOnce()
}

console.log(
  JSON.stringify(
    {
      hardwareEvents: tables.hardware_events.length,
      hardwareHistory: tables.hardware_history.length,
      pendingRows,
      contextEpisodes: tables.context_episodes,
      agentMemories: tables.agent_memories,
    },
    null,
    2,
  ),
)
