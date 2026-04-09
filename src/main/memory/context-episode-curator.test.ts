// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import {
  compactEventForPrompt,
  summarizePayloadForPrompt,
} from './context-episode-curator'
import { ContextEpisodeCurator } from './context-episode-curator'

describe('context episode curator prompt compaction', () => {
  it('omits large binary payload fields such as image_base64', () => {
    const summary = summarizePayloadForPrompt({
      image_base64: 'a'.repeat(4000),
      mime_type: 'image/jpeg',
      snapshot_id: 'snap-1',
    })

    expect(summary).toEqual({
      image_base64: '[omitted image_base64; 4000 chars]',
      mime_type: 'image/jpeg',
      snapshot_id: 'snap-1',
    })
  })

  it('compacts events before sending them into the LLM prompt', () => {
    const event = compactEventForPrompt({
      capability: 'camera',
      confidence: 0.88,
      eventTsMs: 1_700_000_000_000,
      msgId: 'camera-evt-1',
      nodeId: 'cam_01',
      nodeType: 'cam',
      payload: {
        analysis_text: 'desk with monitor',
        image_base64: 'b'.repeat(5000),
        nested: {
          transcript: 'x'.repeat(220),
        },
      },
      recordedAt: '2026-04-09T10:00:00.000Z',
      scope: 'vision',
      signalName: 'snapshot',
      status: null,
      subject: 'snapshot',
      success: null,
      topic: 'direct/vision/cam_01/snapshot',
      type: 'camera_snapshot_final',
    })

    expect(event.payload.image_base64).toBe('[omitted image_base64; 5000 chars]')
    expect(String(event.payload.nested.transcript)).toContain('…(220 chars)')
    expect(event.msgId).toBeUndefined()
    expect(event.nodeId).toBe('cam_01')
  })

  it('inserts a new episode for fresh events after the latest stored episode', async () => {
    const inserted: Array<Record<string, unknown>> = []

    const curator = new ContextEpisodeCurator({
      configService: {
        getActiveModelId: () => null,
      } as never,
      contextEpisodes: {
        insertEpisode: async (row) => {
          inserted.push(row)
          return {
            ...row,
            created_at: '2026-04-09T10:05:00.000Z',
            home_id: '__global__',
            id: 'ep-new',
            updated_at: '2026-04-09T10:05:00.000Z',
          }
        },
        isEnabled: () => true,
        listEpisodes: async () => [
          {
            confidence: 0.8,
            context_type: 'resting_heart_monitoring',
            created_at: '2026-04-09T10:00:00.000Z',
            end_at: '2026-04-09T10:00:00.000Z',
            evidence: {},
            home_id: '__global__',
            id: 'ep-old',
            room_id: null,
            source: 'llm_scheduler',
            start_at: '2026-04-09T09:55:00.000Z',
            status: 'active',
            summary: 'Older resting heart monitoring batch.',
            updated_at: '2026-04-09T10:00:00.000Z',
          },
        ],
      } as never,
      hardwareEvents: {
        isEnabled: () => true,
        queryEvents: async () => ({
          count: 3,
          samples: [
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.91,
              eventTsMs: 3,
              msgId: 'evt-3',
              nodeId: 'heart_01',
              nodeType: 'hrox',
              payload: { bpm: 67, spo2: 98 },
              recordedAt: '2026-04-09T10:03:00.000Z',
              scope: 'sensor',
              signalName: 'reading',
              status: null,
              subject: 'data',
              success: null,
              topic: 'direct/sensor/heart_01/data',
              type: 'sensor_data',
            },
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.9,
              eventTsMs: 2,
              msgId: 'evt-2',
              nodeId: 'heart_01',
              nodeType: 'hrox',
              payload: { bpm: 66, spo2: 98 },
              recordedAt: '2026-04-09T10:02:00.000Z',
              scope: 'sensor',
              signalName: 'reading',
              status: null,
              subject: 'data',
              success: null,
              topic: 'direct/sensor/heart_01/data',
              type: 'sensor_data',
            },
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.89,
              eventTsMs: 1,
              msgId: 'evt-1',
              nodeId: 'heart_01',
              nodeType: 'hrox',
              payload: { bpm: 65, spo2: 99 },
              recordedAt: '2026-04-09T10:01:00.000Z',
              scope: 'sensor',
              signalName: 'reading',
              status: null,
              subject: 'data',
              success: null,
              topic: 'direct/sensor/heart_01/data',
              type: 'sensor_data',
            },
          ],
        }),
      } as never,
      registry: {} as never,
    })

    process.env.MEMORY_CURATOR_MOCK = 'true'
    try {
      await curator.runOnce()
    } finally {
      delete process.env.MEMORY_CURATOR_MOCK
    }

    expect(inserted).toHaveLength(1)
    expect(inserted[0]?.context_type).toBe('resting_heart_monitoring')
    expect(inserted[0]?.start_at).toBe('2026-04-09T10:01:00.000Z')
    expect(inserted[0]?.end_at).toBe('2026-04-09T10:03:00.000Z')
  })
})
