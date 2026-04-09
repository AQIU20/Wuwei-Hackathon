// @ts-nocheck
import { describe, expect, it } from 'bun:test'
import { createHeartRateTools } from './index'

describe('createHeartRateTools', () => {
  it('returns the latest live heart reading from the hardware store', async () => {
    const tools = createHeartRateTools({
      configService: {} as never,
      cwd: process.cwd(),
      getWebSearchConfig: () => ({ tavilyApiKey: '' }),
      hardware: {
        getSensorData: (blockId: string) => ({
          block: {
            block_id: blockId,
            capability: 'heart_rate_oximeter',
            last_seen_ms: Date.parse('2026-04-09T10:00:00.000Z'),
            status: 'online',
          },
          data: {
            bpm: 72,
            diastolic_mm_hg: 78,
            spo2: 98,
            systolic_mm_hg: 118,
            temperature_c: 36.7,
          },
        }),
        listBlocks: () => [
          {
            block_id: 'hr_8fcba4',
            capability: 'heart_rate_oximeter',
            last_seen_ms: Date.parse('2026-04-09T10:00:00.000Z'),
            status: 'online',
          },
        ],
      } as never,
      hardwareEvents: null,
      history: null,
      mqttBridge: null,
      registry: {} as never,
    })

    const tool = tools.find((entry) => entry.name === 'get_latest_heart_reading')
    const result = await tool.execute('tool-1', {})

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Heart block: hr_8fcba4')
    expect(result.content[0]?.text).toContain('BPM: 72')
    expect(result.content[0]?.text).toContain('SpO2: 98%')
    expect(result.content[0]?.text).toContain('Temperature: 36.7 C')
  })

  it('analyzes recent heart readings from hardware events', async () => {
    const tools = createHeartRateTools({
      configService: {} as never,
      cwd: process.cwd(),
      getWebSearchConfig: () => ({ tavilyApiKey: '' }),
      hardware: {
        getSensorData: () => null,
        listBlocks: () => [],
      } as never,
      hardwareEvents: {
        isEnabled: () => true,
        queryEvents: async () => ({
          count: 3,
          samples: [
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.92,
              eventTsMs: 3,
              msgId: 'hr-3',
              nodeId: 'hr_8fcba4',
              nodeType: 'hr',
              payload: { bpm: 74, spo2: 99 },
              recordedAt: '2026-04-09T10:03:00.000Z',
              scope: 'sensor',
              signalName: 'heart_sample',
              status: 'online',
              subject: 'data',
              success: true,
              topic: 'aihub/sensor/hr_8fcba4/data',
              type: 'sensor_data',
            },
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.91,
              eventTsMs: 2,
              msgId: 'hr-2',
              nodeId: 'hr_8fcba4',
              nodeType: 'hr',
              payload: { bpm: 72, spo2: 98 },
              recordedAt: '2026-04-09T10:02:00.000Z',
              scope: 'sensor',
              signalName: 'heart_sample',
              status: 'online',
              subject: 'data',
              success: true,
              topic: 'aihub/sensor/hr_8fcba4/data',
              type: 'sensor_data',
            },
            {
              capability: 'heart_rate_oximeter',
              confidence: 0.9,
              eventTsMs: 1,
              msgId: 'hr-1',
              nodeId: 'hr_8fcba4',
              nodeType: 'hr',
              payload: { bpm: 70, spo2: 97 },
              recordedAt: '2026-04-09T10:01:00.000Z',
              scope: 'sensor',
              signalName: 'heart_sample',
              status: 'online',
              subject: 'data',
              success: true,
              topic: 'aihub/sensor/hr_8fcba4/data',
              type: 'sensor_data',
            },
          ],
        }),
      } as never,
      history: null,
      mqttBridge: null,
      registry: {} as never,
    })

    const tool = tools.find((entry) => entry.name === 'analyze_recent_heart_readings')
    const result = await tool.execute('tool-2', { block_id: 'hr_8fcba4', lookback_minutes: 15 })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Block: hr_8fcba4')
    expect(result.content[0]?.text).toContain('Samples analyzed: 3')
    expect(result.content[0]?.text).toContain('Latest BPM: 74')
    expect(result.content[0]?.text).toContain('Average BPM: 72')
    expect(result.content[0]?.text).toContain('Average SpO2: 98%')
    expect(result.content[0]?.text).toContain('BPM range: 70-74')
    expect(result.content[0]?.text).toContain('SpO2 range: 97-99%')
  })
})
