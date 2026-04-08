export type HardwareMode = 'mqtt'

export function resolveHardwareMode(): HardwareMode {
  return 'mqtt'
}

export function isMqttHardwareMode(mode: HardwareMode): boolean {
  return mode === 'mqtt'
}
