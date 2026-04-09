// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { HardwareEventService } from './hardware-event-service'

describe('HardwareEventService', () => {
  it('writes normalized MQTT envelopes into the hardware_events table', async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = []

    const service = new HardwareEventService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })

        return new Response('', { status: 201 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'hardware_events',
    })

    await service.insertMqttEnvelope(
      'aihub/sensor/env_hello01/data',
      {
        msg_id: 'msg-123',
        node_id: 'env_hello01',
        payload: {
          message: 'hello',
          node_type: 'env',
          sensor: 'test_input',
        },
        ts: 1_712_345_678_901,
        type: 'sensor_data',
        v: 1,
      },
      {
        meta: { qos: 1 },
      },
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(
      'https://example.supabase.co/rest/v1/hardware_events?on_conflict=msg_id',
    )

    const [row] = JSON.parse(requests[0]?.body ?? '[]') as Array<Record<string, unknown>>
    expect(row?.msg_id).toBe('msg-123')
    expect(row?.scope).toBe('sensor')
    expect(row?.subject).toBe('data')
    expect(row?.node_id).toBe('env_hello01')
    expect(row?.node_type).toBe('env')
    expect(row?.capability).toBe('environment')
    expect(row?.signal_name).toBeNull()
    expect(row?.source).toBe('mqtt')
  })

  it('can read back a stored event by msg_id', async () => {
    const service = new HardwareEventService({
      fetchImpl: async () =>
        Response.json([
          {
            capability: 'environment',
            confidence: null,
            event_ts_ms: 1_712_345_678_901,
            msg_id: 'msg-456',
            node_id: 'env_hello01',
            node_type: 'env',
            payload: { message: 'hello' },
            recorded_at: '2026-04-08T00:00:00.000Z',
            scope: 'sensor',
            signal_name: 'message',
            status: null,
            subject: 'data',
            success: null,
            topic: 'aihub/sensor/env_hello01/data',
            type: 'sensor_data',
          },
        ]),
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'hardware_events',
    })

    const sample = await service.getEventByMsgId('msg-456')

    expect(sample).not.toBeNull()
    expect(sample?.msgId).toBe('msg-456')
    expect(sample?.nodeId).toBe('env_hello01')
    expect(sample?.payload).toEqual({ message: 'hello' })
  })

  it('writes direct voice ingress events into the hardware_events table', async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = []

    const service = new HardwareEventService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })

        return new Response('', { status: 201 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'hardware_events',
    })

    await service.insertDirectEvent({
      capability: 'microphone',
      chip_family: null,
      confidence: 0.91,
      event_ts_ms: 1_712_345_678_901,
      home_id: null,
      ingest_trace_id: 'utt-123',
      mac_suffix: null,
      meta: { ingress: 'direct_http_voice' },
      msg_id: 'voice-evt-1',
      node_id: 'mic_01',
      node_type: 'mic',
      payload: { text: 'turn on the light', trigger: true, utterance_id: 'utt-123' },
      protocol_version: 1,
      recorded_at: '2026-04-08T00:00:00.000Z',
      room_id: null,
      scope: 'voice',
      signal_name: 'triggered_transcript',
      source: 'direct_voice_ingress',
      status: null,
      subject: 'transcript',
      success: null,
      topic: 'direct/voice/mic_01/transcript',
      type: 'voice_transcript_final',
    })

    expect(requests).toHaveLength(1)
    const [row] = JSON.parse(requests[0]?.body ?? '[]') as Array<Record<string, unknown>>
    expect(row?.node_id).toBe('mic_01')
    expect(row?.scope).toBe('voice')
    expect(row?.capability).toBe('microphone')
    expect(row?.signal_name).toBe('triggered_transcript')
    expect(row?.source).toBe('direct_voice_ingress')
  })

  it('writes direct camera ingress events into the hardware_events table', async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = []

    const service = new HardwareEventService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })

        return new Response('', { status: 201 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'hardware_events',
    })

    await service.insertDirectEvent({
      capability: 'camera',
      chip_family: null,
      confidence: 0.88,
      event_ts_ms: 1_712_345_678_901,
      home_id: null,
      ingest_trace_id: 'snap-123',
      mac_suffix: null,
      meta: { ingress: 'direct_http_camera', has_image_url: true },
      msg_id: 'camera-evt-1',
      node_id: 'cam_01',
      node_type: 'cam',
      payload: {
        analysis_text: 'desk with monitor and keyboard',
        image_url: 'https://cdn.example/cam_01/snap-123.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 48291,
        snapshot_id: 'snap-123',
        trigger: true,
      },
      protocol_version: 1,
      recorded_at: '2026-04-08T00:00:00.000Z',
      room_id: null,
      scope: 'vision',
      signal_name: 'triggered_snapshot',
      source: 'direct_camera_ingress',
      status: null,
      subject: 'snapshot',
      success: null,
      topic: 'direct/vision/cam_01/snapshot',
      type: 'camera_snapshot_final',
    })

    expect(requests).toHaveLength(1)
    const [row] = JSON.parse(requests[0]?.body ?? '[]') as Array<Record<string, unknown>>
    expect(row?.node_id).toBe('cam_01')
    expect(row?.scope).toBe('vision')
    expect(row?.capability).toBe('camera')
    expect(row?.signal_name).toBe('triggered_snapshot')
    expect(row?.source).toBe('direct_camera_ingress')
  })
})
