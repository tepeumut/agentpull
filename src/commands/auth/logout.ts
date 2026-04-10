import type { Command } from 'commander'
import { isCancel, select } from '@clack/prompts'
import { deleteToken } from '../../security/keychain.js'
import { listProviders, getProvider } from '../../hosts/index.js'
import type { ProviderId } from '../../hosts/types.js'
import { logger } from '../../utils/logger.js'

interface LogoutOptions {
  provider?: string
  host?: string
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

export function registerAuthLogoutCommand(auth: Command): void {
  auth
    .command('logout')
    .description('Remove stored credentials for a git host')
    .option('--provider <id>', 'Provider id (github, gitlab, bitbucket, azure)')
    .option('--host <host>', 'Hostname (defaults to provider default)')
    .action(async (opts: LogoutOptions) => {
      let providerId: ProviderId
      if (opts.provider) {
        providerId = opts.provider as ProviderId
      } else {
        const choice = await select<ProviderId>({
          message: 'Which provider should be logged out?',
          options: listProviders()
            .filter((p) => p.id !== 'git')
            .map((p) => ({ value: p.id, label: p.displayName })),
        })
        providerId = exitIfCancelled(choice)
      }

      const provider = getProvider(providerId)
      const host = opts.host ?? provider.defaultHost

      await deleteToken(providerId, host)
      logger.success(`Cleared credentials for ${providerId}@${host}`)
    })
}
