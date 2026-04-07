import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { SupabaseHistoryService } from '../../history/supabase-history-service'

const getHardwareHistorySchema = Type.Object({
  block_id: Type.Optional(
    Type.String({
      description: 'Specific block ID to query, e.g. "heart_01" or "env_01".',
    }),
  ),
  capability: Type.Optional(
    Type.String({
      description: 'Optional capability filter, e.g. "heart_rate", "temperature", "camera".',
    }),
  ),
  lookback_minutes: Type.Optional(
    Type.Number({
      description: 'How many minutes of history to inspect. Defaults to 60.',
      minimum: 1,
      maximum: 24 * 60,
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of rows to return. Defaults to 20.',
      minimum: 1,
      maximum: 100,
    }),
  ),
})

type GetHardwareHistoryParams = Static<typeof getHardwareHistorySchema>

export function createHardwareHistoryTools(
  history: SupabaseHistoryService | null,
): ToolDefinition<typeof getHardwareHistorySchema>[] {
  if (!history) {
    return []
  }

  return [
    {
      name: 'get_hardware_history',
      label: 'Get Hardware History',
      description:
        'Query historical hardware readings and snapshots stored in Supabase. Use this when the user asks about trends, changes over time, or past sensor values.',
      promptSnippet: 'Read historical hardware data from Supabase.',
      promptGuidelines: [
        'Use this tool for questions about trends, averages, past values, or what changed over time',
        'Prefer block_id when the user names a specific module',
        'If Supabase history is unavailable, explain that historical storage is not configured',
      ],
      parameters: getHardwareHistorySchema,
      async execute(_id: string, params: GetHardwareHistoryParams) {
        if (!history.isEnabled()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Supabase history is not configured on this server.',
              },
            ],
            details: undefined,
            isError: true,
          }
        }

        const result = await history.queryHistory({
          blockId: params.block_id,
          capability: params.capability,
          limit: Math.min(Math.max(Math.floor(params.limit ?? 20), 1), 100),
          minutes: Math.min(Math.max(Math.floor(params.lookback_minutes ?? 60), 1), 24 * 60),
        })

        if (result.count === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No matching historical hardware data found in Supabase for that query.',
              },
            ],
            details: undefined,
          }
        }

        const lines = [
          `Found ${result.count} historical sample(s):`,
          '',
          ...result.samples.map(
            (sample) =>
              [
                `• ${sample.recordedAt} | ${sample.blockId} (${sample.blockCapability}, ${sample.blockType}, ${sample.status})`,
                `  payload: ${JSON.stringify(sample.payload)}`,
              ].join('\n'),
          ),
        ]

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          details: undefined,
        }
      },
    },
  ]
}
