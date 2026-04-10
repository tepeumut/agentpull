import { homedir } from 'node:os'
import { join } from 'node:path'
import { ConfigSchema, DEFAULT_CONFIG } from '../types/config.js'
import type { Config } from '../types/config.js'
import type { AgentpullDefaults, RegistryEntry } from '../types/common.js'
import { readJson, writeJson, fileExists } from '../utils/fs.js'
import { ConfigError } from '../utils/errors.js'

const CONFIG_DIR = join(homedir(), '.agentpull')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function getConfigPath(): string {
  return CONFIG_PATH
}

export async function readConfig(): Promise<Config> {
  if (!(await fileExists(CONFIG_PATH))) {
    return DEFAULT_CONFIG
  }
  try {
    const raw = await readJson<unknown>(CONFIG_PATH)
    const result = ConfigSchema.safeParse(raw)
    if (!result.success) {
      throw new ConfigError(`Invalid config file at ${CONFIG_PATH}: ${result.error.message}`)
    }
    return result.data
  } catch (err) {
    if (err instanceof ConfigError) throw err
    throw new ConfigError(`Failed to read config: ${(err as Error).message}`)
  }
}

export async function writeConfig(config: Config): Promise<void> {
  try {
    // Global config lives in $HOME and may contain registry URLs — owner-only.
    await writeJson(CONFIG_PATH, config, { mode: 0o600 })
  } catch (err) {
    throw new ConfigError(`Failed to write config: ${(err as Error).message}`)
  }
}

export async function addRegistry(entry: RegistryEntry): Promise<void> {
  const config = await readConfig()
  const existing = config.registries.findIndex((r) => r.name === entry.name)
  if (existing !== -1) {
    config.registries[existing] = entry
  } else {
    config.registries.push(entry)
  }
  await writeConfig(config)
}

export async function removeRegistry(name: string): Promise<boolean> {
  const config = await readConfig()
  const before = config.registries.length
  config.registries = config.registries.filter((r) => r.name !== name)
  if (config.registries.length === before) return false
  await writeConfig(config)
  return true
}

export async function findRegistry(name: string): Promise<RegistryEntry | undefined> {
  const config = await readConfig()
  return config.registries.find((r) => r.name === name)
}

/** Keys that `agentpull config` is allowed to read/write. Aliased here so the
 *  command layer doesn't have to know which Zod field corresponds to which
 *  user-facing name. */
export const CONFIG_KEYS = ['conflictResolution', 'autoScan'] as const
export type ConfigKey = (typeof CONFIG_KEYS)[number]

export function isValidConfigKey(key: string): key is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key)
}

/**
 * Apply a single defaults override and persist. The new value is validated
 * against the same Zod schema used to load the file, so an invalid value
 * (wrong enum, wrong type) is rejected before it touches disk.
 */
export async function setDefault<K extends ConfigKey>(
  key: K,
  value: AgentpullDefaults[K],
): Promise<Config> {
  const config = await readConfig()
  const next: Config = {
    ...config,
    defaults: { ...config.defaults, [key]: value },
  }
  const parsed = ConfigSchema.safeParse(next)
  if (!parsed.success) {
    throw new ConfigError(`Invalid value for ${key}: ${parsed.error.message}`)
  }
  await writeConfig(parsed.data)
  return parsed.data
}

/** Reset a single defaults key to the schema default. */
export async function unsetDefault(key: ConfigKey): Promise<Config> {
  return setDefault(key, DEFAULT_CONFIG.defaults[key] as never)
}
