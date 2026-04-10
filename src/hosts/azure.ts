import { DownloadError } from '../utils/errors.js'
import type { Credential, HostProvider, RepoSpec } from './types.js'

/**
 * Azure DevOps Repos provider.
 *
 * Azure URL shape carries an org/project/repo triple. We pack `org/project`
 * into the spec's `owner` field and `repo` into `repo`. The Azure REST API
 * doesn't expose a stable archive endpoint suitable for tarball download —
 * the `getTarballUrl` call therefore throws `DownloadError`, and the
 * downloader is expected to fall back to the generic Git provider for any
 * spec whose `provider === 'azure'`.
 *
 * URL formats:
 *   https://dev.azure.com/{org}/{project}/_git/{repo}
 *   https://dev.azure.com/{org}/{project}/_git/{repo}?version=GBmain
 *   https://{org}.visualstudio.com/{project}/_git/{repo}    (legacy)
 *   dev.azure.com/{org}/{project}/_git/{repo}
 */

const AZURE_HOSTS = new Set(['dev.azure.com'])

function isAzureHost(host: string): boolean {
  if (AZURE_HOSTS.has(host)) return true
  return /\.visualstudio\.com$/.test(host)
}

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
    if (!url.startsWith('dev.azure.com/') && !/^[^/]+\.visualstudio\.com\//.test(url)) {
      return null
    }
    url = `https://${url}`
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!isAzureHost(parsed.hostname)) return null

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0)

  // Two URL shapes:
  //   dev.azure.com/{org}/{project}/_git/{repo}[/...]
  //   {org}.visualstudio.com/{project}/_git/{repo}[/...]
  let org: string
  let project: string
  let repoIdx: number
  if (parsed.hostname === 'dev.azure.com') {
    if (segments.length < 4 || segments[2] !== '_git') return null
    org = segments[0]
    project = segments[1]
    repoIdx = 3
  } else {
    if (segments.length < 3 || segments[1] !== '_git') return null
    org = parsed.hostname.split('.')[0]
    project = segments[0]
    repoIdx = 2
  }

  const repo = segments[repoIdx]
  if (!repo) return null

  // Anything past the repo segment becomes the subdir.
  const subdirSegments = segments.slice(repoIdx + 1)
  const subdir = subdirSegments.length > 0 ? subdirSegments.join('/') : undefined
  if (subdir && subdir.split('/').some((p) => p === '..' || p === '')) return null

  // Azure UI uses ?version=GB<branch> / GT<tag> / GC<sha>.
  let refFromQuery: string | undefined
  const versionParam = parsed.searchParams.get('version')
  if (versionParam && /^G[BTC]/.test(versionParam)) {
    refFromQuery = versionParam.slice(2)
  }

  return {
    host: parsed.hostname,
    owner: `${org}/${project}`,
    repo,
    subdir,
    ref: refOverride ?? refFromQuery,
  }
}

function canonicalUrl(spec: RepoSpec): string {
  return `https://${spec.host}/${spec.owner}/_git/${spec.repo}`
}

function azureApiBase(spec: RepoSpec): string {
  // owner is `org/project`. dev.azure.com uses /{org}/{project}/_apis/...,
  // visualstudio.com uses /{project}/_apis/...
  if (spec.host === 'dev.azure.com') {
    return `https://${spec.host}/${spec.owner}`
  }
  // legacy: org is in the hostname, owner is `org/project` so strip the org
  const project = spec.owner.split('/').slice(1).join('/')
  return `https://${spec.host}/${project}`
}

async function getCommitSha(spec: RepoSpec, credential?: Credential): Promise<string> {
  const ref = spec.ref ?? 'main'
  const apiBase = azureApiBase(spec)
  const url =
    `${apiBase}/_apis/git/repositories/${encodeURIComponent(spec.repo)}/commits` +
    `?searchCriteria.itemVersion.version=${encodeURIComponent(ref)}` +
    `&searchCriteria.$top=1` +
    `&api-version=7.1`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'agentpull', Accept: 'application/json', ...getAuthHeaders(credential) },
  })
  if (!res.ok) {
    throw new DownloadError(
      `Azure DevOps API error ${res.status} resolving ${ref} for ${spec.owner}/${spec.repo}`,
    )
  }
  let body: { value?: Array<{ commitId?: unknown }> }
  try {
    body = (await res.json()) as { value?: Array<{ commitId?: unknown }> }
  } catch {
    throw new DownloadError(
      `Invalid JSON from Azure DevOps API for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  const first = body.value?.[0]
  const sha = first && typeof first.commitId === 'string' ? first.commitId.trim().toLowerCase() : ''
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new DownloadError(
      `Unexpected commit SHA response for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  return sha
}

function getTarballUrl(_spec: RepoSpec, _sha: string): string {
  // Azure DevOps does not expose a stable tarball endpoint — the closest
  // is `/items?path=&download=true&$format=zip` which is fragile and only
  // emits zip. The downloader detects this throw and falls back to the
  // generic Git provider.
  throw new DownloadError(
    'Azure DevOps does not provide a tarball API; install will use the generic git fallback',
  )
}

function getAuthHeaders(credential?: Credential): Record<string, string> {
  if (!credential) return {}
  if (credential.kind === 'basic') {
    const encoded = Buffer.from(`${credential.username}:${credential.password}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  // Azure PATs use Basic auth with empty username and the PAT as password.
  const encoded = Buffer.from(`:${credential.token}`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

function getAllowedRedirectHosts(spec: RepoSpec): string[] {
  return [spec.host]
}

function getCloneUrl(spec: RepoSpec): string {
  // Azure has no tarball API, so the downloader uses git clone.
  return canonicalUrl(spec)
}

export const azureProvider: HostProvider = {
  id: 'azure',
  displayName: 'Azure DevOps',
  defaultHost: 'dev.azure.com',
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
