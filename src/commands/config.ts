import type { Command } from 'commander'
import {
  readConfig,
  setDefault,
  unsetDefault,
  isValidConfigKey,
  CONFIG_KEYS,
  type ConfigKey,
} from '../core/config.js'
import { ConfigError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'

const VALID_CONFLICT_RESOLUTIONS = ['prompt', 'skip', 'overwrite'] as const

/**
 * Parse a CLI string value into the strongly-typed value the schema wants.
 * Booleans accept the usual `true|false|yes|no|on|off|1|0` forms; the
 * `conflictResolution` enum is matched literally.
 */
function parseValue(key: ConfigKey, raw: string): boolean | (typeof VALID_CONFLICT_RESOLUTIONS)[number] {
  if (key === 'autoScan') {
    const v = raw.trim().toLowerCase()
    if (['true', 'yes', 'on', '1'].includes(v)) return true
    if (['false', 'no', 'off', '0'].includes(v)) return false
    throw new ConfigError(`autoScan must be a boolean (got: ${raw})`)
  }
  if (key === 'conflictResolution') {
    if (!(VALID_CONFLICT_RESOLUTIONS as readonly string[]).includes(raw)) {
      throw new ConfigError(
        `conflictResolution must be one of: ${VALID_CONFLICT_RESOLUTIONS.join(', ')} (got: ${raw})`,
      )
    }
    return raw as (typeof VALID_CONFLICT_RESOLUTIONS)[number]
  }
  throw new ConfigError(`Unknown config key: ${key}`)
}

function assertKey(key: string): asserts key is ConfigKey {
  if (!isValidConfigKey(key)) {
    throw new ConfigError(
      `Unknown config key "${key}". Valid keys: ${CONFIG_KEYS.join(', ')}`,
    )
  }
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('View and edit agentpull global defaults (~/.agentpull/config.json)')

  config
    .command('list')
    .alias('ls')
    .description('Show all current defaults')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const c = await readConfig()
      if (opts.json) {
        console.log(JSON.stringify(c.defaults, null, 2))
        return
      }
      for (const key of CONFIG_KEYS) {
        const value = c.defaults[key]
        console.log(`${chalk.bold(key.padEnd(22))} ${chalk.dim(String(value))}`)
      }
    })

  config
    .command('get <key>')
    .description(`Print one default value (keys: ${CONFIG_KEYS.join(', ')})`)
    .action(async (key: string) => {
      assertKey(key)
      const c = await readConfig()
      console.log(String(c.defaults[key]))
    })

  config
    .command('set <key> <value>')
    .description(`Set a default value (keys: ${CONFIG_KEYS.join(', ')})`)
    .action(async (key: string, value: string) => {
      assertKey(key)
      const parsed = parseValue(key, value)
      const next = await setDefault(key, parsed as never)
      logger.success(`Set ${key} = ${String(next.defaults[key])}`)
    })

  config
    .command('unset <key>')
    .description('Reset a default to its built-in value')
    .action(async (key: string) => {
      assertKey(key)
      const next = await unsetDefault(key)
      logger.success(`Reset ${key} → ${String(next.defaults[key])}`)
    })
}
