import type { Command } from 'commander'
import { cwd } from 'node:process'
import { writeManifest, isInitialized, MANIFEST_FILENAME } from '../core/manifest.js'
import { EMPTY_MANIFEST } from '../types/manifest.js'
import { logger } from '../utils/logger.js'

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agentpull in the current project')
    .option('--force', 'Overwrite existing manifest if present')
    .action(async (opts: { force?: boolean }) => {
      const projectDir = cwd()

      if (!opts.force && (await isInitialized(projectDir))) {
        logger.warn(`${MANIFEST_FILENAME} already exists. Use --force to reinitialize.`)
        process.exit(0)
      }

      await writeManifest(projectDir, { ...EMPTY_MANIFEST })
      logger.success(`Created ${MANIFEST_FILENAME}`)
      logger.dim(`Next steps:`)
      logger.dim(`  agentpull registry add <url>   Register a repo`)
      logger.dim(`  agentpull add <name>           Install agent configs`)
    })
}
