import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { createAiNodeTools } from './ai-node'
import { createHardwareEventTools } from './hardware-events'
import { createHardwareHistoryTools } from './hardware-history'
import { createHardwareTools } from './hardware'
import { createCameraVisionTools } from './camera-vision'
import { createDeviceTools } from './device-tools'
import { createTavilyTools } from './tavily'
import type { ToolContext } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCustomTools(ctx: ToolContext): ToolDefinition<any, any, any>[] {
  return [
    ...createTavilyTools(ctx),
    ...createHardwareHistoryTools(ctx.history),
    ...createHardwareEventTools(ctx.hardwareEvents),
    ...createAiNodeTools(ctx),
    ...createCameraVisionTools(ctx),
    ...createHardwareTools(ctx.hardware, ctx.mqttBridge ?? null),
    ...createDeviceTools(ctx.hardware, ctx.mqttBridge ?? null),
  ]
}
