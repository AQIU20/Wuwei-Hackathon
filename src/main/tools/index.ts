import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { createHardwareHistoryTools } from './hardware-history'
import { createHardwareTools } from './hardware-mock'
import { createTavilyTools } from './tavily'
import type { ToolContext } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCustomTools(ctx: ToolContext): ToolDefinition<any, any, any>[] {
  return [
    ...createTavilyTools(ctx),
    ...createHardwareHistoryTools(ctx.history),
    ...createHardwareTools(ctx.hardware),
  ]
}
