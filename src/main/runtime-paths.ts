import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface RuntimePaths {
  configDir: string
  cwd: string
  dataDir: string
  memoryDir: string
  sessionDir: string
}

function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

export function resolveRuntimePaths(): RuntimePaths {
  const cwd = resolve(process.env.AGENT_WORKSPACE_DIR || process.cwd())
  const dataDir = ensureDir(resolve(process.env.AGENT_DATA_DIR || join(cwd, '.unforce-make-server')))

  return {
    cwd,
    dataDir,
    configDir: ensureDir(join(dataDir, 'config')),
    memoryDir: ensureDir(join(dataDir, 'memory')),
    sessionDir: ensureDir(join(dataDir, 'sessions')),
  }
}
