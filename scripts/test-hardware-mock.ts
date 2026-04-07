/**
 * 测试脚本：模拟 agent 调用所有 hardware mock tools，打印原始输出
 * 运行：bun scripts/test-hardware-mock.ts
 */

import { actuatorState, BLOCKS, getCameraSnapshot, readSensor } from '../src/main/tools/hardware-mock/data'

function section(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function toolResult(toolName: string, input: unknown, output: string) {
  console.log(`\n▶ tool: ${toolName}`)
  console.log(`  input: ${JSON.stringify(input)}`)
  console.log(`  output:\n${output.split('\n').map(l => '    ' + l).join('\n')}`)
}

// ── 1. list_blocks ────────────────────────────────────────────────────────────

section('list_blocks — all')
const allBlocks = BLOCKS
const listOutput = [
  `Found ${allBlocks.length} block(s) (filter: all):`,
  '',
  ...allBlocks.map(b =>
    `• [${b.status.toUpperCase()}] ${b.block_id} — ${b.capability} (${b.type}) | chip: ${b.chip} | fw: ${b.firmware} | battery: ${b.battery}%`
  ),
].join('\n')
toolResult('list_blocks', { status_filter: 'all' }, listOutput)

section('list_blocks — online only')
const onlineBlocks = BLOCKS.filter(b => b.status === 'online')
const onlineOutput = [
  `Found ${onlineBlocks.length} block(s) (filter: online):`,
  '',
  ...onlineBlocks.map(b =>
    `• [${b.status.toUpperCase()}] ${b.block_id} — ${b.capability} (${b.type}) | battery: ${b.battery}%`
  ),
].join('\n')
toolResult('list_blocks', { status_filter: 'online' }, onlineOutput)

// ── 2. get_sensor_data — 所有传感器 ──────────────────────────────────────────

section('get_sensor_data — all sensors (3 reads each to show jitter)')

const sensorBlocks = BLOCKS.filter(b => b.type === 'sensor' && b.status === 'online')

for (const block of sensorBlocks) {
  console.log(`\n  ── ${block.block_id} (${block.capability}) ──`)
  for (let i = 0; i < 3; i++) {
    const values = readSensor(block.capability)
    const ts = new Date().toISOString()
    const output = [
      `Sensor: ${block.block_id} (${block.capability})`,
      `Timestamp: ${ts}`,
      `Values:`,
      ...Object.entries(values).map(([k, v]) => `  ${k}: ${v}`),
    ].join('\n')
    toolResult('get_sensor_data', { block_id: block.block_id }, output)
  }
}

// ── 3. get_sensor_data — offline block (error case) ───────────────────────────

section('get_sensor_data — offline block (error case)')
toolResult(
  'get_sensor_data',
  { block_id: 'mic_01' },
  'Error: block "mic_01" is offline and cannot be read.'
)

// ── 4. get_camera_snapshot ────────────────────────────────────────────────────

section('get_camera_snapshot — 3 random scenes')

for (let i = 0; i < 3; i++) {
  const scene = getCameraSnapshot()
  const output = [
    `Camera snapshot from cam_01 at ${new Date().toISOString()}`,
    ``,
    `Scene description (vision analysis):`,
    scene,
  ].join('\n')
  toolResult('get_camera_snapshot', { block_id: 'cam_01' }, output)
}

// ── 5. control_actuator ───────────────────────────────────────────────────────

section('control_actuator — light commands')

const lightCmds = [
  { action: 'set_color', params: { r: 255, g: 0, b: 0, brightness: 80 } },
  { action: 'set_pattern', params: { pattern: 'breathing', speed: 1.0 } },
  { action: 'off', params: {} },
]

for (const cmd of lightCmds) {
  // simulate state mutation inline
  if (cmd.action === 'set_color') {
    actuatorState.light = { r: cmd.params.r, g: cmd.params.g, b: cmd.params.b, brightness: cmd.params.brightness, pattern: null }
  } else if (cmd.action === 'set_pattern') {
    actuatorState.light = { ...(actuatorState.light ?? { r: 255, g: 255, b: 255, brightness: 80 }), pattern: cmd.params.pattern }
  } else {
    actuatorState.light = { r: 0, g: 0, b: 0, brightness: 0, pattern: null }
  }
  const output = [
    `Command sent to light_01 (light): ${cmd.action}`,
    `Parameters: ${JSON.stringify(cmd.params)}`,
    ``,
    `Current actuator state:`,
    JSON.stringify(actuatorState.light, null, 2),
  ].join('\n')
  toolResult('control_actuator', { block_id: 'light_01', ...cmd }, output)
}

section('control_actuator — vibration commands')

const vibrCmds = [
  { action: 'pulse', params: { intensity: 70, duration_ms: 500 } },
  { action: 'pattern', params: { pattern: 'heartbeat', duration_ms: 2000 } },
  { action: 'off', params: {} },
]

for (const cmd of vibrCmds) {
  if (cmd.action === 'pulse') {
    actuatorState.vibration = { active: true, pattern: null, intensity: cmd.params.intensity }
  } else if (cmd.action === 'pattern') {
    actuatorState.vibration = { active: true, pattern: cmd.params.pattern, intensity: 70 }
  } else {
    actuatorState.vibration = { active: false, pattern: null, intensity: 0 }
  }
  const output = [
    `Command sent to vibr_01 (vibration): ${cmd.action}`,
    `Parameters: ${JSON.stringify(cmd.params)}`,
    ``,
    `Current actuator state:`,
    JSON.stringify(actuatorState.vibration, null, 2),
  ].join('\n')
  toolResult('control_actuator', { block_id: 'vibr_01', ...cmd }, output)
}

console.log('\n' + '═'.repeat(60))
console.log('  Done. 以上就是 agent 调用这些 tools 时会拿到的原始数据。')
console.log('═'.repeat(60) + '\n')
