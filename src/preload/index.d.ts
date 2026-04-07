interface SessionSummary {
  path: string
  id: string
  name?: string
  modified: string
  messageCount: number
  firstMessage: string
}

interface PreferenceMemorySummary {
  id: string
  key: string
  value: string
  sourceType: 'explicit' | 'inferred'
  confidence: number
  reason: string | null
  evidenceCount: number
  updatedAt: string
}

interface AgentAPI {
  // Agent session
  prompt: (text: string) => Promise<void>
  abort: () => Promise<void>
  newSession: () => Promise<void>
  getConfig: () => Promise<{ hasApiKey: boolean }>

  // Session persistence
  listSessions: () => Promise<SessionSummary[]>
  resumeSession: (sessionPath: string) => Promise<
    Array<{
      role: 'user' | 'assistant'
      content?: string
      blocks?: unknown[]
    }>
  >
  getCurrentSession: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  deleteSession: (sessionPath: string) => Promise<void>

  // Agent push events
  onTextDelta: (cb: (delta: string) => void) => () => void
  onThinkingDelta: (cb: (delta: string) => void) => () => void
  onToolStart: (
    cb: (data: { id: string; name: string; args: Record<string, unknown> }) => void,
  ) => () => void
  onToolEnd: (
    cb: (data: { id: string; name: string; result: string; isError: boolean }) => void,
  ) => () => void
  onComplete: (cb: () => void) => () => void
  onError: (cb: (data: { message: string }) => void) => () => void
  onSessionReset: (cb: () => void) => () => void
  onSessionsChanged: (cb: () => void) => () => void

  // Provider management
  getProviders: () => Promise<unknown[]>
  saveProvider: (provider: unknown) => Promise<void>
  deleteProvider: (providerId: string) => Promise<void>
  testConnection: (providerId: string) => Promise<{ success: boolean; error?: string }>
  getWebSearchConfig: () => Promise<{ hasTavilyApiKey: boolean }>
  saveWebSearchConfig: (webSearch: { tavilyApiKey?: string }) => Promise<void>

  // Model management
  getModels: () => Promise<unknown[]>
  getActiveModel: () => Promise<string | null>
  setActiveModel: (providerId: string, modelId: string) => Promise<void>

  // Memory management
  listMemory: () => Promise<PreferenceMemorySummary[]>
  updateMemory: (memory: { id: string; value: string; reason?: string | null }) => Promise<void>
  deleteMemory: (id: string) => Promise<void>

  // Config change events
  onConfigChanged: (cb: () => void) => () => void
}

declare global {
  interface Window {
    api: AgentAPI
  }
}

export {}
