import { DownloadError } from '../utils/errors.js'
import type { Credential, HostProvider, RepoSpec } from './types.js'

/**
 * Bitbucket Cloud provider.
 *
 * Bitbucket does not use PATs the way GitHub/GitLab do — instead, you create
 * an "app password" tied to a username, and authenticate with HTTP Basic
 * `Authorization: Basic base64(username:app_password)`. This is why the
 * provider's `usesPAT` flag is `false`: the auth flow needs both fields.
 *
 * URL formats:
 *   bitbucket.org/workspace/repo
 *   bitbucket.org/workspace/repo/src/main/path  (the UI tree URL)
 *   workspace/repo                              (no — ambiguous, declined)
 *   bitbucket.org/workspace/repo#ref
 */

const BITBUCKET_HOST = 'bitbucket.org'

function parseUrl(input: string): RepoSpec | null {
  let url = input.trim()
  if (!url) return null

  let refOverride: string | undefined
  const hashIdx = url.indexOf('#')
  if (hashIdx >= 0) {
    refOverride = url.slice(hashIdx + 1) || undefined
    url = url.slice(0, hashIdx)
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (!url.startsWith('bitbucket.org/')) return null
    url = `https://${url}`
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.hostname !== BITBUCKET_HOST) return null

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0)
  if (segments.length < 2) return null

  const [workspace, repo, ...rest] = segments

  // Bitbucket UI URLs use `/src/<ref>/<subdir>` to point at a path inside
  // the repo. Lift the ref + subdir out if we see this prefix.
  let subdir: string | undefined
  let refFromUrl: string | undefined
  if (rest.length >= 2 && rest[0] === 'src') {
    refFromUrl = rest[1]
    if (rest.length > 2) subdir = rest.slice(2).join('/')
  } else if (rest.length > 0) {
    // Plain trailing path — treat as a subdir.
    subdir = rest.join('/')
  }

  if (subdir && subdir.split('/').some((p) => p === '..' || p === '')) return null

  return {
    host: BITBUCKET_HOST,
    owner: workspace,
    repo,
    subdir,
    ref: refOverride ?? refFromUrl,
  }
}

function canonicalUrl(spec: RepoSpec): string {
  return `https://${spec.host}/${spec.owner}/${spec.repo}`
}

async function getCommitSha(spec: RepoSpec, credential?: Credential): Promise<string> {
  const ref = spec.ref ?? 'HEAD'
  const url = `https://api.${spec.host}/2.0/repositories/${spec.owner}/${spec.repo}/commit/${encodeURIComponent(ref)}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'agentpull', Accept: 'application/json', ...getAuthHeaders(credential) },
  })
  if (!res.ok) {
    throw new DownloadError(
      `Bitbucket API error ${res.status} resolving ${ref} for ${spec.owner}/${spec.repo}`,
    )
  }
  let body: { hash?: unknown }
  try {
    body = (await res.json()) as { hash?: unknown }
  } catch {
    throw new DownloadError(
      `Invalid JSON from Bitbucket API for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  const sha = typeof body.hash === 'string' ? body.hash.trim() : ''
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new DownloadError(
      `Unexpected commit SHA response for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  return sha
}

function getTarballUrl(spec: RepoSpec, sha: string): string {
  return `https://${spec.host}/${spec.owner}/${spec.repo}/get/${sha}.tar.gz`
}

function getAuthHeaders(credential?: Credential): Record<string, string> {
  if (!credential) return {}
  if (credential.kind === 'basic') {
    const encoded = Buffer.from(`${credential.username}:${credential.password}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  // Bitbucket also accepts a workspace access token via Bearer auth.
  return { Authorization: `Bearer ${credential.token}` }
}

function getAllowedRedirectHosts(): string[] {
  return ['bitbucket.org', 'api.bitbucket.org', 'bbuseruploads.s3.amazonaws.com']
}

export const bitbucketProvider: HostProvider = {
  id: 'bitbucket',
  displayName: 'Bitbucket Cloud',
  defaultHost: 'bitbucket.org',
  selfHosted: false,
  usesPAT: false,
  parseUrl,
  canonicalUrl,
  getCommitSha,
  getTarballUrl,
  getAuthHeaders,
  getAllowedRedirectHosts,
  getRootDirStrip: () => 1,
}
