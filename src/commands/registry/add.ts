import type { Command } from 'commander'
import { isCancel, select, text } from '@clack/prompts'
import { addRegistry } from '../../core/config.js'
import { parseRepoUrl } from '../../core/registry.js'
import { listProviders, getProvider } from '../../hosts/index.js'
import { logger } from '../../utils/logger.js'
import { RegistryError } from '../../utils/errors.js'
import type { ProviderId } from '../../hosts/types.js'

interface AddOptions {
  name?: string
  ref?: string
  provider?: string
  host?: string
}

function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

/**
 * Prompt-driven flow used when the user runs `agentpull registry add` without a
 * URL. Mirrors the wizard's auth-less subset: provider → host (if self-hosted)
 * → URL → optional ref → optional name. Returns the values to be persisted.
 */
async function promptForEntry(opts: AddOptions): Promise<{
  url: string
  providerId: ProviderId
  host?: string
  name?: string
  ref?: string
}> {
  const providerId =
    (opts.provider as ProviderId | undefined) ??
    exitIfCancelled(
      await select<ProviderId>({
        message: 'Which git host?',
        options: listProviders().map((p) => ({
          value: p.id,
          label: p.displayName,
          hint: p.id === 'git' ? 'shallow git clone fallback' : undefined,
        })),
      }),
    )

  const provider = getProvider(providerId)
  let host = opts.host
  if (provider.selfHosted && !host) {
    const result = await text({
      message: `Hostname for ${provider.displayName}`,
      placeholder: provider.defaultHost || 'example.com',
      defaultValue: provider.defaultHost,
    })
    host = exitIfCancelled(result) || provider.defaultHost
  }

  const url = exitIfCancelled(
    await text({
      message: 'Repository URL or shorthand',
      placeholder:
        providerId === 'github'
          ? 'anthropics/claude-code'
          : providerId === 'gitlab'
            ? 'https://gitlab.com/group/project'
            : providerId === 'bitbucket'
              ? 'https://bitbucket.org/workspace/repo'
              : providerId === 'azure'
                ? 'https://dev.azure.com/org/project/_git/repo'
                : 'https://example.com/owner/repo.git',
      validate(value) {
        if (!value || value.trim().length === 0) return 'Enter a URL or shorthand'
        const parsed = parseRepoUrl(value, providerId)
        if (!parsed) return `Cannot parse as a ${provider.displayName} URL`
        return undefined
      },
    }),
  )

  const refInput = exitIfCancelled(
    await text({
      message: 'Default branch or tag (optional)',
      placeholder: 'HEAD',
      defaultValue: '',
    }),
  )
  const ref = refInput.trim() || opts.ref

  const nameInput = exitIfCancelled(
    await text({
      message: 'Short name (optional)',
      placeholder: '(derived from repo or last subdir segment)',
      defaultValue: '',
    }),
  )
  const name = nameInput.trim() || opts.name

  return { url, providerId, host, name, ref }
}

export function registerRegistryAddCommand(registry: Command): void {
  registry
    .command('add [url]')
    .description('Register a repository from any supported git host (omit URL for interactive mode)')
    .option('-n, --name <name>', 'Short name (defaults to repo or last path segment)')
    .option('-r, --ref <ref>', 'Default branch or tag')
    .option(
      '-p, --provider <id>',
      'Force a provider (github, gitlab, bitbucket, azure, git) — useful for self-hosted instances or the generic git fallback',
    )
    .option('--host <host>', 'Override the host (for self-hosted instances)')
    .action(async (urlArg: string | undefined, opts: AddOptions) => {
      let url: string
      let providerHint: ProviderId | undefined = opts.provider as ProviderId | undefined
      let hostOverride = opts.host
      let nameOverride = opts.name
      let refOverride = opts.ref

      if (urlArg) {
        url = urlArg
      } else {
        const fields = await promptForEntry(opts)
        url = fields.url
        providerHint = fields.providerId
        hostOverride = fields.host ?? hostOverride
        nameOverride = fields.name ?? nameOverride
        refOverride = fields.ref ?? refOverride
      }

      const parsed = parseRepoUrl(url, providerHint)
      if (!parsed) {
        throw new RegistryError(
          `Cannot parse repository URL: ${url}. Try forcing a provider with --provider.`,
        )
      }

      const name = nameOverride ?? parsed.name
      await addRegistry({
        name,
        url: parsed.canonicalUrl,
        provider: parsed.provider,
        host: hostOverride ?? parsed.host,
        subdir: parsed.subdir,
        defaultRef: refOverride ?? parsed.ref,
      })
      logger.success(
        `Registered "${name}" → ${parsed.canonicalUrl}${parsed.subdir ? `/${parsed.subdir}` : ''} (${parsed.provider})`,
      )
    })
}
