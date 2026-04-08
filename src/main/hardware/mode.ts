export type HardwareMode = 'live' | 'mock' | 'mqtt'

export function resolveHardwareMode(): HardwareMode {
  const raw = (process.env.HARDWARE_MODE || 'live').trim().toLowerCase()
  if (raw === 'mqtt') return 'mqtt'
  return raw === 'mock' ? 'mock' : 'live'
}

export function isMockHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mock'
}

export function isMqttHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mqtt'
}
