/**
 * hardware-bridge.ts
 *
 * 在「连接了真实硬件的那台电脑」上运行这个脚本。
 * 它会连接本地硬件的 WebSocket（或直接读串口/BLE），
 * 然后把数据推到 Railway 上的 agent-server。
 *
 * 用法:
 *   RAILWAY_WS_URL=wss://your-agent.up.railway.app/v1/hardware/ws bun run scripts/hardware-bridge.ts
 *
 * 如果你的本地硬件也是通过 WebSocket 暴露的（比如本地跑了另一个 agent-server），
 * 还可以设置:
 *   LOCAL_HW_WS_URL=ws://localhost:8787/v1/hardware/ws
 *
 * 如果没有设置 LOCAL_HW_WS_URL，脚本会进入「手动推送示例模式」，
 * 你可以参考 sendTelemetry() / sendAnnounce() 的调用方式接入自己的硬件 SDK。
 */

const RAILWAY_WS_URL = process.env.RAILWAY_WS_URL
const LOCAL_HW_WS_URL = process.env.LOCAL_HW_WS_URL

if (!RAILWAY_WS_URL) {
  console.error('[bridge] ❌ RAILWAY_WS_URL is required')
  console.error('  export RAILWAY_WS_URL=wss://your-agent.up.railway.app/v1/hardware/ws')
  process.exit(1)
}

// ── WebSocket helpers ─────────────────────────────────────────────────────────

type IngressMessage =
  | {
      type: 'announce'
      block: {
        block_id: string
        capability: string
        type: 'sensor' | 'stream' | 'actuator'
        chip?: string
        firmware?: string
        battery?: number
      }
    }
  | { type: 'status'; block_id: string; status: 'online' | 'offline'; battery?: number }
  | { type: 'telemetry'; block_id: string; data: Record<string, number>; timestamp?: number }
  | { type: 'snapshot'; block_id: string; scene: string; timestamp?: number }

function createRailwayConnection(url: string, onOpen?: () => void) {
  let ws: WebSocket
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let alive = true

  function connect() {
    console.log(`[bridge] → Connecting to Railway: ${url}`)
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[bridge] ✅ Connected to Railway agent-server')
      onOpen?.()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'ack') {
          // Server acknowledged a message — ignore or log
        } else if (msg.type === 'error') {
          console.warn('[bridge] Server error:', msg.message)
        } else if (msg.type === 'snapshot' || msg.type === 'update') {
          // Server echoing back its snapshot — ignore in bridge mode
        }
      } catch {
        // ignore
      }
    }

    ws.onerror = (err) => {
      console.error('[bridge] WebSocket error:', err)
    }

    ws.onclose = () => {
      if (!alive) return
      console.warn('[bridge] ⚠️  Disconnected from Railway, reconnecting in 5s…')
      reconnectTimer = setTimeout(connect, 5000)
    }
  }

  connect()

  function send(msg: IngressMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function destroy() {
    alive = false
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws.close()
  }

  return { send, destroy }
}

// ── Mode A: 本地也有 hardware WS（转发模式）────────────────────────────────

function startForwardMode(localUrl: string, railwayUrl: string) {
  console.log('[bridge] Mode: FORWARD (local WS → Railway)')
  console.log(`[bridge]   Local:   ${localUrl}`)
  console.log(`[bridge]   Railway: ${railwayUrl}`)

  const railway = createRailwayConnection(railwayUrl)

  let localWs: WebSocket
  let localReconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connectLocal() {
    console.log(`[bridge] → Connecting to local hardware: ${localUrl}`)
    localWs = new WebSocket(localUrl)

    localWs.onopen = () => {
      console.log('[bridge] ✅ Connected to local hardware WS')
    }

    localWs.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type: string
          payload?: unknown
        }

        // 本地 WS 广播的是 HardwareBroadcast（snapshot/update），
        // 我们需要把其中的 telemetry 数据转成 IngressMessage 推给 Railway
        if (payload.type === 'snapshot' || payload.type === 'update') {
          const snapshot = payload.payload as {
            blocks: Array<{
              block_id: string
              capability: string
              type: 'sensor' | 'stream' | 'actuator'
              status: 'online' | 'offline'
              battery: number
              chip?: string
              firmware?: string
              latest?: Record<string, number>
              scene?: string
            }>
          }

          for (const block of snapshot.blocks ?? []) {
            // 先 announce（idempotent）
            railway.send({
              type: 'announce',
              block: {
                block_id: block.block_id,
                capability: block.capability,
                type: block.type,
                chip: block.chip,
                firmware: block.firmware,
                battery: block.battery,
              },
            })

            // 推 telemetry
            if (block.type === 'sensor' && block.latest && Object.keys(block.latest).length > 0) {
              railway.send({
                type: 'telemetry',
                block_id: block.block_id,
                data: block.latest,
                timestamp: Date.now(),
              })
            }

            // 推 camera snapshot
            if (block.capability === 'camera' && block.scene) {
              railway.send({
                type: 'snapshot',
                block_id: block.block_id,
                scene: block.scene,
                timestamp: Date.now(),
              })
            }

            // 推 status
            railway.send({
              type: 'status',
              block_id: block.block_id,
              status: block.status,
              battery: block.battery,
            })
          }
        }
      } catch (err) {
        console.error('[bridge] Failed to parse local WS message:', err)
      }
    }

    localWs.onerror = (err) => {
      console.error('[bridge] Local WS error:', err)
    }

    localWs.onclose = () => {
      console.warn('[bridge] ⚠️  Local WS disconnected, reconnecting in 3s…')
      localReconnectTimer = setTimeout(connectLocal, 3000)
    }
  }

  connectLocal()

  return () => {
    if (localReconnectTimer) clearTimeout(localReconnectTimer)
    localWs?.close()
    railway.destroy()
  }
}

// ── Mode B: 直接调用 API 推数据（手动接入模式）──────────────────────────────

function startManualMode(railwayUrl: string) {
  console.log('[bridge] Mode: MANUAL (direct API push)')
  console.log('[bridge] Modify this script to push real sensor data from your hardware SDK.')
  console.log('[bridge] Current behaviour: sending example telemetry every 3 seconds.\n')

  const railway = createRailwayConnection(railwayUrl, () => {
    // 连接建立后先 announce 所有积木块
    railway.send({
      type: 'announce',
      block: {
        block_id: 'heart_01',
        capability: 'heart_rate',
        type: 'sensor',
        chip: 'ESP32-C3',
        battery: 85,
      },
    })
    railway.send({
      type: 'announce',
      block: {
        block_id: 'env_01',
        capability: 'temperature',
        type: 'sensor',
        chip: 'ESP32-C3',
        battery: 90,
      },
    })
    railway.send({
      type: 'announce',
      block: {
        block_id: 'env_02',
        capability: 'humidity',
        type: 'sensor',
        chip: 'ESP32-C3',
        battery: 88,
      },
    })
    railway.send({
      type: 'announce',
      block: {
        block_id: 'air_01',
        capability: 'formaldehyde',
        type: 'sensor',
        chip: 'ESP32-C3',
        battery: 75,
      },
    })
  })

  // ── 每 3 秒推一次模拟数据（替换为你的真实硬件读值）────────────────────────
  // TODO: 在这里接入你的 BLE/串口/MQTT SDK，读真实传感器数值
  const timer = setInterval(() => {
    const now = Date.now()

    railway.send({
      type: 'telemetry',
      block_id: 'heart_01',
      data: { bpm: 60 + Math.random() * 40 },
      timestamp: now,
    })

    railway.send({
      type: 'telemetry',
      block_id: 'env_01',
      data: { temp_c: 22 + Math.random() * 6 },
      timestamp: now,
    })

    railway.send({
      type: 'telemetry',
      block_id: 'env_02',
      data: { rh: 45 + Math.random() * 30 },
      timestamp: now,
    })

    railway.send({
      type: 'telemetry',
      block_id: 'air_01',
      data: { hcho_mg: 0.01 + Math.random() * 0.05 },
      timestamp: now,
    })

    console.log(`[bridge] ↑ Pushed telemetry @ ${new Date(now).toLocaleTimeString()}`)
  }, 3000)

  return () => {
    clearInterval(timer)
    railway.destroy()
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const cleanup = LOCAL_HW_WS_URL
  ? startForwardMode(LOCAL_HW_WS_URL, RAILWAY_WS_URL)
  : startManualMode(RAILWAY_WS_URL)

process.on('SIGINT', () => {
  console.log('\n[bridge] Shutting down…')
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})
