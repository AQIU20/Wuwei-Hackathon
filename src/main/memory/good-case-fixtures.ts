import type {
  ContextEpisodeInsert,
  ContextEpisodeRow,
  ContextEpisodeService,
} from './context-episode-service'
import type {
  AgentMemoryRow,
  AgentMemoryUpsert,
  SupabaseMemoryService,
} from './supabase-memory-service'

const GOOD_CASE_SOURCE = 'mock_good_case'
const GOOD_CASE_REASON = 'Seeded good-case fixture for frontend mixed demo.'
const GOOD_CASE_FIXTURE_COUNT = 3
const GOOD_CASE_HOME_ID = null

type GoodCaseEpisodeFixture = {
  context_type: string
  fixtureKey: string
  summary: string
}

type GoodCaseMemoryFixture = {
  memory_key: string
  memory_type: string
  memory_value: string
}

const GOOD_CASE_EPISODES: GoodCaseEpisodeFixture[] = [
  {
    context_type: 'voice_interaction',
    fixtureKey: 'good_case_morning_briefing',
    summary:
      'The user started the day with a short voice check-in, asked for a concise morning briefing, and confirmed the assistant response matched the preferred pace and tone.',
  },
  {
    context_type: 'resting_at_home',
    fixtureKey: 'good_case_evening_wind_down',
    summary:
      'The user spent a calm evening at home, kept the environment comfortable, and used the assistant for low-friction support without needing repeated corrections.',
  },
  {
    context_type: 'monitoring_space',
    fixtureKey: 'good_case_comfort_followup',
    summary:
      'The system detected an indoor comfort shift, the assistant surfaced the change clearly, and the user responded smoothly with a successful follow-up action.',
  },
]

const GOOD_CASE_MEMORIES: GoodCaseMemoryFixture[] = [
  {
    memory_key: 'good_case_response_style',
    memory_type: 'preference',
    memory_value:
      'Prefers concise, calm updates with direct next steps when checking daily status.',
  },
  {
    memory_key: 'good_case_evening_support_pattern',
    memory_type: 'pattern',
    memory_value:
      'Often interacts with the assistant during evening wind-down periods and responds well to low-friction, minimally interruptive support.',
  },
  {
    memory_key: 'good_case_environment_followup',
    memory_type: 'pattern',
    memory_value:
      'Values proactive explanations when indoor comfort changes are detected, especially when the assistant can pair the alert with an actionable follow-up.',
  },
]

function minutesAgoIso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function buildEpisodeRow(fixture: GoodCaseEpisodeFixture, index: number): ContextEpisodeInsert {
  const endMinutesAgo = index * 9 + 2
  const startMinutesAgo = endMinutesAgo + 8

  return {
    home_id: GOOD_CASE_HOME_ID,
    room_id: null,
    context_type: fixture.context_type,
    start_at: minutesAgoIso(startMinutesAgo),
    end_at: minutesAgoIso(endMinutesAgo),
    confidence: 0.95 - index * 0.01,
    summary: fixture.summary,
    source: GOOD_CASE_SOURCE,
    evidence: {
      fixture_key: fixture.fixtureKey,
      fixture_kind: 'good_case',
    },
    status: 'active',
  }
}

function buildMemoryRow(
  fixture: GoodCaseMemoryFixture,
  index: number,
  sourceEpisodeIds: string[],
): AgentMemoryUpsert {
  return {
    home_id: GOOD_CASE_HOME_ID,
    memory_key: fixture.memory_key,
    memory_type: fixture.memory_type,
    memory_value: fixture.memory_value,
    confidence: 0.97 - index * 0.01,
    evidence_count: 4 + index,
    last_observed_at: minutesAgoIso(index * 11 + 3),
    source_episode_ids: sourceEpisodeIds,
    reason: GOOD_CASE_REASON,
    status: 'active',
  }
}

export function isGoodCaseEpisode(row: ContextEpisodeRow): boolean {
  return row.source === GOOD_CASE_SOURCE
}

export function isGoodCaseMemory(row: AgentMemoryRow): boolean {
  return GOOD_CASE_MEMORIES.some((fixture) => fixture.memory_key === row.memory_key)
}

export function mixGoodCases<T extends { id: string }>(
  items: T[],
  isFixture: (item: T) => boolean,
  limit: number,
  fixtureCount = GOOD_CASE_FIXTURE_COUNT,
): T[] {
  const fixtures = items.filter(isFixture).slice(0, Math.min(limit, fixtureCount))
  const seen = new Set(fixtures.map((item) => item.id))
  const reals = items.filter((item) => !seen.has(item.id) && !isFixture(item))
  return [...fixtures, ...reals].slice(0, limit)
}

export async function seedGoodCaseFixtures(
  contextEpisodes: ContextEpisodeService,
  supabaseMemory: SupabaseMemoryService,
): Promise<void> {
  if (!contextEpisodes.isEnabled() || !supabaseMemory.isEnabled()) return

  const existingFixtures = await contextEpisodes.listEpisodes({
    homeId: GOOD_CASE_HOME_ID,
    limit: 20,
    minutes: 60 * 24 * 365,
    source: GOOD_CASE_SOURCE,
  })

  const fixtureEpisodeIds: string[] = []

  for (const [index, fixture] of GOOD_CASE_EPISODES.entries()) {
    const payload = buildEpisodeRow(fixture, index)
    const existing = existingFixtures.find((item) => {
      const fixtureKey =
        item.evidence && typeof item.evidence === 'object' ? item.evidence.fixture_key : undefined
      return fixtureKey === fixture.fixtureKey
    })

    if (existing) {
      await contextEpisodes.updateEpisode(existing.id, payload)
      fixtureEpisodeIds.push(existing.id)
    } else {
      const created = await contextEpisodes.insertEpisode(payload)
      fixtureEpisodeIds.push(created.id)
    }
  }

  for (const [index, fixture] of GOOD_CASE_MEMORIES.entries()) {
    await supabaseMemory.upsertMemory(buildMemoryRow(fixture, index, fixtureEpisodeIds))
  }
}
