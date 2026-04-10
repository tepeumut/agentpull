import { DownloadError } from '../utils/errors.js'
import type { Credential, HostProvider, RepoSpec } from './types.js'

const GITHUB_URL_RE =
  /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/#]+)(?:\/([^#]*))?(?:#(.*))?$/

/**
 * GitHub provider.
 *
 * Supports github.com only. Self-hosted GitHub Enterprise would need a
 * separate `host` field on the parsed spec — out of scope for this round.
 *
 * URL formats accepted:
 *   github.com/owner/repo
 *   github.com/owner/repo/subdir
 *   github.com/owner/repo/subdir#ref
 *   owner/repo                      (implicit github.com)
 *   owner/repo/subdir#ref
 */
function parseUrl(input: string): RepoSpec | null {
  let url = input.trim()
  if (!url) return null

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.startsWith('github.com/')) {
      url = `https://${url}`
    } else {
      url = `https://github.com/${url}`
    }
  }

  const match = url.match(GITHUB_URL_RE)
  if (!match) return null

  const [, owner, repo, rawSubdir, ref] = match
  const subdir = rawSubdir?.replace(/\/$/, '') || undefined

  // Reject any subdir that contains path traversal or empty segments —
  // it will be used as a filesystem path during tarball extraction.
  if (subdir && subdir.split('/').some((p) => p === '..' || p === '')) return null

  return {
    host: 'github.com',
    owner,
    repo,
    subdir,
    ref,
  }
}

function canonicalUrl(spec: RepoSpec): string {
  return `https://${spec.host}/${spec.owner}/${spec.repo}`
}

async function getCommitSha(spec: RepoSpec, credential?: Credential): Promise<string> {
  const url = `https://api.${spec.host}/repos/${spec.owner}/${spec.repo}/commits/${spec.ref ?? 'HEAD'}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.sha',
    'User-Agent': 'agentpull',
    ...getAuthHeaders(credential),
  }
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new DownloadError(
      `GitHub API error ${res.status} resolving ${spec.ref} for ${spec.owner}/${spec.repo}`,
    )
  }
  const sha = (await res.text()).trim()
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new DownloadError(
      `Unexpected commit SHA response for ${spec.owner}/${spec.repo}@${spec.ref}`,
    )
  }
  return sha
}

function getTarballUrl(spec: RepoSpec, sha: string): string {
  // IMPORTANT: download by the resolved commit SHA, not the original ref.
  // codeload.github.com caches tarballs at ref URLs (e.g. /tarball/main) and
  // may serve a stale archive for several seconds after a push.
  return `https://api.${spec.host}/repos/${spec.owner}/${spec.repo}/tarball/${sha}`
}

function getAuthHeaders(credential?: Credential): Record<string, string> {
  if (!credential || credential.kind !== 'token') return {}
  return { Authorization: `Bearer ${credential.token}` }
}

function getAllowedRedirectHosts(): string[] {
  return ['codeload.github.com', 'objects.githubusercontent.com', 'api.github.com']
}

export const githubProvider: HostProvider = {
  id: 'github',
  displayName: 'GitHub',
  defaultHost: 'github.com',
  selfHosted: false,
  usesPAT: true,
  parseUrl,
  canonicalUrl,
  getCommitSha,
  getTarballUrl,
  getAuthHeaders,
  getAllowedRedirectHosts,
  getRootDirStrip: () => 1,
}
