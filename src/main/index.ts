import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { cors } from 'hono/cors'
import { AgentRuntime } from './agent'
import { isMqttHardwareMode, resolveHardwareMode } from './hardware/mode'
import { AihubMqttBridge } from './hardware/mqtt-bridge'
import { type HardwareIngressMessage, HardwareStore } from './hardware/store'
import { HardwareEventService } from './history/hardware-event-service'
import { SupabaseHistoryService } from './history/supabase-history-service'
import { AgentMemoryCurator } from './memory/agent-memory-curator'
import { ContextEpisodeCurator } from './memory/context-episode-curator'
import { ContextEpisodeService } from './memory/context-episode-service'
import { PreferenceMemoryService } from './memory/preference-memory-service'
import { SupabaseMemoryService } from './memory/supabase-memory-service'
import { ConfigService } from './providers/config-service'
import { ProviderRegistry } from './providers/registry'
import { resolveRuntimePaths } from './runtime-paths'

const paths = resolveRuntimePaths()
const configService = new ConfigService(paths.configDir)
configService.init()

const registry = new ProviderRegistry(configService)
const supabaseMemory = new SupabaseMemoryService()
const contextEpisodes = new ContextEpisodeService()
const memoryService = new PreferenceMemoryService(
  join(paths.memoryDir, 'preferences.sqlite'),
  supabaseMemory,
)
const hardwareMode = resolveHardwareMode()
const mqttHardwareMode = isMqttHardwareMode(hardwareMode)
const hardware = new HardwareStore()
const history = new SupabaseHistoryService()
const galleryDb = new Database(join(paths.memoryDir, 'gallery.sqlite'))
galleryDb.run(
  'CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY, email TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
)
galleryDb.run(
  'CREATE TABLE IF NOT EXISTS gallery (id INTEGER PRIMARY KEY, username TEXT, sensors TEXT, easter_eggs TEXT, image TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
)
// Add message column if missing (safe migration)
try {
  galleryDb.run("ALTER TABLE gallery ADD COLUMN message TEXT DEFAULT ''")
} catch {
  /* column already exists */
}
const hardwareEvents = new HardwareEventService()
const contextEpisodeCurator = new ContextEpisodeCurator({
  configService,
  contextEpisodes,
  hardwareEvents,
  registry,
})
const agentMemories = new AgentMemoryCurator({
  contextEpisodes,
  configService,
  registry,
  supabaseMemory,
})
const mqttBridge = new AihubMqttBridge({
  eventService: hardwareEvents,
  hardware,
})
const sessions = new Map<string, AgentRuntime>()
const voiceSessionByNode = new Map<string, string>()
const seenVoiceUtterances = new Map<string, number>()
const hardwareEventRowsPerMemoryRun = Math.max(
  1,
  Number(
    process.env.MEMORY_PIPELINE_EVENT_ROW_TRIGGER ||
      process.env.MEMORY_PIPELINE_HISTORY_ROW_TRIGGER ||
      10,
  ),
)
let pendingHardwareEventRowsForMemoryPipeline = 0
let memoryPipelineRunning = false
let agentMemorySyncPending = false
let agentMemorySyncRunning = false
let debugCuratorRunPending = false
let debugCuratorRunRunning = false
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
    hardwareEvents,
    history,
    agentMemories,
    memoryService,
    mqttBridge: mqttHardwareMode ? mqttBridge : null,
    registry,
    sessionDir: paths.sessionDir,
  })
}

hardware.subscribe((event) => {
  if (history && (event.type === 'snapshot' || event.type === 'update') && history.isEnabled()) {
    void history.persistSnapshot(event.payload, event.type).catch((error) => {
      console.error('[history] persist snapshot failed:', error)
    })
  }
})

async function runMemoryPipelineIfNeeded(): Promise<void> {
  if (memoryPipelineRunning) return
  if (pendingHardwareEventRowsForMemoryPipeline < hardwareEventRowsPerMemoryRun) return

  memoryPipelineRunning = true
  try {
    while (pendingHardwareEventRowsForMemoryPipeline >= hardwareEventRowsPerMemoryRun) {
      pendingHardwareEventRowsForMemoryPipeline -= hardwareEventRowsPerMemoryRun
      await contextEpisodeCurator.runOnce()
      await agentMemories.runOnce()
    }
  } catch (error) {
    pendingHardwareEventRowsForMemoryPipeline += hardwareEventRowsPerMemoryRun
    console.error('[memory-pipeline] trigger run failed:', error)
  } finally {
    memoryPipelineRunning = false
    if (pendingHardwareEventRowsForMemoryPipeline >= hardwareEventRowsPerMemoryRun) {
      void runMemoryPipelineIfNeeded()
    }
  }
}

const unsubscribeHardwareEventRowsPersisted = hardwareEvents.onRowsPersisted(({ rowCount }) => {
  pendingHardwareEventRowsForMemoryPipeline += rowCount
  void runMemoryPipelineIfNeeded()
})

async function syncAgentMemoriesFromEpisodes(): Promise<void> {
  if (agentMemorySyncRunning) {
    agentMemorySyncPending = true
    return
  }

  agentMemorySyncRunning = true
  try {
    do {
      agentMemorySyncPending = false
      await agentMemories.runOnce()
    } while (agentMemorySyncPending)
  } catch (error) {
    console.error('[agent-memories] episode-triggered sync failed:', error)
  } finally {
    agentMemorySyncRunning = false
  }
}

const unsubscribeContextEpisodeChanges = contextEpisodes.onEpisodeChanged(() => {
  void syncAgentMemoriesFromEpisodes()
})

async function runDebugCuratorsInBackground(): Promise<void> {
  if (debugCuratorRunRunning) {
    debugCuratorRunPending = true
    return
  }

  debugCuratorRunRunning = true
  try {
    do {
      debugCuratorRunPending = false
      contextEpisodeCurator.reset('manual debug run')
      agentMemories.reset('manual debug run')
      await contextEpisodeCurator.runOnce()
      await agentMemories.runOnce()
    } while (debugCuratorRunPending)
  } catch (error) {
    console.error('[debug-curators] background run failed:', error)
  } finally {
    debugCuratorRunRunning = false
  }
}

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

interface VoiceIngressBody {
  chip?: string
  confidence?: number | null
  event_id?: string
  firmware?: string
  is_final?: boolean
  is_partial?: boolean
  language?: string | null
  locale?: 'en' | 'zh'
  node_id?: string
  session_id?: string
  text?: string
  timestamp_ms?: number
  trigger?: boolean
  utterance_id?: string
  wakeword?: string | null
}

interface CameraIngressBody {
  analysis_text?: string | null
  chip?: string
  confidence?: number | null
  event_id?: string
  firmware?: string
  height?: number | null
  image_base64?: string | null
  image_url?: string | null
  mime_type?: string | null
  node_id?: string
  size_bytes?: number | null
  snapshot_id?: string
  timestamp_ms?: number
  trigger?: boolean
  width?: number | null
  scene?: string | null
}

interface HeartRateIngressBody {
  battery?: number | null
  bpm?: number | null
  chip?: string
  confidence?: number | null
  diastolic_mm_hg?: number | null
  event_id?: string
  firmware?: string
  node_id?: string
  spo2?: number | null
  systolic_mm_hg?: number | null
  temperature_c?: number | null
  timestamp_ms?: number
  trace_id?: string
}

function pruneSeenVoiceUtterances(now = Date.now()): void {
  const ttlMs = 6 * 60 * 60 * 1000
  for (const [key, seenAt] of seenVoiceUtterances.entries()) {
    if (now - seenAt > ttlMs) {
      seenVoiceUtterances.delete(key)
    }
  }
}

async function resolveVoiceRuntime(nodeId: string, requestedSessionId?: string) {
  const sessionId = requestedSessionId?.trim() || voiceSessionByNode.get(nodeId)
  const runtime = sessionId ? await resolveRuntime(sessionId) : await createSessionRuntime()
  const summary = runtime.getSessionSummary()
  voiceSessionByNode.set(nodeId, summary.id)
  return {
    runtime,
    sessionId: summary.id,
  }
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
      contextEpisodes: contextEpisodes.getStatus(),
      contextEpisodeCurator: contextEpisodeCurator.getStatus(),
      agentMemories: agentMemories.getStatus(),
      memoryPipeline: {
        pendingHardwareEventRows: pendingHardwareEventRowsForMemoryPipeline,
        rowTrigger: hardwareEventRowsPerMemoryRun,
        running: memoryPipelineRunning,
      },
      agentMemorySync: {
        pending: agentMemorySyncPending,
        running: agentMemorySyncRunning,
      },
      debugCuratorRun: {
        pending: debugCuratorRunPending,
        running: debugCuratorRunRunning,
      },
      mqttBridge: mqttBridge.getStatus(),
      ok: isReady,
      workspace: paths.cwd,
    },
    isReady ? 200 : 503,
  )
})

app.post('/v1/debug/curators/reset', (c) => {
  contextEpisodeCurator.reset('manual debug reset')
  agentMemories.reset('manual debug reset')
  return c.json({
    ok: true,
    agentMemories: agentMemories.getStatus(),
    contextEpisodeCurator: contextEpisodeCurator.getStatus(),
  })
})

app.post('/v1/debug/curators/run-once', (c) => {
  const startedAt = new Date().toISOString()
  debugCuratorRunPending = true
  void runDebugCuratorsInBackground()

  return c.json(
    {
      ok: true,
      accepted: true,
      agentMemories: agentMemories.getStatus(),
      contextEpisodeCurator: contextEpisodeCurator.getStatus(),
      debugCuratorRun: {
        pending: debugCuratorRunPending,
        running: debugCuratorRunRunning,
      },
      startedAt,
    },
    202,
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
  const msgId = c.req.query('msg_id')
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
      msgId,
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

app.get('/v1/context-episodes', async (c) => {
  if (!contextEpisodes.isEnabled()) {
    return c.json({ error: 'Supabase context episodes are not configured' }, 503)
  }

  const contextType = c.req.query('context_type')
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const minutes = Math.min(
    Math.max(Number(c.req.query('minutes') || c.req.query('range_minutes') || 24 * 60), 1),
    7 * 24 * 60,
  )

  try {
    const items = await contextEpisodes.listEpisodes({
      contextType,
      limit,
      minutes,
    })

    return c.json({ count: items.length, items })
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to query context episodes',
      },
      500,
    )
  }
})

app.post('/v1/voice/ingress', async (c) => {
  const body = (await c.req.json()) as VoiceIngressBody
  const nodeId = body.node_id?.trim()

  if (!nodeId) {
    return c.json({ error: 'node_id is required' }, 400)
  }

  const normalizedText = body.text?.trim() || ''
  const utteranceId = body.utterance_id?.trim() || `utt-${randomUUID()}`
  const eventId = body.event_id?.trim() || `voice-${randomUUID()}`
  const timestampMs =
    typeof body.timestamp_ms === 'number' && Number.isFinite(body.timestamp_ms)
      ? body.timestamp_ms
      : Date.now()
  const isFinal = body.is_final === true || (body.is_partial !== true && normalizedText.length > 0)
  const trigger = body.trigger === true

  const voiceState = hardware.upsertVoiceState({
    blockId: nodeId,
    chip: body.chip?.trim() || undefined,
    confidence: body.confidence ?? null,
    firmware: body.firmware?.trim() || undefined,
    isFinal,
    language: body.language ?? null,
    text: normalizedText,
    timestampMs,
    trigger,
    utteranceId,
    wakeword: body.wakeword ?? null,
  })

  if (hardwareEvents.isEnabled()) {
    void hardwareEvents
      .insertDirectEvent({
        capability: 'microphone',
        chip_family: null,
        confidence:
          typeof body.confidence === 'number' && Number.isFinite(body.confidence)
            ? body.confidence
            : null,
        event_ts_ms: timestampMs,
        home_id: null,
        ingest_trace_id: utteranceId,
        mac_suffix: null,
        meta: {
          ingress: 'direct_http_voice',
          session_id: body.session_id ?? null,
        },
        msg_id: eventId,
        node_id: nodeId,
        node_type: 'mic',
        payload: {
          is_final: isFinal,
          is_partial: !isFinal,
          language: body.language ?? null,
          text: normalizedText,
          trigger,
          utterance_id: utteranceId,
          wakeword: body.wakeword ?? null,
        },
        protocol_version: 1,
        recorded_at: new Date(timestampMs).toISOString(),
        room_id: null,
        scope: 'voice',
        signal_name: trigger ? 'triggered_transcript' : 'transcript',
        source: 'direct_voice_ingress',
        status: null,
        subject: 'transcript',
        success: null,
        topic: `direct/voice/${nodeId}/transcript`,
        type: isFinal ? 'voice_transcript_final' : 'voice_transcript_partial',
      })
      .catch((error) => {
        console.error('[voice] direct event persist failed:', error)
      })
  }

  pruneSeenVoiceUtterances(timestampMs)

  const dedupeKey = `${nodeId}:${utteranceId}`
  const shouldPrompt =
    isFinal && trigger && normalizedText.length > 0 && !seenVoiceUtterances.has(dedupeKey)

  let prompted = false
  let sessionId: string | null = body.session_id?.trim() || voiceSessionByNode.get(nodeId) || null

  if (shouldPrompt) {
    const resolved = await resolveVoiceRuntime(nodeId, body.session_id)
    sessionId = resolved.sessionId
    prompted = true
    seenVoiceUtterances.set(dedupeKey, timestampMs)
    void resolved.runtime.prompt({
      locale: body.locale,
      messageId: `voice-${utteranceId}`,
      text: normalizedText,
    })
  }

  return c.json({
    ok: true,
    block: voiceState.block,
    prompted,
    session_id: sessionId,
    state: voiceState.state,
    utterance_id: utteranceId,
  })
})

app.post('/v1/camera/ingress', async (c) => {
  const body = (await c.req.json()) as CameraIngressBody
  const nodeId = body.node_id?.trim()

  if (!nodeId) {
    return c.json({ error: 'node_id is required' }, 400)
  }

  const snapshotId = body.snapshot_id?.trim() || `snap-${randomUUID()}`
  const eventId = body.event_id?.trim() || `camera-${randomUUID()}`
  const timestampMs =
    typeof body.timestamp_ms === 'number' && Number.isFinite(body.timestamp_ms)
      ? body.timestamp_ms
      : Date.now()
  const analysisText = body.analysis_text?.trim() || body.scene?.trim() || null
  const trigger = body.trigger === true

  const cameraState = hardware.upsertCameraSnapshot({
    analysisText,
    blockId: nodeId,
    chip: body.chip?.trim() || undefined,
    confidence: body.confidence ?? null,
    firmware: body.firmware?.trim() || undefined,
    height: body.height ?? null,
    imageBase64: body.image_base64 ?? null,
    imageUrl: body.image_url ?? null,
    mimeType: body.mime_type ?? null,
    sizeBytes: body.size_bytes ?? null,
    snapshotId,
    timestampMs,
    trigger,
    width: body.width ?? null,
  })

  if (hardwareEvents.isEnabled()) {
    void hardwareEvents
      .insertDirectEvent({
        capability: 'camera',
        chip_family: null,
        confidence:
          typeof body.confidence === 'number' && Number.isFinite(body.confidence)
            ? body.confidence
            : null,
        event_ts_ms: timestampMs,
        home_id: null,
        ingest_trace_id: snapshotId,
        mac_suffix: null,
        meta: {
          has_analysis_text: analysisText !== null,
          has_image_base64: typeof body.image_base64 === 'string' && body.image_base64.length > 0,
          has_image_url: typeof body.image_url === 'string' && body.image_url.length > 0,
          ingress: 'direct_http_camera',
        },
        msg_id: eventId,
        node_id: nodeId,
        node_type: 'cam',
        payload: {
          analysis_text: analysisText,
          height:
            typeof body.height === 'number' && Number.isFinite(body.height) ? body.height : null,
          image_base64: body.image_base64 ?? null,
          image_url: body.image_url ?? null,
          mime_type: body.mime_type ?? null,
          size_bytes:
            typeof body.size_bytes === 'number' && Number.isFinite(body.size_bytes)
              ? body.size_bytes
              : null,
          snapshot_id: snapshotId,
          trigger,
          width: typeof body.width === 'number' && Number.isFinite(body.width) ? body.width : null,
        },
        protocol_version: 1,
        recorded_at: new Date(timestampMs).toISOString(),
        room_id: null,
        scope: 'vision',
        signal_name: trigger ? 'triggered_snapshot' : 'snapshot',
        source: 'direct_camera_ingress',
        status: null,
        subject: 'snapshot',
        success: null,
        topic: `direct/vision/${nodeId}/snapshot`,
        type: 'camera_snapshot_final',
      })
      .catch((error) => {
        console.error('[camera] direct event persist failed:', error)
      })
  }

  return c.json({
    ok: true,
    block: cameraState.block,
    snapshot_id: snapshotId,
    state: cameraState.state,
  })
})

app.post('/v1/heart-rate/ingress', async (c) => {
  const body = (await c.req.json()) as HeartRateIngressBody
  const nodeId = body.node_id?.trim()

  if (!nodeId) {
    return c.json({ error: 'node_id is required' }, 400)
  }

  const hasNumericReading = [
    body.bpm,
    body.spo2,
    body.systolic_mm_hg,
    body.diastolic_mm_hg,
    body.temperature_c,
  ].some((value) => typeof value === 'number' && Number.isFinite(value))

  if (!hasNumericReading) {
    return c.json(
      {
        error:
          'At least one numeric reading is required: bpm, spo2, systolic_mm_hg, diastolic_mm_hg, or temperature_c',
      },
      400,
    )
  }

  const eventId = body.event_id?.trim() || `heart-${randomUUID()}`
  const traceId = body.trace_id?.trim() || `trace-${randomUUID()}`
  const timestampMs =
    typeof body.timestamp_ms === 'number' && Number.isFinite(body.timestamp_ms)
      ? body.timestamp_ms
      : Date.now()

  const announceResult = hardware.applyMessage({
    type: 'announce',
    block: {
      block_id: nodeId,
      battery:
        typeof body.battery === 'number' && Number.isFinite(body.battery)
          ? Math.max(0, Math.min(100, Math.round(body.battery)))
          : undefined,
      capability: 'heart_rate_oximeter',
      chip: body.chip?.trim() || 'external',
      firmware: body.firmware?.trim() || 'heart-rate-ingress@1',
      status: 'online',
      type: 'sensor',
    },
  })

  if (!announceResult.ok) {
    return c.json({ error: announceResult.error ?? 'Failed to announce heart-rate block' }, 500)
  }

  const telemetry: Record<string, unknown> = {
    _scope: 'sensor',
    _subject: 'data',
    _type: 'sensor_data',
  }
  if (typeof body.bpm === 'number' && Number.isFinite(body.bpm)) telemetry.bpm = body.bpm
  if (typeof body.spo2 === 'number' && Number.isFinite(body.spo2)) telemetry.spo2 = body.spo2
  if (typeof body.systolic_mm_hg === 'number' && Number.isFinite(body.systolic_mm_hg)) {
    telemetry.systolic_mm_hg = body.systolic_mm_hg
  }
  if (typeof body.diastolic_mm_hg === 'number' && Number.isFinite(body.diastolic_mm_hg)) {
    telemetry.diastolic_mm_hg = body.diastolic_mm_hg
  }
  if (typeof body.temperature_c === 'number' && Number.isFinite(body.temperature_c)) {
    telemetry.temperature_c = body.temperature_c
  }

  const telemetryResult = hardware.applyMessage({
    type: 'telemetry',
    block_id: nodeId,
    data: telemetry,
    timestamp: timestampMs,
  })

  if (!telemetryResult.ok) {
    return c.json({ error: telemetryResult.error ?? 'Failed to apply heart-rate telemetry' }, 500)
  }

  if (hardwareEvents.isEnabled()) {
    void hardwareEvents
      .insertDirectEvent({
        capability: 'heart_rate_oximeter',
        chip_family: body.chip?.trim() || null,
        confidence:
          typeof body.confidence === 'number' && Number.isFinite(body.confidence)
            ? body.confidence
            : null,
        event_ts_ms: timestampMs,
        home_id: null,
        ingest_trace_id: traceId,
        mac_suffix: null,
        meta: {
          ingress: 'direct_http_heart_rate',
        },
        msg_id: eventId,
        node_id: nodeId,
        node_type: 'hrox',
        payload: {
          bpm: typeof body.bpm === 'number' && Number.isFinite(body.bpm) ? body.bpm : null,
          diastolic_mm_hg:
            typeof body.diastolic_mm_hg === 'number' && Number.isFinite(body.diastolic_mm_hg)
              ? body.diastolic_mm_hg
              : null,
          spo2: typeof body.spo2 === 'number' && Number.isFinite(body.spo2) ? body.spo2 : null,
          systolic_mm_hg:
            typeof body.systolic_mm_hg === 'number' && Number.isFinite(body.systolic_mm_hg)
              ? body.systolic_mm_hg
              : null,
          temperature_c:
            typeof body.temperature_c === 'number' && Number.isFinite(body.temperature_c)
              ? body.temperature_c
              : null,
        },
        protocol_version: 1,
        recorded_at: new Date(timestampMs).toISOString(),
        room_id: null,
        scope: 'sensor',
        signal_name: 'heart_sample',
        source: 'direct_heart_rate_ingress',
        status: 'online',
        subject: 'data',
        success: true,
        topic: `direct/sensor/${nodeId}/heart_rate`,
        type: 'sensor_data',
      })
      .catch((error) => {
        console.error('[heart-rate] direct event persist failed:', error)
      })
  }

  return c.json({
    ok: true,
    block: hardware.getBlock(nodeId),
    readings: telemetry,
    trace_id: traceId,
  })
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

          const _ignored = payload as HardwareIngressMessage
          void _ignored
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Direct hardware ingress is disabled. Use MQTT topics instead.',
            }),
          )
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

// --- Memory routes ---

app.get('/v1/memories', async (c) => {
  if (!supabaseMemory.isEnabled()) {
    return c.json({ error: 'Memory service unavailable' }, 503)
  }

  try {
    const items = await supabaseMemory.listMemories()
    return c.json({ items })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to list memories' },
      500,
    )
  }
})

app.patch('/v1/memories/:id', async (c) => {
  if (!supabaseMemory.isEnabled()) {
    return c.json({ error: 'Memory service unavailable' }, 503)
  }

  const id = c.req.param('id')
  const body = (await c.req.json()) as { value?: string; reason?: string | null }
  const value = body.value?.trim()
  if (!value) return c.json({ error: 'value is required' }, 400)

  try {
    await supabaseMemory.updateMemory(id, value, body.reason?.trim() || null)
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Update failed' }, 500)
  }
})

app.delete('/v1/memories/:id', async (c) => {
  if (!supabaseMemory.isEnabled()) {
    return c.json({ error: 'Memory service unavailable' }, 503)
  }

  const id = c.req.param('id')
  try {
    await supabaseMemory.deleteMemory(id)
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Delete failed' }, 500)
  }
})

app.get('/v1/memory/preferences', async (c) => {
  try {
    const items = memoryService.listManageablePreferences().map((item) => ({
      id: item.id,
      home_id: null,
      memory_type: 'preference',
      memory_key: item.key,
      memory_value: item.value,
      confidence: item.confidence,
      evidence_count: item.evidenceCount,
      last_observed_at: item.updatedAt,
      reason: item.reason,
      status: 'active',
      updated_at: item.updatedAt,
    }))
    return c.json({ items, remoteEnabled: supabaseMemory.isEnabled() })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to list memories' },
      500,
    )
  }
})

app.patch('/v1/memory/preferences/:id', async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json()) as { value?: string; reason?: string | null }
  const value = body.value?.trim()
  if (!value) return c.json({ error: 'value is required' }, 400)
  try {
    memoryService.updatePreference({ id, value, reason: body.reason ?? null })
    const local = memoryService.listManageablePreferences().find((m) => m.id === id)
    if (local && supabaseMemory.isEnabled()) {
      await supabaseMemory.upsertMemory({
        home_id: null,
        memory_type: 'preference',
        memory_key: local.key,
        memory_value: local.value,
        confidence: local.confidence,
        evidence_count: local.evidenceCount,
        last_observed_at: local.updatedAt,
        reason: local.reason ?? null,
        status: 'active',
      })
    }
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Update failed' }, 500)
  }
})

app.delete('/v1/memory/preferences/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const local = memoryService.listManageablePreferences().find((m) => m.id === id)
    if (!local) {
      return c.json({ error: 'Memory item not found' }, 404)
    }
    memoryService.deletePreference(id)
    if (supabaseMemory.isEnabled()) {
      await supabaseMemory.deleteMemoryByKey(local.key)
    }
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Delete failed' }, 500)
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
    email?: string
    message?: string
    sensors?: string[]
    easterEggs?: string[]
    imageBase64?: string
  }
  const { username, email, message, sensors, easterEggs, imageBase64 } = body
  if (!username) {
    return c.json({ error: 'username is required' }, 400)
  }
  const result = galleryDb.run(
    'INSERT INTO gallery (username, message, sensors, easter_eggs, image) VALUES (?, ?, ?, ?, ?)',
    [
      username,
      message ?? '',
      JSON.stringify(sensors ?? []),
      JSON.stringify(easterEggs ?? []),
      imageBase64 ?? '',
    ],
  )
  // Auto-add email to waitlist if provided
  if (email?.trim()) {
    try {
      galleryDb.run('INSERT INTO waitlist (email) VALUES (?)', [email.trim()])
    } catch {
      /* ignore duplicate */
    }
  }
  return c.json({ ok: true, id: Number(result.lastInsertRowid) })
})

app.get('/v1/gallery', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100)
  const offset = Math.max(Number(c.req.query('offset') || 0), 0)

  const total = (
    galleryDb.query('SELECT COUNT(*) as count FROM gallery').get() as { count: number }
  ).count
  const rows = galleryDb
    .query(
      'SELECT id, username, message, sensors, easter_eggs, created_at FROM gallery ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
    .all(limit, offset) as {
    id: number
    username: string
    message: string
    sensors: string
    easter_eggs: string
    created_at: string
  }[]

  const items = rows.map((row) => ({
    id: row.id,
    username: row.username,
    message: row.message || undefined,
    sensors: JSON.parse(row.sensors) as string[],
    easterEggs: JSON.parse(row.easter_eggs) as string[],
    createdAt: row.created_at,
  }))

  return c.json({ items, total })
})

app.get('/v1/gallery/:id/image', (c) => {
  const id = Number(c.req.param('id'))
  const row = galleryDb.query('SELECT image FROM gallery WHERE id = ?').get(id) as {
    image: string
  } | null
  if (!row) return c.json({ error: 'Not found' }, 404)

  const base64 = row.image.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})

const port = Number(process.env.PORT || 8787)

if (mqttHardwareMode && mqttBridge.isEnabled()) {
  void mqttBridge.start().catch((error) => {
    console.error('[mqtt] bridge start failed:', error)
  })
}

contextEpisodeCurator.start()

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
      : 'inactive'
  }`,
)

function shutdown(): void {
  if (mqttHardwareMode) {
    void mqttBridge.stop().catch((error) => {
      console.error('[mqtt] bridge stop failed:', error)
    })
  }
  for (const runtime of sessions.values()) {
    runtime.destroy()
  }
  contextEpisodeCurator.stop()
  unsubscribeHardwareEventRowsPersisted()
  unsubscribeContextEpisodeChanges()
  memoryService.destroy()
  galleryDb.close()
  server.stop(true)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
