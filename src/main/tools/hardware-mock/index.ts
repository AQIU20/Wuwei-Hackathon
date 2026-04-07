import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { HardwareStore } from '../../hardware/store'

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
          (block) =>
            `• [${block.status.toUpperCase()}] ${block.block_id} — ${block.capability} (${block.type}) | chip: ${block.chip} | fw: ${block.firmware} | battery: ${block.battery}%`,
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
        .map(([key, value]) => `  ${key}: ${value}`)
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
      'Capture a snapshot from a camera block and get a visual description of the scene via AI vision analysis.',
    promptSnippet: 'Capture and analyze a camera snapshot.',
    promptGuidelines: [
      'Use list_blocks to confirm the camera block_id before calling this tool',
      'The snapshot is analyzed by a vision model — describe what you see to the user',
      'If the user asks "what do you see" or "look around", use this tool',
    ],
    parameters: getCameraSnapshotSchema,
    async execute(_id: string, params: GetCameraSnapshotParams) {
      const result = hardware.getCameraScene(params.block_id)
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
      'The action to perform. Light: "set_color", "set_pattern", "off". Vibration: "pulse", "pattern", "off".',
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
      'For vibration pulse, params must include intensity (0-100) and duration_ms',
      'For vibration pattern, valid patterns are: "heartbeat", "alert", "gentle"',
      'Always confirm with the user before sending repeated or high-intensity commands',
    ],
    parameters: controlActuatorSchema,
    async execute(_id: string, params: ControlActuatorParams) {
      const block = hardware.getBlock(params.block_id)

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
              text: `Error: actuator "${params.block_id}" is offline and cannot be controlled.`,
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
              type: 'text',
              text: `Error: "${params.block_id}" is not an actuator (type: ${block.type}).`,
            },
          ],
          details: undefined,
          isError: true,
        }
      }

      const next = hardware.controlActuator(params.block_id, params.action, params.params ?? {})
      const stateStr = JSON.stringify(next?.state ?? {}, null, 2)

      return {
        content: [
          {
            type: 'text',
            text: [
              `Command sent to ${params.block_id} (${block.capability}): ${params.action}`,
              `Parameters: ${JSON.stringify(params.params ?? {})}`,
              '',
              'Current actuator state:',
              stateStr,
            ].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHardwareTools(hardware: HardwareStore): ToolDefinition<any, any, any>[] {
  return [
    createListBlocksTool(hardware),
    createGetSensorDataTool(hardware),
    createGetCameraSnapshotTool(hardware),
    createControlActuatorTool(hardware),
  ]
}
