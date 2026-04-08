import { randomUUID } from 'node:crypto'
import mqtt, { type IClientOptions } from 'mqtt'

const agentServerUrl = (process.env.AGENT_SERVER_URL || '').trim()
const brokerUri = (process.env.MQTT_BROKER_URI || '').trim()
const rootTopic = (process.env.MQTT_ROOT_TOPIC || 'aihub').trim() || 'aihub'
const nodeId = (process.env.MQTT_TEST_NODE_ID || 'env_railwaycheck01').trim()
const username = process.env.MQTT_USERNAME || undefined
const password = process.env.MQTT_PASSWORD || undefined
const timeoutMs = Math.max(Number(process.env.MQTT_TEST_TIMEOUT_MS || 30_000), 5_000)
const pollIntervalMs = Math.max(Number(process.env.MQTT_TEST_POLL_INTERVAL_MS || 2_000), 500)

if (!agentServerUrl) {
  console.error('[mqtt-railway-test] Missing AGENT_SERVER_URL.')
  process.exit(1)
}

if (!brokerUri) {
  console.error('[mqtt-railway-test] Missing MQTT_BROKER_URI.')
  process.exit(1)
}

const msgId = `railwaycheck-${randomUUID().slice(0, 8)}`
const topic = `${rootTopic}/sensor/${nodeId}/data`

const payload = JSON.stringify({
  v: 1,
  ts: Date.now(),
  node_id: nodeId,
  msg_id: msgId,
  type: 'sensor_data',
  payload: {
    message: 'railway-ingest-check',
    node_type: 'env',
    sensor: 'test_input',
  },
})

async function publishToBroker() {
  const options: IClientOptions = {
    clientId: `mqtt-railway-test-${randomUUID().slice(0, 8)}`,
    password,
    reconnectPeriod: 5000,
    username,
  }

  const client = await mqtt.connectAsync(brokerUri, options)
  try {
    await client.publishAsync(topic, payload, { qos: 1, retain: false })
  } finally {
    await client.endAsync()
  }
}

async function pollAgentServer() {
  const deadline = Date.now() + timeoutMs
  const baseUrl = agentServerUrl.replace(/\/$/, '')

  while (Date.now() < deadline) {
    const url = new URL('/v1/hardware-events', baseUrl)
    url.searchParams.set('msg_id', msgId)
    url.searchParams.set('limit', '1')
    url.searchParams.set('minutes', '10')

    const response = await fetch(url)
    if (response.ok) {
      const result = (await response.json()) as {
        count?: number
        samples?: Array<Record<string, unknown>>
      }
      const sample = result.samples?.[0]
      if (result.count && sample) {
        return sample
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Timed out waiting for msg_id=${msgId} to appear via ${agentServerUrl}`)
}

console.log(`[mqtt-railway-test] publishing to ${topic}`)
console.log(`[mqtt-railway-test] expecting Railway ingestion via ${agentServerUrl}`)

await publishToBroker()
const sample = await pollAgentServer()

console.log('[mqtt-railway-test] end-to-end ingest verified')
console.log(
  JSON.stringify(
    {
      msgId,
      nodeId,
      sample,
    },
    null,
    2,
  ),
)
