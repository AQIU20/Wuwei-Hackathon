// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import type { HardwareSnapshot } from '../hardware/store'
import { SupabaseHistoryService } from './supabase-history-service'

function createSnapshot(overrides?: Partial<HardwareSnapshot>): HardwareSnapshot {
  return {
    actuatorState: {},
    blocks: [
      {
        battery: 91,
        block_id: 'env_hello01',
        capability: 'environment',
        chip: 'ESP32-C3',
        firmware: '1.0.0',
        last_seen_ms: 1_712_345_678_901,
        latest: { temp_c: 24.3 },
        status: 'online',
        type: 'sensor',
      },
      {
        actuator: { brightness: 80, pattern: 'rainbow' },
        battery: 100,
        block_id: 'led_fd8480',
        capability: 'light',
        chip: 'ESP32-C3',
        firmware: '1.0.0',
        last_seen_ms: 1_712_345_679_500,
        status: 'online',
        type: 'actuator',
      },
    ],
    metrics: {
      bpm: null,
      hcho: null,
      humidity: null,
      temp: 24.3,
    },
    updatedAt: '2026-04-08T00:00:30.000Z',
    ...overrides,
  }
}

describe('SupabaseHistoryService', () => {
  it('writes recorded_at from each block last_seen_ms and persists multiple blocks independently', async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = []

    const service = new SupabaseHistoryService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })
        return new Response('', { status: 201 })
      },
      persistIntervalMs: 15_000,
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'hardware_history',
    })

    await service.persistSnapshot(createSnapshot(), 'mqtt_update')

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    const rows = JSON.parse(requests[0]?.body ?? '[]') as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]?.recorded_at).toBe('2024-04-05T19:34:38.901Z')
    expect(rows[1]?.recorded_at).toBe('2024-04-05T19:34:39.500Z')
    expect(rows[0]?.source).toBe('mqtt_update')
  })

  it('throttles history writes per block instead of globally', async () => {
    const requests: Array<Array<Record<string, unknown>>> = []
    const originalNow = Date.now

    try {
      const service = new SupabaseHistoryService({
        fetchImpl: async (_input, init) => {
          requests.push(JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>)
          return new Response('', { status: 201 })
        },
        persistIntervalMs: 60_000,
        serviceRoleKey: 'service-role',
        supabaseUrl: 'https://example.supabase.co',
        tableName: 'hardware_history',
      })

      Date.now = () => 2_000_000
      await service.persistSnapshot(
        createSnapshot({
          blocks: [
            {
              battery: 91,
              block_id: 'env_hello01',
              capability: 'environment',
              chip: 'ESP32-C3',
              firmware: '1.0.0',
              last_seen_ms: 1_712_345_678_901,
              latest: { temp_c: 24.3 },
              status: 'online',
              type: 'sensor',
            },
            {
              battery: 100,
              block_id: 'led_fd8480',
              capability: 'light',
              chip: 'ESP32-C3',
              firmware: '1.0.0',
              last_seen_ms: 1_712_345_679_500,
              status: 'online',
              type: 'actuator',
            },
          ],
        }),
        'mqtt_update',
      )

      Date.now = () => 2_030_000
      await service.persistSnapshot(
        createSnapshot({
          blocks: [
            {
              battery: 91,
              block_id: 'env_hello01',
              capability: 'environment',
              chip: 'ESP32-C3',
              firmware: '1.0.0',
              last_seen_ms: 1_712_345_678_950,
              latest: { temp_c: 24.4 },
              status: 'online',
              type: 'sensor',
            },
            {
              actuator: { brightness: 80, pattern: 'rainbow' },
              battery: 100,
              block_id: 'led_fd8480',
              capability: 'light',
              chip: 'ESP32-C3',
              firmware: '1.0.0',
              last_seen_ms: 1_712_345_800_000,
              status: 'online',
              type: 'actuator',
            },
          ],
        }),
        'mqtt_update',
      )

      expect(requests).toHaveLength(2)
      expect(requests[0]).toHaveLength(1)
      expect(requests[1]).toHaveLength(1)
      expect(requests[1]?.[0]?.block_id).toBe('led_fd8480')
    } finally {
      Date.now = originalNow
    }
  })
})
