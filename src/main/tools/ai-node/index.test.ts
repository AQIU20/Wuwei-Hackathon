import { describe, expect, it } from 'bun:test'
import { buildNodeCommandArgs, getPythonBin } from './index'

describe('buildNodeCommandArgs', () => {
  it('builds a status command with json-only output', () => {
    expect(buildNodeCommandArgs('/tmp/aht20xxx.py', 'status', { nodeId: 'heap_c13de8' })).toEqual([
      '/tmp/aht20xxx.py',
      'status',
      '--node-id',
      'heap_c13de8',
      '--json-only',
    ])
  })

  it('builds a ws2812 command with optional params', () => {
    expect(
      buildNodeCommandArgs('/tmp/aht20xxx.py', 'ws2812', {
        nodeId: 'led_fd8480',
        brightness: 180,
        effect: 'siri',
        hue: 260,
        speed: 25,
        stringPayload: true,
      }),
    ).toEqual([
      '/tmp/aht20xxx.py',
      'ws2812',
      '--node-id',
      'led_fd8480',
      '--json-only',
      '--effect',
      'siri',
      '--speed',
      '25',
      '--brightness',
      '180',
      '--hue',
      '260',
      '--string-payload',
    ])
  })

  it('builds a raw command with fill and pixel arguments', () => {
    expect(
      buildNodeCommandArgs('/tmp/aht20xxx.py', 'raw', {
        nodeId: 'heap_c13de8',
        fill: '255,32,0',
        pixels: '0:255,0,0;1:0,255,0',
      }),
    ).toEqual([
      '/tmp/aht20xxx.py',
      'raw',
      '--node-id',
      'heap_c13de8',
      '--json-only',
      '--fill',
      '255,32,0',
      '--pixels',
      '0:255,0,0;1:0,255,0',
    ])
  })

  it('builds an hr command with timeout override', () => {
    expect(
      buildNodeCommandArgs('/tmp/aht20xxx.py', 'hr', {
        nodeId: 'hr_8fcba4',
        timeout: 12,
      }),
    ).toEqual([
      '/tmp/aht20xxx.py',
      'hr',
      '--node-id',
      'hr_8fcba4',
      '--json-only',
      '--timeout',
      '12',
    ])
  })

  it('builds a sensor streaming command with count and timeout', () => {
    expect(
      buildNodeCommandArgs('/tmp/aht20xxx.py', 'sensor', {
        nodeId: 'hr_8fcba4',
        sensorCount: 3,
        timeout: 9,
      }),
    ).toEqual([
      '/tmp/aht20xxx.py',
      'sensor',
      '--node-id',
      'hr_8fcba4',
      '--json-only',
      '--timeout',
      '9',
      '--sensor-count',
      '3',
    ])
  })

  it('builds a watch command with watch duration', () => {
    expect(
      buildNodeCommandArgs('/tmp/aht20xxx.py', 'watch', {
        nodeId: 'hr_8fcba4',
        watchSeconds: 15,
      }),
    ).toEqual([
      '/tmp/aht20xxx.py',
      'watch',
      '--node-id',
      'hr_8fcba4',
      '--json-only',
      '--watch-seconds',
      '15',
    ])
  })

  it('prefers an absolute python3 fallback when no env override is set', () => {
    const previous = process.env.AI_NODE_PYTHON_BIN
    delete process.env.AI_NODE_PYTHON_BIN

    try {
      expect(getPythonBin()).toBe('/usr/bin/python3')
    } finally {
      if (previous === undefined) {
        delete process.env.AI_NODE_PYTHON_BIN
      } else {
        process.env.AI_NODE_PYTHON_BIN = previous
      }
    }
  })
})
