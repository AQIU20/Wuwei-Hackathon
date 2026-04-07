import { contextBridge, ipcRenderer } from 'electron'

type Callback<T = void> = T extends void ? () => void : (data: T) => void

function onChannel<T = void>(channel: string, callback: Callback<T>): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T): void =>
    (callback as (data: T) => void)(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  // --- Agent session (existing) ---
  prompt: (text: string): Promise<void> => ipcRenderer.invoke('agent:prompt', text),
  abort: (): Promise<void> => ipcRenderer.invoke('agent:abort'),
  newSession: (): Promise<void> => ipcRenderer.invoke('agent:new-session'),
  getConfig: (): Promise<{ hasApiKey: boolean }> => ipcRenderer.invoke('agent:get-config'),

  // Session persistence
  listSessions: (): Promise<
    Array<{
      path: string
      id: string
      name?: string
      modified: string
      messageCount: number
      firstMessage: string
    }>
  > => ipcRenderer.invoke('agent:list-sessions'),
  resumeSession: (
    sessionPath: string,
  ): Promise<
    Array<{
      role: 'user' | 'assistant'
      content?: string
      blocks?: unknown[]
    }>
  > => ipcRenderer.invoke('agent:resume-session', sessionPath),
  getCurrentSession: (): Promise<string | null> => ipcRenderer.invoke('agent:current-session'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  deleteSession: (sessionPath: string): Promise<void> =>
    ipcRenderer.invoke('agent:delete-session', sessionPath),

  // Agent push events
  onTextDelta: (cb: (delta: string) => void) => onChannel('agent:text-delta', cb),
  onThinkingDelta: (cb: (delta: string) => void) => onChannel('agent:thinking-delta', cb),
  onToolStart: (cb: (data: { id: string; name: string; args: Record<string, unknown> }) => void) =>
    onChannel('agent:tool-start', cb),
  onToolEnd: (cb: (data: { id: string; name: string; result: string; isError: boolean }) => void) =>
    onChannel('agent:tool-end', cb),
  onComplete: (cb: () => void) => onChannel('agent:complete', cb),
  onError: (cb: (data: { message: string }) => void) => onChannel('agent:error', cb),
  onSessionReset: (cb: () => void) => onChannel('agent:session-reset', cb),
  onSessionsChanged: (cb: () => void) => onChannel('agent:sessions-changed', cb),

  // --- Provider management ---
  getProviders: (): Promise<unknown[]> => ipcRenderer.invoke('provider:get-all'),
  saveProvider: (provider: unknown): Promise<void> => ipcRenderer.invoke('provider:save', provider),
  deleteProvider: (providerId: string): Promise<void> =>
    ipcRenderer.invoke('provider:delete', providerId),
  testConnection: (providerId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('provider:test-connection', providerId),
  getWebSearchConfig: (): Promise<{ hasTavilyApiKey: boolean }> =>
    ipcRenderer.invoke('websearch:get-config'),
  saveWebSearchConfig: (webSearch: { tavilyApiKey?: string }): Promise<void> =>
    ipcRenderer.invoke('websearch:save-config', webSearch),

  // --- Model management ---
  getModels: (): Promise<unknown[]> => ipcRenderer.invoke('provider:get-models'),
  getActiveModel: (): Promise<string | null> => ipcRenderer.invoke('model:get-active'),
  setActiveModel: (providerId: string, modelId: string): Promise<void> =>
    ipcRenderer.invoke('model:set-active', providerId, modelId),

  // --- Memory management ---
  listMemory: (): Promise<unknown[]> => ipcRenderer.invoke('memory:list'),
  updateMemory: (memory: { id: string; value: string; reason?: string | null }): Promise<void> =>
    ipcRenderer.invoke('memory:update', memory),
  deleteMemory: (id: string): Promise<void> => ipcRenderer.invoke('memory:delete', id),

  // Provider config change events
  onConfigChanged: (cb: () => void) => onChannel('provider:config-changed', cb),
})
