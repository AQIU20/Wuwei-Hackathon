import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { cors } from 'hono/cors'
import { AgentRuntime } from './agent'
import { isMockHardwareMode, resolveHardwareMode } from './hardware/mode'
import { HardwareStore, type HardwareIngressMessage } from './hardware/store'
import { SupabaseHistoryService } from './history/supabase-history-service'
import { PreferenceMemoryService } from './memory/preference-memory-service'
import { ConfigService } from './providers/config-service'
import { ProviderRegistry } from './providers/registry'
import { resolveRuntimePaths } from './runtime-paths'

const paths = resolveRuntimePaths()
const configService = new ConfigService(paths.configDir)
configService.init()

const registry = new ProviderRegistry(configService)
const memoryService = new PreferenceMemoryService(join(paths.memoryDir, 'preferences.sqlite'))
const hardwareMode = resolveHardwareMode()
const mockHardwareMode = isMockHardwareMode(hardwareMode)
const hardware = new HardwareStore()
const history = mockHardwareMode ? new SupabaseHistoryService() : null
const stopSimulation = mockHardwareMode ? hardware.startSimulation() : null
const sessions = new Map<string, AgentRuntime>()
type WebSocketConnection = { send: (data: string) => void }
const BunRuntime = globalThis as unknown as {
  Bun: {
    serve: (options: {
      fetch: (request: Request) => Response | Promise<Response>
      port: number
      websocket: unknown
    }) => { stop: (closeActiveConnections?: boolean) => void }
  }
}

const app = new Hono()
const { upgradeWebSocket, websocket } = createBunWebSocket()

function createRuntime(): AgentRuntime {
  return new AgentRuntime({
    configService,
    cwd: paths.cwd,
    hardware,
    history,
    memoryService,
    registry,
    sessionDir: paths.sessionDir,
  })
}

hardware.subscribe((event) => {
  if (
    mockHardwareMode &&
    history &&
    (event.type === 'snapshot' || event.type === 'update') &&
    history.isEnabled()
  ) {
    void history.persistSnapshot(event.payload, event.type).catch((error) => {
      console.error('[history] persist snapshot failed:', error)
    })
  }
})

async function createSessionRuntime(): Promise<AgentRuntime> {
  const runtime = createRuntime()
  const session = await runtime.ensureSession()
  sessions.set(session.id, runtime)
  return runtime
}

async function resolveRuntime(sessionId: string): Promise<AgentRuntime> {
  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  const runtime = createRuntime()
  await runtime.resumeSession(sessionId)
  sessions.set(runtime.getSessionSummary().id, runtime)
  return runtime
}

app.use(
  '*',
  cors({
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Type'],
    origin: process.env.CORS_ORIGIN || '*',
  }),
)

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'unforce-make-agent-server',
    time: new Date().toISOString(),
  }),
)

app.get('/ready', (c) => {
  const activeModel = configService.getActiveModelId()
  const configuredProviders = registry.getConfiguredProviders()
  const isReady = Boolean(activeModel) && configuredProviders.length > 0

  return c.json(
    {
      activeModel,
      configuredProviders: configuredProviders.map((provider) => provider.id),
      hardwareMode,
      history: history?.getStatus() ?? { enabled: false, mode: hardwareMode, tableName: null },
      ok: isReady,
      workspace: paths.cwd,
    },
    isReady ? 200 : 503,
  )
})

app.get('/v1/blocks', (c) => c.json(hardware.getSnapshot()))

app.get('/v1/blocks/:blockId', (c) => {
  const block = hardware.getBlock(c.req.param('blockId'))
  if (!block) {
    return c.json({ error: 'Block not found' }, 404)
  }

  return c.json(block)
})

app.get('/v1/blocks/:blockId/history', async (c) => {
  if (!history?.isEnabled()) {
    return c.json({ error: 'Supabase history is not configured' }, 503)
  }

  const blockId = c.req.param('blockId')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const minutes = Math.min(
    Math.max(Number(c.req.query('minutes') || c.req.query('range_minutes') || 60), 1),
    24 * 60,
  )

  try {
    const result = await history.queryHistory({
      blockId,
      limit,
      minutes,
    })

    return c.json(result)
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to query block history',
      },
      500,
    )
  }
})

app.get('/v1/history', async (c) => {
  if (!history?.isEnabled()) {
    return c.json({ error: 'Supabase history is not configured' }, 503)
  }

  const capability = c.req.query('capability')
  const blockId = c.req.query('block_id')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const minutes = Math.min(
    Math.max(Number(c.req.query('minutes') || c.req.query('range_minutes') || 60), 1),
    24 * 60,
  )

  try {
    const result = await history.queryHistory({
      blockId,
      capability,
      limit,
      minutes,
    })

    return c.json(result)
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to query hardware history',
      },
      500,
    )
  }
})

app.get(
  '/v1/hardware/ws',
  upgradeWebSocket(() => {
    let unsubscribe: (() => void) | null = null

    return {
      onOpen(_event: Event, ws: WebSocketConnection) {
        unsubscribe = hardware.subscribe((payload) => {
          ws.send(JSON.stringify(payload))
        })
      },
      onClose() {
        unsubscribe?.()
      },
      onMessage(event: MessageEvent, ws: WebSocketConnection) {
        try {
          const payload = JSON.parse(String(event.data)) as HardwareIngressMessage | { type: 'ping' }
          if (payload.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }))
            return
          }

          const result = hardware.applyMessage(payload)
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }))
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : 'Invalid hardware payload',
            }),
          )
        }
      },
    }
  }),
)

app.get('/v1/chat/sessions', async (c) => {
  const runtime = createRuntime()
  const items = await runtime.listSessions()
  runtime.destroy()
  return c.json({ items })
})

app.post('/v1/chat/sessions', async (c) => {
  const runtime = await createSessionRuntime()
  return c.json({
    session: runtime.getSessionSummary(),
    transcript: runtime.getTranscript(),
  })
})

app.get('/v1/chat/sessions/:sessionId', async (c) => {
  try {
    const runtime = await resolveRuntime(c.req.param('sessionId'))
    return c.json({
      session: runtime.getSessionSummary(),
      transcript: runtime.getTranscript(),
    })
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Session not found',
      },
      404,
    )
  }
})

app.post('/v1/chat/sessions/:sessionId/abort', async (c) => {
  try {
    const runtime = await resolveRuntime(c.req.param('sessionId'))
    await runtime.abort()
    return c.json({ ok: true })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to abort session' },
      404,
    )
  }
})

app.delete('/v1/chat/sessions/:sessionId', async (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    const runtime = await resolveRuntime(sessionId)
    await runtime.deleteSession(sessionId)
    runtime.destroy()
    sessions.delete(sessionId)
    return c.json({ ok: true })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to delete session' },
      404,
    )
  }
})

app.post('/v1/chat/sessions/:sessionId/messages', async (c) => {
  const sessionId = c.req.param('sessionId')
  const body = (await c.req.json()) as { locale?: 'en' | 'zh'; text?: string }
  const text = body.text?.trim()

  if (!text) {
    return c.json({ error: 'text is required' }, 400)
  }

  try {
    const runtime = await resolveRuntime(sessionId)
    const messageId = randomUUID()
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (payload: unknown): void => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
        }

        const unsubscribe = runtime.onEvent((event) => {
          write(event)

          if (
            (event.type === 'complete' || event.type === 'error') &&
            event.messageId === messageId
          ) {
            unsubscribe()
            controller.close()
          }
        })

        write({ type: 'session', session: runtime.getSessionSummary() })
        write({ type: 'user_message', message: { id: randomUUID(), role: 'user', content: text } })

        void runtime.prompt({
          locale: body.locale,
          messageId,
          text,
        })
      },
      cancel() {
        void runtime.abort()
      },
    })

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'application/x-ndjson; charset=utf-8',
      },
    })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to prompt session' },
      404,
    )
  }
})

const port = Number(process.env.PORT || 8787)
const server = BunRuntime.Bun.serve({
  fetch: app.fetch,
  port,
  websocket,
})

console.log(`[server] Unforce Make agent server listening on http://localhost:${port}`)
console.log(`[server] Workspace cwd: ${paths.cwd}`)
console.log(`[server] Data dir: ${paths.dataDir}`)
console.log(`[server] Hardware mode: ${hardwareMode}`)
console.log(`[server] Supabase history: ${history?.isEnabled() ? 'enabled (mock)' : 'disabled'}`)

function shutdown(): void {
  stopSimulation?.()
  for (const runtime of sessions.values()) {
    runtime.destroy()
  }
  memoryService.destroy()
  server.stop(true)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
