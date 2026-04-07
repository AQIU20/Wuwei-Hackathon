import type { WebSearchConfig } from '../providers/types'
import type { HardwareStore } from '../hardware/store'
import type { SupabaseHistoryService } from '../history/supabase-history-service'

export interface ToolContext {
  cwd: string
  getWebSearchConfig: () => WebSearchConfig
  hardware: HardwareStore
  history: SupabaseHistoryService | null
}
