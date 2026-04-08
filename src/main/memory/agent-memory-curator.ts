import type { Api, Model } from '@mariozechner/pi-ai'
import { complete } from '@mariozechner/pi-ai'
import type { HardwareEventSample, HardwareEventService } from '../history/hardware-event-service'
import type { ConfigService } from '../providers/config-service'
import type { ProviderRegistry } from '../providers/registry'
import { parseModelKey } from '../providers/types'
import type { AgentMemoryRow, SupabaseMemoryService } from './supabase-memory-service'

interface CuratedMemoryCandidate {
  confidence?: number
  evidence_count?: number
  memory_key?: string
  memory_type?: string
  memory_value?: string
  reason?: string | null
}

interface CuratorResult {
  memories?: CuratedMemoryCandidate[]
}

interface AgentMemoryCuratorOptions {
  configService: ConfigService
  hardwareEvents: HardwareEventService
  intervalMs?: number
  maxMemories?: number
  minutes?: number
  registry: ProviderRegistry
  supabaseMemory: SupabaseMemoryService
}

const CURATOR_PROMPT = `You create long-term agent memories from recent smart-home / wearable hardware events.

The input contains:
- recent hardware events from the last time window
- current active memories

Your job:
- infer only stable, useful user memories from hardware behavior and environment patterns
- use plain natural language for memory_value
- prefer memories like sleep schedule, lighting preference, health pattern, sedentary routine, comfort zone, air quality sensitivity
- do not output raw event summaries or one-off incidents
- do not invent facts that are not supported by the events
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
      "reason": "Repeated overnight low-activity and wake transitions across multiple days."
    }
  ]
}

Rules:
- output at most 6 memories
- memory_key must be short, stable, snake_case
- confidence must be between 0 and 1
- evidence_count must be a positive integer
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

function compactEvent(sample: HardwareEventSample): Record<string, unknown> {
  return {
    capability: sample.capability,
    eventTsMs: sample.eventTsMs,
    nodeId: sample.nodeId,
    nodeType: sample.nodeType,
    payload: sample.payload,
    recordedAt: sample.recordedAt,
    scope: sample.scope,
    status: sample.status,
    subject: sample.subject,
    success: sample.success,
    topic: sample.topic,
    type: sample.type,
  }
}

export class AgentMemoryCurator {
  private intervalHandle: Timer | null = null
  private readonly intervalMs: number
  private readonly maxMemories: number
  private readonly minutes: number
  private running = false

  constructor(private options: AgentMemoryCuratorOptions) {
    this.intervalMs = options.intervalMs ?? Number(process.env.AGENT_MEMORY_INTERVAL_MS || 60_000)
    this.maxMemories = options.maxMemories ?? Number(process.env.AGENT_MEMORY_MAX_ITEMS || 6)
    this.minutes =
      options.minutes ?? Number(process.env.AGENT_MEMORY_WINDOW_MINUTES || 60 * 24 * 3)
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
      enabled: this.options.hardwareEvents.isEnabled() && this.options.supabaseMemory.isEnabled(),
      intervalMs: this.intervalMs,
      maxMemories: this.maxMemories,
      minutes: this.minutes,
      running: this.running,
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) return
    if (!this.options.hardwareEvents.isEnabled()) return
    if (!this.options.supabaseMemory.isEnabled()) return

    const auth = this.resolveModelAuth()
    if (!auth) return

    this.running = true
    try {
      const [events, existing] = await Promise.all([
        this.options.hardwareEvents.queryEvents({
          limit: 180,
          minutes: this.minutes,
        }),
        this.options.supabaseMemory.listMemories(),
      ])

      if (events.samples.length < 5) return

      const promptPayload = {
        currentTime: new Date().toISOString(),
        existingMemories: existing.map((item) => ({
          confidence: item.confidence,
          evidence_count: item.evidence_count,
          memory_key: item.memory_key,
          memory_type: item.memory_type,
          memory_value: item.memory_value,
          reason: item.reason,
        })),
        recentHardwareEvents: events.samples.map(compactEvent),
      }

      const response = await complete(
        auth.model,
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
          apiKey: auth.apiKey,
        },
      )

      const parsed = safeJsonParse<CuratorResult>(extractTextFromResponse(response))
      const candidates = (parsed?.memories ?? [])
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
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

      if (candidates.length === 0) return

      const latestObservedAt =
        events.samples[0]?.recordedAt ??
        new Date(Math.max(...events.samples.map((sample) => sample.eventTsMs))).toISOString()

      for (const item of candidates) {
        await this.options.supabaseMemory.upsertMemory({
          home_id: null,
          memory_type: item.memory_type,
          memory_key: item.memory_key,
          memory_value: item.memory_value,
          confidence: item.confidence,
          evidence_count: item.evidence_count,
          last_observed_at: latestObservedAt,
          reason: item.reason,
          status: 'active',
        })
      }
    } finally {
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
