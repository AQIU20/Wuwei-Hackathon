const agentServerUrl = (process.env.AGENT_SERVER_URL || '').trim()
const nodeId = (process.env.HEART_RATE_NODE_ID || 'heart_01').trim()
const sampleCount = Math.max(Number(process.env.HEART_RATE_SAMPLE_COUNT || 10), 1)
const intervalMs = Math.max(Number(process.env.HEART_RATE_SAMPLE_INTERVAL_MS || 250), 0)
const startTs = Date.now()

if (!agentServerUrl) {
  console.error('[heart-rate-push] Missing AGENT_SERVER_URL.')
  process.exit(1)
}

const samples = [
  { bpm: 64, diastolic_mm_hg: 76, spo2: 98, systolic_mm_hg: 118, temperature_c: 36.5 },
  { bpm: 65, diastolic_mm_hg: 77, spo2: 98, systolic_mm_hg: 119, temperature_c: 36.5 },
  { bpm: 66, diastolic_mm_hg: 77, spo2: 97, systolic_mm_hg: 120, temperature_c: 36.4 },
  { bpm: 67, diastolic_mm_hg: 78, spo2: 98, systolic_mm_hg: 121, temperature_c: 36.5 },
  { bpm: 66, diastolic_mm_hg: 77, spo2: 98, systolic_mm_hg: 119, temperature_c: 36.5 },
  { bpm: 65, diastolic_mm_hg: 76, spo2: 99, systolic_mm_hg: 118, temperature_c: 36.4 },
  { bpm: 64, diastolic_mm_hg: 76, spo2: 98, systolic_mm_hg: 117, temperature_c: 36.4 },
  { bpm: 66, diastolic_mm_hg: 77, spo2: 98, systolic_mm_hg: 120, temperature_c: 36.5 },
  { bpm: 67, diastolic_mm_hg: 78, spo2: 97, systolic_mm_hg: 121, temperature_c: 36.6 },
  { bpm: 66, diastolic_mm_hg: 77, spo2: 98, systolic_mm_hg: 119, temperature_c: 36.5 },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

for (let i = 0; i < sampleCount; i++) {
  const sample = samples[i % samples.length]
  const timestampMs = startTs + i * 60_000
  const response = await fetch(
    new URL('/v1/heart-rate/ingress', agentServerUrl.replace(/\/$/, '/')),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...sample,
        confidence: 0.97,
        event_id: `heart-sample-${timestampMs}-${i + 1}`,
        firmware: 'mock-heart-sensor@1',
        node_id: nodeId,
        timestamp_ms: timestampMs,
        trace_id: `trace-heart-${timestampMs}-${i + 1}`,
      }),
    },
  )

  const result = await response.json()
  console.log(
    JSON.stringify(
      {
        index: i + 1,
        ok: response.ok,
        status: response.status,
        timestampMs,
        ...result,
      },
      null,
      2,
    ),
  )

  if (!response.ok) {
    process.exit(1)
  }

  if (intervalMs > 0 && i < sampleCount - 1) {
    await sleep(intervalMs)
  }
}
