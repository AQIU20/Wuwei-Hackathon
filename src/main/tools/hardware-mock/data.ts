/**
 * Mock hardware state — simulates a set of live ESP32 blocks.
 * Values drift slightly on each read to mimic real sensor noise.
 */

export interface BlockState {
  block_id: string
  type: 'sensor' | 'stream' | 'actuator'
  capability: string
  chip: string
  firmware: string
  battery: number
  status: 'online' | 'offline'
  last_seen_ms: number
}

export interface ActuatorState {
  light?: { r: number; g: number; b: number; brightness: number; pattern: string | null }
  vibration?: { active: boolean; pattern: string | null; intensity: number }
}

// ── registered blocks ────────────────────────────────────────────────────────

export const BLOCKS: BlockState[] = [
  {
    block_id: 'heart_01',
    type: 'sensor',
    capability: 'heart_rate',
    chip: 'ESP32-C3',
    firmware: '1.0.3',
    battery: 82,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'imu_01',
    type: 'sensor',
    capability: 'imu',
    chip: 'ESP32-C3',
    firmware: '1.0.1',
    battery: 91,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'env_01',
    type: 'sensor',
    capability: 'temperature',
    chip: 'ESP32-C3',
    firmware: '1.0.2',
    battery: 74,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'env_02',
    type: 'sensor',
    capability: 'humidity',
    chip: 'ESP32-C3',
    firmware: '1.0.2',
    battery: 74,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'air_01',
    type: 'sensor',
    capability: 'formaldehyde',
    chip: 'ESP32-C3',
    firmware: '1.0.0',
    battery: 67,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'cam_01',
    type: 'stream',
    capability: 'camera',
    chip: 'ESP32-S3',
    firmware: '2.1.0',
    battery: 100,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'light_01',
    type: 'actuator',
    capability: 'light',
    chip: 'ESP32-C3',
    firmware: '1.2.0',
    battery: 100,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  {
    block_id: 'vibr_01',
    type: 'actuator',
    capability: 'vibration',
    chip: 'ESP32-C3',
    firmware: '1.1.0',
    battery: 88,
    status: 'online',
    last_seen_ms: Date.now(),
  },
  // One offline module to make list interesting
  {
    block_id: 'mic_01',
    type: 'stream',
    capability: 'microphone',
    chip: 'ESP32-S3',
    firmware: '2.0.1',
    battery: 0,
    status: 'offline',
    last_seen_ms: Date.now() - 120_000,
  },
]

// ── mutable actuator state ───────────────────────────────────────────────────

export const actuatorState: ActuatorState = {
  light: { r: 0, g: 0, b: 0, brightness: 0, pattern: null },
  vibration: { active: false, pattern: null, intensity: 0 },
}

// ── sensor reading generators ────────────────────────────────────────────────

function jitter(base: number, range: number): number {
  return parseFloat((base + (Math.random() - 0.5) * 2 * range).toFixed(2))
}

export function readSensor(capability: string): Record<string, number> {
  switch (capability) {
    case 'heart_rate':
      return { bpm: jitter(72, 4), spo2: jitter(98, 1) }
    case 'imu':
      return {
        ax: jitter(0.05, 0.1),
        ay: jitter(-0.2, 0.1),
        az: jitter(9.81, 0.05),
        gx: jitter(0, 0.5),
        gy: jitter(0, 0.5),
        gz: jitter(0, 0.5),
      }
    case 'temperature':
      return { temp_c: jitter(24.5, 0.3) }
    case 'humidity':
      return { rh: jitter(55.0, 2) }
    case 'formaldehyde':
      return { hcho_mg: jitter(0.03, 0.005) }
    default:
      return {}
  }
}

// ── camera scene descriptions ────────────────────────────────────────────────

const CAMERA_SCENES = [
  'A well-lit desk with a laptop, a coffee mug, and scattered papers. A person is visible in the background standing near a window.',
  'A quiet living room. Natural daylight. No people visible. A cat is sleeping on the sofa.',
  'Office environment. Two people are having a conversation near a whiteboard covered with diagrams.',
  'Dim bedroom at night. Lamp is on. A person appears to be reading on the bed.',
  'Kitchen area. Someone is preparing food at the counter. Bright overhead lighting.',
]

export function getCameraSnapshot(): string {
  return CAMERA_SCENES[Math.floor(Math.random() * CAMERA_SCENES.length)]
}
