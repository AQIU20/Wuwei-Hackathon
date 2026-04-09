// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { compactEventForPrompt, summarizePayloadForPrompt } from './context-episode-curator'

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
})
