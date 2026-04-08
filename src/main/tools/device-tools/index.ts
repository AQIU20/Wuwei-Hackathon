/**
 * Device-specific tools — one tool per registered hardware block.
 *
 * Each online block gets its own tool whose name and description come from:
 *   1. HARDWARE_NODE_LABELS  e.g. {"led_fd8480":"桌面上的灯"}
 *   2. HARDWARE_NODE_DESCRIPTIONS  e.g. {"led_fd8480":"放在桌面右侧的 WS2812 灯条"}
 *
 * This lets the agent match natural language like "开启桌面上的灯" directly to
 * the correct block without a generic list_blocks + control_actuator round-trip.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import type { AihubMqttBridge } from '../../hardware/mqtt-bridge'
import type { HardwareStore } from '../../hardware/store'

function sanitizeName(blockId: string): string {
  // Tool names must be [a-zA-Z0-9_-] and ≤ 64 chars
  return `device_${blockId.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64)
}

function buildActuatorLabel(label: string, capability: string): string {
  return label !== '' ? label : capability
}

// ── Light actuator tool ───────────────────────────────────────────────────────

function createLightTool(
  blockId: string,
  label: string,
  description: string,
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
    name: sanitizeName(blockId),
    label: buildActuatorLabel(label, 'light'),
    description: description || `控制 ${label || blockId} 灯光（开/关/颜色/动态效果）`,
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

      // Map to hardware store action
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

// ── Sensor read tool ──────────────────────────────────────────────────────────

function createSensorTool(
  blockId: string,
  label: string,
  description: string,
  hardware: HardwareStore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any, any> {
  const schema = Type.Object({})

  return {
    name: sanitizeName(blockId),
    label: buildActuatorLabel(label, 'sensor'),
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
  hardware: HardwareStore,
  mqttBridge: AihubMqttBridge | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any, any>[] {
  const blocks = hardware.listBlocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: ToolDefinition<any, any, any>[] = []

  for (const block of blocks) {
    const label = hardware.getNodeLabel(block.block_id)
    const desc = hardware.getNodeDescription(block.block_id) ?? ''

    if (block.type === 'actuator' && block.capability === 'light') {
      tools.push(createLightTool(block.block_id, label, desc, hardware, mqttBridge))
    } else if (block.type === 'sensor') {
      tools.push(createSensorTool(block.block_id, label, desc, hardware))
    }
  }

  return tools
}
