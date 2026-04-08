import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { cors } from 'hono/cors'
import { AgentRuntime } from './agent'
import { isMockHardwareMode, isMqttHardwareMode, resolveHardwareMode } from './hardware/mode'
import { AihubMqttBridge } from './hardware/mqtt-bridge'
import { type HardwareIngressMessage, HardwareStore } from './hardware/store'
import { HardwareEventService } from './history/hardware-event-service'
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
const mqttHardwareMode = isMqttHardwareMode(hardwareMode)
const hardware = new HardwareStore()
const history = new SupabaseHistoryService()
const galleryDb = new Database(join(paths.memoryDir, 'gallery.sqlite'))
galleryDb.run('CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY, email TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
galleryDb.run('CREATE TABLE IF NOT EXISTS gallery (id INTEGER PRIMARY KEY, username TEXT, sensors TEXT, easter_eggs TEXT, image TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
const hardwareEvents = new HardwareEventService()
const mqttBridge = new AihubMqttBridge({
  eventService: hardwareEvents,
  hardware,
})
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
    mqttBridge: mqttHardwareMode ? mqttBridge : null,
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
      hardwareEvents: hardwareEvents.getStatus(),
      mqttBridge: mqttBridge.getStatus(),
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

app.get('/v1/hardware-events', async (c) => {
  if (!hardwareEvents.isEnabled()) {
    return c.json({ error: 'Supabase hardware events are not configured' }, 503)
  }

  const capability = c.req.query('capability')
  const nodeId = c.req.query('node_id')
  const scope = c.req.query('scope')
  const type = c.req.query('type')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const minutes = Math.min(
    Math.max(Number(c.req.query('minutes') || c.req.query('range_minutes') || 60), 1),
    24 * 60,
  )

  try {
    const result = await hardwareEvents.queryEvents({
      capability,
      limit,
      minutes,
      nodeId,
      scope,
      type,
    })

    return c.json(result)
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to query hardware events',
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
          const payload = JSON.parse(String(event.data)) as
            | HardwareIngressMessage
            | { type: 'ping' }
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

// --- Waitlist & Gallery routes ---

app.post('/v1/waitlist', async (c) => {
  const body = (await c.req.json()) as { email?: string }
  const email = body.email?.trim()
  if (!email) {
    return c.json({ error: 'email is required' }, 400)
  }
  try {
    galleryDb.run('INSERT INTO waitlist (email) VALUES (?)', [email])
    return c.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Email already registered' }, 409)
    }
    return c.json({ error: msg || 'Internal error' }, 500)
  }
})

app.post('/v1/gallery', async (c) => {
  const body = (await c.req.json()) as {
    username?: string
    sensors?: string[]
    easterEggs?: string[]
    imageBase64?: string
  }
  const { username, sensors, easterEggs, imageBase64 } = body
  if (!username) {
    return c.json({ error: 'username is required' }, 400)
  }
  const result = galleryDb.run(
    'INSERT INTO gallery (username, sensors, easter_eggs, image) VALUES (?, ?, ?, ?)',
    [username, JSON.stringify(sensors ?? []), JSON.stringify(easterEggs ?? []), imageBase64 ?? ''],
  )
  return c.json({ ok: true, id: Number(result.lastInsertRowid) })
})

app.get('/v1/gallery', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)

  const total = (galleryDb.query('SELECT COUNT(*) as count FROM gallery').get() as { count: number }).count
  const rows = galleryDb.query('SELECT id, username, sensors, easter_eggs, created_at FROM gallery ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as {
    id: number
    username: string
    sensors: string
    easter_eggs: string
    created_at: string
  }[]

  const items = rows.map((row) => ({
    id: row.id,
    username: row.username,
    sensors: JSON.parse(row.sensors) as string[],
    easterEggs: JSON.parse(row.easter_eggs) as string[],
    createdAt: row.created_at,
  }))

  return c.json({ items, total })
})

app.get('/v1/gallery/:id/image', (c) => {
  const id = Number(c.req.param('id'))
  const row = galleryDb.query('SELECT image FROM gallery WHERE id = ?').get(id) as { image: string } | null
  if (!row) return c.json({ error: 'Not found' }, 404)

  const base64 = row.image.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})

const port = Number(process.env.PORT || 8787)

if (mqttHardwareMode && mqttBridge.isEnabled()) {
  void mqttBridge.start().catch((error) => {
    console.error('[mqtt] bridge start failed:', error)
  })
}

const server = BunRuntime.Bun.serve({
  fetch: app.fetch,
  port,
  websocket,
})

console.log(`[server] Unforce Make agent server listening on http://localhost:${port}`)
console.log(`[server] Workspace cwd: ${paths.cwd}`)
console.log(`[server] Data dir: ${paths.dataDir}`)
console.log(`[server] Hardware mode: ${hardwareMode}`)
console.log(
  `[server] Supabase history: ${history.isEnabled() ? 'enabled' : 'disabled (no Supabase config)'}`,
)
console.log(
  `[server] Hardware events: ${hardwareEvents.isEnabled() ? 'enabled' : 'disabled (no Supabase config)'}`,
)
console.log(
  `[server] MQTT bridge: ${
    mqttHardwareMode
      ? mqttBridge.isEnabled()
        ? 'configured'
        : 'disabled (no MQTT_BROKER_URI)'
      : 'inactive (HARDWARE_MODE is not mqtt)'
  }`,
)

function shutdown(): void {
  stopSimulation?.()
  if (mqttHardwareMode) {
    void mqttBridge.stop().catch((error) => {
      console.error('[mqtt] bridge stop failed:', error)
    })
  }
  for (const runtime of sessions.values()) {
    runtime.destroy()
  }
  memoryService.destroy()
  galleryDb.close()
  server.stop(true)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
