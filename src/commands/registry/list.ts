import type { Command } from 'commander'
import { readConfig } from '../../core/config.js'
import chalk from 'chalk'

export function registerRegistryListCommand(registry: Command): void {
  registry
    .command('list')
    .alias('ls')
    .description('List registered repositories')
    .action(async () => {
      const config = await readConfig()
      if (config.registries.length === 0) {
        console.log(chalk.dim('No repositories registered. Use: agentpull registry add <url>'))
        return
      }
      for (const r of config.registries) {
        const subdir = r.subdir ? chalk.dim(`/${r.subdir}`) : ''
        const ref = r.defaultRef ? chalk.dim(` @${r.defaultRef}`) : ''
        console.log(`${chalk.bold(r.name.padEnd(20))} ${r.url}${subdir}${ref}`)
      }
    })
}
