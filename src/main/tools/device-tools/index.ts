/**
 * Device-specific tools — one tool per physical hardware block.
 * Device names and descriptions are defined here in code.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import type { AihubMqttBridge } from '../../hardware/mqtt-bridge'
import type { HardwareStore } from '../../hardware/store'
import { isHelperBackedNodeId, runHelperLightAction } from '../ai-node'

interface DeviceDefinition {
  blockId: string
  kind: 'light' | 'sensor'
  label: string        // 自然语言名称，Agent 用这个匹配用户意图
  description: string  // 描述这个设备是什么、在哪
}

// ── 在这里定义你的真实设备 ──────────────────────────────────────────────────
const DEVICE_DEFINITIONS: DeviceDefinition[] = [
  {
    blockId: 'led_fd8480',
    kind: 'light',
    label: '桌面上的灯',
    description: '放在桌面上的 WS2812 LED 灯条，可以控制颜色、亮度和动态效果',
  },
  {
    blockId: 'heap_c13de8',
    kind: 'light',
    label: '环形灯模块',
    description: '环形 WS2812 灯模块，可以控制开关、颜色、亮度和动态效果',
  },
  {
    blockId: 'hr_8fcba4',
    kind: 'sensor',
    label: '心率血氧传感器',
    description: '可穿戴心率和血氧传感器，返回 bpm、SpO2、血压与体温等读数',
  },
]
// ────────────────────────────────────────────────────────────────────────────

// ── Light actuator tool ───────────────────────────────────────────────────────

function createLightTool(
  blockId: string,
  label: string,
  description: string,
  cwd: string,
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any, any> {
  const schema = Type.Object({
    action: Type.Union(
      [
        Type.Literal('on'),
        Type.Literal('off'),
        Type.Literal('set_color'),
        Type.Literal('set_pattern'),
      ],
      {
        description:
          '"on" 开灯（白色全亮）, "off" 关灯, "set_color" 设置颜色, "set_pattern" 设置动态效果',
      },
    ),
    r: Type.Optional(Type.Number({ description: '红色通道 0-255，set_color 时使用', minimum: 0, maximum: 255 })),
    g: Type.Optional(Type.Number({ description: '绿色通道 0-255，set_color 时使用', minimum: 0, maximum: 255 })),
    b: Type.Optional(Type.Number({ description: '蓝色通道 0-255，set_color 时使用', minimum: 0, maximum: 255 })),
    brightness: Type.Optional(Type.Number({ description: '亮度 0-100', minimum: 0, maximum: 100 })),
    pattern: Type.Optional(
      Type.Union(
        [
          Type.Literal('breathing'),
          Type.Literal('strobe'),
          Type.Literal('rainbow'),
          Type.Literal('steady'),
          Type.Literal('siri'),
          Type.Literal('particles'),
        ],
        { description: 'set_pattern 时的效果名称' },
      ),
    ),
  })

  return {
    name: `device_${blockId.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64),
    label: label,
    description: description,
    promptSnippet: `Control the light "${label || blockId}" (block: ${blockId})`,
    promptGuidelines: [
      `This tool directly controls the light device "${label || blockId}" (hardware id: ${blockId})`,
      'Use action "on" to turn it on with default white light',
      'Use action "off" to turn it off',
      'Use action "set_color" with r, g, b (0-255) and optional brightness (0-100)',
      'Use action "set_pattern" with pattern name: breathing, strobe, rainbow, steady, siri, particles',
      'When the user says things like "开灯", "打开灯", "turn on the light", use action "on"',
      'When the user says "关灯", "turn off the light", use action "off"',
    ],
    parameters: schema,
    async execute(_id: string, params: { action: string; r?: number; g?: number; b?: number; brightness?: number; pattern?: string }) {
      const action = params.action
      const actionParams: Record<string, unknown> = {}

      if (action === 'set_color') {
        actionParams.r = params.r ?? 255
        actionParams.g = params.g ?? 255
        actionParams.b = params.b ?? 255
        actionParams.brightness = params.brightness ?? 100
      } else if (action === 'set_pattern') {
        actionParams.pattern = params.pattern ?? 'rainbow'
        if (params.brightness !== undefined) actionParams.brightness = params.brightness
      } else if (action === 'on') {
        actionParams.r = 255
        actionParams.g = 255
        actionParams.b = 255
        actionParams.brightness = params.brightness ?? 100
      }

      if (isHelperBackedNodeId(blockId)) {
        try {
          const helper = await runHelperLightAction({
            action,
            blockId,
            cwd,
            params: actionParams,
          })

          return {
            content: [
              {
                type: 'text',
                text: [
                  `${label || blockId}: helper command sent`,
                  `Helper mode: ${helper.mode}`,
                  `Command args: ${JSON.stringify(helper.commandArgs.slice(1))}`,
                  '',
                  JSON.stringify(helper.result, null, 2),
                ].join('\n'),
              },
            ],
            details: undefined,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error controlling "${label || blockId}" via helper: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            details: undefined,
            isError: true,
          }
        }
      }

      const block = hardware.getBlock(blockId)

      if (!block) {
        return {
          content: [{ type: 'text', text: `Error: device "${blockId}" not found.` }],
          details: undefined,
          isError: true,
        }
      }

      if (block.status === 'offline') {
        return {
          content: [{ type: 'text', text: `Error: "${label || blockId}" is offline.` }],
          details: undefined,
          isError: true,
        }
      }

      // Update in-memory state
      const storeAction = action === 'on' ? 'set_color' : action
      hardware.controlActuator(blockId, storeAction, actionParams)

      // Send MQTT command
      let mqttSummary = 'MQTT: disabled'
      if (mqttBridge?.isEnabled() && mqttBridge.isConnected()) {
        const result = await mqttBridge.publishActuatorCommand(blockId, action, actionParams)
        if (result) {
          const topics = [result.topic, ...(result.compatibilityTopics ?? [])].join(', ')
          mqttSummary = `MQTT sent → ${topics}`
        } else {
          mqttSummary = 'MQTT: no mapping for this action'
        }
      } else if (mqttBridge && !mqttBridge.isConnected()) {
        mqttSummary = 'MQTT: bridge not connected'
      }

      const actionLabel: Record<string, string> = {
        on: '已开灯',
        off: '已关灯',
        set_color: `已设置颜色 rgb(${actionParams.r}, ${actionParams.g}, ${actionParams.b})`,
        set_pattern: `已设置效果 ${actionParams.pattern}`,
      }

      return {
        content: [
          {
            type: 'text',
            text: [
              `${label || blockId}: ${actionLabel[action] ?? action}`,
              mqttSummary,
            ].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

// ── Sensor read tool (available for future sensor devices) ────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createSensorTool(
  blockId: string,
  label: string,
  description: string,
  hardware: HardwareStore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any, any> {
  const schema = Type.Object({})

  return {
    name: `device_${blockId.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64),
    label: label,
    description: description || `读取 ${label || blockId} 传感器的最新数据`,
    promptSnippet: `Read sensor data from "${label || blockId}" (block: ${blockId})`,
    promptGuidelines: [
      `This tool reads real-time data from the sensor "${label || blockId}" (hardware id: ${blockId})`,
      'Call this when the user asks about readings from this specific device',
    ],
    parameters: schema,
    async execute(_id: string, _params: Record<string, never>) {
      const result = hardware.getSensorData(blockId)

      if (!result) {
        return {
          content: [{ type: 'text', text: `Error: sensor "${blockId}" not found or not a sensor.` }],
          details: undefined,
          isError: true,
        }
      }

      if (result.block.status === 'offline') {
        return {
          content: [{ type: 'text', text: `"${label || blockId}" is offline.` }],
          details: undefined,
          isError: true,
        }
      }

      const lines = Object.entries(result.data).map(
        ([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`,
      )

      return {
        content: [
          {
            type: 'text',
            text: [`${label || blockId} (${result.block.capability}):`, ...lines].join('\n'),
          },
        ],
        details: undefined,
      }
    },
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

export function createDeviceTools(
  cwd: string,
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any, any>[] {
  return DEVICE_DEFINITIONS.map((def) =>
    def.kind === 'light'
      ? createLightTool(def.blockId, def.label, def.description, cwd, hardware, mqttBridge)
      : createSensorTool(def.blockId, def.label, def.description, hardware),
  )
}
