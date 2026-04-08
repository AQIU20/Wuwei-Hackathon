import type { AihubMqttBridge } from '../hardware/mqtt-bridge'
import type { HardwareStore } from '../hardware/store'
import type { HardwareEventService } from '../history/hardware-event-service'
import type { SupabaseHistoryService } from '../history/supabase-history-service'
import type { WebSearchConfig } from '../providers/types'

export interface ToolContext {
  cwd: string
  getWebSearchConfig: () => WebSearchConfig
  hardware: HardwareStore
  hardwareEvents: HardwareEventService | null
  history: SupabaseHistoryService | null
  mqttBridge?: AihubMqttBridge | null
}
