export type HardwareMode = 'live' | 'mock'

export function resolveHardwareMode(): HardwareMode {
  const raw = (process.env.HARDWARE_MODE || 'live').trim().toLowerCase()
  return raw === 'mock' ? 'mock' : 'live'
}

export function isMockHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mock'
}
