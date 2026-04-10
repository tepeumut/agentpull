import { DownloadError } from '../utils/errors.js'
import type { Credential, HostProvider, RepoSpec } from './types.js'

/**
 * GitLab provider — supports gitlab.com and self-hosted instances.
 *
 * Project paths can have arbitrary nesting (groups + subgroups), so the
 * `owner` field carries the full slash-separated path before the final
 * project segment. The combined `{owner}/{repo}` slug is URL-encoded into a
 * single path-id when calling the v4 API.
 *
 * URL formats:
 *   gitlab.com/owner/repo
 *   gitlab.com/group/subgroup/repo
 *   gitlab.com/group/subgroup/repo/-/tree/branch/path  (handles `-` separator)
 *   gitlab.com/group/repo#ref
 *   https://gitlab.example.com/group/repo
 */

const GITLAB_HOSTS = new Set(['gitlab.com'])

function isGitLabHost(host: string): boolean {
  if (GITLAB_HOSTS.has(host)) return true
  // Self-hosted instances commonly use gitlab.* or *.gitlab.* hostnames.
  return /(^|\.)gitlab\./.test(host)
}

/**
 * Build the URL-encoded project id used by the GitLab REST API.
 * For `group/subgroup/repo`, returns `group%2Fsubgroup%2Frepo`.
 */
export function gitlabProjectId(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`)
}

function parseUrl(input: string): RepoSpec | null {
  let url = input.trim()
  if (!url) return null

  // Strip an explicit ref suffix (#ref) before URL parsing so URL() doesn't
  // confuse it with a fragment we want to keep.
  let refOverride: string | undefined
  const hashIdx = url.indexOf('#')
  if (hashIdx >= 0) {
    refOverride = url.slice(hashIdx + 1) || undefined
    url = url.slice(0, hashIdx)
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Bare `gitlab.com/...` shorthand only — without a scheme we can't
    // disambiguate self-hosted instances from GitHub-style `owner/repo`.
    if (!url.startsWith('gitlab.')) return null
    url = `https://${url}`
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!isGitLabHost(parsed.hostname)) return null

  // Strip leading/trailing slashes; reject empty paths.
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0)
  if (segments.length < 2) return null

  // GitLab UI URLs have `/-/tree/<ref>/<subdir>` or `/-/blob/<ref>/<subdir>`
  // separators. Cut at the `-` to keep just the project path, and lift the
  // ref/subdir out of the trailing tail.
  const dashIdx = segments.indexOf('-')
  let projectSegments: string[]
  let tailSegments: string[] = []
  if (dashIdx >= 0) {
    projectSegments = segments.slice(0, dashIdx)
    tailSegments = segments.slice(dashIdx + 1)
  } else {
    projectSegments = segments
  }

  if (projectSegments.length < 2) return null

  const repo = projectSegments[projectSegments.length - 1]
  const ownerPath = projectSegments.slice(0, -1).join('/')

  // Decode subdir/ref from `/-/tree/<ref>/<subdir>` if present.
  let subdir: string | undefined
  let refFromUrl: string | undefined
  if (tailSegments.length >= 2 && (tailSegments[0] === 'tree' || tailSegments[0] === 'blob')) {
    refFromUrl = tailSegments[1]
    if (tailSegments.length > 2) subdir = tailSegments.slice(2).join('/')
  }

  if (subdir && subdir.split('/').some((p) => p === '..' || p === '')) return null

  return {
    host: parsed.hostname,
    owner: ownerPath,
    repo,
    subdir,
    ref: refOverride ?? refFromUrl,
  }
}

function canonicalUrl(spec: RepoSpec): string {
  return `https://${spec.host}/${spec.owner}/${spec.repo}`
}

async function getCommitSha(spec: RepoSpec, credential?: Credential): Promise<string> {
  const id = gitlabProjectId(spec.owner, spec.repo)
  const ref = spec.ref ?? 'HEAD'
  const url = `https://${spec.host}/api/v4/projects/${id}/repository/commits/${encodeURIComponent(ref)}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'agentpull', ...getAuthHeaders(credential) },
  })
  if (!res.ok) {
    throw new DownloadError(
      `GitLab API error ${res.status} resolving ${ref} for ${spec.owner}/${spec.repo}`,
    )
  }
  let body: { id?: unknown }
  try {
    body = (await res.json()) as { id?: unknown }
  } catch {
    throw new DownloadError(
      `Invalid JSON from GitLab API for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  const sha = typeof body.id === 'string' ? body.id.trim() : ''
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new DownloadError(
      `Unexpected commit SHA response for ${spec.owner}/${spec.repo}@${ref}`,
    )
  }
  return sha
}

function getTarballUrl(spec: RepoSpec, sha: string): string {
  const id = gitlabProjectId(spec.owner, spec.repo)
  return `https://${spec.host}/api/v4/projects/${id}/repository/archive.tar.gz?sha=${sha}`
}

function getAuthHeaders(credential?: Credential): Record<string, string> {
  if (!credential || credential.kind !== 'token') return {}
  return { 'PRIVATE-TOKEN': credential.token }
}

function getAllowedRedirectHosts(spec: RepoSpec): string[] {
  // GitLab serves archives directly from the API host without redirecting,
  // but allow self-redirect for safety.
  return [spec.host]
}

export const gitlabProvider: HostProvider = {
  id: 'gitlab',
  displayName: 'GitLab',
  defaultHost: 'gitlab.com',
  selfHosted: true,
  usesPAT: true,
  parseUrl,
  canonicalUrl,
  getCommitSha,
  getTarballUrl,
  getAuthHeaders,
  getAllowedRedirectHosts,
  getRootDirStrip: () => 1,
}
