import { Command } from 'commander'
import { registerInitCommand } from './commands/init.js'
import { registerWizardCommand } from './commands/wizard.js'
import { registerRegistryAddCommand } from './commands/registry/add.js'
import { registerRegistryListCommand } from './commands/registry/list.js'
import { registerRegistryRemoveCommand } from './commands/registry/remove.js'
import { registerAddCommand } from './commands/add.js'
import { registerUpdateCommand } from './commands/update.js'
import { registerRemoveCommand } from './commands/remove.js'
import { registerListCommand } from './commands/list.js'
import { registerScanCommand } from './commands/scan.js'
import { registerAuthLoginCommand } from './commands/auth/login.js'
import { registerAuthLogoutCommand } from './commands/auth/logout.js'
import { registerAuditCommand } from './commands/audit.js'
import { registerConfigCommand } from './commands/config.js'
import { registerCacheCommand } from './commands/cache.js'
import { AgentpullError } from './utils/errors.js'
import { logger } from './utils/logger.js'

// Injected at build time from package.json via tsup/vitest `define`.
const VERSION = __AGENTPULL_VERSION__

export function createProgram(): Command {
  const program = new Command()

  program
    .name('agentpull')
    .description('Pull AI agent configurations from any git host — tracked, verified, updatable')
    .version(VERSION)

  // Core commands
  registerInitCommand(program)
  registerWizardCommand(program)
  registerAddCommand(program)
  registerUpdateCommand(program)
  registerRemoveCommand(program)
  registerListCommand(program)
  registerScanCommand(program)
  registerAuditCommand(program)
  registerConfigCommand(program)
  registerCacheCommand(program)

  // Auth subcommand group
  const auth = program.command('auth').description('Authentication management')
  registerAuthLoginCommand(auth)
  registerAuthLogoutCommand(auth)

  // Registry subcommand group
  const registry = program.command('registry').description('Manage registered repositories')
  registerRegistryAddCommand(registry)
  registerRegistryListCommand(registry)
  registerRegistryRemoveCommand(registry)

  // Global error handler
  program.exitOverride()

  return program
}

export async function run(argv: string[]): Promise<void> {
  const program = createProgram()
  try {
    await program.parseAsync(argv)
  } catch (err) {
    if (err instanceof AgentpullError) {
      logger.error(`${err.message} [${err.code}]`)
      process.exit(1)
    }
    // Commander throws on --help / --version, which is fine
    if ((err as { code?: string }).code === 'commander.helpDisplayed') process.exit(0)
    if ((err as { code?: string }).code === 'commander.version') process.exit(0)
    throw err
  }
}
