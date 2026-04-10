import type { Command } from 'commander'
import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  password,
  select,
  text,
} from '@clack/prompts'
import chalk from 'chalk'
import { cwd } from 'node:process'
import { isInitialized, writeManifest, MANIFEST_FILENAME } from '../core/manifest.js'
import { EMPTY_MANIFEST } from '../types/manifest.js'
import { install } from '../core/installer.js'
import { listProviders, getProvider } from '../hosts/index.js'
import { parseRepoUrl } from '../core/registry.js'
import { addRegistry, removeRegistry } from '../core/config.js'
import { loadCredential, storeCredential } from '../security/keychain.js'
import type { ProviderId } from '../hosts/types.js'

/**
 * Step-by-step interactive setup. Walks a first-time user from an empty
 * directory all the way to an installed agent config without requiring
 * them to know any subcommand names.
 *
 * Order:
 *   1. Init manifest if missing
 *   2. Pick provider
 *   3. Optional host (self-hosted only)
 *   4. Auth (skip if creds already in keychain)
 *   5. Repo URL or shorthand → parse + validate
 *   6. Optional ref / subdir
 *   7. Optional name (for the registry entry)
 *   8. Install
 */
export function registerWizardCommand(program: Command): void {
  program
    .command('wizard')
    .description('Step-by-step guided setup (recommended for first-time users)')
    .action(async () => {
      await runWizard()
    })
}

function bail<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Cancelled')
    process.exit(130)
  }
  return value as T
}

async function runWizard(): Promise<void> {
  intro(chalk.cyan('agentpull wizard'))

  const projectDir = cwd()

  // 1. Init manifest if missing
  if (!(await isInitialized(projectDir))) {
    const initChoice = await confirm({
      message: `No ${MANIFEST_FILENAME} in this directory. Initialize one?`,
      initialValue: true,
    })
    if (!bail(initChoice)) {
      cancel('Cannot continue without a manifest')
      process.exit(0)
    }
    await writeManifest(projectDir, { ...EMPTY_MANIFEST })
  }

  // 2. Pick provider
  const providerId = bail(
    await select<ProviderId>({
      message: 'Which git host?',
      options: listProviders().map((p) => ({
        value: p.id,
        label: p.displayName,
        hint: p.id === 'git' ? 'fallback for any host with a `git` binary' : undefined,
      })),
    }),
  )
  const provider = getProvider(providerId)

  // 3. Optional host
  let host = provider.defaultHost
  if (provider.selfHosted) {
    const result = await text({
      message: `Hostname for ${provider.displayName}`,
      placeholder: provider.defaultHost || 'example.com',
      defaultValue: provider.defaultHost,
    })
    host = bail(result) || provider.defaultHost
  }

  // 4. Auth — skip if credentials already exist for this provider/host
  const existing = await loadCredential(providerId, host)
  if (!existing) {
    const wantsAuth = await confirm({
      message: `No saved credentials for ${providerId}@${host}. Add some now? (you can skip for public repos)`,
      initialValue: true,
    })
    if (bail(wantsAuth)) {
      if (provider.usesPAT) {
        const token = bail(
          await password({ message: `Paste your ${provider.displayName} access token` }),
        )
        await storeCredential(providerId, host, { kind: 'token', token })
      } else {
        const username = bail(await text({ message: 'Username' }))
        const appPassword = bail(await password({ message: 'App password' }))
        await storeCredential(providerId, host, {
          kind: 'basic',
          username,
          password: appPassword,
        })
      }
    }
  }

  // 5. Repo URL / shorthand
  const repoInput = bail(
    await text({
      message: 'Repository URL or owner/repo shorthand',
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
  const parsed = parseRepoUrl(repoInput, providerId)
  if (!parsed) {
    cancel('Could not parse the repository URL')
    process.exit(1)
  }

  // 6. Optional subdir + ref
  const subdirInput = bail(
    await text({
      message: 'Subdirectory inside the repo (optional)',
      placeholder: parsed.subdir ?? '(install from repo root)',
      defaultValue: parsed.subdir ?? '',
    }),
  )
  const subdir = subdirInput.trim() || parsed.subdir

  const refInput = bail(
    await text({
      message: 'Branch, tag, or commit (optional)',
      placeholder: parsed.ref ?? 'HEAD',
      defaultValue: parsed.ref ?? '',
    }),
  )
  const ref = refInput.trim() || parsed.ref

  // 7. Short name for the registry entry
  const nameInput = bail(
    await text({
      message: 'Short name for this registry entry',
      defaultValue: parsed.name,
      placeholder: parsed.name,
    }),
  )
  const name = nameInput.trim() || parsed.name

  // 8. Install confirmation. We persist to the registry only after the user
  // commits to the install AND the install actually succeeds, so a cancelled
  // or failed first-run doesn't leave an orphan registry entry. The
  // save-then-rollback shape exists because `install()` resolves the repo
  // by name via the registry — it has to be present at install time, but we
  // tear it back down on any error path.
  const proceed = bail(
    await confirm({
      message: `Install "${name}" from ${parsed.canonicalUrl}${subdir ? `/${subdir}` : ''}${
        ref ? `@${ref}` : ''
      }?`,
      initialValue: true,
    }),
  )
  if (!proceed) {
    cancel('Installation skipped — nothing was saved.')
    process.exit(0)
  }

  await addRegistry({
    name,
    url: parsed.canonicalUrl,
    provider: parsed.provider,
    host: host,
    subdir,
    defaultRef: ref,
  })

  try {
    await install({
      name,
      projectDir,
      ref,
    })
  } catch (err) {
    // Roll back the just-added registry entry so a failed install doesn't
    // leave a phantom that the user has to clean up by hand.
    await removeRegistry(name).catch(() => undefined)
    throw err
  }

  outro(chalk.green(`Done. Run 'agentpull list' to see installed entries.`))
}
