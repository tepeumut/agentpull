import { findRegistry } from './config.js'
import { RegistryError } from '../utils/errors.js'
import { detectProvider, getProvider } from '../hosts/index.js'
import type { ProviderId } from '../hosts/types.js'

export interface ParsedRepo {
  /** Stable provider id (github/gitlab/bitbucket/azure/git). */
  provider: ProviderId
  /** Hostname (e.g. github.com, gitlab.example.com). */
  host: string
  /** Canonical https URL for the repo (without subdir/ref). */
  canonicalUrl: string
  owner: string
  repo: string
  /** Subdirectory within the repo, if any */
  subdir?: string
  /** Ref (branch/tag/commit) if specified with #ref */
  ref?: string
  /** Derived short name (repo name or last subdir segment) */
  name: string
}

function deriveName(repo: string, subdir?: string): string {
  return subdir ? subdir.split('/').at(-1)! : repo
}

/**
 * Parse a URL or shorthand into its components by trying each registered
 * provider in turn. Returns `null` if no provider claims the input.
 *
 * To force a specific provider (e.g. for the generic `git` fallback that is
 * never auto-detected), pass `providerHint`.
 */
export function parseRepoUrl(input: string, providerHint?: ProviderId): ParsedRepo | null {
  if (providerHint) {
    const provider = getProvider(providerHint)
    const spec = provider.parseUrl(input)
    if (!spec) return null
    return {
      provider: provider.id,
      host: spec.host,
      canonicalUrl: provider.canonicalUrl(spec),
      owner: spec.owner,
      repo: spec.repo,
      subdir: spec.subdir,
      ref: spec.ref,
      name: deriveName(spec.repo, spec.subdir),
    }
  }

  const detected = detectProvider(input)
  if (!detected || !detected.spec) return null
  const { provider, spec } = detected
  return {
    provider: provider.id,
    host: spec.host,
    canonicalUrl: provider.canonicalUrl(spec),
    owner: spec.owner,
    repo: spec.repo,
    subdir: spec.subdir,
    ref: spec.ref,
    name: deriveName(spec.repo, spec.subdir),
  }
}

export interface ResolvedRepo extends ParsedRepo {
  ref: string
}

/**
 * Resolve a name or URL to a full repo spec.
 * Checks global registry first, then tries direct URL parse.
 */
export async function resolveRepo(nameOrUrl: string): Promise<ResolvedRepo> {
  // Check registry
  const entry = await findRegistry(nameOrUrl)
  if (entry) {
    // Honour the entry's `provider` hint when present (self-hosted instances
    // or generic-git fallback). Otherwise fall back to URL-based detection.
    const parsed = parseRepoUrl(entry.url, entry.provider as ProviderId | undefined)
    if (!parsed) throw new RegistryError(`Registered URL is invalid: ${entry.url}`)
    return {
      ...parsed,
      host: entry.host ?? parsed.host,
      subdir: entry.subdir ?? parsed.subdir,
      ref: entry.defaultRef ?? parsed.ref ?? 'HEAD',
      name: entry.name,
    }
  }

  // Try parsing directly as a URL
  const parsed = parseRepoUrl(nameOrUrl)
  if (parsed) {
    return { ...parsed, ref: parsed.ref ?? 'HEAD' }
  }

  throw new RegistryError(
    `"${nameOrUrl}" is not a registered name or a recognised repository URL.\n` +
      `Register with: agentpull registry add <url> --name ${nameOrUrl}`,
  )
}
