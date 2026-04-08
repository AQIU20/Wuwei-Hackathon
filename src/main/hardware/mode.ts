export type HardwareMode = 'mock' | 'mqtt'

export function resolveHardwareMode(): HardwareMode {
  const raw = (process.env.HARDWARE_MODE || 'mock').trim().toLowerCase()
  if (raw === 'mqtt') return 'mqtt'
  return 'mock'
}

export function isMockHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mock'
}

export function isMqttHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mqtt'
}
