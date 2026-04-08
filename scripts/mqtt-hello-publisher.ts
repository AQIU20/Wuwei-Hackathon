import { randomUUID } from 'node:crypto'
import mqtt, { type IClientOptions } from 'mqtt'

const brokerUri = (process.env.MQTT_BROKER_URI || 'mqtt://broker.emqx.io').trim()
const rootTopic = (process.env.MQTT_ROOT_TOPIC || 'aihub').trim() || 'aihub'
const nodeId = (process.env.MQTT_TEST_NODE_ID || 'env_hello01').trim()
const intervalMs = Math.max(Number(process.env.MQTT_TEST_INTERVAL_MS || 10_000), 1000)
const username = process.env.MQTT_USERNAME || undefined
const password = process.env.MQTT_PASSWORD || undefined

function buildEnvelope(type: string, payload: Record<string, unknown>) {
  return JSON.stringify({
    v: 1,
    ts: Date.now(),
    node_id: nodeId,
    msg_id: randomUUID().replaceAll('-', '').slice(0, 8),
    type,
    payload,
  })
}

async function publish(
  client: mqtt.MqttClient,
  topic: string,
  payload: string,
  qos: 0 | 1 = 0,
  retain = false,
) {
  await client.publishAsync(topic, payload, { qos, retain })
  console.log(`[mqtt-test] published ${topic} ${payload}`)
}

const options: IClientOptions = {
  clientId: `mqtt-hello-${randomUUID().slice(0, 8)}`,
  password,
  reconnectPeriod: 5000,
  username,
}

const client = await mqtt.connectAsync(brokerUri, options)

console.log(`[mqtt-test] connected to ${brokerUri}`)
console.log(`[mqtt-test] node_id=${nodeId} interval_ms=${intervalMs}`)

await publish(
  client,
  `${rootTopic}/status/${nodeId}/online`,
  buildEnvelope('online', {
    battery_mv: 3900,
    fw_version: 'test-hello-1.0.0',
    net: {
      ip: '127.0.0.1',
      mac: '00:00:00:00:00:01',
      rssi: -42,
      ssid: 'mqtt-test',
    },
    node_type: 'env',
    reset_reason: 'software',
  }),
  1,
  true,
)

const timer = setInterval(() => {
  void publish(
    client,
    `${rootTopic}/sensor/${nodeId}/data`,
    buildEnvelope('sensor_data', {
      message: 'hello',
      sensor: 'test_input',
    }),
  ).catch((error) => {
    console.error('[mqtt-test] publish failed:', error)
  })
}, intervalMs)

async function shutdown() {
  clearInterval(timer)

  try {
    await publish(
      client,
      `${rootTopic}/status/${nodeId}/offline`,
      buildEnvelope('offline', {
        reason: 'shutdown',
      }),
      1,
      true,
    )
  } catch (error) {
    console.error('[mqtt-test] failed to publish offline event:', error)
  }

  await client.endAsync()
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown()
})

process.on('SIGTERM', () => {
  void shutdown()
})
