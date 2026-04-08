import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { AihubMqttBridge } from '../../hardware/mqtt-bridge'
import type { HardwareStore } from '../../hardware/store'

type PresetCapability = 'light' | 'sound' | 'vibration'

interface ActuatorToolPreset {
  blockId: string
  capability: PresetCapability
  description: string
  label: string
  name: string
}

const DEFAULT_ACTUATOR_TOOL_PRESETS: ActuatorToolPreset[] = [
  {
    name: 'desk_test_led_control',
    label: 'Desk Test LED Control',
    description:
      'Control the desk test LED light actuator (led_fd8480). Use this tool first when user asks to turn on/off, set rainbow, or switch lighting effects.',
    blockId: 'led_fd8480',
    capability: 'light',
  },
]

function normalizeToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseActuatorToolPresets(raw: string | undefined): ActuatorToolPreset[] {
  if (!raw) return DEFAULT_ACTUATOR_TOOL_PRESETS

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return DEFAULT_ACTUATOR_TOOL_PRESETS
    }

    const presets: ActuatorToolPreset[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const row = item as Record<string, unknown>
      const blockId = typeof row.block_id === 'string' ? row.block_id.trim() : ''
      const capability = typeof row.capability === 'string' ? row.capability.trim() : ''
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const description = typeof row.description === 'string' ? row.description.trim() : ''
      const name = typeof row.name === 'string' ? normalizeToolName(row.name) : ''

      if (!blockId || !label || !description || !name) continue
      if (capability !== 'light' && capability !== 'sound' && capability !== 'vibration') continue

      presets.push({
        blockId,
        capability,
        description,
        label,
        name,
      })
    }

    return presets.length > 0 ? presets : DEFAULT_ACTUATOR_TOOL_PRESETS
  } catch {
    return DEFAULT_ACTUATOR_TOOL_PRESETS
  }
}

const presetActuatorControlSchema = Type.Object({
  action: Type.String({
    description:
      'Action to perform. Light: "on", "set_color", "set_pattern", "off". Vibration: "pulse", "pattern", "off". Sound: "play", "stop".',
  }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        'Action parameters. light set_color: {r,g,b,brightness}; light set_pattern: {pattern,brightness,speed_ms}; vibration pulse/pattern: {intensity,duration_ms}; sound play: {clip,volume}.',
    }),
  ),
})

type PresetActuatorControlParams = Static<typeof presetActuatorControlSchema>

async function executeActuatorCommand(args: {
  action: string
  blockId: string
  hardware: HardwareStore
  mqttBridge: AihubMqttBridge | null
  params?: Record<string, unknown>
}) {
  const { action, blockId, hardware, mqttBridge } = args
  const params = args.params ?? {}
  const block = hardware.getBlock(blockId)

  if (!block) {
    return {
      content: [{ type: 'text' as const, text: `Error: block "${blockId}" not found.` }],
      details: undefined,
      isError: true,
    }
  }

  if (block.status === 'offline') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: actuator "${blockId}" is offline and cannot be controlled.`,
        },
      ],
      details: undefined,
      isError: true,
    }
  }

  if (block.type !== 'actuator') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: "${blockId}" is not an actuator (type: ${block.type}).`,
        },
      ],
      details: undefined,
      isError: true,
    }
  }

  const next = hardware.controlActuator(blockId, action, params)
  const commandResult = mqttBridge
    ? await mqttBridge.publishActuatorCommand(blockId, action, params)
    : null
  const publishSummary = mqttBridge
    ? commandResult
      ? [
          `MQTT topic: ${commandResult.topic}`,
          `MQTT payload: ${commandResult.payload}`,
          ...(commandResult.compatibilityTopics?.length
            ? [`MQTT compatibility topics: ${commandResult.compatibilityTopics.join(', ')}`]
            : []),
        ]
      : ['MQTT publish: not sent for this action mapping']
    : ['MQTT publish: disabled (local state only)']
  const stateStr = JSON.stringify(next?.state ?? {}, null, 2)

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          `Command handled for ${hardware.getNodeLabel(blockId)} (${blockId}, ${block.capability}): ${action}`,
          `Parameters: ${JSON.stringify(params)}`,
          ...publishSummary,
          '',
          'Current actuator state:',
          stateStr,
        ].join('\n'),
      },
    ],
    details: undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPresetActuatorTools(hardware: HardwareStore, mqttBridge: AihubMqttBridge | null): ToolDefinition<any, any, any>[] {
  const presets = parseActuatorToolPresets(process.env.HARDWARE_ACTUATOR_TOOL_PRESETS)

  return presets.map((preset) => ({
    name: preset.name,
    label: preset.label,
    description: preset.description,
    promptSnippet:
      preset.capability === 'light'
        ? `Control ${preset.label} for on/off/color/pattern requests.`
        : `Control ${preset.label} actuator actions.`,
    promptGuidelines: [
      `This tool is bound to fixed block_id "${preset.blockId}". Do not ask user for another ID when this device matches intent.`,
      'Prefer this preset tool over generic control_actuator when user asks for this specific device.',
      preset.capability === 'light'
        ? 'For LED effects, prefer action "set_pattern" with params like { pattern: "rainbow", brightness: 80 }.'
        : 'Use capability-appropriate actions and params.',
    ],
    parameters: presetActuatorControlSchema,
    async execute(_id: string, params: PresetActuatorControlParams) {
      return executeActuatorCommand({
        hardware,
        mqttBridge,
        blockId: preset.blockId,
        action: params.action,
        params: params.params ?? {},
      })
    },
  }))
}

const listBlocksSchema = Type.Object({
  status_filter: Type.Optional(
    Type.Union([Type.Literal('online'), Type.Literal('offline'), Type.Literal('all')], {
      description: 'Filter by status. Defaults to "all".',
    }),
  ),
})

type ListBlocksParams = Static<typeof listBlocksSchema>

function createListBlocksTool(hardware: HardwareStore): ToolDefinition<typeof listBlocksSchema> {
  return {
    name: 'list_blocks',
    label: 'List Hardware Blocks',
    description:
      'List all registered hardware module blocks (sensors, actuators, stream devices). Returns their IDs, capabilities, battery level, and online/offline status.',
    promptSnippet: 'List all connected hardware modules and their status.',
    promptGuidelines: [
      'Call list_blocks first to discover which hardware is available before using other hardware tools',
      'A block with status "offline" cannot be read or controlled — inform the user',
      'Use the block_id from this list when calling get_sensor_data or control_actuator',
    ],
    parameters: listBlocksSchema,
    async execute(_id: string, params: ListBlocksParams) {
      const filter = params.status_filter ?? 'all'
      const blocks = hardware
        .listBlocks()
        .filter((block) => filter === 'all' || block.status === filter)

      const lines = [
        `Found ${blocks.length} block(s) (filter: ${filter}):`,
        '',
        ...blocks.map(
          (block) => {
            const label = hardware.getNodeLabel(block.block_id)
            const description = hardware.getNodeDescription(block.block_id)
            const display = label === block.block_id ? block.block_id : `${label} (${block.block_id})`
            const meta = `${display} — ${block.capability} (${block.type}) | chip: ${block.chip} | fw: ${block.firmware} | battery: ${block.battery}%`
            return description
              ? `• [${block.status.toUpperCase()}] ${meta} | desc: ${description}`
              : `• [${block.status.toUpperCase()}] ${meta}`
          },
        ),
      ]

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: undefined,
      }
    },
  }
}

const getSensorDataSchema = Type.Object({
  block_id: Type.String({
    description: 'The block ID of the sensor to read (e.g. "heart_01", "env_01")',
  }),
})

type GetSensorDataParams = Static<typeof getSensorDataSchema>

function createGetSensorDataTool(
  hardware: HardwareStore,
): ToolDefinition<typeof getSensorDataSchema> {
  return {
    name: 'get_sensor_data',
    label: 'Get Sensor Data',
    description:
      'Read the latest sensor values from a specific hardware block. Supports heart_rate, imu, temperature, humidity, and formaldehyde sensors.',
    promptSnippet: 'Read real-time sensor data from a hardware block.',
    promptGuidelines: [
      'Use list_blocks first to find valid sensor block_ids',
      'Cannot read stream or actuator blocks — those are not sensors',
      'Interpret the values for the user: bpm > 100 is elevated heart rate, hcho_mg > 0.08 is a concerning formaldehyde level, etc.',
    ],
    parameters: getSensorDataSchema,
    async execute(_id: string, params: GetSensorDataParams) {
      const result = hardware.getSensorData(params.block_id)
      const block = result?.block

      if (!block) {
        return {
          content: [{ type: 'text', text: `Error: block "${params.block_id}" not found.` }],
          details: undefined,
          isError: true,
        }
      }

      if (block.status === 'offline') {
        return {
          content: [
            {
              type: 'text',
              text: `Error: block "${params.block_id}" is offline and cannot be read.`,
            },
          ],
          details: undefined,
          isError: true,
        }
      }

      if (block.type !== 'sensor') {
        return {
          content: [
            {
              type: 'text',
              text: `Error: "${params.block_id}" is a ${block.type} block, not a sensor. Use get_camera_snapshot for cameras.`,
            },
          ],
          details: undefined,
          isError: true,
        }
      }

      const valueLines = Object.entries(result.data)
        .map(
          ([key, value]) =>
            `  ${key}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : value}`,
        )
        .join('\n')

      return {
        content: [
          {
            type: 'text',
            text: [
              `Sensor: ${params.block_id} (${block.capability})`,
              `Timestamp: ${new Date().toISOString()}`,
              'Values:',
              valueLines,
            ].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

const getCameraSnapshotSchema = Type.Object({
  block_id: Type.String({
    description: 'The block ID of the camera (e.g. "cam_01")',
  }),
})

type GetCameraSnapshotParams = Static<typeof getCameraSnapshotSchema>

function createGetCameraSnapshotTool(
  hardware: HardwareStore,
): ToolDefinition<typeof getCameraSnapshotSchema> {
  return {
    name: 'get_camera_snapshot',
    label: 'Get Camera Snapshot',
    description:
      'Return the latest camera snapshot/scene description currently cached for a camera block.',
    promptSnippet: 'Capture and analyze a camera snapshot.',
    promptGuidelines: [
      'Use list_blocks to confirm the camera block_id before calling this tool',
      'This tool returns the latest scene already cached from hardware ingress',
      'If the user asks "what do you see" or "look around", use this tool',
    ],
    parameters: getCameraSnapshotSchema,
    async execute(_id: string, params: GetCameraSnapshotParams) {
      const block = hardware.getBlock(params.block_id)
      const result = hardware.getCameraScene(params.block_id)

      if (!block) {
        return {
          content: [{ type: 'text', text: `Error: block "${params.block_id}" not found.` }],
          details: undefined,
          isError: true,
        }
      }

      if (block.status === 'offline') {
        return {
          content: [{ type: 'text', text: `Error: camera "${params.block_id}" is offline.` }],
          details: undefined,
          isError: true,
        }
      }

      if (block.capability !== 'camera') {
        return {
          content: [
            {
              type: 'text',
              text: `Error: "${params.block_id}" is not a camera (capability: ${block.capability}).`,
            },
          ],
          details: undefined,
          isError: true,
        }
      }

      if (!result) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: no camera snapshot is cached yet for "${params.block_id}".`,
            },
          ],
          details: undefined,
          isError: true,
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: [
              `Camera snapshot from ${params.block_id} at ${new Date().toISOString()}`,
              '',
              'Scene description (vision analysis):',
              result.scene,
            ].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

const controlActuatorSchema = Type.Object({
  block_id: Type.String({
    description: 'The actuator block ID (e.g. "light_01", "vibr_01")',
  }),
  action: Type.String({
    description:
      'The action to perform. Light: "on", "set_color", "set_pattern", "off". Vibration: "pulse", "pattern", "off".',
  }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        'Action parameters. set_color: {r,g,b,brightness}. set_pattern: {pattern,color,speed}. pulse: {intensity,duration_ms}. pattern: {pattern,duration_ms}.',
    }),
  ),
})

type ControlActuatorParams = Static<typeof controlActuatorSchema>

function createControlActuatorTool(
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
): ToolDefinition<typeof controlActuatorSchema> {
  return {
    name: 'control_actuator',
    label: 'Control Actuator',
    description:
      'Send a control command to a light or vibration actuator block. Can set colors, patterns, or turn off.',
    promptSnippet: 'Control a hardware actuator (light color, vibration pattern, etc.).',
    promptGuidelines: [
      'Use list_blocks to confirm the actuator block_id before calling this tool',
      'For light set_color, params must include r, g, b (0-255) and brightness (0-100)',
      'For set_pattern, valid patterns are: "breathing", "strobe", "rainbow", "steady"',
      'For real ESP32 LED nodes (block_id starts with "led_"), prefer set_pattern (for example "rainbow") over set_color',
      'For vibration pulse, params must include intensity (0-100) and duration_ms',
      'For vibration pattern, valid patterns are: "heartbeat", "alert", "gentle"',
      'Always confirm with the user before sending repeated or high-intensity commands',
    ],
    parameters: controlActuatorSchema,
    async execute(_id: string, params: ControlActuatorParams) {
      return executeActuatorCommand({
        action: params.action,
        blockId: params.block_id,
        hardware,
        mqttBridge,
        params: params.params ?? {},
      })
    },
  }
}

const requestBlockInfoSchema = Type.Object({
  block_id: Type.String({
    description: 'The block ID / node_id to query for latest node info via MQTT.',
  }),
})

type RequestBlockInfoParams = Static<typeof requestBlockInfoSchema>

function createRequestBlockInfoTool(
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
): ToolDefinition<typeof requestBlockInfoSchema> {
  return {
    name: 'request_block_info',
    label: 'Request Block Info',
    description:
      'Request the latest online info / capability snapshot from a real AI Hub node over MQTT.',
    promptSnippet: 'Request fresh block info from the hardware node over MQTT.',
    promptGuidelines: [
      'Use this when the user asks to refresh hardware status or when the node metadata may be stale.',
      'Only works when the MQTT bridge is enabled.',
    ],
    parameters: requestBlockInfoSchema,
    async execute(_id: string, params: RequestBlockInfoParams) {
      const block = hardware.getBlock(params.block_id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Error: block "${params.block_id}" not found.` }],
          details: undefined,
          isError: true,
        }
      }

      if (!mqttBridge?.isEnabled()) {
        return {
          content: [{ type: 'text', text: 'Error: MQTT bridge is not enabled on this server.' }],
          details: undefined,
          isError: true,
        }
      }

      if (!mqttBridge.isConnected()) {
        return {
          content: [{ type: 'text', text: 'Error: MQTT bridge is not connected to the broker.' }],
          details: undefined,
          isError: true,
        }
      }

      const published = await mqttBridge.requestInfo(params.block_id)

      return {
        content: [
          {
            type: 'text',
            text: [
              `Requested fresh node info for ${params.block_id}.`,
              `MQTT topic: ${published.topic}`,
              `MQTT payload: ${published.payload}`,
              ...(published.compatibilityTopics?.length
                ? [`MQTT compatibility topics: ${published.compatibilityTopics.join(', ')}`]
                : []),
            ].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHardwareTools(
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
): ToolDefinition<any, any, any>[] {
  const tools: ToolDefinition<any, any, any>[] = [
    ...createPresetActuatorTools(hardware, mqttBridge),
    createListBlocksTool(hardware),
    createGetSensorDataTool(hardware),
    createGetCameraSnapshotTool(hardware),
    createControlActuatorTool(hardware, mqttBridge),
  ]

  if (mqttBridge?.isEnabled()) {
    tools.push(createRequestBlockInfoTool(hardware, mqttBridge))
  }

  return tools
}
