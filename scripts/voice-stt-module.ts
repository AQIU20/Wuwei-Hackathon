import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import mqtt from 'mqtt'

interface WavInfo {
  bytesPerSample: number
  channelCount: number
  durationMs: number
  peak: number
  rms: number
  sampleRate: number
}

interface TranscriptResult {
  confidence?: number
  language?: string
  text: string
}

const MQTT_BROKER_URI = (process.env.MQTT_BROKER_URI || 'mqtt://localhost:1883').trim()
const MQTT_ROOT_TOPIC = (process.env.MQTT_ROOT_TOPIC || 'aihub').trim() || 'aihub'
const NODE_ID = (process.env.VOICE_NODE_ID || 'vad_demo_01').trim()
const INBOX_DIR = resolve(process.env.VOICE_INBOX_DIR || 'data/voice-inbox')
const PROCESSED_DIR = resolve(process.env.VOICE_PROCESSED_DIR || 'data/voice-processed')
const SCAN_INTERVAL_MS = Number(process.env.VOICE_SCAN_INTERVAL_MS || 1500)
const VAD_RMS_THRESHOLD = Number(process.env.VOICE_VAD_RMS_THRESHOLD || 0.015)
const MIN_DURATION_MS = Number(process.env.VOICE_MIN_DURATION_MS || 800)
const STT_COMMAND = (process.env.VOICE_STT_COMMAND || '').trim()
const AUTO_STATUS = (process.env.VOICE_AUTO_STATUS || 'true').trim().toLowerCase() !== 'false'

function log(...args: unknown[]) {
  console.log('[voice-stt]', ...args)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractTextFromWhisperJson(payload: Record<string, unknown>) {
  const directText = typeof payload.text === 'string' ? payload.text.trim() : ''
  const result = isRecord(payload.result) ? payload.result : null
  const nestedText = result && typeof result.text === 'string' ? result.text.trim() : ''

  if (directText || nestedText) {
    return directText || nestedText
  }

  const transcription = payload.transcription
  if (!Array.isArray(transcription)) return ''

  const parts = transcription
    .map((segment) => {
      if (!isRecord(segment) || typeof segment.text !== 'string') return ''
      return segment.text.trim()
    })
    .filter(Boolean)

  return parts.join(' ').trim()
}

function buildEnvelope(type: string, payload: Record<string, unknown>) {
  return {
    v: 1,
    ts: Date.now(),
    node_id: NODE_ID,
    msg_id: randomUUID().replaceAll('-', '').slice(0, 8),
    type,
    payload,
  }
}

function topic(scope: 'status' | 'event', subject: string) {
  return `${MQTT_ROOT_TOPIC}/${scope}/${NODE_ID}/${subject}`
}

async function ensureDirs() {
  await mkdir(INBOX_DIR, { recursive: true })
  await mkdir(PROCESSED_DIR, { recursive: true })
}

function readAscii(view: Uint8Array, start: number, length: number) {
  return new TextDecoder().decode(view.subarray(start, start + length))
}

async function inspectWav(filePath: string): Promise<WavInfo> {
  const buffer = await Bun.file(filePath).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const dataView = new DataView(buffer)

  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new Error(`Unsupported WAV container: ${filePath}`)
  }

  let offset = 12
  let sampleRate = 0
  let channelCount = 0
  let bytesPerSample = 0
  let pcmOffset = 0
  let pcmSize = 0

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4)
    const chunkSize = dataView.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8
    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2)

    if (!Number.isFinite(chunkSize) || chunkDataOffset > bytes.length || nextOffset > bytes.length) {
      throw new Error(`Malformed WAV chunk ${chunkId} in ${filePath}`)
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        throw new Error(`Invalid fmt chunk in ${filePath}`)
      }
      const format = dataView.getUint16(chunkDataOffset, true)
      channelCount = dataView.getUint16(chunkDataOffset + 2, true)
      sampleRate = dataView.getUint32(chunkDataOffset + 4, true)
      const bitsPerSample = dataView.getUint16(chunkDataOffset + 14, true)
      bytesPerSample = bitsPerSample / 8
      if (format !== 1 && format !== 3) {
        throw new Error(`Unsupported WAV format ${format} in ${filePath}`)
      }
    }

    if (chunkId === 'data') {
      pcmOffset = chunkDataOffset
      pcmSize = chunkSize
      break
    }

    offset = nextOffset
  }

  if (!pcmOffset || !pcmSize || !sampleRate || !channelCount || !bytesPerSample) {
    throw new Error(`Incomplete WAV metadata: ${filePath}`)
  }

  const frameSize = channelCount * bytesPerSample
  const sampleCount = Math.floor(pcmSize / frameSize)
  let sumSquares = 0
  let peak = 0

  for (let i = 0; i < sampleCount; i += 1) {
    const sampleOffset = pcmOffset + i * frameSize
    let sample = 0

    if (bytesPerSample === 2) {
      sample = dataView.getInt16(sampleOffset, true) / 32768
    } else if (bytesPerSample === 4) {
      sample = dataView.getFloat32(sampleOffset, true)
    } else {
      throw new Error(`Unsupported sample width ${bytesPerSample} bytes in ${filePath}`)
    }

    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
    sumSquares += sample * sample
  }

  const rms = Math.sqrt(sumSquares / Math.max(sampleCount, 1))
  const durationMs = Math.round((sampleCount / sampleRate) * 1000)

  return {
    sampleRate,
    channelCount,
    bytesPerSample,
    durationMs,
    rms,
    peak,
  }
}

async function runStt(filePath: string): Promise<TranscriptResult | null> {
  if (!STT_COMMAND) {
    const inferredText = basename(filePath, extname(filePath)).replaceAll('_', ' ').trim()
    return inferredText
      ? {
          text: inferredText,
          confidence: 0.5,
          language: 'unknown',
        }
      : null
  }

  const outputBase = join(PROCESSED_DIR, `${basename(filePath, extname(filePath))}-${Date.now()}`)
  const outputJsonPath = `${outputBase}.json`
  const outputTxtPath = `${outputBase}.txt`
  const command = STT_COMMAND.replaceAll('{input}', filePath).replaceAll(
    '{output_base}',
    outputBase,
  )
  const proc = Bun.spawn({
    cmd: ['sh', '-lc', command],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `STT command failed with exit code ${exitCode}`)
  }

  try {
    const jsonText = await readFile(outputJsonPath, 'utf8')
    const parsed = JSON.parse(jsonText) as unknown
    if (isRecord(parsed)) {
      const result = isRecord(parsed.result) ? parsed.result : null
      const text = extractTextFromWhisperJson(parsed)
      if (text) {
        const confidence =
          typeof parsed.confidence === 'number'
            ? parsed.confidence
            : result && typeof result.confidence === 'number'
              ? result.confidence
              : undefined
        const language =
          typeof parsed.language === 'string'
            ? parsed.language
            : result && typeof result.language === 'string'
              ? result.language
              : undefined
        await rm(outputJsonPath, { force: true })
        return { text, confidence, language }
      }
    }
  } catch {
    // no json output file
  }

  try {
    const txt = (await readFile(outputTxtPath, 'utf8')).trim()
    if (txt) {
      await rm(outputTxtPath, { force: true })
      return { text: txt, confidence: 0.8 }
    }
  } catch {
    // no txt output file
  }

  const output = stdout.trim()
  if (!output) return null

  try {
    const parsed = JSON.parse(output) as unknown
    if (isRecord(parsed) && typeof parsed.text === 'string') {
      return {
        text: parsed.text.trim(),
        confidence:
          typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? parsed.confidence
            : undefined,
        language: typeof parsed.language === 'string' ? parsed.language : undefined,
      }
    }
  } catch {
    // fall back to plain text
  }

  return { text: output, confidence: 0.8 }
}

async function publishStatus(client: mqtt.MqttClient) {
  if (!AUTO_STATUS) return
  const envelope = buildEnvelope('online', {
    node_type: 'vad',
    fw_version: 'voice-stt-module@1',
    summary_mode: 'mqtt_event_only',
  })

  client.publish(topic('status', 'online'), JSON.stringify(envelope), {
    qos: 1,
    retain: true,
  })
}

async function processFile(client: mqtt.MqttClient, fileName: string) {
  const sourcePath = join(INBOX_DIR, fileName)
  const inProgressPath = join(INBOX_DIR, `${fileName}.processing`)
  const donePath = join(PROCESSED_DIR, fileName)

  await rename(sourcePath, inProgressPath)
  const wav = await inspectWav(inProgressPath)

  const vadActive = wav.durationMs >= MIN_DURATION_MS && wav.rms >= VAD_RMS_THRESHOLD
  const vadEnvelope = buildEnvelope('vad', {
    active: vadActive,
    rms: Number(wav.rms.toFixed(6)),
    peak: Number(wav.peak.toFixed(6)),
    duration_ms: wav.durationMs,
    sample_rate: wav.sampleRate,
    channel_count: wav.channelCount,
    node_type: 'vad',
    confidence: vadActive ? 0.95 : 0.3,
  })

  client.publish(topic('event', 'vad'), JSON.stringify(vadEnvelope), { qos: 1 })
  log(`published vad for ${fileName}`, vadEnvelope.payload)

  if (vadActive) {
    const transcript = await runStt(inProgressPath)
    if (transcript?.text) {
      const transcriptEnvelope = buildEnvelope('transcript', {
        text: transcript.text,
        confidence: transcript.confidence ?? 0.8,
        language: transcript.language ?? 'unknown',
        duration_ms: wav.durationMs,
        rms: Number(wav.rms.toFixed(6)),
        node_type: 'vad',
      })

      client.publish(topic('event', 'transcript'), JSON.stringify(transcriptEnvelope), { qos: 1 })
      log(`published transcript for ${fileName}`, transcriptEnvelope.payload)
    }
  }

  await rename(inProgressPath, donePath)
}

async function loop(client: mqtt.MqttClient) {
  await ensureDirs()

  while (true) {
    const entries = await readdir(INBOX_DIR)
    for (const entry of entries) {
      if (extname(entry).toLowerCase() !== '.wav') continue
      const fullPath = join(INBOX_DIR, entry)
      const fileStat = await stat(fullPath)
      if (!fileStat.isFile()) continue
      try {
        await processFile(client, entry)
      } catch (error) {
        console.error('[voice-stt] failed to process', entry, error)
      }
    }

    await Bun.sleep(SCAN_INTERVAL_MS)
  }
}

async function main() {
  await ensureDirs()
  const client = mqtt.connect(MQTT_BROKER_URI)

  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => {
      log(`connected to ${MQTT_BROKER_URI}`)
      resolve()
    })
    client.once('error', reject)
  })

  await publishStatus(client)
  log(`watching ${INBOX_DIR}`)
  if (STT_COMMAND) {
    log(`using external STT command: ${STT_COMMAND}`)
  } else {
    log('VOICE_STT_COMMAND not set; transcript falls back to file name stem')
  }

  await loop(client)
}

main().catch((error) => {
  console.error('[voice-stt] fatal error', error)
  process.exit(1)
})
