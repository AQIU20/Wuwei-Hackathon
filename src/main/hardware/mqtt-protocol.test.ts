import { describe, expect, it } from 'bun:test'
import { normalizeAihubMqttEnvelope } from './mqtt-protocol'

describe('normalizeAihubMqttEnvelope', () => {
  it('maps hr_* sensor nodes to heart_rate_oximeter capability', () => {
    const row = normalizeAihubMqttEnvelope('aihub/sensor/hr_8fcba4/data', {
      msg_id: 'msg-hr-1',
      node_id: 'hr_8fcba4',
      payload: {
        bpm: 72,
        node_type: 'hr',
        sensor: 'max30102',
        spo2: 98,
      },
      ts: 1_712_345_678_901,
      type: 'sensor_data',
      v: 1,
    })

    expect(row.node_id).toBe('hr_8fcba4')
    expect(row.node_type).toBe('hr')
    expect(row.capability).toBe('heart_rate_oximeter')
    expect(row.scope).toBe('sensor')
    expect(row.subject).toBe('data')
    expect(row.type).toBe('sensor_data')
  })
})
