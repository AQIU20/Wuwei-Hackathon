import { describe, expect, it } from 'bun:test'
import { buildNodeCommandArgs } from './index'

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
})
