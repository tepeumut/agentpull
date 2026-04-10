import { azureProvider } from './azure.js'
import { bitbucketProvider } from './bitbucket.js'
import { gitProvider } from './git.js'
import { githubProvider } from './github.js'
import { gitlabProvider } from './gitlab.js'
import type { HostProvider, ProviderId } from './types.js'

/**
 * Registry of all auto-detectable host providers.
 *
 * Order matters: `detectProvider` returns the first one whose `parseUrl`
 * accepts the input. The generic `git` provider is intentionally placed
 * last and only matches URLs that look unambiguously like git URLs (`*.git`,
 * `git://`, SCP-style) so it doesn't hijack URLs the real providers should
 * handle. Forced selection via `providerHint='git'` is the escape hatch.
 */
const PROVIDERS: HostProvider[] = [
  githubProvider,
  gitlabProvider,
  bitbucketProvider,
  azureProvider,
  gitProvider,
]

const PROVIDER_BY_ID = new Map<ProviderId, HostProvider>(
  PROVIDERS.map((p) => [p.id, p]),
)

export function listProviders(): readonly HostProvider[] {
  return PROVIDERS
}

export function getProvider(id: ProviderId): HostProvider {
  const provider = PROVIDER_BY_ID.get(id)
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`)
  }
  return provider
}

/**
 * Try every provider's `parseUrl`. Returns the first match, or `null` if
 * the URL doesn't look like any known host.
 */
export function detectProvider(
  input: string,
): { provider: HostProvider; spec: ReturnType<HostProvider['parseUrl']> } | null {
  for (const provider of PROVIDERS) {
    const spec = provider.parseUrl(input)
    if (spec) return { provider, spec }
  }
  return null
}

export type { Credential, HostProvider, ProviderId, RepoSpec } from './types.js'
