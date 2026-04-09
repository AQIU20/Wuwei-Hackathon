import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { type Static, Type } from '@sinclair/typebox'
import type { ToolContext } from '../types'

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_HELPER_NODE_IDS = ['heap_c13de8', 'led_fd8480']
const FALLBACK_PYTHON_BINS = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']

const nodeStatusSchema = Type.Object({
  node_id: Type.String({
    description: 'Target node id, for example "heap_c13de8" or "led_fd8480".',
  }),
})

const nodeEnvSchema = Type.Object({
  node_id: Type.String({
    description: 'Target node id, for example "heap_c13de8".',
  }),
})

const ws2812EffectSchema = Type.Union(
  [
    Type.Literal('off'),
    Type.Literal('rainbow'),
    Type.Literal('particles'),
    Type.Literal('siri'),
    Type.Literal('boot'),
    Type.Literal('wifi_connecting'),
    Type.Literal('mqtt_online'),
    Type.Literal('status'),
  ],
  {
    description:
      'WS2812 effect name supported by the firmware helper script.',
  },
)

const nodeWs2812Schema = Type.Object({
  node_id: Type.String({
    description: 'Target node id, for example "heap_c13de8" or "led_fd8480".',
  }),
  effect: ws2812EffectSchema,
  speed: Type.Optional(
    Type.Number({
      description: 'Optional speed in milliseconds, valid range 10-1000.',
      minimum: 10,
      maximum: 1000,
    }),
  ),
  brightness: Type.Optional(
    Type.Number({
      description: 'Optional brightness, valid range 0-255.',
      minimum: 0,
      maximum: 255,
    }),
  ),
  hue: Type.Optional(
    Type.Number({
      description: 'Optional hue, valid range 0-360.',
      minimum: 0,
      maximum: 360,
    }),
  ),
  string_payload: Type.Optional(
    Type.Boolean({
      description: 'Whether to send the WS2812 command as a string payload instead of JSON.',
    }),
  ),
})

const nodeRawSchema = Type.Object({
  node_id: Type.String({
    description: 'Target node id, for example "heap_c13de8" or "led_fd8480".',
  }),
  fill: Type.Optional(
    Type.String({
      description: 'Optional raw fill color in the form "r,g,b", for example "255,32,0".',
    }),
  ),
  pixels: Type.Optional(
    Type.String({
      description: 'Optional raw pixel list in the form "0:255,0,0;1:0,255,0".',
    }),
  ),
})

type NodeStatusParams = Static<typeof nodeStatusSchema>
type NodeEnvParams = Static<typeof nodeEnvSchema>
type NodeWs2812Params = Static<typeof nodeWs2812Schema>
type NodeRawParams = Static<typeof nodeRawSchema>

function getScriptPath(cwd: string): string {
  return join(cwd, 'idea', 'aht20xxx.py')
}

export function getPythonBin(): string {
  const configured = process.env.AI_NODE_PYTHON_BIN?.trim()
  if (configured) {
    return configured
  }

  for (const candidate of FALLBACK_PYTHON_BINS) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return 'python3'
}

function getHelperNodeIds(): Set<string> {
  const raw = process.env.AI_NODE_HELPER_NODE_IDS?.trim()
  if (!raw) {
    return new Set(DEFAULT_HELPER_NODE_IDS)
  }

  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function isHelperBackedNodeId(nodeId: string): boolean {
  return getHelperNodeIds().has(nodeId.trim())
}

export function scaleBrightnessPercentToByte(value: unknown, fallback = 255): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.round(Math.min(Math.max(value, 0), 100) * 2.55)
}

function normalizeOptionalBrightnessByte(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? scaleBrightnessPercentToByte(value)
    : undefined
}

export function buildNodeCommandArgs(
  scriptPath: string,
  command: 'status' | 'env' | 'ws2812' | 'raw',
  params: {
    nodeId: string
    brightness?: number
    effect?: string
    fill?: string
    hue?: number
    pixels?: string
    speed?: number
    stringPayload?: boolean
  },
): string[] {
  const args = [scriptPath, command, '--node-id', params.nodeId, '--json-only']

  if (command === 'ws2812') {
    args.push('--effect', params.effect as string)
    if (typeof params.speed === 'number') {
      args.push('--speed', String(params.speed))
    }
    if (typeof params.brightness === 'number') {
      args.push('--brightness', String(params.brightness))
    }
    if (typeof params.hue === 'number') {
      args.push('--hue', String(params.hue))
    }
    if (params.stringPayload === true) {
      args.push('--string-payload')
    }
  }

  if (command === 'raw') {
    if (params.fill) {
      args.push('--fill', params.fill)
    }
    if (params.pixels) {
      args.push('--pixels', params.pixels)
    }
  }

  return args
}

async function runNodeScript(args: string[]): Promise<unknown> {
  const { stdout, stderr } = await execFileAsync(getPythonBin(), args, {
    timeout: DEFAULT_TIMEOUT_MS,
  })
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error(stderr.trim() || 'The node helper script returned no stdout')
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    throw new Error(`Failed to parse helper JSON output: ${trimmed}`)
  }
}

export async function runNodeScriptForCwd(cwd: string, args: string[]): Promise<unknown> {
  const scriptPath = getScriptPath(cwd)
  return runNodeScript([scriptPath, ...args])
}

export async function runHelperLightAction(args: {
  action: string
  blockId: string
  cwd: string
  params?: Record<string, unknown>
}): Promise<{
  commandArgs: string[]
  mode: 'raw' | 'ws2812'
  result: unknown
}> {
  const params = args.params ?? {}
  const normalizedAction = args.action.trim().toLowerCase()

  if (normalizedAction === 'off') {
    const commandArgs = buildNodeCommandArgs(getScriptPath(args.cwd), 'ws2812', {
      effect: 'off',
      nodeId: args.blockId,
    })
    return {
      commandArgs,
      mode: 'ws2812',
      result: await runNodeScript(commandArgs),
    }
  }

  if (normalizedAction === 'on') {
    const brightness = scaleBrightnessPercentToByte(params.brightness, 255)
    const commandArgs = buildNodeCommandArgs(getScriptPath(args.cwd), 'raw', {
      fill: `${brightness},${brightness},${brightness}`,
      nodeId: args.blockId,
    })
    return {
      commandArgs,
      mode: 'raw',
      result: await runNodeScript(commandArgs),
    }
  }

  if (normalizedAction === 'set_color') {
    const brightnessFactor =
      typeof params.brightness === 'number' && Number.isFinite(params.brightness)
        ? Math.min(Math.max(params.brightness, 0), 100) / 100
        : 1
    const r = Math.round(Math.min(Math.max(Number(params.r ?? 255), 0), 255) * brightnessFactor)
    const g = Math.round(Math.min(Math.max(Number(params.g ?? 255), 0), 255) * brightnessFactor)
    const b = Math.round(Math.min(Math.max(Number(params.b ?? 255), 0), 255) * brightnessFactor)
    const commandArgs = buildNodeCommandArgs(getScriptPath(args.cwd), 'raw', {
      fill: `${r},${g},${b}`,
      nodeId: args.blockId,
    })
    return {
      commandArgs,
      mode: 'raw',
      result: await runNodeScript(commandArgs),
    }
  }

  if (normalizedAction === 'set_pattern') {
    const pattern = String(params.pattern ?? 'rainbow').trim().toLowerCase()
    if (!['off', 'rainbow', 'particles', 'siri', 'boot', 'wifi_connecting', 'mqtt_online', 'status'].includes(pattern)) {
      throw new Error(
        `Unsupported helper pattern "${pattern}". Supported patterns: off, rainbow, particles, siri, boot, wifi_connecting, mqtt_online, status.`,
      )
    }

    const commandArgs = buildNodeCommandArgs(getScriptPath(args.cwd), 'ws2812', {
      brightness: normalizeOptionalBrightnessByte(params.brightness),
      effect: pattern,
      hue:
        typeof params.hue === 'number' && Number.isFinite(params.hue) ? params.hue : undefined,
      nodeId: args.blockId,
      speed:
        typeof params.speed_ms === 'number' && Number.isFinite(params.speed_ms)
          ? params.speed_ms
          : undefined,
    })
    return {
      commandArgs,
      mode: 'ws2812',
      result: await runNodeScript(commandArgs),
    }
  }

  throw new Error(`Unsupported helper light action "${args.action}".`)
}

function formatToolResult(summary: string, payload: unknown): string {
  return `${summary}\n\n${JSON.stringify(payload, null, 2)}`
}

export function createAiNodeTools(
  ctx: ToolContext,
): ToolDefinition<typeof nodeStatusSchema | typeof nodeEnvSchema | typeof nodeWs2812Schema | typeof nodeRawSchema>[] {
  const scriptPath = getScriptPath(ctx.cwd)

  return [
    {
      name: 'get_ai_node_status',
      label: 'Get AI Node Status',
      description:
        'Call the Python helper script to fetch full device status for nodes like heap_c13de8 or led_fd8480 from the current MQTT server.',
      promptSnippet: 'Get full status for a specific AI node.',
      promptGuidelines: [
        'Use this when you need one call that includes identity, WS2812 state, env data, and device metrics.',
        'Prefer this over inferring current state from stale cached block snapshots when the user asks about heap_c13de8 directly.',
      ],
      parameters: nodeStatusSchema,
      async execute(_id: string, params: NodeStatusParams) {
        try {
          const result = await runNodeScript(
            buildNodeCommandArgs(scriptPath, 'status', { nodeId: params.node_id }),
          )
          return {
            content: [
              {
                type: 'text',
                text: formatToolResult(`Status for ${params.node_id}:`, result),
              },
            ],
            details: undefined,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error fetching status for "${params.node_id}": ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            details: undefined,
            isError: true,
          }
        }
      },
    },
    {
      name: 'get_ai_node_env',
      label: 'Get AI Node Env',
      description:
        'Call the Python helper script to fetch the latest temperature and humidity from a node like heap_c13de8.',
      promptSnippet: 'Get temperature and humidity from a specific AI node.',
      promptGuidelines: [
        'Use this when the user asks for the latest environment reading from heap_c13de8.',
        'This bypasses the old server-side hardware cache and queries the current MQTT server directly.',
      ],
      parameters: nodeEnvSchema,
      async execute(_id: string, params: NodeEnvParams) {
        try {
          const result = await runNodeScript(
            buildNodeCommandArgs(scriptPath, 'env', { nodeId: params.node_id }),
          )
          return {
            content: [
              {
                type: 'text',
                text: formatToolResult(`Environment reading for ${params.node_id}:`, result),
              },
            ],
            details: undefined,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error fetching env data for "${params.node_id}": ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            details: undefined,
            isError: true,
          }
        }
      },
    },
    {
      name: 'set_ai_node_ws2812',
      label: 'Set AI Node WS2812',
      description:
        'Call the Python helper script to change the WS2812 effect for a node like heap_c13de8 or led_fd8480 on the current MQTT server.',
      promptSnippet: 'Set a WS2812 effect for a specific AI node.',
      promptGuidelines: [
        'Use only the effect names supported by the helper script: off, rainbow, particles, siri, boot, wifi_connecting, mqtt_online, status.',
        'For color-accurate direct fills, use set_ai_node_raw instead of this tool.',
      ],
      parameters: nodeWs2812Schema,
      async execute(_id: string, params: NodeWs2812Params) {
        try {
          const result = await runNodeScript(
            buildNodeCommandArgs(scriptPath, 'ws2812', {
              nodeId: params.node_id,
              brightness: params.brightness,
              effect: params.effect,
              hue: params.hue,
              speed: params.speed,
              stringPayload: params.string_payload === true,
            }),
          )
          return {
            content: [
              {
                type: 'text',
                text: formatToolResult(`WS2812 updated for ${params.node_id}:`, result),
              },
            ],
            details: undefined,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error updating WS2812 for "${params.node_id}": ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            details: undefined,
            isError: true,
          }
        }
      },
    },
    {
      name: 'set_ai_node_raw',
      label: 'Set AI Node Raw WS2812',
      description:
        'Call the Python helper script to send raw WS2812 pixel or fill commands to a node like heap_c13de8 or led_fd8480.',
      promptSnippet: 'Set raw WS2812 pixel data for a specific AI node.',
      promptGuidelines: [
        'Use fill for one whole-ring color such as "255,32,0".',
        'Use pixels when the user needs individual LEDs, for example "0:255,0,0;1:0,255,0".',
        'At least one of fill or pixels must be provided.',
      ],
      parameters: nodeRawSchema,
      async execute(_id: string, params: NodeRawParams) {
        if (!params.fill && !params.pixels) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: set_ai_node_raw requires at least one of "fill" or "pixels".',
              },
            ],
            details: undefined,
            isError: true,
          }
        }

        try {
          const result = await runNodeScript(
            buildNodeCommandArgs(scriptPath, 'raw', {
              nodeId: params.node_id,
              fill: params.fill,
              pixels: params.pixels,
            }),
          )
          return {
            content: [
              {
                type: 'text',
                text: formatToolResult(`Raw WS2812 updated for ${params.node_id}:`, result),
              },
            ],
            details: undefined,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error sending raw WS2812 command to "${params.node_id}": ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            details: undefined,
            isError: true,
          }
        }
      },
    },
  ]
}
