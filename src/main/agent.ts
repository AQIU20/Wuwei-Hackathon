import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { basename } from 'node:path'
import type {
  Api,
  AssistantMessage,
  Model,
  ToolResultMessage,
  UserMessage,
} from '@mariozechner/pi-ai'
import type { SessionInfo } from '@mariozechner/pi-coding-agent'
import {
  AuthStorage,
  buildSessionContext,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from '@mariozechner/pi-coding-agent'
import type { HardwareStore } from './hardware/store'
import type { PreferenceMemoryService } from './memory/preference-memory-service'
import type { ConfigService } from './providers/config-service'
import type { ProviderRegistry } from './providers/registry'
import { parseModelKey } from './providers/types'
import { createCustomTools } from './tools'
import type { SupabaseHistoryService } from './history/supabase-history-service'

const SYSTEM_PROMPT = `You are a helpful AI assistant running on a cloud server for the Unforce Make platform.
You have direct access to the server filesystem and can run shell commands when solving coding tasks.
Be concise and direct. When working with files or commands, briefly explain what you're doing.

You also have access to connected hardware blocks (ESP32 sensor/actuator modules) through a live hardware gateway.
Use list_blocks to discover available hardware, get_sensor_data to read sensor values,
get_camera_snapshot to see what a camera sees, and control_actuator to control lights or vibration.
When the user asks about their environment, health data, or wants to control devices, use these tools proactively.`
  + ` If historical hardware data is available in Supabase, use get_hardware_history when the user asks about trends, past readings, or changes over time.`

export interface UIMessage {
  role: 'assistant' | 'user'
  content?: string
  blocks?: UIBlock[]
}

export type UIBlock =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | {
      type: 'tool'
      id: string
      name: string
      args: Record<string, unknown>
      result?: string
      isError?: boolean
      status: 'running' | 'done'
    }

export interface SessionSummary {
  id: string
  messageCount?: number
  modified?: string
  name: string
  path: string
}

export type AgentRuntimeEvent =
  | { type: 'assistant_start'; messageId: string; session: SessionSummary }
  | { type: 'complete'; messageId: string; session: SessionSummary }
  | { type: 'error'; message: string; messageId?: string; session?: SessionSummary }
  | { type: 'text_delta'; delta: string; messageId: string }
  | { type: 'thinking_delta'; delta: string; messageId: string }
  | {
      type: 'tool_end'
      id: string
      isError?: boolean
      messageId: string
      name: string
      result: string
    }
  | {
      type: 'tool_start'
      args: Record<string, unknown>
      id: string
      messageId: string
      name: string
    }

export interface AgentRuntimeOptions {
  configService: ConfigService
  cwd: string
  hardware: HardwareStore
  history?: SupabaseHistoryService | null
  memoryService: PreferenceMemoryService
  registry: ProviderRegistry
  sessionDir: string
}

type SessionHandle = Awaited<ReturnType<typeof createAgentSession>>['session']
type Listener = (event: AgentRuntimeEvent) => void

function formatSessionSummary(sessionInfo: SessionInfo): SessionSummary {
  return {
    id: basename(sessionInfo.path),
    messageCount: sessionInfo.messageCount,
    modified: sessionInfo.modified.toISOString(),
    name: sessionInfo.name ?? basename(sessionInfo.path),
    path: sessionInfo.path,
  }
}

function summarizeCurrentSession(path: string): SessionSummary {
  return {
    id: basename(path),
    name: basename(path),
    path,
  }
}

export class AgentRuntime {
  private activeTurn: { assistantText: string; userText: string } | null = null
  private authStorage = AuthStorage.inMemory()
  private currentInjectedMemoryIds: string[] = []
  private currentMemoryContext = ''
  private currentMessageId: string | null = null
  private currentModelKey: string | null = null
  private listeners = new Set<Listener>()
  private modelRegistry: ModelRegistry = ModelRegistry.create(this.authStorage)
  private session: SessionHandle | null = null
  private syncedProviderNames = new Set<string>()
  private unsubscribe: (() => void) | null = null

  constructor(private options: AgentRuntimeOptions) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async ensureSession(): Promise<SessionSummary> {
    if (!this.session) {
      const sessionManager = SessionManager.create(this.options.cwd, this.options.sessionDir)
      await this.startSession(sessionManager)
    }

    return this.getSessionSummary()
  }

  async prompt(input: { locale?: 'en' | 'zh'; messageId: string; text: string }): Promise<void> {
    const session = await this.ensureSession()

    try {
      const memoryContext = this.options.memoryService.getPromptContext()
      this.currentMemoryContext = memoryContext.text
      this.currentInjectedMemoryIds = memoryContext.ids
      this.activeTurn = { userText: input.text, assistantText: '' }
      this.currentMessageId = input.messageId

      this.emit({ type: 'assistant_start', messageId: input.messageId, session })
      await this.session?.prompt(this.applyLocaleInstruction(input.text, input.locale))
      this.options.memoryService.markApplied(this.currentInjectedMemoryIds)

      if (this.activeTurn && this.modelRegistry) {
        const turn = this.activeTurn
        const model = this.resolveModel()
        void this.options.memoryService
          .curateTurn({
            assistantText: turn.assistantText,
            model,
            modelRegistry: this.modelRegistry,
            userText: turn.userText,
          })
          .catch((error) => {
            console.error('[memory] curation failed:', error)
          })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[agent] error:', err)
      this.emit({ type: 'error', message, messageId: input.messageId, session })
    } finally {
      this.currentMemoryContext = ''
      this.currentInjectedMemoryIds = []
      this.activeTurn = null
      this.currentMessageId = null
      this.emit({ type: 'complete', messageId: input.messageId, session })
    }
  }

  async abort(): Promise<void> {
    await this.session?.abort()
  }

  async newSession(): Promise<SessionSummary> {
    this.cleanup()
    return this.ensureSession()
  }

  async listSessions(): Promise<SessionSummary[]> {
    try {
      const sessions = await SessionManager.list(this.options.cwd, this.options.sessionDir)
      return sessions
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())
        .map(formatSessionSummary)
    } catch {
      return []
    }
  }

  async resumeSession(sessionId: string): Promise<UIMessage[]> {
    this.cleanup()
    const sessionPath = await this.resolveSessionPath(sessionId)
    const sessionManager = SessionManager.open(sessionPath, this.options.sessionDir)
    await this.startSession(sessionManager)
    return this.buildUIMessages(sessionManager)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = await this.resolveSessionPath(sessionId)

    if (this.session?.sessionFile === sessionPath) {
      this.cleanup()
    }

    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath)
    }
  }

  getCurrentSessionFile(): string | undefined {
    return this.session?.sessionFile
  }

  getSessionSummary(): SessionSummary {
    const path = this.session?.sessionFile
    if (!path) {
      throw new Error('Agent session has not been initialized')
    }

    return summarizeCurrentSession(path)
  }

  getTranscript(): UIMessage[] {
    const path = this.getCurrentSessionFile()
    if (!path) return []

    const sessionManager = SessionManager.open(path, this.options.sessionDir)
    return this.buildUIMessages(sessionManager)
  }

  async switchModel(providerId: string, modelId: string): Promise<void> {
    const result = this.options.registry.createModelForId(providerId, modelId)
    if ('error' in result) throw new Error(result.error)

    const newModelKey = `${providerId}/${modelId}`

    if (this.session) {
      try {
        await this.session.setModel(result)
        this.currentModelKey = newModelKey
      } catch (err) {
        console.error('[agent] setModel failed, recreating session:', err)
        this.cleanup()
        this.currentModelKey = newModelKey
      }
    } else {
      this.currentModelKey = newModelKey
    }
  }

  getCurrentModelKey(): string | null {
    return this.currentModelKey
  }

  async refreshProviderConfig(providerId?: string): Promise<void> {
    this.syncRuntimeApiKeys()

    if (!this.currentModelKey) {
      this.currentModelKey = this.options.configService.getActiveModelId()
      return
    }

    const parsed = parseModelKey(this.currentModelKey)
    if (!parsed) {
      this.currentModelKey = this.options.configService.getActiveModelId()
      return
    }

    if (providerId && parsed.providerId !== providerId) {
      return
    }

    const result = this.options.registry.createModelForId(parsed.providerId, parsed.modelId)
    if ('error' in result) {
      this.cleanup()
      this.currentModelKey = this.options.configService.getActiveModelId()
      return
    }

    if (!this.session) {
      return
    }

    try {
      await this.session.setModel(result)
    } catch (err) {
      console.error('[agent] failed to refresh model after provider update:', err)
      this.cleanup()
    }
  }

  destroy(): void {
    this.cleanup()
  }

  private applyLocaleInstruction(text: string, locale?: 'en' | 'zh'): string {
    if (locale !== 'zh') return text
    return `Reply in Simplified Chinese unless the user explicitly requests another language.\n\n${text}`
  }

  private async resolveSessionPath(sessionId: string): Promise<string> {
    const sessions = await SessionManager.list(this.options.cwd, this.options.sessionDir)
    const session = sessions.find(
      (entry) =>
        entry.id === sessionId || entry.path === sessionId || basename(entry.path) === sessionId,
    )

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return session.path
  }

  private async startSession(sessionManager: SessionManager): Promise<void> {
    const model = this.resolveModel()

    mkdirSync(this.options.sessionDir, { recursive: true })

    const tools = createCodingTools(this.options.cwd)
    const customTools = createCustomTools({
      cwd: this.options.cwd,
      getWebSearchConfig: () => this.options.configService.getWebSearchConfig(),
      hardware: this.options.hardware,
      history: this.options.history ?? null,
    })

    const resourceLoader = new DefaultResourceLoader({
      cwd: this.options.cwd,
      appendSystemPromptOverride: (base) =>
        this.currentMemoryContext ? [...base, this.currentMemoryContext] : base,
      systemPromptOverride: () => SYSTEM_PROMPT,
      noExtensions: true,
      noPromptTemplates: true,
      noSkills: false,
      noThemes: true,
    })
    await resourceLoader.reload()

    this.syncRuntimeApiKeys()

    const { session } = await createAgentSession({
      authStorage: this.authStorage,
      customTools,
      cwd: this.options.cwd,
      model,
      modelRegistry: this.modelRegistry,
      resourceLoader,
      sessionManager,
      tools,
    })

    this.session = session
    this.unsubscribe = session.subscribe((event: unknown) => this.handleEvent(event))
  }

  private resolveModel(): Model<Api> {
    if (this.currentModelKey) {
      const parsed = parseModelKey(this.currentModelKey)
      if (!parsed) throw new Error(`Invalid model key: ${this.currentModelKey}`)
      const result = this.options.registry.createModelForId(parsed.providerId, parsed.modelId)
      if ('error' in result) throw new Error(`Cannot create model: ${result.error}`)
      return result
    }

    const result = this.options.registry.createActiveModel()
    if ('error' in result) throw new Error(`No model available: ${result.error}`)
    this.currentModelKey = this.options.configService.getActiveModelId()
    return result
  }

  private cleanup(): void {
    this.unsubscribe?.()
    this.session?.dispose()
    this.session = null
    this.unsubscribe = null
    this.currentMemoryContext = ''
    this.currentInjectedMemoryIds = []
    this.activeTurn = null
    this.currentMessageId = null
  }

  private syncRuntimeApiKeys(): void {
    const nextRuntimeKeys = new Map<string, string>()

    for (const provider of this.options.configService.getProviders()) {
      if (provider.apiKey) {
        nextRuntimeKeys.set(String(provider.provider), provider.apiKey)
      }
    }

    for (const providerName of this.syncedProviderNames) {
      if (!nextRuntimeKeys.has(providerName)) {
        this.authStorage.removeRuntimeApiKey(providerName)
      }
    }

    for (const [providerName, apiKey] of nextRuntimeKeys) {
      this.authStorage.setRuntimeApiKey(providerName, apiKey)
    }

    this.syncedProviderNames = new Set(nextRuntimeKeys.keys())
  }

  private buildUIMessages(sessionManager: SessionManager): UIMessage[] {
    const entries = sessionManager.getEntries()
    const { messages: agentMessages } = buildSessionContext(entries)

    const uiMessages: UIMessage[] = []
    const toolResultMap = new Map<string, ToolResultMessage>()

    for (const msg of agentMessages) {
      if ('role' in msg && msg.role === 'toolResult') {
        toolResultMap.set(msg.toolCallId, msg as ToolResultMessage)
      }
    }

    for (const msg of agentMessages) {
      if (!('role' in msg)) continue

      if (msg.role === 'user') {
        const userMsg = msg as UserMessage
        const text =
          typeof userMsg.content === 'string'
            ? userMsg.content
            : userMsg.content
                .filter((content) => content.type === 'text')
                .map((content) => (content as { text: string }).text)
                .join('')

        uiMessages.push({ role: 'user', content: text })
      }

      if (msg.role === 'assistant') {
        const assistantMsg = msg as AssistantMessage
        const blocks: UIBlock[] = []

        for (const part of assistantMsg.content) {
          if (part.type === 'text') {
            blocks.push({ type: 'text', content: part.text })
            continue
          }

          if (part.type === 'thinking') {
            blocks.push({ type: 'thinking', content: part.thinking })
            continue
          }

          if (part.type === 'toolCall') {
            const toolResult = toolResultMap.get(part.id)
            blocks.push({
              type: 'tool',
              id: part.id,
              name: part.name,
              args: part.arguments,
              result: toolResult
                ? toolResult.content
                    .filter((content) => content.type === 'text')
                    .map((content) => (content as { text: string }).text)
                    .join('')
                : undefined,
              isError: toolResult?.isError,
              status: 'done',
            })
          }
        }

        if (blocks.length > 0) {
          uiMessages.push({ role: 'assistant', blocks })
        }
      }
    }

    return uiMessages
  }

  private handleEvent(event: unknown): void {
    const messageId = this.currentMessageId
    if (!messageId || typeof event !== 'object' || event === null) return

    const payload = event as Record<string, unknown>

    switch (payload.type) {
      case 'message_update': {
        const assistantMessageEvent = payload.assistantMessageEvent as
          | { type?: string; delta?: string; error?: { errorMessage?: string } }
          | undefined

        switch (assistantMessageEvent?.type) {
          case 'text_delta':
            if (typeof assistantMessageEvent.delta === 'string') {
              if (this.activeTurn) {
                this.activeTurn.assistantText += assistantMessageEvent.delta
              }
              this.emit({
                type: 'text_delta',
                delta: assistantMessageEvent.delta,
                messageId,
              })
            }
            break
          case 'thinking_delta':
            if (typeof assistantMessageEvent.delta === 'string') {
              this.emit({
                type: 'thinking_delta',
                delta: assistantMessageEvent.delta,
                messageId,
              })
            }
            break
          case 'error':
            this.emit({
              type: 'error',
              message: assistantMessageEvent.error?.errorMessage || 'Unknown assistant error',
              messageId,
              session: this.getSessionSummary(),
            })
            break
        }

        break
      }
      case 'tool_execution_start':
        this.emit({
          type: 'tool_start',
          args: (payload.args as Record<string, unknown>) ?? {},
          id: String(payload.toolCallId),
          messageId,
          name: String(payload.toolName),
        })
        break
      case 'tool_execution_end':
        this.emit({
          type: 'tool_end',
          id: String(payload.toolCallId),
          isError: Boolean(payload.isError),
          messageId,
          name: String(payload.toolName),
          result:
            typeof payload.result === 'string'
              ? payload.result
              : JSON.stringify(payload.result ?? null, null, 2),
        })
        break
    }
  }

  private emit(event: AgentRuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
