import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type Api, complete, type Model } from '@mariozechner/pi-ai'
import type { ModelRegistry } from '@mariozechner/pi-coding-agent'

type MemorySourceType = 'explicit' | 'inferred'
type MemoryStatus = 'active' | 'deleted'

interface StoredPreferenceMemory {
  confidence: number
  createdAt: string
  evidenceCount: number
  id: string
  key: string
  lastAppliedAt: string | null
  lastConfirmedAt: string | null
  reason: string | null
  sourceType: MemorySourceType
  status: MemoryStatus
  updatedAt: string
  value: string
}

interface MemoryStore {
  items: StoredPreferenceMemory[]
}

export interface PreferenceMemory {
  id: string
  key: string
  value: string
  sourceType: MemorySourceType
  confidence: number
  reason: string | null
  evidenceCount: number
  updatedAt: string
}

export interface PreferenceMemoryUpdateInput {
  id: string
  reason?: string | null
  value: string
}

interface ExtractionCandidate {
  key: string
  value: string
  sourceType: MemorySourceType
  confidence: number
  reason: string
}

interface ExtractorResult {
  candidates: ExtractionCandidate[]
}

interface ReconcilerOperation {
  action: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'
  key?: string
  value?: string
  memoryId?: string
  sourceType?: MemorySourceType
  confidence?: number
  reason: string
}

interface ReconcilerResult {
  operations: ReconcilerOperation[]
}

interface CurateTurnOptions {
  assistantText: string
  model: Model<Api>
  modelRegistry: ModelRegistry
  userText: string
}

const EMPTY_STORE: MemoryStore = {
  items: [],
}

const EXTRACTOR_PROMPT = `You extract long-lived user preference memories from a single assistant turn.

Only extract preferences that are likely to be useful in future conversations with the same user.
Focus on durable user preferences about how the assistant should respond or collaborate.

Allowed keys:
- response_language
- response_tone
- response_length
- explanation_style
- formatting_preference
- tool_preference
- coding_preference

Rules:
- Return JSON only.
- Ignore one-off task requirements.
- Ignore project-specific instructions and repository rules.
- Ignore facts about the current task unless the user states them as a future preference.
- Prefer exact normalized values like "zh-CN", "concise", "step-by-step", "markdown", "bun".
- sourceType must be "explicit" when the user directly states a preference or correction.
- sourceType must be "inferred" only when the signal is weaker but still likely reusable.
- If nothing should be remembered, return {"candidates":[]}.

JSON shape:
{
  "candidates": [
    {
      "key": "response_language",
      "value": "zh-CN",
      "sourceType": "explicit",
      "confidence": 0.98,
      "reason": "User explicitly asked for future replies in Chinese."
    }
  ]
}`

const RECONCILER_PROMPT = `You reconcile new preference-memory candidates against an existing memory store.

You must decide one of:
- ADD: candidate is new and should be stored
- UPDATE: candidate replaces or improves an existing memory entry
- DELETE: user explicitly reversed or removed an existing memory entry
- NONE: candidate should not change memory

Rules:
- Return JSON only.
- Only operate on preference memory.
- Prefer explicit user statements over inferred preferences.
- If a candidate repeats the same meaning as an existing memory, use NONE.
- If a candidate conflicts with an existing memory for the same key, use UPDATE with the existing memoryId.
- Use DELETE only when the new information explicitly negates a stored preference.
- If no change is needed, return {"operations":[]}.

JSON shape:
{
  "operations": [
    {
      "action": "UPDATE",
      "memoryId": "existing-id",
      "key": "response_language",
      "value": "zh-CN",
      "sourceType": "explicit",
      "confidence": 0.99,
      "reason": "The user explicitly corrected the preferred language."
    }
  ]
}`

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

function normalizeValue(value: string): string {
  return value.trim()
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

function toPreferenceMemory(item: StoredPreferenceMemory): PreferenceMemory {
  return {
    id: item.id,
    key: item.key,
    value: item.value,
    sourceType: item.sourceType,
    confidence: item.confidence,
    reason: item.reason,
    evidenceCount: item.evidenceCount,
    updatedAt: item.updatedAt,
  }
}

export class PreferenceMemoryService {
  private filePath: string
  private store: MemoryStore = { ...EMPTY_STORE }

  constructor(filePath?: string) {
    const baseDir = filePath
      ? dirname(filePath)
      : join(process.env.AGENT_DATA_DIR || process.cwd(), 'memory')

    mkdirSync(baseDir, { recursive: true })
    this.filePath = filePath ?? join(baseDir, 'preferences.json')
    this.load()
  }

  destroy(): void {}

  listActivePreferences(limit = 8): PreferenceMemory[] {
    return this.store.items
      .filter((item) => item.status === 'active')
      .sort((a, b) => {
        if (a.sourceType !== b.sourceType) {
          return a.sourceType === 'explicit' ? -1 : 1
        }
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence
        }
        return b.updatedAt.localeCompare(a.updatedAt)
      })
      .slice(0, limit)
      .map(toPreferenceMemory)
  }

  listManageablePreferences(): PreferenceMemory[] {
    return this.listActivePreferences(100)
  }

  getPromptContext(limit = 8): { ids: string[]; text: string } {
    const memories = this.listActivePreferences(limit)
    if (memories.length === 0) {
      return { ids: [], text: '' }
    }

    const lines = memories.map((memory) => `- ${memory.key}: ${memory.value}`)
    return {
      ids: memories.map((memory) => memory.id),
      text: `## User Preference Memory\n${lines.join('\n')}`,
    }
  }

  markApplied(memoryIds: string[]): void {
    if (memoryIds.length === 0) return

    const now = new Date().toISOString()
    let changed = false

    for (const item of this.store.items) {
      if (memoryIds.includes(item.id)) {
        item.lastAppliedAt = now
        changed = true
      }
    }

    if (changed) {
      this.persist()
    }
  }

  updatePreference({ id, reason, value }: PreferenceMemoryUpdateInput): void {
    const item = this.store.items.find((entry) => entry.id === id && entry.status === 'active')
    if (!item) {
      throw new Error('Memory item not found')
    }

    const normalizedValue = normalizeValue(value)
    if (!normalizedValue) {
      throw new Error('Memory value cannot be empty')
    }

    item.value = normalizedValue
    item.reason = reason?.trim() || null
    item.updatedAt = new Date().toISOString()
    this.persist()
  }

  deletePreference(id: string): void {
    const item = this.store.items.find((entry) => entry.id === id && entry.status === 'active')
    if (!item) {
      throw new Error('Memory item not found')
    }

    item.status = 'deleted'
    item.updatedAt = new Date().toISOString()
    this.persist()
  }

  async curateTurn({
    assistantText,
    model,
    modelRegistry,
    userText,
  }: CurateTurnOptions): Promise<void> {
    const trimmedUserText = userText.trim()
    if (!trimmedUserText) return

    const auth = await modelRegistry.getApiKeyAndHeaders(model)
    if (!auth.ok) {
      throw new Error(auth.error)
    }

    const extractionResponse = await complete(
      model,
      {
        systemPrompt: EXTRACTOR_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    assistantMessage: assistantText.trim(),
                    userMessage: trimmedUserText,
                  },
                  null,
                  2,
                ),
              },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
      },
    )

    const extractorResult = safeJsonParse<ExtractorResult>(
      extractTextFromResponse(extractionResponse),
    )

    const candidates = extractorResult?.candidates
      ?.map((candidate) => ({
        ...candidate,
        value: normalizeValue(candidate.value),
        confidence: clampConfidence(candidate.confidence),
      }))
      .filter(
        (candidate) =>
          candidate.key &&
          candidate.value &&
          [
            'response_language',
            'response_tone',
            'response_length',
            'explanation_style',
            'formatting_preference',
            'tool_preference',
            'coding_preference',
          ].includes(candidate.key),
      )

    if (!candidates || candidates.length === 0) return

    const reconcileResponse = await complete(
      model,
      {
        systemPrompt: RECONCILER_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    candidates,
                    existingMemories: this.listActivePreferences(100),
                  },
                  null,
                  2,
                ),
              },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
      },
    )

    const reconcileResult = safeJsonParse<ReconcilerResult>(
      extractTextFromResponse(reconcileResponse),
    )

    const operations = reconcileResult?.operations ?? []
    if (operations.length === 0) return
    this.applyOperations(operations)
  }

  private applyOperations(operations: ReconcilerOperation[]): void {
    const now = new Date().toISOString()
    let changed = false

    for (const operation of operations) {
      switch (operation.action) {
        case 'ADD': {
          if (!operation.key || !operation.value || !operation.sourceType) break

          const existing = this.getActiveRowByKey(operation.key)
          if (existing) {
            existing.value = operation.value
            existing.sourceType = operation.sourceType
            existing.confidence = clampConfidence(operation.confidence)
            existing.reason = operation.reason
            existing.evidenceCount += 1
            existing.updatedAt = now
            if (operation.sourceType === 'explicit') {
              existing.lastConfirmedAt = now
            }
          } else {
            this.store.items.push({
              confidence: clampConfidence(operation.confidence),
              createdAt: now,
              evidenceCount: 1,
              id: randomUUID(),
              key: operation.key,
              lastAppliedAt: null,
              lastConfirmedAt: operation.sourceType === 'explicit' ? now : null,
              reason: operation.reason,
              sourceType: operation.sourceType,
              status: 'active',
              updatedAt: now,
              value: operation.value,
            })
          }

          changed = true
          break
        }
        case 'UPDATE': {
          if (!operation.memoryId || !operation.value) break
          const existing = this.store.items.find(
            (item) => item.id === operation.memoryId && item.status === 'active',
          )
          if (!existing) break

          existing.value = operation.value
          existing.reason = operation.reason
          existing.updatedAt = now
          if (operation.sourceType) {
            existing.sourceType = operation.sourceType
          }
          if (typeof operation.confidence === 'number') {
            existing.confidence = clampConfidence(operation.confidence)
          }
          if (operation.sourceType === 'explicit') {
            existing.lastConfirmedAt = now
          }

          changed = true
          break
        }
        case 'DELETE': {
          if (!operation.memoryId) break
          const existing = this.store.items.find(
            (item) => item.id === operation.memoryId && item.status === 'active',
          )
          if (!existing) break

          existing.status = 'deleted'
          existing.updatedAt = now
          changed = true
          break
        }
        case 'NONE':
          break
      }
    }

    if (changed) {
      this.persist()
    }
  }

  private getActiveRowByKey(key: string): StoredPreferenceMemory | undefined {
    return this.store.items.find((item) => item.key === key && item.status === 'active')
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.persist()
      return
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      this.store = {
        items: (JSON.parse(raw) as MemoryStore).items ?? [],
      }
    } catch {
      this.store = { ...EMPTY_STORE }
      this.persist()
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8')
  }
}
