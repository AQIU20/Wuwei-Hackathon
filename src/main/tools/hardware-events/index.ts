import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { HardwareEventService } from '../../history/hardware-event-service'

const getHardwareEventsSchema = Type.Object({
  node_id: Type.Optional(
    Type.String({
      description: 'Specific node/block id to query, for example "led_fd8480" or "env_hello01".',
    }),
  ),
  capability: Type.Optional(
    Type.String({
      description: 'Optional capability filter, for example "light", "environment", or "camera".',
    }),
  ),
  scope: Type.Optional(
    Type.String({
      description: 'Optional event scope filter such as "sensor", "event", "resp", or "ai".',
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Optional event type filter such as "sensor_data", "online", "offline", or "cmd".',
    }),
  ),
  msg_id: Type.Optional(
    Type.String({
      description: 'Query one specific event by msg_id when tracing a single MQTT envelope.',
    }),
  ),
  lookback_minutes: Type.Optional(
    Type.Number({
      description: 'How many minutes of raw hardware events to inspect. Defaults to 10.',
      minimum: 1,
      maximum: 24 * 60,
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of events to return. Defaults to 20.',
      minimum: 1,
      maximum: 100,
    }),
  ),
})

type GetHardwareEventsParams = Static<typeof getHardwareEventsSchema>

export function createHardwareEventTools(
  hardwareEvents: HardwareEventService | null,
): ToolDefinition<typeof getHardwareEventsSchema>[] {
  if (!hardwareEvents) {
    return []
  }

  return [
    {
      name: 'get_hardware_events',
      label: 'Get Hardware Events',
      description:
        'Query raw hardware event records stored in Supabase hardware_events. Use this for event-level questions: what happened, whether a message arrived, AI detections, command responses, or counting recent events.',
      promptSnippet: 'Read raw hardware events from Supabase.',
      promptGuidelines: [
        'Use this tool for event questions, not state trend questions.',
        'Prefer this tool for queries about detections, appearances, message ingress, command responses, or recent event counts.',
        'If the user asks about trends or historical sensor values for a device, use get_hardware_history instead.',
        'Use msg_id when tracing one specific MQTT envelope.',
      ],
      parameters: getHardwareEventsSchema,
      async execute(_id: string, params: GetHardwareEventsParams) {
        if (!hardwareEvents.isEnabled()) {
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

        const result = await hardwareEvents.queryEvents({
          capability: params.capability,
          limit: Math.min(Math.max(Math.floor(params.limit ?? 20), 1), 100),
          minutes: Math.min(Math.max(Math.floor(params.lookback_minutes ?? 10), 1), 24 * 60),
          msgId: params.msg_id,
          nodeId: params.node_id,
          scope: params.scope,
          type: params.type,
        })

        if (result.count === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No matching hardware events were found in Supabase for that query.',
              },
            ],
            details: undefined,
          }
        }

        const lines = [
          `Found ${result.count} hardware event(s):`,
          '',
          ...result.samples.map((sample) =>
            [
              `• ${sample.recordedAt} | ${sample.nodeId} | scope=${sample.scope} subject=${sample.subject} type=${sample.type}`,
              `  msg_id: ${sample.msgId}`,
              `  capability: ${sample.capability ?? 'unknown'} | status: ${sample.status ?? 'n/a'} | success: ${sample.success ?? 'n/a'}`,
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
