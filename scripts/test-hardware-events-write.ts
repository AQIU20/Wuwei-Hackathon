import { randomUUID } from 'node:crypto'
import { HardwareEventService } from '../src/main/history/hardware-event-service'

const service = new HardwareEventService()

if (!service.isEnabled()) {
  console.error(
    '[hardware-events-test] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Aborting write test.',
  )
  process.exit(1)
}

const nodeId = (process.env.MQTT_TEST_NODE_ID || 'env_writecheck01').trim()
const rootTopic = (process.env.MQTT_ROOT_TOPIC || 'aihub').trim() || 'aihub'
const msgId = `writecheck-${randomUUID().slice(0, 8)}`
const now = Date.now()
const topic = `${rootTopic}/sensor/${nodeId}/data`

await service.insertMqttEnvelope(topic, {
  msg_id: msgId,
  node_id: nodeId,
  payload: {
    message: 'hardware-events-write-check',
    node_type: 'env',
    sensor: 'test_input',
  },
  ts: now,
  type: 'sensor_data',
  v: 1,
})

const sample = await service.getEventByMsgId(msgId)

if (!sample) {
  console.error(`[hardware-events-test] Inserted msg_id=${msgId} but could not read it back.`)
  process.exit(1)
}

console.log('[hardware-events-test] write verified')
console.log(
  JSON.stringify(
    {
      capability: sample.capability,
      msgId: sample.msgId,
      nodeId: sample.nodeId,
      recordedAt: sample.recordedAt,
      scope: sample.scope,
      topic: sample.topic,
      type: sample.type,
    },
    null,
    2,
  ),
)
