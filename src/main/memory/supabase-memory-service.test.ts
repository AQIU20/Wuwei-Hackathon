// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { SupabaseMemoryService } from './supabase-memory-service'

describe('SupabaseMemoryService', () => {
  it('normalizes null home_id to the global key for list and upsert', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = []

    const service = new SupabaseMemoryService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })
        return init?.method === 'POST'
          ? new Response('', { status: 201 })
          : Response.json([])
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
    expect(requests[1]?.url).toContain('on_conflict=home_id%2Cmemory_key')
    expect(requests[1]?.body).toContain('"home_id":"__global__"')
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
})
