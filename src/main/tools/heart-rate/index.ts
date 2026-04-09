import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { HardwareEventSample } from '../../history/hardware-event-service'
import type { ToolContext } from '../types'

const getLatestHeartReadingSchema = Type.Object({
  block_id: Type.Optional(
    Type.String({
      description:
        'Optional heart-rate/SpO2 block ID. If omitted, returns the most recently updated heart-rate block.',
    }),
  ),
})

const analyzeRecentHeartReadingsSchema = Type.Object({
  block_id: Type.Optional(
    Type.String({
      description: 'Optional specific heart-rate block id to inspect, for example "hr_8fcba4".',
    }),
  ),
  lookback_minutes: Type.Optional(
    Type.Number({
      description: 'How many recent minutes of heart-rate events to inspect. Defaults to 10.',
      minimum: 1,
      maximum: 24 * 60,
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of raw heart-rate events to scan. Defaults to 100.',
      minimum: 1,
      maximum: 500,
    }),
  ),
})

type GetLatestHeartReadingParams = Static<typeof getLatestHeartReadingSchema>
type AnalyzeRecentHeartReadingsParams = Static<typeof analyzeRecentHeartReadingsSchema>

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readHeartMetrics(payload: Record<string, unknown>) {
  return {
    bpm: toFiniteNumber(payload.bpm ?? payload.heart_rate_bpm),
    diastolic: toFiniteNumber(payload.diastolic_mm_hg),
    spo2: toFiniteNumber(payload.spo2 ?? payload.spo2_pct ?? payload.oxygen_sat),
    systolic: toFiniteNumber(payload.systolic_mm_hg),
    temperature: toFiniteNumber(payload.temperature_c ?? payload.temp_c),
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundMetric(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1))
}

function formatMetric(name: string, value: number | null, unit = ''): string {
  return `${name}: ${value === null ? '(none)' : `${value}${unit}`}`
}

export function createHeartRateTools(
  ctx: ToolContext,
): ToolDefinition<typeof getLatestHeartReadingSchema | typeof analyzeRecentHeartReadingsSchema>[] {
  const { hardware, hardwareEvents } = ctx

  return [
    {
      name: 'get_latest_heart_reading',
      label: 'Get Latest Heart Reading',
      description:
        'Read the latest heart-rate and SpO2 state cached in the live hardware store, including bpm, spo2, blood pressure, and temperature when available.',
      promptSnippet: 'Read the latest heart-rate/SpO2 data from the live hardware store.',
      promptGuidelines: [
        'Use this when the user asks for the newest heart-rate or oxygen reading.',
        'Prefer block_id when the user names a specific wearable or heart sensor node.',
        'This tool returns live in-memory state, not historical event logs.',
      ],
      parameters: getLatestHeartReadingSchema,
      async execute(_id: string, params: GetLatestHeartReadingParams) {
        const candidates = hardware
          .listBlocks()
          .filter((block) => block.capability === 'heart_rate_oximeter')
          .sort((left, right) => right.last_seen_ms - left.last_seen_ms)

        const targetBlockId = params.block_id ?? candidates[0]?.block_id
        if (!targetBlockId) {
          return {
            content: [{ type: 'text', text: 'No live heart-rate blocks are cached in the hardware store yet.' }],
            details: undefined,
            isError: true,
          }
        }

        const result = hardware.getSensorData(targetBlockId)
        const block = result?.block
        if (!result || !block) {
          return {
            content: [{ type: 'text', text: `Error: no heart-rate state is cached for "${targetBlockId}".` }],
            details: undefined,
            isError: true,
          }
        }

        const metrics = readHeartMetrics(result.data)
        return {
          content: [
            {
              type: 'text',
              text: [
                `Heart block: ${block.block_id} (${block.capability}, ${block.status})`,
                `Last seen: ${new Date(block.last_seen_ms).toISOString()}`,
                formatMetric('BPM', metrics.bpm),
                formatMetric('SpO2', metrics.spo2, '%'),
                formatMetric('Systolic', metrics.systolic, ' mmHg'),
                formatMetric('Diastolic', metrics.diastolic, ' mmHg'),
                formatMetric('Temperature', metrics.temperature, ' C'),
                `Raw payload: ${JSON.stringify(result.data)}`,
              ].join('\n'),
            },
          ],
          details: undefined,
        }
      },
    },
    {
      name: 'analyze_recent_heart_readings',
      label: 'Analyze Recent Heart Readings',
      description:
        'Analyze recent heart-rate and SpO2 events from Supabase hardware_events. Use this for questions about recent averages, ranges, or the latest trend in heart data.',
      promptSnippet: 'Analyze recent heart-rate and oxygen readings from Supabase events.',
      promptGuidelines: [
        'Use this when the user asks about recent heart-rate trends, averages, or whether readings look elevated.',
        'This tool summarizes raw event data; it is better than manually eyeballing event rows.',
        'Prefer block_id when the user names a specific heart sensor block.',
      ],
      parameters: analyzeRecentHeartReadingsSchema,
      async execute(_id: string, params: AnalyzeRecentHeartReadingsParams) {
        if (!hardwareEvents?.isEnabled()) {
          return {
            content: [{ type: 'text', text: 'Error: Supabase hardware events are not configured on this server.' }],
            details: undefined,
            isError: true,
          }
        }

        const lookbackMinutes = Math.min(Math.max(Math.floor(params.lookback_minutes ?? 10), 1), 24 * 60)
        const limit = Math.min(Math.max(Math.floor(params.limit ?? 100), 1), 500)
        const events = await hardwareEvents.queryEvents({
          capability: 'heart_rate_oximeter',
          limit,
          minutes: lookbackMinutes,
          nodeId: params.block_id,
          scope: 'sensor',
          type: 'sensor_data',
        })

        const rows = events.samples
          .map((sample) => ({
            metrics: readHeartMetrics(sample.payload),
            sample,
          }))
          .filter(
            (item) =>
              item.metrics.bpm !== null ||
              item.metrics.spo2 !== null ||
              item.metrics.systolic !== null ||
              item.metrics.diastolic !== null ||
              item.metrics.temperature !== null,
          )

        if (rows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No heart-rate events with numeric readings were found in the last ${lookbackMinutes} minute(s)${params.block_id ? ` for ${params.block_id}` : ''}.`,
              },
            ],
            details: undefined,
          }
        }

        const bpmValues = rows.map((row) => row.metrics.bpm).filter((value): value is number => value !== null)
        const spo2Values = rows.map((row) => row.metrics.spo2).filter((value): value is number => value !== null)
        const averageBpm = roundMetric(average(bpmValues))
        const averageSpo2 = roundMetric(average(spo2Values))
        const latest = rows[0] as { metrics: ReturnType<typeof readHeartMetrics>; sample: HardwareEventSample }

        return {
          content: [
            {
              type: 'text',
              text: [
                `Heart analysis window: last ${lookbackMinutes} minute(s)`,
                `Block: ${params.block_id ?? latest.sample.nodeId}`,
                `Samples analyzed: ${rows.length}`,
                `Latest sample: ${latest.sample.recordedAt}`,
                formatMetric('Latest BPM', latest.metrics.bpm),
                formatMetric('Latest SpO2', latest.metrics.spo2, '%'),
                formatMetric('Average BPM', averageBpm),
                formatMetric('Average SpO2', averageSpo2, '%'),
                bpmValues.length > 0 ? `BPM range: ${Math.min(...bpmValues)}-${Math.max(...bpmValues)}` : 'BPM range: (none)',
                spo2Values.length > 0 ? `SpO2 range: ${Math.min(...spo2Values)}-${Math.max(...spo2Values)}%` : 'SpO2 range: (none)',
              ].join('\n'),
            },
          ],
          details: undefined,
        }
      },
    },
  ]
}
