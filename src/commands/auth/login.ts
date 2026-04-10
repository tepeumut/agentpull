import type { Command } from 'commander'
import { isCancel, password, select, text } from '@clack/prompts'
import { storeCredential } from '../../security/keychain.js'
import { listProviders, getProvider } from '../../hosts/index.js'
import type { ProviderId } from '../../hosts/types.js'
import { logger } from '../../utils/logger.js'

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

interface LoginOptions {
  provider?: string
  host?: string
}

const TOKEN_DOC_URL: Record<ProviderId, string> = {
  github: 'https://github.com/settings/tokens',
  gitlab: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  bitbucket: 'https://bitbucket.org/account/settings/app-passwords/',
  azure: 'https://dev.azure.com/_usersSettings/tokens',
  git: '', // generic — depends on the host
}

export function registerAuthLoginCommand(auth: Command): void {
  auth
    .command('login')
    .description('Authenticate with a git host (stores credentials in OS keychain)')
    .option('--provider <id>', 'Provider id (github, gitlab, bitbucket, azure)')
    .option('--host <host>', 'Hostname (defaults to provider default)')
    .action(async (opts: LoginOptions) => {
      let providerId: ProviderId
      if (opts.provider) {
        providerId = opts.provider as ProviderId
      } else {
        const choice = await select<ProviderId>({
          message: 'Which git host?',
          options: listProviders()
            .filter((p) => p.id !== 'git')
            .map((p) => ({ value: p.id, label: p.displayName })),
        })
        providerId = exitIfCancelled(choice)
      }

      const provider = getProvider(providerId)
      let host = opts.host ?? provider.defaultHost
      if (provider.selfHosted && !opts.host) {
        const result = await text({
          message: `Hostname for ${provider.displayName}`,
          placeholder: provider.defaultHost,
          defaultValue: provider.defaultHost,
        })
        host = exitIfCancelled(result)
      }

      logger.info(`Authenticating with ${provider.displayName} (${host})`)
      if (TOKEN_DOC_URL[providerId]) {
        logger.dim(`Create a token at: ${TOKEN_DOC_URL[providerId]}`)
      }

      if (provider.usesPAT) {
        const result = await password({
          message: `Paste your ${provider.displayName} access token:`,
        })
        const token = exitIfCancelled(result)
        await storeCredential(providerId, host, { kind: 'token', token })
      } else {
        // Bitbucket-style: needs a username + app password pair.
        const usernameResult = await text({ message: 'Username:' })
        const username = exitIfCancelled(usernameResult)
        const passwordResult = await password({ message: 'App password:' })
        const appPassword = exitIfCancelled(passwordResult)
        await storeCredential(providerId, host, {
          kind: 'basic',
          username,
          password: appPassword,
        })
      }

      logger.success(`Credentials stored securely in OS keychain for ${providerId}@${host}`)
    })
}
