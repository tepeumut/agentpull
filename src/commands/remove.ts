import type { Command } from 'commander'
import { cwd } from 'node:process'
import { confirm, isCancel, select } from '@clack/prompts'
import { uninstall } from '../core/installer.js'
import { readManifest } from '../core/manifest.js'
import { logger } from '../utils/logger.js'
import { ManifestError } from '../utils/errors.js'

interface RemoveOptions {
  force?: boolean
  yes?: boolean
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

async function pickInstalledEntry(): Promise<string> {
  const manifest = await readManifest(cwd())
  if (manifest.installed.length === 0) {
    throw new ManifestError('Nothing installed in this project')
  }
  const choice = await select<string>({
    message: 'Which entry should be removed?',
    options: manifest.installed.map((e) => ({
      value: e.name,
      label: e.name,
      hint: `${e.files.length} file(s) from ${e.source}`,
    })),
  })
  return exitIfCancelled(choice)
}

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove [name]')
    .alias('rm')
    .description('Remove installed agent configs (omit name to pick interactively)')
    .option('--force', 'Skip confirmation prompt (deprecated alias for --yes)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (name: string | undefined, opts: RemoveOptions) => {
      const target = name ?? (await pickInstalledEntry())
      const skipConfirm = opts.yes || opts.force
      if (!skipConfirm) {
        const ok = await confirm({
          message: `Remove "${target}" and all of its tracked files?`,
          initialValue: false,
        })
        if (!exitIfCancelled(ok)) {
          logger.warn('Removal cancelled')
          return
        }
      }
      await uninstall({ name: target, projectDir: cwd(), force: opts.force })
      logger.success(`Removed "${target}"`)
    })
}
