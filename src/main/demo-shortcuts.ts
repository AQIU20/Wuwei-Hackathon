import type { AihubMqttBridge } from './hardware/mqtt-bridge'
import type { HardwareStore } from './hardware/store'
import { isHelperBackedNodeId, runHelperLightAction } from './tools/ai-node'

interface DemoShortcut {
  id: string
  matchers: string[]
  reply: string
  lightAction: {
    action: 'set_pattern'
    blockId: string
    params: {
      brightness: number
      pattern: 'rainbow'
      speed_ms: number
    }
  }
}

export interface DemoShortcutMatch {
  id: string
  lightTriggered: boolean
  promptText: string
  reply: string
}

const DEMO_SHORTCUTS: DemoShortcut[] = [
  {
    id: 'demo-mood-bad-rainbow-ring',
    matchers: ['我今天心情很不好'],
    reply: '别难过，看点五彩斑斓的开心点～',
    lightAction: {
      action: 'set_pattern',
      blockId: 'heap_c13de8',
      params: {
        pattern: 'rainbow',
        brightness: 100,
        speed_ms: 80,
      },
    },
  },
]

function normalizeQuery(text: string): string {
  return text.trim().replace(/\s+/g, '')
}

function buildDemoPrompt(inputText: string, shortcut: DemoShortcut): string {
  return [
    `The user's original message was: "${inputText}"`,
    `A removable live demo shortcut matched with id "${shortcut.id}".`,
    `The ring light effect has already been triggered externally for this demo.`,
    'Reply in Simplified Chinese.',
    `Reply exactly with this sentence and nothing else: "${shortcut.reply}"`,
  ].join('\n')
}

async function triggerShortcutLight(args: {
  cwd: string
  hardware: HardwareStore
  mqttBridge: AihubMqttBridge | null
  shortcut: DemoShortcut
}): Promise<boolean> {
  const { blockId, action, params } = args.shortcut.lightAction
  args.hardware.controlActuator(blockId, action, params)

  if (isHelperBackedNodeId(blockId)) {
    if (args.mqttBridge) {
      try {
        const result = await args.mqttBridge.publishActuatorCommand(blockId, action, params)
        if (result) {
          return true
        }
      } catch (mqttError) {
        console.error(`[demo-shortcut] mqtt light action failed for ${blockId}:`, mqttError)
      }
    }

    try {
      await runHelperLightAction({
        action,
        blockId,
        cwd: args.cwd,
        params,
      })
      return true
    } catch (error) {
      console.error(`[demo-shortcut] helper light action failed for ${blockId}:`, error)
      return false
    }
  }

  if (args.mqttBridge) {
    const result = await args.mqttBridge.publishActuatorCommand(blockId, action, params)
    return Boolean(result)
  }

  return true
}

export async function applyDemoShortcut(args: {
  cwd: string
  hardware: HardwareStore
  mqttBridge: AihubMqttBridge | null
  text: string
}): Promise<DemoShortcutMatch | null> {
  const normalizedText = normalizeQuery(args.text)
  const shortcut = DEMO_SHORTCUTS.find((item) =>
    item.matchers.some((matcher) => normalizedText.includes(normalizeQuery(matcher))),
  )

  if (!shortcut) {
    return null
  }

  const lightTriggered = await triggerShortcutLight({
    cwd: args.cwd,
    hardware: args.hardware,
    mqttBridge: args.mqttBridge,
    shortcut,
  })

  return {
    id: shortcut.id,
    lightTriggered,
    promptText: buildDemoPrompt(args.text, shortcut),
    reply: shortcut.reply,
  }
}
