import { describe, expect, it } from 'bun:test'
import { HardwareStore } from './store'

describe('HardwareStore voice state', () => {
  it('stores partial and final voice updates and exposes the latest state', () => {
    const store = new HardwareStore()

    store.upsertVoiceState({
      blockId: 'mic_01',
      confidence: 0.62,
      isFinal: false,
      language: 'en',
      text: 'turn on the',
      timestampMs: 1_700_000_000_000,
      trigger: false,
      utteranceId: 'utt-1',
    })

    let latest = store.getLatestVoiceState()
    expect(latest).not.toBeNull()
    expect(latest?.block.block_id).toBe('mic_01')
    expect(latest?.state.partial_text).toBe('turn on the')
    expect(latest?.state.text).toBeNull()
    expect(latest?.block.type).toBe('stream')
    expect(latest?.block.capability).toBe('microphone')

    store.upsertVoiceState({
      blockId: 'mic_01',
      confidence: 0.91,
      isFinal: true,
      language: 'en',
      text: 'turn on the desk light',
      timestampMs: 1_700_000_000_500,
      trigger: true,
      utteranceId: 'utt-1',
      wakeword: 'hey hub',
    })

    latest = store.getLatestVoiceState()
    expect(latest?.state.partial_text).toBeNull()
    expect(latest?.state.text).toBe('turn on the desk light')
    expect(latest?.state.trigger).toBe(true)
    expect(latest?.state.wakeword).toBe('hey hub')
    expect(latest?.state.last_finalized_at).toBe('2023-11-14T22:13:20.500Z')

    const byBlock = store.getVoiceState('mic_01')
    expect(byBlock?.block.latest).toEqual({
      confidence: 0.91,
      is_final: true,
      language: 'en',
      last_finalized_at: '2023-11-14T22:13:20.500Z',
      partial_text: null,
      text: 'turn on the desk light',
      trigger: true,
      triggered_at: '2023-11-14T22:13:20.500Z',
      updated_at: '2023-11-14T22:13:20.500Z',
      utterance_id: 'utt-1',
      wakeword: 'hey hub',
    })
  })
})

describe('HardwareStore camera snapshot state', () => {
  it('stores camera snapshots with image metadata and exposes the latest state', () => {
    const store = new HardwareStore()

    store.upsertCameraSnapshot({
      analysisText: 'desk with monitor and keyboard',
      blockId: 'cam_01',
      confidence: 0.88,
      imageUrl: 'https://cdn.example/cam_01/snap-1.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 48291,
      snapshotId: 'snap-1',
      timestampMs: 1_700_000_100_000,
      trigger: true,
      width: 1280,
      height: 720,
    })

    const byBlock = store.getCameraScene('cam_01')
    expect(byBlock).not.toBeNull()
    expect(byBlock?.scene).toBe('desk with monitor and keyboard')
    expect(byBlock?.state.snapshot_id).toBe('snap-1')
    expect(byBlock?.state.image_url).toBe('https://cdn.example/cam_01/snap-1.jpg')
    expect(byBlock?.state.mime_type).toBe('image/jpeg')
    expect(byBlock?.state.width).toBe(1280)
    expect(byBlock?.state.height).toBe(720)

    const block = store.getBlock('cam_01')
    expect(block?.type).toBe('stream')
    expect(block?.capability).toBe('camera')
    expect(block?.scene).toBe('desk with monitor and keyboard')
    expect(block?.latest).toEqual({
      analysis_text: 'desk with monitor and keyboard',
      captured_at: '2023-11-14T22:15:00.000Z',
      confidence: 0.88,
      image_base64: null,
      image_url: 'https://cdn.example/cam_01/snap-1.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 48291,
      snapshot_id: 'snap-1',
      trigger: true,
      triggered_at: '2023-11-14T22:15:00.000Z',
      updated_at: '2023-11-14T22:15:00.000Z',
      width: 1280,
      height: 720,
    })
  })
})
