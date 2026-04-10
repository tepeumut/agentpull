import type { Command } from 'commander'
import { confirm, isCancel, select } from '@clack/prompts'
import { readConfig, removeRegistry } from '../../core/config.js'
import { logger } from '../../utils/logger.js'
import { RegistryError } from '../../utils/errors.js'

interface RemoveOptions {
  yes?: boolean
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

async function pickRegisteredRepo(): Promise<string> {
  const config = await readConfig()
  if (config.registries.length === 0) {
    throw new RegistryError('No registered repositories to remove')
  }
  const choice = await select<string>({
    message: 'Which registered repository should be removed?',
    options: config.registries.map((r) => ({
      value: r.name,
      label: r.name,
      hint: `${r.url}${r.subdir ? '/' + r.subdir : ''}`,
    })),
  })
  return exitIfCancelled(choice)
}

export function registerRegistryRemoveCommand(registry: Command): void {
  registry
    .command('remove [name]')
    .alias('rm')
    .description('Remove a registered repository (omit name to pick interactively)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (name: string | undefined, opts: RemoveOptions) => {
      const target = name ?? (await pickRegisteredRepo())
      if (!opts.yes) {
        const ok = await confirm({
          message: `Remove registry entry "${target}"? (does not touch installed files)`,
          initialValue: false,
        })
        if (!exitIfCancelled(ok)) {
          logger.warn('Cancelled')
          return
        }
      }
      const removed = await removeRegistry(target)
      if (removed) {
        logger.success(`Removed registry "${target}"`)
      } else {
        logger.warn(`No registry named "${target}" found`)
      }
    })
}
