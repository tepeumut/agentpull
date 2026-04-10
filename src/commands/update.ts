import type { Command } from 'commander'
import { cwd } from 'node:process'
import { isCancel, select } from '@clack/prompts'
import { updateInstalled } from '../core/installer.js'
import { readManifest } from '../core/manifest.js'
import { logger } from '../utils/logger.js'

interface UpdateOptions {
  scan?: boolean
  force?: boolean
  yes?: boolean
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

/**
 * When the user runs `agentpull update` with no name and without `--yes`, ask
 * whether they want to update *everything* or pick one entry. With `--yes`
 * the historical behavior (update everything) is preserved for CI use.
 */
async function pickUpdateTarget(): Promise<string | undefined> {
  const manifest = await readManifest(cwd())
  if (manifest.installed.length === 0) {
    logger.warn('Nothing installed to update')
    return undefined
  }
  if (manifest.installed.length === 1) {
    // Only one entry — no point in asking, just update it.
    return manifest.installed[0].name
  }

  const choice = await select<string>({
    message: 'What should be updated?',
    options: [
      { value: '__all__', label: `All ${manifest.installed.length} installed entries` },
      ...manifest.installed.map((e) => ({
        value: e.name,
        label: e.name,
        hint: `pinned at ${e.commitSha.slice(0, 7)}`,
      })),
    ],
  })
  const picked = exitIfCancelled(choice)
  return picked === '__all__' ? undefined : picked
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [name]')
    .description(
      'Update installed agent configs (omit name to pick interactively or update all)',
    )
    .option('--scan', 'Run security scan on downloaded files before installing')
    .option(
      '--force',
      'Bypass the up-to-date check, evict the cached tarball, and overwrite every conflicting file (including hand-written ones)',
    )
    .option('-y, --yes', 'Skip the interactive picker and update all installed entries')
    .action(async (name: string | undefined, opts: UpdateOptions) => {
      let target = name
      if (!target && !opts.yes) {
        const picked = await pickUpdateTarget()
        if (picked === undefined && (await readManifest(cwd())).installed.length === 0) {
          return
        }
        target = picked
      }
      const summary = await updateInstalled({
        name: target,
        projectDir: cwd(),
        scan: opts.scan,
        force: opts.force,
      })
      const { updatedCount, upToDateCount, skippedCount } = summary
      const parts: string[] = []
      if (updatedCount > 0) parts.push(`${updatedCount} updated`)
      if (upToDateCount > 0) parts.push(`${upToDateCount} up to date`)
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`)
      if (parts.length === 0) return // nothing actionable — earlier warnings covered it
      if (updatedCount > 0) logger.success(`Update complete: ${parts.join(', ')}`)
      else logger.dim(parts.join(', '))
    })
}
