import type { Api, Model } from '@mariozechner/pi-ai'
import { complete } from '@mariozechner/pi-ai'
import type { ConfigService } from '../providers/config-service'
import type { ProviderRegistry } from '../providers/registry'
import { parseModelKey } from '../providers/types'
import type { ContextEpisodeRow, ContextEpisodeService } from './context-episode-service'
import type { AgentMemoryRow, SupabaseMemoryService } from './supabase-memory-service'

interface CuratedMemoryCandidate {
  confidence?: number
  evidence_count?: number
  memory_key?: string
  memory_type?: string
  memory_value?: string
  reason?: string | null
  source_episode_ids?: string[]
}

interface CuratorResult {
  memories?: CuratedMemoryCandidate[]
}

interface AgentMemoryCuratorOptions {
  contextEpisodes: ContextEpisodeService
  configService: ConfigService
  intervalMs?: number
  maxMemories?: number
  minutes?: number
  registry: ProviderRegistry
  supabaseMemory: SupabaseMemoryService
}

const DEFAULT_LLM_TIMEOUT_MS = 45_000
const DEFAULT_RUN_TIMEOUT_MS = 60_000

const CURATOR_PROMPT = `You create long-term agent memories from recent smart-home / wearable context episodes.

The input contains:
- recent context episodes from the last time window
- current active memories

Your job:
- infer only stable, useful user memories from repeated context episodes
- use plain natural language for memory_value
- prefer memories like sleep schedule, lighting preference, health pattern, sedentary routine, comfort zone, air quality sensitivity
- do not output raw episode summaries or one-off incidents
- do not invent facts that are not supported by the episodes
- if evidence is too weak, return fewer memories
- reuse an existing memory_key when updating the same semantic memory

Allowed memory_type values:
- preference
- pattern
- health
- habit

Return JSON only in this shape:
{
  "memories": [
    {
      "memory_type": "pattern",
      "memory_key": "sleep_schedule",
      "memory_value": "Usually falls asleep around 11:30pm and wakes around 7:30am.",
      "confidence": 0.91,
      "evidence_count": 14,
      "source_episode_ids": ["episode-1", "episode-2"],
      "reason": "Repeated overnight low-activity and wake transitions across multiple days."
    }
  ]
}

Rules:
- output at most 6 memories
- memory_key must be short, stable, snake_case
- confidence must be between 0 and 1
- evidence_count must be a positive integer
- source_episode_ids should point to the strongest supporting episodes when available
- if nothing is strong enough, return {"memories":[]}`

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function extractTextFromResponse(response: Awaited<ReturnType<typeof complete>>): string {
  return response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const payload = fenced?.[1]?.trim() ?? trimmed

  try {
    return JSON.parse(payload) as T
  } catch {
    return null
  }
}

function normalizeMemoryType(value: string | undefined): string {
  if (!value) return 'pattern'
  if (['preference', 'pattern', 'health', 'habit'].includes(value)) return value
  return 'pattern'
}

function normalizeMemoryKey(value: string | undefined, fallbackValue: string): string {
  const raw = (value?.trim() || fallbackValue.trim()).toLowerCase()
  const normalized = raw
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64)
  return normalized || `memory_${Date.now()}`
}

function timeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${timeoutMs}ms`)
}

async function withTimeout<T>(label: string, timeoutMs: number, task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(timeoutError(label, timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function compactEpisode(sample: ContextEpisodeRow): Record<string, unknown> {
  return {
    confidence: sample.confidence,
    context_type: sample.context_type,
    end_at: sample.end_at,
    evidence: sample.evidence,
    id: sample.id,
    room_id: sample.room_id,
    source: sample.source,
    start_at: sample.start_at,
    summary: sample.summary,
  }
}

function buildMockMemoriesFromEpisodes(
  episodes: ContextEpisodeRow[],
  existing: AgentMemoryRow[],
  maxMemories: number,
): CuratedMemoryCandidate[] {
  const heartEpisodes = episodes.filter(
    (episode) => episode.context_type === 'resting_heart_monitoring',
  )
  if (heartEpisodes.length === 0) return []
  if (existing.some((item) => item.memory_key === 'resting_heart_rate_baseline')) return []

  const avgBpmValues = heartEpisodes
    .map((episode) => {
      const value = episode.evidence?.avg_bpm
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    })
    .filter((value): value is number => value !== null)
  const avgSpo2Values = heartEpisodes
    .map((episode) => {
      const value = episode.evidence?.avg_spo2
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    })
    .filter((value): value is number => value !== null)

  const avgBpm =
    avgBpmValues.reduce((sum, value) => sum + value, 0) / Math.max(1, avgBpmValues.length)
  const avgSpo2 =
    avgSpo2Values.reduce((sum, value) => sum + value, 0) / Math.max(1, avgSpo2Values.length)

  return [
    {
      confidence: 0.84,
      evidence_count: heartEpisodes.length,
      memory_key: 'resting_heart_rate_baseline',
      memory_type: 'health',
      memory_value: `Recent resting heart-rate observations repeatedly stayed around ${Math.round(avgBpm)} bpm with oxygen saturation near ${Math.round(avgSpo2)}%.`,
      reason: 'Repeated resting heart monitoring episodes suggest a stable short-term baseline.',
      source_episode_ids: heartEpisodes.map((episode) => episode.id),
    },
  ].slice(0, maxMemories)
}

export class AgentMemoryCurator {
  private intervalHandle: Timer | null = null
  private readonly intervalMs: number
  private lastError: string | null = null
  private lastRunAt: string | null = null
  private readonly llmTimeoutMs: number
  private readonly maxMemories: number
  private readonly minutes: number
  private readonly runTimeoutMs: number
  private running = false

  constructor(private options: AgentMemoryCuratorOptions) {
    this.intervalMs = options.intervalMs ?? Number(process.env.AGENT_MEMORY_INTERVAL_MS || 60_000)
    this.llmTimeoutMs = Math.max(
      1_000,
      Number(process.env.AGENT_MEMORY_LLM_TIMEOUT_MS || DEFAULT_LLM_TIMEOUT_MS),
    )
    this.maxMemories = options.maxMemories ?? Number(process.env.AGENT_MEMORY_MAX_ITEMS || 6)
    this.minutes = options.minutes ?? Number(process.env.AGENT_MEMORY_WINDOW_MINUTES || 60 * 24 * 3)
    this.runTimeoutMs = Math.max(
      this.llmTimeoutMs + 1_000,
      Number(process.env.AGENT_MEMORY_RUN_TIMEOUT_MS || DEFAULT_RUN_TIMEOUT_MS),
    )
  }

  start(): void {
    if (this.intervalHandle) return
    void this.runOnce().catch((error) => {
      console.error('[agent-memories] initial curation failed:', error)
    })
    this.intervalHandle = setInterval(() => {
      void this.runOnce().catch((error) => {
        console.error('[agent-memories] periodic curation failed:', error)
      })
    }, this.intervalMs)
  }

  stop(): void {
    if (!this.intervalHandle) return
    clearInterval(this.intervalHandle)
    this.intervalHandle = null
  }

  getStatus() {
    return {
      enabled: this.options.contextEpisodes.isEnabled() && this.options.supabaseMemory.isEnabled(),
      intervalMs: this.intervalMs,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt,
      llmTimeoutMs: this.llmTimeoutMs,
      maxMemories: this.maxMemories,
      minutes: this.minutes,
      running: this.running,
      runTimeoutMs: this.runTimeoutMs,
    }
  }

  reset(reason = 'manual reset'): void {
    this.lastError = reason
    this.running = false
  }

  async runOnce(): Promise<void> {
    if (this.running) return
    if (!this.options.contextEpisodes.isEnabled()) return
    if (!this.options.supabaseMemory.isEnabled()) return

    const mockMode = process.env.MEMORY_CURATOR_MOCK === 'true'
    const auth = mockMode ? null : this.resolveModelAuth()
    if (!mockMode && !auth) return

    this.running = true
    this.lastRunAt = new Date().toISOString()
    this.lastError = null
    const runStartedAt = this.lastRunAt
    const watchdog = setTimeout(() => {
      if (this.running && this.lastRunAt === runStartedAt) {
        this.lastError = timeoutError('agent memory run', this.runTimeoutMs).message
        this.running = false
        console.error('[agent-memories] watchdog released stuck run')
      }
    }, this.runTimeoutMs)

    try {
      const [episodes, existing] = await Promise.all([
        this.options.contextEpisodes.listEpisodes({
          limit: 120,
          minutes: this.minutes,
        }),
        this.options.supabaseMemory.listMemories(),
      ])

      if ((!mockMode && episodes.length < 3) || (mockMode && episodes.length < 1)) return

      const promptPayload = {
        currentTime: new Date().toISOString(),
        existingMemories: existing.map((item) => ({
          confidence: item.confidence,
          evidence_count: item.evidence_count,
          memory_key: item.memory_key,
          memory_type: item.memory_type,
          memory_value: item.memory_value,
          reason: item.reason,
          source_episode_ids: item.source_episode_ids,
        })),
        recentContextEpisodes: episodes.map(compactEpisode),
      }

      let rawCandidates: CuratedMemoryCandidate[] = []
      if (mockMode) {
        rawCandidates = buildMockMemoriesFromEpisodes(episodes, existing, this.maxMemories)
      } else {
        const liveAuth = auth
        if (!liveAuth) return
        try {
          rawCandidates =
            safeJsonParse<CuratorResult>(
              extractTextFromResponse(
                await withTimeout(
                  'agent memory LLM call',
                  this.llmTimeoutMs,
                  complete(
                    liveAuth.model,
                    {
                      systemPrompt: CURATOR_PROMPT,
                      messages: [
                        {
                          role: 'user',
                          content: [{ type: 'text', text: JSON.stringify(promptPayload, null, 2) }],
                          timestamp: Date.now(),
                        },
                      ],
                    },
                    {
                      apiKey: liveAuth.apiKey,
                    },
                  ),
                ),
              ),
            )?.memories ?? []
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error)
          console.error('[agent-memories] llm curation failed, falling back to rules:', error)
        }
      }

      if (rawCandidates.length === 0) {
        rawCandidates = buildMockMemoriesFromEpisodes(episodes, existing, this.maxMemories)
      }

      const candidates = rawCandidates
        .slice(0, this.maxMemories)
        .map((item) => {
          const value = item.memory_value?.trim()
          if (!value) return null
          return {
            confidence: clampConfidence(item.confidence),
            evidence_count: Math.max(1, Math.round(item.evidence_count ?? 1)),
            memory_key: normalizeMemoryKey(item.memory_key, value),
            memory_type: normalizeMemoryType(item.memory_type),
            memory_value: value,
            reason: item.reason?.trim() || null,
            source_episode_ids: Array.isArray(item.source_episode_ids)
              ? item.source_episode_ids
                  .map((episodeId) => String(episodeId).trim())
                  .filter((episodeId) => episodeId.length > 0)
                  .slice(0, 12)
              : [],
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

      if (candidates.length === 0) return

      const latestObservedAt =
        episodes[0]?.end_at ??
        new Date(Math.max(...episodes.map((sample) => Date.parse(sample.end_at)))).toISOString()

      for (const item of candidates) {
        await this.options.supabaseMemory.upsertMemory({
          home_id: null,
          memory_type: item.memory_type,
          memory_key: item.memory_key,
          memory_value: item.memory_value,
          confidence: item.confidence,
          evidence_count: item.evidence_count,
          last_observed_at: latestObservedAt,
          source_episode_ids: item.source_episode_ids,
          reason: item.reason,
          status: 'active',
        })
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      clearTimeout(watchdog)
      this.running = false
    }
  }

  async buildPromptContext(limit = 6): Promise<string> {
    if (!this.options.supabaseMemory.isEnabled()) return ''

    try {
      const items = (await this.options.supabaseMemory.listMemories()).slice(0, limit)
      if (items.length === 0) return ''
      return formatAgentMemoriesForPrompt(items)
    } catch (error) {
      console.error('[agent-memories] prompt context load failed:', error)
      return ''
    }
  }

  private resolveModelAuth(): { apiKey: string; model: Model<Api> } | null {
    const activeModelId = this.options.configService.getActiveModelId()
    if (!activeModelId) return null

    const parsed = parseModelKey(activeModelId)
    if (!parsed) return null

    const provider = this.options.configService.getProvider(parsed.providerId)
    if (!provider?.apiKey) return null

    const model = this.options.registry.createActiveModel()
    if ('error' in model) return null

    return { apiKey: provider.apiKey, model }
  }
}

export function formatAgentMemoriesForPrompt(items: AgentMemoryRow[]): string {
  if (items.length === 0) return ''

  const lines = items.slice(0, 6).map((item) => {
    const confidence = Math.round(item.confidence * 100)
    return `- [${item.memory_type}] ${item.memory_key}: ${item.memory_value} (confidence ${confidence}%, observations ${item.evidence_count})`
  })

  return ['## Behavioral Memory', ...lines].join('\n')
}
