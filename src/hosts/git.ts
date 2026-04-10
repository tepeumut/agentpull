import { DownloadError } from '../utils/errors.js'
import type { Credential, HostProvider, RepoSpec } from './types.js'

/**
 * Generic Git provider — last-resort fallback for any host that the
 * specialised providers don't recognise. The downloader detects this
 * provider via `getCloneUrl` and shells out to `git clone --depth 1`
 * instead of using the tarball flow.
 *
 * Auto-detection is intentionally restrictive: this provider only claims
 * URLs that *look* like git URLs (`*.git` suffix, `git://` scheme, or
 * `git@host:owner/repo` shorthand). Anything else must opt in by passing
 * `provider: 'git'` to `parseRepoUrl` or in a registry entry — otherwise
 * we'd hijack typo'd URLs that a real provider was about to claim.
 *
 * URL formats accepted (auto-detect):
 *   https://example.com/owner/repo.git
 *   git://example.com/owner/repo.git
 *   git@example.com:owner/repo.git
 *   ssh://git@example.com/owner/repo.git
 *
 * URL formats accepted (when forced via providerHint):
 *   any of the above, plus arbitrary http(s) URLs
 */

const SCP_RE = /^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9._-]+):([^#]+?)(?:#(.*))?$/

function parseUrl(input: string): RepoSpec | null {
  let url = input.trim()
  if (!url) return null

  let refOverride: string | undefined
  // SCP-style git URLs (`git@host:path`) don't have a fragment shape that
  // URL() understands, so handle them separately.
  if (!url.includes('://')) {
    const m = url.match(SCP_RE)
    if (!m) return null
    const [, host, path, ref] = m
    refOverride = ref
    return parsePath(host, path, refOverride)
  }

  const hashIdx = url.indexOf('#')
  if (hashIdx >= 0) {
    refOverride = url.slice(hashIdx + 1) || undefined
    url = url.slice(0, hashIdx)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // Auto-detect: only claim http(s) URLs that end in `.git` so we don't
  // hijack URLs that GitHub/GitLab/Bitbucket/Azure should handle. The
  // `git://` and `ssh://` schemes are unambiguous.
  const isGitScheme = parsed.protocol === 'git:' || parsed.protocol === 'ssh:'
  const looksLikeGit = parsed.pathname.endsWith('.git')
  if (!isGitScheme && !looksLikeGit) return null

  return parsePath(parsed.hostname, parsed.pathname.replace(/^\//, ''), refOverride)
}

function parsePath(host: string, rawPath: string, ref?: string): RepoSpec | null {
  const path = rawPath.replace(/\.git$/, '')
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length < 2) return null
  const repo = segments[segments.length - 1]
  const owner = segments.slice(0, -1).join('/')
  return {
    host,
    owner,
    repo,
    subdir: undefined,
    ref,
  }
}

function canonicalUrl(spec: RepoSpec): string {
  return `https://${spec.host}/${spec.owner}/${spec.repo}.git`
}

function getCloneUrl(spec: RepoSpec): string {
  return canonicalUrl(spec)
}

async function getCommitSha(_spec: RepoSpec, _credential?: Credential): Promise<string> {
  // The git-clone branch in the downloader resolves SHA via `git rev-parse HEAD`
  // after the clone, so providers in clone mode never go through this path.
  // Throw loudly if it's ever called by mistake.
  throw new DownloadError('Generic git provider does not support remote SHA resolution')
}

function getTarballUrl(_spec: RepoSpec, _sha: string): string {
  throw new DownloadError('Generic git provider does not provide a tarball URL')
}

function getAuthHeaders(): Record<string, string> {
  // git auth is handled out-of-band via GIT_ASKPASS in the downloader.
  return {}
}

function getAllowedRedirectHosts(spec: RepoSpec): string[] {
  return [spec.host]
}

export const gitProvider: HostProvider = {
  id: 'git',
  displayName: 'Generic Git',
  defaultHost: '',
  selfHosted: true,
  usesPAT: true,
  parseUrl,
  canonicalUrl,
  getCommitSha,
  getTarballUrl,
  getAuthHeaders,
  getAllowedRedirectHosts,
  getRootDirStrip: () => 0,
  getCloneUrl,
}
