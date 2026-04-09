// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { ContextEpisodeService } from './context-episode-service'

describe('ContextEpisodeService', () => {
  it('normalizes null home_id to the global key for list and insert', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = []

    const service = new ContextEpisodeService({
      fetchImpl: async (input, init) => {
        requests.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          method: init?.method ?? 'GET',
          url: String(input),
        })

        return init?.method === 'POST'
          ? Response.json([
              {
                id: 'ep-1',
                home_id: '__global__',
                room_id: null,
                context_type: 'voice_interaction',
                start_at: '2026-04-09T00:00:00.000Z',
                end_at: '2026-04-09T00:05:00.000Z',
                confidence: 0.81,
                summary: 'The user interacted with the assistant by voice.',
                source: 'llm_scheduler',
                evidence: {},
                status: 'active',
                created_at: '2026-04-09T00:05:01.000Z',
                updated_at: '2026-04-09T00:05:01.000Z',
              },
            ])
          : Response.json([])
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'context_episodes',
    })

    await service.listEpisodes()
    await service.insertEpisode({
      home_id: null,
      room_id: null,
      context_type: 'voice_interaction',
      start_at: '2026-04-09T00:00:00.000Z',
      end_at: '2026-04-09T00:05:00.000Z',
      confidence: 0.81,
      summary: 'The user interacted with the assistant by voice.',
      source: 'llm_scheduler',
      evidence: {},
      status: 'active',
    })

    expect(requests[0]?.url).toContain('home_id=eq.__global__')
    expect(requests[1]?.body).toContain('"home_id":"__global__"')
  })

  it('emits change events on insert and update', async () => {
    const events: Array<{ id: string; type: 'insert' | 'update' }> = []

    const service = new ContextEpisodeService({
      fetchImpl: async (_input, init) => {
        if (init?.method === 'POST') {
          return Response.json([
            {
              id: 'ep-2',
              home_id: '__global__',
              room_id: null,
              context_type: 'resting_at_home',
              start_at: '2026-04-09T00:00:00.000Z',
              end_at: '2026-04-09T00:05:00.000Z',
              confidence: 0.77,
              summary: 'The user appeared to be resting at home.',
              source: 'llm_scheduler',
              evidence: {},
              status: 'active',
              created_at: '2026-04-09T00:05:01.000Z',
              updated_at: '2026-04-09T00:05:01.000Z',
            },
          ])
        }

        return new Response('', { status: 200 })
      },
      serviceRoleKey: 'service-role',
      supabaseUrl: 'https://example.supabase.co',
      tableName: 'context_episodes',
    })

    service.onEpisodeChanged((event) => {
      events.push(event)
    })

    await service.insertEpisode({
      home_id: null,
      room_id: null,
      context_type: 'resting_at_home',
      start_at: '2026-04-09T00:00:00.000Z',
      end_at: '2026-04-09T00:05:00.000Z',
      confidence: 0.77,
      summary: 'The user appeared to be resting at home.',
      source: 'llm_scheduler',
      evidence: {},
      status: 'active',
    })
    await service.updateEpisode('ep-2', {
      summary: 'The user appeared to be resting quietly at home.',
    })

    expect(events).toEqual([
      { id: 'ep-2', type: 'insert' },
      { id: 'ep-2', type: 'update' },
    ])
  })
})
