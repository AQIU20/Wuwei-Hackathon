// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { SupabaseMemoryService } from './supabase-memory-service'

describe('SupabaseMemoryService', () => {
  it('normalizes null home_id to the global key for list and insert-style upsert', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = []

    const service = new SupabaseMemoryService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })
        if (init?.method === 'POST') {
          return new Response('', { status: 201 })
        }
        return Response.json([])
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'agent_memories',
    })

    await service.listMemories()
    await service.upsertMemory({
      home_id: null,
      memory_type: 'preference',
      memory_key: 'response_language',
      memory_value: 'zh-CN',
      confidence: 0.99,
      evidence_count: 3,
      last_observed_at: '2026-04-09T00:00:00.000Z',
      reason: 'User explicitly asked for Chinese.',
      status: 'active',
    })

    expect(requests[0]?.url).toContain('home_id=eq.__global__')
    expect(requests[1]?.url).toContain('memory_key=eq.response_language')
    expect(requests[2]?.body).toContain('"home_id":"__global__"')
    expect(requests[2]?.body).toContain('"source_episode_ids":[]')
  })

  it('updates and deletes by memory_key under the global home id', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = []

    const service = new SupabaseMemoryService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })
        return new Response('', { status: 200 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'agent_memories',
    })

    await service.updateMemoryByKey('response_tone', 'concise', 'User corrected the tone.')
    await service.deleteMemoryByKey('response_tone')

    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toContain('home_id=eq.__global__')
    expect(requests[0]?.url).toContain('memory_key=eq.response_tone')
    expect(requests[0]?.body).toContain('"memory_value":"concise"')
    expect(requests[1]?.url).toContain('home_id=eq.__global__')
    expect(requests[1]?.url).toContain('memory_key=eq.response_tone')
    expect(requests[1]?.body).toContain('"status":"deleted"')
  })

  it('updates an existing active memory instead of relying on on_conflict', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = []

    const service = new SupabaseMemoryService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })

        if (init?.method === 'GET') {
          return Response.json([
            {
              id: 'mem-1',
              home_id: '__global__',
              memory_type: 'health',
              memory_key: 'resting_heart_rate_baseline',
              memory_value: 'Old baseline',
              confidence: 0.7,
              evidence_count: 2,
              last_observed_at: '2026-04-09T00:00:00.000Z',
              source_episode_ids: [],
              reason: null,
              status: 'active',
              created_at: '2026-04-09T00:00:00.000Z',
              updated_at: '2026-04-09T00:00:00.000Z',
            },
          ])
        }

        return new Response('', { status: 200 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'agent_memories',
    })

    await service.upsertMemory({
      home_id: null,
      memory_type: 'health',
      memory_key: 'resting_heart_rate_baseline',
      memory_value: 'New baseline',
      confidence: 0.84,
      evidence_count: 5,
      last_observed_at: '2026-04-09T05:40:00.000Z',
      source_episode_ids: ['episode-1'],
      reason: 'Updated from repeated episodes.',
      status: 'active',
    })

    expect(requests).toHaveLength(2)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[1]?.method).toBe('PATCH')
    expect(requests[1]?.url).toContain('id=eq.mem-1')
    expect(requests[1]?.body).toContain('"memory_value":"New baseline"')
    expect(requests[1]?.body).toContain('"source_episode_ids":["episode-1"]')
  })
})
