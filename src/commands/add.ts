import type { Command } from 'commander'
import { cwd } from 'node:process'
import { isCancel, select } from '@clack/prompts'
import { install } from '../core/installer.js'
import { readConfig } from '../core/config.js'
import { logger } from '../utils/logger.js'
import { RegistryError } from '../utils/errors.js'

interface AddOptions {
  ref?: string
  agent?: string
  scan?: boolean
  overwrite?: boolean
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

/**
 * Interactive picker for the registered repos. Returns the chosen short name,
 * or exits the process on Ctrl-C / empty registry.
 */
async function pickRegisteredRepo(): Promise<string> {
  const config = await readConfig()
  if (config.registries.length === 0) {
    throw new RegistryError(
      'No registered repositories. Run `agentpull registry add <url>` or `agentpull wizard` first.',
    )
  }
  const choice = await select<string>({
    message: 'Which repository should be installed?',
    options: config.registries.map((r) => ({
      value: r.name,
      label: r.name,
      hint: `${r.url}${r.subdir ? '/' + r.subdir : ''}${r.defaultRef ? '@' + r.defaultRef : ''}`,
    })),
  })
  return exitIfCancelled(choice)
}

export function registerAddCommand(program: Command): void {
  program
    .command('add [name]')
    .description('Add agent configs from a registered repository (omit name to pick interactively)')
    .option('--ref <ref>', 'Branch, tag, or commit to use')
    .option('--agent <types>', 'Comma-separated agent types to install (e.g., cursor,copilot)')
    .option('--scan', 'Run security scan on downloaded files before installing')
    .option('--overwrite', 'Overwrite existing files without prompting')
    .action(async (name: string | undefined, opts: AddOptions) => {
      const target = name ?? (await pickRegisteredRepo())
      const agentFilter = opts.agent ? opts.agent.split(',').map((s) => s.trim()) : undefined
      const result = await install({
        name: target,
        projectDir: cwd(),
        ref: opts.ref,
        agentFilter,
        scan: opts.scan,
        conflictResolution: opts.overwrite ? 'overwrite' : undefined,
      })
      // Only print the success line when something was actually installed —
      // otherwise the earlier warning ("No agent configuration files found",
      // "Nothing selected", "Installation aborted") was the real result.
      if (result.installed) {
        logger.success(`Done (${result.fileCount} file(s), ${result.agentTypes.join(', ')})`)
        process.exitCode = 0
      } else {
        process.exitCode = 1
      }
    })
}
