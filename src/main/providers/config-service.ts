import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBuiltInProviders } from './built-in'
import type { AppConfig, ProviderConfig, WebSearchConfig } from './types'
import { EMPTY_CONFIG } from './types'

const CONFIG_FILENAME = 'providers.json'

export class ConfigService {
  private configPath: string
  private config: AppConfig = {
    ...EMPTY_CONFIG,
    providers: [],
    webSearch: { ...EMPTY_CONFIG.webSearch },
  }

  constructor(configDir?: string) {
    const dir = configDir || join(process.env.AGENT_DATA_DIR || process.cwd(), 'config')
    mkdirSync(dir, { recursive: true })
    this.configPath = join(dir, CONFIG_FILENAME)
  }

  /** Initialize: load existing config or create from built-ins */
  init(): void {
    if (existsSync(this.configPath)) {
      this.load()
    } else {
      this.initFromScratch()
    }

    this.applyEnvironmentOverrides()
    console.log(
      '[config] initialized:',
      this.config.providers.length,
      'providers,',
      'active:',
      this.config.activeModelId,
    )
  }

  getProviders(): ProviderConfig[] {
    return this.config.providers
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.config.providers.find((p) => p.id === id)
  }

  getActiveModelId(): string | null {
    return this.config.activeModelId
  }

  getWebSearchConfig(): WebSearchConfig {
    return this.config.webSearch
  }

  /** Save a provider (add or update by id) */
  saveProvider(provider: ProviderConfig): void {
    const idx = this.config.providers.findIndex((p) => p.id === provider.id)
    if (idx >= 0) {
      this.config.providers[idx] = provider
    } else {
      this.config.providers.push(provider)
    }
    this.persist()
  }

  /** Remove a provider by id */
  deleteProvider(id: string): void {
    this.config.providers = this.config.providers.filter((p) => p.id !== id)
    // Clear active model if it belonged to the deleted provider
    if (this.config.activeModelId?.startsWith(`${id}/`)) {
      this.config.activeModelId = null
    }
    this.persist()
  }

  /** Set the active model */
  setActiveModel(modelKey: string | null): void {
    this.config.activeModelId = modelKey
    this.persist()
  }

  saveWebSearchConfig(webSearch: WebSearchConfig): void {
    this.config.webSearch = webSearch
    this.persist()
  }

  // --- Private ---

  private load(): void {
    try {
      const raw = readFileSync(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw) as AppConfig
      // Merge built-in providers: ensure all built-ins exist, preserve user's API keys
      this.config = this.mergeWithBuiltIns(parsed)
      this.persist()
    } catch (err) {
      console.error('[config] failed to parse config, resetting:', err)
      this.initFromScratch()
    }
  }

  private initFromScratch(): void {
    const builtIns = createBuiltInProviders()
    this.config = {
      providers: builtIns,
      activeModelId: this.pickDefaultModel(builtIns),
      webSearch: { ...EMPTY_CONFIG.webSearch },
    }
    this.persist()
  }

  /** Ensure all built-in providers exist in config, preserving user data */
  private mergeWithBuiltIns(saved: AppConfig): AppConfig {
    const builtIns = createBuiltInProviders()
    const merged = [...saved.providers]

    for (const builtIn of builtIns) {
      const existing = merged.find((p) => p.id === builtIn.id)
      if (!existing) {
        // Built-in not in saved config — add it (unconfigured)
        merged.push(builtIn)
      } else {
        // Refresh models from pi-ai registry, but preserve user-added models
        const builtInIds = new Set(builtIn.models.map((m) => m.id))
        const userModels = existing.models.filter((m) => !builtInIds.has(m.id))
        existing.models = [...builtIn.models, ...userModels]
        existing.api = builtIn.api
        existing.baseUrl = builtIn.baseUrl
        existing.isBuiltIn = true
      }
    }

    return {
      providers: merged,
      activeModelId: saved.activeModelId ?? this.pickDefaultModel(merged),
      webSearch: {
        ...EMPTY_CONFIG.webSearch,
        ...saved.webSearch,
      },
    }
  }

  private applyEnvironmentOverrides(): void {
    const envProviderKeys: Record<string, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      'google-vertex': process.env.GOOGLE_VERTEX_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    }

    this.config.providers = this.config.providers.map((provider) => {
      const apiKey = envProviderKeys[provider.id]
      return apiKey ? { ...provider, apiKey } : provider
    })

    this.config.webSearch = {
      ...this.config.webSearch,
      tavilyApiKey: process.env.TAVILY_API_KEY || this.config.webSearch.tavilyApiKey,
    }

    const envActiveModelId = process.env.AGENT_MODEL
    if (envActiveModelId) {
      this.config.activeModelId = envActiveModelId
      return
    }

    if (!this.config.activeModelId) {
      this.config.activeModelId = this.pickDefaultModel(this.config.providers)
    }
  }

  private pickDefaultModel(providers: ProviderConfig[]): string | null {
    const configuredProvider = providers.find((provider) => provider.apiKey && provider.models.length > 0)
    if (configuredProvider) {
      const preferredModel =
        configuredProvider.models.find((model) => model.id === 'gpt-5-mini') ??
        configuredProvider.models.find((model) => model.id === 'gpt-4.1') ??
        configuredProvider.models[0]

      return preferredModel ? `${configuredProvider.id}/${preferredModel.id}` : null
    }

    return null
  }

  /** Atomic write: temp file → rename */
  private persist(): void {
    try {
      const json = JSON.stringify(this.config, null, 2)
      const tmpPath = join(tmpdir(), `agent-desktop-config-${Date.now()}.tmp`)
      writeFileSync(tmpPath, json, 'utf-8')
      renameSync(tmpPath, this.configPath)
    } catch (err) {
      console.error('[config] failed to persist config:', err)
    }
  }
}
