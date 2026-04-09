import type { Api, Model } from '@mariozechner/pi-ai'
import { complete } from '@mariozechner/pi-ai'
import type { HardwareEventSample, HardwareEventService } from '../history/hardware-event-service'
import type { ConfigService } from '../providers/config-service'
import type { ProviderRegistry } from '../providers/registry'
import { parseModelKey } from '../providers/types'
import type { ContextEpisodeRow, ContextEpisodeService } from './context-episode-service'

interface CuratedEpisodeCandidate {
  confidence?: number
  context_type?: string
  end_at?: string
  evidence?: Record<string, unknown>
  room_id?: string | null
  start_at?: string
  summary?: string
}

interface CuratorResult {
  episodes?: CuratedEpisodeCandidate[]
}

interface ContextEpisodeCuratorOptions {
  configService: ConfigService
  contextEpisodes: ContextEpisodeService
  hardwareEvents: HardwareEventService
  intervalMs?: number
  maxEpisodes?: number
  minutes?: number
  registry: ProviderRegistry
}

const DEFAULT_LLM_TIMEOUT_MS = 45_000
const DEFAULT_RUN_TIMEOUT_MS = 60_000
const DEFAULT_EVENT_LIMIT = 60
const MAX_PROMPT_ARRAY_ITEMS = 5
const MAX_PROMPT_OBJECT_KEYS = 20
const MAX_PROMPT_STRING_LENGTH = 160
const OMITTED_PROMPT_PAYLOAD_KEYS = new Set([
  'audio_base64',
  'audio_bytes',
  'frame_base64',
  'image_base64',
  'image_bytes',
  'pcm_base64',
  'raw_audio',
  'raw_image',
])

const CURATOR_PROMPT = `You build context episodes from recent smart-home / wearable hardware events.

The input contains:
- recent hardware events from the current lookback window
- recent existing episodes to avoid duplication

Your job:
- summarize recent behavior into short-lived context episodes such as sleeping, working, resting_at_home, voice_interaction, monitoring_space, indoor_comfort_shift
- only emit episodes that are clearly grounded in the hardware events
- merge repeated nearby events into one episode with a coherent start_at and end_at
- do not emit one episode per raw event
- do not emit duplicates of existing recent episodes
- summaries must be plain natural language and concise

Return JSON only in this shape:
{
  "episodes": [
    {
      "context_type": "voice_interaction",
      "start_at": "2026-04-09T10:00:00.000Z",
      "end_at": "2026-04-09T10:03:00.000Z",
      "confidence": 0.86,
      "summary": "The user interacted with the home assistant through voice commands.",
      "room_id": null,
      "evidence": {
        "node_ids": ["mic_01"],
        "event_count": 3,
        "signals": ["triggered_transcript"]
      }
    }
  ]
}

Rules:
- output at most 6 episodes
- context_type must be short snake_case
- confidence must be between 0 and 1
- start_at must be <= end_at
- if nothing meaningful happened, return {"episodes":[]}`

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

function normalizeContextType(value: string | undefined, summary: string): string {
  const raw = (value?.trim() || summary.trim()).toLowerCase()
  const normalized = raw
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64)
  return normalized || 'unknown_context'
}

function truncatePromptString(value: string): string {
  if (value.length <= MAX_PROMPT_STRING_LENGTH) return value
  return `${value.slice(0, MAX_PROMPT_STRING_LENGTH)}…(${value.length} chars)`
}

export function summarizePayloadForPrompt(value: unknown, key?: string, depth = 0): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (key && OMITTED_PROMPT_PAYLOAD_KEYS.has(key)) {
      return `[omitted ${key}; ${value.length} chars]`
    }
    return truncatePromptString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_PROMPT_ARRAY_ITEMS)
      .map((item) => summarizePayloadForPrompt(item, undefined, depth + 1))

    if (value.length > MAX_PROMPT_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_PROMPT_ARRAY_ITEMS} more items omitted]`)
    }

    return items
  }

  if (typeof value !== 'object') {
    return String(value)
  }

  if (depth >= 4) {
    return '[object omitted at max depth]'
  }

  const entries = Object.entries(value)
  const summary: Record<string, unknown> = {}

  for (const [entryKey, entryValue] of entries.slice(0, MAX_PROMPT_OBJECT_KEYS)) {
    summary[entryKey] = summarizePayloadForPrompt(entryValue, entryKey, depth + 1)
  }

  if (entries.length > MAX_PROMPT_OBJECT_KEYS) {
    summary.__omitted_keys = entries.length - MAX_PROMPT_OBJECT_KEYS
  }

  return summary
}

export function compactEventForPrompt(sample: HardwareEventSample): Record<string, unknown> {
  return {
    capability: sample.capability,
    confidence: sample.confidence,
    eventTsMs: sample.eventTsMs,
    nodeId: sample.nodeId,
    nodeType: sample.nodeType,
    payload: summarizePayloadForPrompt(sample.payload),
    recordedAt: sample.recordedAt,
    scope: sample.scope,
    signalName: sample.signalName,
    status: sample.status,
    subject: sample.subject,
    success: sample.success,
    topic: sample.topic,
    type: sample.type,
  }
}

function compactEpisode(row: ContextEpisodeRow): Record<string, unknown> {
  return {
    confidence: row.confidence,
    context_type: row.context_type,
    end_at: row.end_at,
    room_id: row.room_id,
    start_at: row.start_at,
    summary: row.summary,
  }
}

function normalizeIsoTime(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toISOString()
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

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getLatestEpisodeEndAt(episodes: ContextEpisodeRow[]): number | null {
  let latest: number | null = null

  for (const episode of episodes) {
    const parsed = Date.parse(episode.end_at)
    if (Number.isNaN(parsed)) continue
    if (latest === null || parsed > latest) {
      latest = parsed
    }
  }

  return latest
}

function buildMockEpisodesFromEvents(
  events: HardwareEventSample[],
  recentEpisodes: ContextEpisodeRow[],
  maxEpisodes: number,
): CuratedEpisodeCandidate[] {
  const heartEvents = events
    .filter(
      (event) =>
        event.capability === 'heart_rate_oximeter' ||
        event.nodeType === 'hrox' ||
        typeof event.payload.bpm === 'number',
    )
    .map((event) => ({
      bpm: toNumber(event.payload.bpm),
      event,
      spo2: toNumber(event.payload.spo2 ?? event.payload.spo2_pct ?? event.payload.oxygen_sat),
    }))
    .filter(
      (item): item is { bpm: number | null; event: HardwareEventSample; spo2: number | null } =>
        item.event !== null,
    )

  if (heartEvents.length < 3) return []

  const avgBpm =
    heartEvents.reduce((sum, item) => sum + (item.bpm ?? 0), 0) /
    heartEvents.filter((item) => item.bpm !== null).length
  const avgSpo2 =
    heartEvents
      .filter((item) => item.spo2 !== null)
      .reduce((sum, item) => sum + (item.spo2 ?? 0), 0) /
    Math.max(1, heartEvents.filter((item) => item.spo2 !== null).length)

  const existingRestingEpisode = recentEpisodes.find(
    (episode) => episode.context_type === 'resting_heart_monitoring',
  )

  const latestHeartEventAt = heartEvents[0]?.event.recordedAt
  const earliestHeartEventAt = heartEvents[heartEvents.length - 1]?.event.recordedAt
  if (!latestHeartEventAt || !earliestHeartEventAt) return []

  if (existingRestingEpisode) {
    const existingEndAt = Date.parse(existingRestingEpisode.end_at)
    const latestEventAt = Date.parse(latestHeartEventAt)
    if (!Number.isNaN(existingEndAt) && !Number.isNaN(latestEventAt) && latestEventAt <= existingEndAt) {
      return []
    }
  }

  return [
    {
      confidence: 0.82,
      context_type: 'resting_heart_monitoring',
      end_at: latestHeartEventAt,
      evidence: {
        avg_bpm: Math.round(avgBpm),
        avg_spo2: Math.round(avgSpo2),
        event_count: heartEvents.length,
        node_ids: [...new Set(heartEvents.map((item) => item.event.nodeId))],
      },
      room_id: null,
      start_at: existingRestingEpisode?.start_at ?? earliestHeartEventAt,
      summary: `Heart-rate monitoring showed a sustained resting range around ${Math.round(avgBpm)} bpm with oxygen saturation near ${Math.round(avgSpo2)}%.`,
    },
  ].slice(0, maxEpisodes)
}

export class ContextEpisodeCurator {
  private readonly eventLimit: number
  private intervalHandle: Timer | null = null
  private readonly intervalMs: number
  private lastError: string | null = null
  private lastRunAt: string | null = null
  private readonly maxEpisodes: number
  private readonly minutes: number
  private readonly llmTimeoutMs: number
  private readonly runTimeoutMs: number
  private running = false

  constructor(private options: ContextEpisodeCuratorOptions) {
    this.intervalMs =
      options.intervalMs ?? Number(process.env.CONTEXT_EPISODE_INTERVAL_MS || 60_000)
    this.eventLimit = Math.max(
      10,
      Number(process.env.CONTEXT_EPISODE_EVENT_LIMIT || DEFAULT_EVENT_LIMIT),
    )
    this.llmTimeoutMs = Math.max(
      1_000,
      Number(process.env.CONTEXT_EPISODE_LLM_TIMEOUT_MS || DEFAULT_LLM_TIMEOUT_MS),
    )
    this.maxEpisodes = options.maxEpisodes ?? Number(process.env.CONTEXT_EPISODE_MAX_ITEMS || 6)
    this.minutes = options.minutes ?? Number(process.env.CONTEXT_EPISODE_WINDOW_MINUTES || 180)
    this.runTimeoutMs = Math.max(
      this.llmTimeoutMs + 1_000,
      Number(process.env.CONTEXT_EPISODE_RUN_TIMEOUT_MS || DEFAULT_RUN_TIMEOUT_MS),
    )
  }

  start(): void {
    if (this.intervalHandle) return
    void this.runOnce().catch((error) => {
      console.error('[context-episodes] initial curation failed:', error)
    })
    this.intervalHandle = setInterval(() => {
      void this.runOnce().catch((error) => {
        console.error('[context-episodes] periodic curation failed:', error)
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
      enabled: this.options.hardwareEvents.isEnabled() && this.options.contextEpisodes.isEnabled(),
      eventLimit: this.eventLimit,
      intervalMs: this.intervalMs,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt,
      llmTimeoutMs: this.llmTimeoutMs,
      maxEpisodes: this.maxEpisodes,
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
    if (!this.options.hardwareEvents.isEnabled()) return
    if (!this.options.contextEpisodes.isEnabled()) return

    const mockMode = process.env.MEMORY_CURATOR_MOCK === 'true'
    const auth = mockMode ? null : this.resolveModelAuth()
    if (!mockMode && !auth) return

    this.running = true
    this.lastRunAt = new Date().toISOString()
    this.lastError = null
    const runStartedAt = this.lastRunAt
    const watchdog = setTimeout(() => {
      if (this.running && this.lastRunAt === runStartedAt) {
        this.lastError = timeoutError('context episode run', this.runTimeoutMs).message
        this.running = false
        console.error('[context-episodes] watchdog released stuck run')
      }
    }, this.runTimeoutMs)

    try {
      const [events, recentEpisodes] = await Promise.all([
        this.options.hardwareEvents.queryEvents({
          limit: this.eventLimit,
          minutes: this.minutes,
        }),
        this.options.contextEpisodes.listEpisodes({
          limit: 24,
          minutes: this.minutes,
        }),
      ])

      const latestEpisodeEndAt = getLatestEpisodeEndAt(recentEpisodes)
      const freshEvents =
        latestEpisodeEndAt === null
          ? events.samples
          : events.samples.filter((event) => {
              const recordedAt = Date.parse(event.recordedAt)
              return !Number.isNaN(recordedAt) && recordedAt > latestEpisodeEndAt
            })

      if (freshEvents.length < 3) return

      const promptPayload = {
        currentTime: new Date().toISOString(),
        recentEpisodes: recentEpisodes.map(compactEpisode),
        recentHardwareEvents: freshEvents.map(compactEventForPrompt),
      }

      let rawCandidates: CuratedEpisodeCandidate[] = []
      if (mockMode) {
        rawCandidates = buildMockEpisodesFromEvents(
          freshEvents,
          recentEpisodes,
          this.maxEpisodes,
        )
      } else {
        const liveAuth = auth
        if (!liveAuth) return
        try {
          rawCandidates =
            safeJsonParse<CuratorResult>(
              extractTextFromResponse(
                await withTimeout(
                  'context episode LLM call',
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
            )?.episodes ?? []
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error)
          console.error('[context-episodes] llm curation failed, falling back to rules:', error)
        }
      }

      if (rawCandidates.length === 0) {
        rawCandidates = buildMockEpisodesFromEvents(
          freshEvents,
          recentEpisodes,
          this.maxEpisodes,
        )
      }

      const candidates = rawCandidates
        .slice(0, this.maxEpisodes)
        .map((item) => {
          const summary = item.summary?.trim()
          if (!summary) return null

          const freshWindowStart =
            freshEvents[freshEvents.length - 1]?.recordedAt ?? new Date().toISOString()
          const freshWindowEnd = freshEvents[0]?.recordedAt ?? freshWindowStart
          const startAt = normalizeIsoTime(
            item.start_at,
            freshWindowStart,
          )
          const endAt = normalizeIsoTime(item.end_at, freshWindowEnd)
          const boundedStartAt =
            Date.parse(startAt) < Date.parse(freshWindowStart) ? freshWindowStart : startAt
          const boundedEndAt =
            Date.parse(endAt) > Date.parse(freshWindowEnd) ? freshWindowEnd : endAt
          const normalizedStart =
            Date.parse(boundedStartAt) <= Date.parse(boundedEndAt) ? boundedStartAt : boundedEndAt
          const normalizedEnd =
            Date.parse(boundedEndAt) >= Date.parse(boundedStartAt) ? boundedEndAt : boundedStartAt

          return {
            confidence: clampConfidence(item.confidence),
            context_type: normalizeContextType(item.context_type, summary),
            end_at: normalizedEnd,
            evidence: item.evidence ?? {},
            room_id: item.room_id?.trim() || null,
            start_at: normalizedStart,
            summary,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

      for (const item of candidates) {
        const created = await this.options.contextEpisodes.insertEpisode({
          home_id: null,
          room_id: item.room_id,
          context_type: item.context_type,
          start_at: item.start_at,
          end_at: item.end_at,
          confidence: item.confidence,
          summary: item.summary,
          source: 'llm_scheduler',
          evidence: item.evidence,
          status: 'active',
        })
        recentEpisodes.unshift(created)
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      clearTimeout(watchdog)
      this.running = false
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
