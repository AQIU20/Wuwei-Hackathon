import type { Api, Model } from '@mariozechner/pi-ai'
import { complete } from '@mariozechner/pi-ai'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { HardwareEventSample } from '../../history/hardware-event-service'
import { parseModelKey } from '../../providers/types'
import type { ToolContext } from '../types'

const DEFAULT_LOOKBACK_MINUTES = 10
const DEFAULT_MAX_IMAGES = 10
const MAX_IMAGES = 10
const MAX_QUERY_IMAGES = 200

const analyzeRecentCameraImagesSchema = Type.Object({
  question: Type.String({
    description:
      'The camera-related question to answer, for example "How many people appeared in the last 10 minutes?"',
  }),
  node_id: Type.Optional(
    Type.String({
      description: 'Optional specific camera block id to inspect.',
    }),
  ),
  lookback_minutes: Type.Optional(
    Type.Number({
      description: 'How many recent minutes of camera events to inspect. Defaults to 10.',
      minimum: 1,
      maximum: 24 * 60,
    }),
  ),
  max_images: Type.Optional(
    Type.Number({
      description:
        'Maximum number of camera images to analyze after sampling the requested time window. Defaults to 10 and cannot exceed 10.',
      minimum: 1,
      maximum: MAX_IMAGES,
    }),
  ),
})

type AnalyzeRecentCameraImagesParams = Static<typeof analyzeRecentCameraImagesSchema>

interface VisionToolResult {
  answer?: string
  confidence?: number
  evidence?: Array<{
    msg_id?: string
    node_id?: string
    recorded_at?: string
    summary?: string
  }>
  reasoning?: string
}

const CAMERA_VISION_PROMPT = `You analyze recent smart-home camera snapshots to answer one user question.

You will receive:
- a question
- metadata for recent camera events
- the corresponding images

Answer only from the provided events and images.
Do not invent unseen details.
If the images are insufficient, say that clearly.
Prefer concrete counts and time references when possible.

Return JSON only in this shape:
{
  "answer": "Short answer for the user.",
  "confidence": 0.0,
  "reasoning": "Brief grounded explanation of how the answer was inferred.",
  "evidence": [
    {
      "msg_id": "event id",
      "node_id": "camera block id",
      "recorded_at": "ISO timestamp",
      "summary": "What this image contributed"
    }
  ]
}`

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildEventSummary(sample: HardwareEventSample) {
  const payload = isRecord(sample.payload) ? sample.payload : {}
  return {
    analysis_text: toNonEmptyString(payload.analysis_text),
    confidence: sample.confidence,
    event_ts_ms: sample.eventTsMs,
    height: toFiniteNumber(payload.height),
    image_url: toNonEmptyString(payload.image_url),
    msg_id: sample.msgId,
    node_id: sample.nodeId,
    recorded_at: sample.recordedAt,
    snapshot_id: toNonEmptyString(payload.snapshot_id),
    trigger: payload.trigger === true,
    width: toFiniteNumber(payload.width),
  }
}

function hasImagePayload(sample: HardwareEventSample): boolean {
  const payload = isRecord(sample.payload) ? sample.payload : {}
  return Boolean(toNonEmptyString(payload.image_base64))
}

function sortByRecordedAtAsc(samples: HardwareEventSample[]): HardwareEventSample[] {
  return [...samples].sort((left, right) => {
    const leftTime = Date.parse(left.recordedAt)
    const rightTime = Date.parse(right.recordedAt)
    return leftTime - rightTime
  })
}

function selectEvenlyDistributedSamples(
  samples: HardwareEventSample[],
  maxSamples: number,
): HardwareEventSample[] {
  if (samples.length <= maxSamples) {
    return sortByRecordedAtAsc(samples)
  }

  const ordered = sortByRecordedAtAsc(samples)
  const lastIndex = ordered.length - 1
  const selected: HardwareEventSample[] = []
  let previousIndex = -1

  for (let i = 0; i < maxSamples; i += 1) {
    const targetIndex = Math.round((i * lastIndex) / (maxSamples - 1))
    const index = Math.max(targetIndex, previousIndex + 1)
    selected.push(ordered[Math.min(index, lastIndex)] as HardwareEventSample)
    previousIndex = index
  }

  return selected
}

function resolveModelAuth(ctx: ToolContext): { apiKey: string; model: Model<Api> } | null {
  const activeModelId = ctx.configService.getActiveModelId()
  if (!activeModelId) return null

  const parsed = parseModelKey(activeModelId)
  if (!parsed) return null

  const provider = ctx.configService.getProvider(parsed.providerId)
  if (!provider?.apiKey) return null

  const model = ctx.registry.createActiveModel()
  if ('error' in model) return null

  return { apiKey: provider.apiKey, model }
}

export function createCameraVisionTools(
  ctx: ToolContext,
): ToolDefinition<typeof analyzeRecentCameraImagesSchema>[] {
  if (!ctx.hardwareEvents) {
    return []
  }

  return [
    {
      name: 'analyze_recent_camera_images',
      label: 'Analyze Recent Camera Images',
      description:
        'Load recent camera events from Supabase, decode stored image_base64 snapshots, and ask the active vision-capable model to answer a camera question from those images.',
      promptSnippet: 'Answer recent camera questions from stored camera snapshots.',
      promptGuidelines: [
        'Use this tool when the user asks what a camera saw over a recent time window.',
        'Use this instead of get_hardware_events when image understanding is required.',
        'Pass the user question through in the question field instead of paraphrasing away important details like time windows or counts.',
        'Prefer node_id when the user names a specific camera.',
      ],
      parameters: analyzeRecentCameraImagesSchema,
      async execute(_id: string, params: AnalyzeRecentCameraImagesParams) {
        if (!ctx.hardwareEvents?.isEnabled()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Supabase hardware events are not configured on this server.',
              },
            ],
            details: undefined,
            isError: true,
          }
        }

        const modelAuth = resolveModelAuth(ctx)
        if (!modelAuth) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No active vision-capable model with an API key is configured on this server.',
              },
            ],
            details: undefined,
            isError: true,
          }
        }

        const lookbackMinutes = Math.min(
          Math.max(Math.floor(params.lookback_minutes ?? DEFAULT_LOOKBACK_MINUTES), 1),
          24 * 60,
        )
        const maxImages = Math.min(
          Math.max(Math.floor(params.max_images ?? DEFAULT_MAX_IMAGES), 1),
          MAX_IMAGES,
        )

        const events = await ctx.hardwareEvents.queryEvents({
          capability: 'camera',
          limit: MAX_QUERY_IMAGES,
          minutes: lookbackMinutes,
          nodeId: params.node_id,
          scope: 'vision',
          type: 'camera_snapshot_final',
        })

        const imageEvents = events.samples.filter(hasImagePayload)
        const selectedImageEvents = selectEvenlyDistributedSamples(imageEvents, maxImages)

        if (selectedImageEvents.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No camera events with image_base64 were found in the last ${lookbackMinutes} minute(s)${params.node_id ? ` for ${params.node_id}` : ''}.`,
              },
            ],
            details: undefined,
          }
        }

        const messageContent: Array<
          | { type: 'text'; text: string }
          | { type: 'image'; data: string; mimeType: string }
        > = [
          {
            type: 'text',
            text: JSON.stringify(
              {
                image_count: selectedImageEvents.length,
                sampled_from_image_count: imageEvents.length,
                sampling_strategy: 'evenly_distributed_over_time_window',
                images: selectedImageEvents.map(buildEventSummary),
                question: params.question,
              },
              null,
              2,
            ),
          },
        ]

        for (const sample of selectedImageEvents) {
          const payload = sample.payload as Record<string, unknown>
          messageContent.push({
            type: 'image',
            data: String(payload.image_base64),
            mimeType: toNonEmptyString(payload.mime_type) ?? 'image/jpeg',
          })
        }

        const response = await complete(
          modelAuth.model,
          {
            systemPrompt: CAMERA_VISION_PROMPT,
            messages: [
              {
                role: 'user',
                content: messageContent,
                timestamp: Date.now(),
              },
            ],
          },
          {
            apiKey: modelAuth.apiKey,
          },
        )

        const rawText = extractTextFromResponse(response)
        const parsed = safeJsonParse<VisionToolResult>(rawText)

        const evidence = parsed?.evidence?.length
          ? parsed.evidence
              .map((item) =>
                [
                  item.recorded_at ?? 'unknown-time',
                  item.node_id ?? 'unknown-node',
                  item.msg_id ? `msg_id=${item.msg_id}` : null,
                  item.summary ?? null,
                ]
                  .filter(Boolean)
                  .join(' | '),
              )
              .join('\n')
          : selectedImageEvents
              .map((sample) => {
                const summary = buildEventSummary(sample)
                return [
                  summary.recorded_at,
                  summary.node_id,
                  `msg_id=${summary.msg_id}`,
                  summary.analysis_text,
                ]
                  .filter(Boolean)
                  .join(' | ')
              })
              .join('\n')

        const answerText = parsed?.answer?.trim() || rawText.trim()
        const confidenceText =
          typeof parsed?.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? `Confidence: ${parsed.confidence.toFixed(2)}`
            : null
        const reasoningText = parsed?.reasoning?.trim() ? `Reasoning: ${parsed.reasoning}` : null

        return {
          content: [
            {
              type: 'text',
              text: [
                answerText || 'The camera analysis completed but returned no answer text.',
                confidenceText,
                reasoningText,
                `Images analyzed: ${selectedImageEvents.length}`,
                `Images available in window: ${imageEvents.length}`,
                'Evidence:',
                evidence,
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
          details: undefined,
        }
      },
    },
  ]
}
