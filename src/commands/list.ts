import type { Command } from 'commander'
import { cwd } from 'node:process'
import { readManifest } from '../core/manifest.js'
import { verifyIntegrity } from '../core/installer.js'
import chalk from 'chalk'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List installed agent configs with integrity status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const manifest = await readManifest(cwd())
      if (opts.json) {
        console.log(JSON.stringify(manifest.installed, null, 2))
        return
      }
      if (manifest.installed.length === 0) {
        console.log(chalk.dim('Nothing installed. Use: agentpull add <name>'))
        return
      }
      for (const entry of manifest.installed) {
        const integrity = await verifyIntegrity(cwd(), entry.files)
        const status = integrity.ok
          ? chalk.green('✓')
          : chalk.yellow(`⚠ ${integrity.modified.length} modified`)
        console.log(
          `${status} ${chalk.bold(entry.name.padEnd(20))} ${chalk.dim(entry.source)} ${chalk.dim(`@${entry.commitSha.slice(0, 7)}`)}`,
        )
        console.log(
          chalk.dim(
            `   agents: ${entry.agentTypes.join(', ')} | files: ${entry.files.length} | updated: ${entry.updatedAt.slice(0, 10)}`,
          ),
        )
      }
    })
}
