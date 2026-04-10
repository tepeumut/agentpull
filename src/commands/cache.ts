import type { Command } from 'commander'
import { readdir, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileExists } from '../utils/fs.js'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'

const CACHE_DIR = join(homedir(), '.agentpull', 'cache')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function registerCacheCommand(program: Command): void {
  const cache = program
    .command('cache')
    .description('Manage the local tarball cache (~/.agentpull/cache/)')

  cache
    .command('list')
    .alias('ls')
    .description('List cached tarballs with size')
    .action(async () => {
      if (!(await fileExists(CACHE_DIR))) {
        console.log(chalk.dim('Cache is empty.'))
        return
      }
      const entries = await readdir(CACHE_DIR)
      if (entries.length === 0) {
        console.log(chalk.dim('Cache is empty.'))
        return
      }
      let total = 0
      for (const name of entries.sort()) {
        const full = join(CACHE_DIR, name)
        const st = await stat(full).catch(() => null)
        if (!st || !st.isFile()) continue
        total += st.size
        console.log(`  ${chalk.dim(formatBytes(st.size).padStart(9))}  ${name}`)
      }
      console.log(chalk.dim(`\n${entries.length} entries, ${formatBytes(total)} total`))
    })

  cache
    .command('clear')
    .description('Delete every cached tarball. Next install/update re-downloads from the source host.')
    .action(async () => {
      if (!(await fileExists(CACHE_DIR))) {
        logger.dim('Cache is already empty.')
        return
      }
      const entries = await readdir(CACHE_DIR)
      let removed = 0
      for (const name of entries) {
        await rm(join(CACHE_DIR, name), { force: true, recursive: true }).catch(() => undefined)
        removed++
      }
      logger.success(`Cleared ${removed} cached file(s) from ${CACHE_DIR}`)
    })
}
