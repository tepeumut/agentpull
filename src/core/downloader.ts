import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, rm, mkdtemp, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { devNull, tmpdir, homedir, platform } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import * as tar from 'tar'
import { DownloadError } from '../utils/errors.js'
import { hashBuffer } from '../utils/hash.js'
import { fileExists, ensureDir } from '../utils/fs.js'
import { getProvider } from '../hosts/index.js'
import type { Credential, HostProvider, RepoSpec } from '../hosts/types.js'
import type { ResolvedRepo } from './registry.js'

const CACHE_DIR = join(homedir(), '.agentpull', 'cache')

function assertRelativePath(p: string, what: string): void {
  if (!p) throw new DownloadError(`${what} is empty`)
  if (p.startsWith('/') || p.startsWith('\\')) {
    throw new DownloadError(`${what} must be relative: ${p}`)
  }
  const parts = p.split(/[/\\]/)
  if (parts.some((part) => part === '..')) {
    throw new DownloadError(`${what} must not contain "..": ${p}`)
  }
}

export interface DownloadResult {
  /** Directory containing the extracted files (caller must clean up) */
  extractDir: string
  /** Commit SHA returned by GitHub */
  commitSha: string
  /** List of relative paths within extractDir */
  files: string[]
}

async function getCacheDir(): Promise<string> {
  await ensureDir(CACHE_DIR)
  return CACHE_DIR
}

async function downloadTarball(
  url: string,
  destPath: string,
  authHeaders: Record<string, string>,
  allowedRedirectHosts: ReadonlySet<string>,
): Promise<void> {
  const headers: Record<string, string> = { 'User-Agent': 'agentpull', ...authHeaders }

  let res = await fetch(url, { headers, redirect: 'manual' })

  // Follow tarball redirects manually so any auth header is not leaked to a
  // CDN host. Only redirects to provider-approved hosts are followed.
  if (res.status === 302 || res.status === 301) {
    const location = res.headers.get('location')
    if (!location) throw new DownloadError('Tarball redirect had no location')

    let redirectUrl: URL
    try {
      redirectUrl = new URL(location)
    } catch {
      throw new DownloadError(`Invalid redirect location: ${location}`)
    }
    if (redirectUrl.protocol !== 'https:') {
      throw new DownloadError(`Refusing non-https redirect: ${redirectUrl.protocol}`)
    }
    if (!allowedRedirectHosts.has(redirectUrl.hostname)) {
      throw new DownloadError(`Refusing redirect to unexpected host: ${redirectUrl.hostname}`)
    }
    res = await fetch(redirectUrl, { headers: { 'User-Agent': 'agentpull' } })
  }

  if (!res.ok) {
    throw new DownloadError(`Failed to download tarball: HTTP ${res.status}`)
  }
  if (!res.body) throw new DownloadError('Empty response body')

  // Atomic write: download to a temp file, then rename into place. This
  // prevents a killed process from leaving a truncated tarball in the cache.
  await ensureDir(join(destPath, '..'))
  const tmpPath = `${destPath}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tmpPath))
    await rename(tmpPath, destPath)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    throw err
  }
}

// Tar bomb protection: hard ceilings on extracted size and entry count.
// A 1 MB compressed tarball can otherwise expand to gigabytes.
const MAX_EXTRACT_BYTES = 500 * 1024 * 1024 // 500 MB
const MAX_EXTRACT_ENTRIES = 10_000

async function extractTarball(
  tgzPath: string,
  extractDir: string,
  strip: number,
  subdir?: string,
): Promise<string[]> {
  await ensureDir(extractDir)

  if (subdir) assertRelativePath(subdir, 'subdir')

  // GitHub tarballs have a root dir like "owner-repo-sha/"
  const files: string[] = []

  let totalBytes = 0
  let totalEntries = 0

  await tar.x({
    file: tgzPath,
    cwd: extractDir,
    filter: (filePath, entry) => {
      // Reject absolute paths outright.
      if (filePath.startsWith('/')) return false
      // Strip the leading `strip` path components to match tar's `strip` opt.
      const parts = filePath.split('/')
      if (parts.length <= strip) return false
      const pathWithoutRoot = parts.slice(strip).join('/')
      if (!pathWithoutRoot) return false

      // Path traversal guard: reject any `..` component that would escape
      // extractDir once tar normalises the path.
      if (pathWithoutRoot.split('/').some((p) => p === '..')) return false

      if (subdir && !(pathWithoutRoot === subdir || pathWithoutRoot.startsWith(subdir + '/'))) {
        return false
      }

      // Tar bomb guard: enforce ceilings on total entries and uncompressed
      // bytes once the entry has passed every other filter.
      totalEntries += 1
      if (totalEntries > MAX_EXTRACT_ENTRIES) {
        throw new DownloadError(
          `Tarball exceeds maximum entry count (${MAX_EXTRACT_ENTRIES})`,
        )
      }
      totalBytes += entry.size ?? 0
      if (totalBytes > MAX_EXTRACT_BYTES) {
        throw new DownloadError(
          `Tarball exceeds maximum extracted size (${MAX_EXTRACT_BYTES} bytes)`,
        )
      }
      return true
    },
    strip, // Remove the leading `strip` path components (typically the root dir)
    onwarn: () => undefined,
  })

  // Collect files
  const walkDir = async (dir: string, base: string) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const rel = relative(base, full)
      if (entry.isDirectory()) {
        await walkDir(full, base)
      } else {
        files.push(rel)
      }
    }
  }

  // If subdir filtering, flatten subdir contents into extractDir. We stage
  // through a sibling temp dir to avoid overwriting the extract root while
  // it still contains the nested tree.
  if (subdir) {
    const subdirPath = join(extractDir, subdir)
    if (!(await fileExists(subdirPath))) {
      throw new DownloadError(`Subdirectory "${subdir}" not found in repository`)
    }
    const tmpMove = await mkdtemp(join(tmpdir(), 'agentpull-move-'))
    // Move children of subdirPath into tmpMove, then wipe extractDir and
    // rename tmpMove back. This avoids the prior bug where `extractDir_move`
    // lived next to extractDir and could collide with another agentpull process.
    const children = await readdir(subdirPath)
    for (const child of children) {
      await rename(join(subdirPath, child), join(tmpMove, child))
    }
    await rm(extractDir, { recursive: true, force: true })
    await rename(tmpMove, extractDir)
    await walkDir(extractDir, extractDir)
  } else {
    await walkDir(extractDir, extractDir)
  }

  return files
}

export interface DownloadOptions {
  /** Bypass and replace any existing cache entry for this commit. */
  forceRefresh?: boolean
}

/**
 * Build a `RepoSpec` from a `ResolvedRepo` for the provider call. The repo
 * may have been constructed before the host abstraction landed (e.g. by tests
 * or older callers); in that case `provider`/`host` are absent and we default
 * to GitHub for backward compatibility.
 */
function specFromRepo(repo: ResolvedRepo): { provider: HostProvider; spec: RepoSpec } {
  const providerId = repo.provider ?? 'github'
  const provider = getProvider(providerId)
  const spec: RepoSpec = {
    host: repo.host ?? provider.defaultHost,
    owner: repo.owner,
    repo: repo.repo,
    subdir: repo.subdir,
    ref: repo.ref,
  }
  return { provider, spec }
}

/**
 * Normalise a legacy bare-string token argument into a `Credential`. Tests
 * (and a few legacy call sites) still pass a plain PAT string; everything
 * new should pass a `Credential` so basic-auth providers like Bitbucket can
 * use the same entry point.
 */
function toCredential(input: Credential | string | undefined): Credential | undefined {
  if (input === undefined) return undefined
  if (typeof input === 'string') return { kind: 'token', token: input }
  return input
}

const execFileAsync = promisify(execFile)

/**
 * Run `git --version` once on first use to verify the binary is available
 * before we shell out to it. Cached so repeated git-clone installs in the
 * same process don't pay the cost twice.
 */
let gitAvailable: boolean | undefined
async function ensureGitAvailable(): Promise<void> {
  if (gitAvailable === true) return
  if (gitAvailable === false) {
    throw new DownloadError(
      'The `git` binary is required for this provider but was not found on PATH. Install git and try again.',
    )
  }
  try {
    await execFileAsync('git', ['--version'])
    gitAvailable = true
  } catch {
    gitAvailable = false
    throw new DownloadError(
      'The `git` binary is required for this provider but was not found on PATH. Install git and try again.',
    )
  }
}

/**
 * Build a temp directory containing a GIT_ASKPASS helper that emits the
 * credential when git asks for it.
 *
 * The credentials are interpolated **directly into the script body** as
 * JSON-encoded string literals — they are not passed via environment
 * variables. This is deliberate:
 *
 *   1. Env vars set on the parent `git clone` process are inherited by
 *      every git subprocess (remote helpers, transport, hooks, …).
 *      `GIT_TRACE=1` in the user's existing env would print the entire
 *      child env, leaking the secret.
 *   2. The askpass helper only needs the credential at the moment git
 *      shells out to it — it has no need for the value to live in any
 *      ambient process state.
 *
 * The helper file lives in a `mkdtemp` directory (mode 0700 on POSIX),
 * is written with mode 0700 itself, and is wiped via `cleanup()` once
 * the clone completes — success or failure.
 */
async function makeAskPass(credential: Credential): Promise<{
  env: Record<string, string>
  cleanup: () => Promise<void>
}> {
  const username =
    credential.kind === 'basic' ? credential.username : 'x-access-token'
  const password = credential.kind === 'basic' ? credential.password : credential.token

  // JSON.stringify is the safest way to embed an arbitrary string into JS
  // source — it handles quotes, backslashes, control characters, and unicode.
  const userLit = JSON.stringify(username)
  const passLit = JSON.stringify(password)

  const dir = await mkdtemp(join(tmpdir(), 'agentpull-askpass-'))
  const scriptPath = join(dir, platform() === 'win32' ? 'askpass.cmd' : 'askpass.js')

  const jsBody =
    `const arg = (process.argv[2] || '').toLowerCase();\n` +
    `process.stdout.write(/username/i.test(arg) ? ${userLit} : ${passLit});\n`

  if (platform() === 'win32') {
    // Windows wrapper: cmd that invokes node on a sibling .js file. NTFS
    // ignores 0o600 from Node, but writing the .js file mode 0600 still
    // matches our intent on cygwin/git-bash where it is honoured.
    const jsPath = join(dir, 'askpass.js')
    await writeFile(jsPath, jsBody, { mode: 0o600 })
    await writeFile(scriptPath, `@node "${jsPath}" %*\r\n`, { mode: 0o600 })
  } else {
    await writeFile(scriptPath, `#!/usr/bin/env node\n` + jsBody, { mode: 0o700 })
    await chmod(scriptPath, 0o700)
  }

  return {
    env: {
      GIT_ASKPASS: scriptPath,
      // Disable terminal prompts so a misconfigured askpass cannot fall
      // through to interactive input.
      GIT_TERMINAL_PROMPT: '0',
    },
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => undefined),
  }
}

/**
 * Clone a repository using `git clone --depth 1` and return the resolved
 * commit SHA. Used by providers that opt into the clone flow via
 * `getCloneUrl` (the generic Git provider and Azure DevOps).
 */
async function downloadViaGit(
  cloneUrl: string,
  ref: string | undefined,
  destDir: string,
  credential?: Credential,
): Promise<string> {
  await ensureGitAvailable()

  const args = ['clone', '--depth', '1', '--single-branch']
  if (ref) {
    args.push('--branch', ref)
  }
  args.push('--', cloneUrl, destDir)

  let extraEnv: Record<string, string> = {}
  let cleanup: (() => Promise<void>) | undefined
  if (credential) {
    const askpass = await makeAskPass(credential)
    extraEnv = askpass.env
    cleanup = askpass.cleanup
  }

  // Defence-in-depth: suppress the user's system and global git config for
  // this clone subprocess. Otherwise a `credential.helper = osxkeychain` or
  // `http.extraHeader = Authorization: Bearer ...` in `~/.gitconfig` could
  // either inject stale credentials or leak unrelated tokens to the host.
  const isolationEnv: Record<string, string> = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_TERMINAL_PROMPT: '0',
  }

  try {
    await execFileAsync('git', args, {
      env: { ...process.env, ...isolationEnv, ...extraEnv },
      // Limit clone output buffer; large clones still write to disk via
      // git itself, this just caps stderr/stdout we capture.
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (err) {
    throw new DownloadError(`git clone failed: ${(err as Error).message}`)
  } finally {
    if (cleanup) await cleanup()
  }

  // Resolve the SHA from the cloned working tree.
  let sha: string
  try {
    const { stdout } = await execFileAsync('git', ['-C', destDir, 'rev-parse', 'HEAD'])
    sha = stdout.trim().toLowerCase()
  } catch (err) {
    throw new DownloadError(`git rev-parse HEAD failed: ${(err as Error).message}`)
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new DownloadError(`Unexpected SHA from git rev-parse: ${sha}`)
  }

  // Wipe the .git metadata before handing the directory back. The caller
  // only wants the working tree contents.
  await rm(join(destDir, '.git'), { recursive: true, force: true })

  return sha
}

/**
 * Walk a directory and return file paths relative to it. Used after the
 * git-clone branch to populate `DownloadResult.files` the same way the
 * tarball branch does. Enforces the same size/entry caps as the tarball
 * extractor (`MAX_EXTRACT_BYTES` / `MAX_EXTRACT_ENTRIES`) so a malicious
 * or accidentally huge repo cannot fill the disk through the clone branch.
 */
async function listFiles(root: string): Promise<string[]> {
  const files: string[] = []
  let totalBytes = 0
  let totalEntries = 0
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else {
        totalEntries += 1
        if (totalEntries > MAX_EXTRACT_ENTRIES) {
          throw new DownloadError(
            `Cloned repository exceeds maximum entry count (${MAX_EXTRACT_ENTRIES})`,
          )
        }
        const st = await stat(full)
        totalBytes += st.size
        if (totalBytes > MAX_EXTRACT_BYTES) {
          throw new DownloadError(
            `Cloned repository exceeds maximum size (${MAX_EXTRACT_BYTES} bytes)`,
          )
        }
        files.push(relative(root, full))
      }
    }
  }
  await walk(root)
  return files
}

/**
 * Move the contents of a `subdir` inside `extractDir` to be the new
 * extractDir root, deleting everything else. Mirrors the tarball branch's
 * subdir-flattening logic.
 */
async function flattenSubdir(extractDir: string, subdir: string): Promise<void> {
  assertRelativePath(subdir, 'subdir')
  const subdirPath = join(extractDir, subdir)
  if (!(await fileExists(subdirPath))) {
    throw new DownloadError(`Subdirectory "${subdir}" not found in repository`)
  }
  const tmpMove = await mkdtemp(join(tmpdir(), 'agentpull-move-'))
  const children = await readdir(subdirPath)
  for (const child of children) {
    await rename(join(subdirPath, child), join(tmpMove, child))
  }
  await rm(extractDir, { recursive: true, force: true })
  await rename(tmpMove, extractDir)
}

export async function downloadRepo(
  repo: ResolvedRepo,
  credentialOrToken?: Credential | string,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const credential = toCredential(credentialOrToken)
  const { provider, spec } = specFromRepo(repo)

  // Clone-mode providers (generic git, Azure DevOps fallback): no API call
  // for SHA, no tarball cache — clone fresh into the extract dir.
  const cloneUrl = provider.getCloneUrl?.(spec) ?? null
  if (cloneUrl) {
    const extractDir = await mkdtemp(join(tmpdir(), 'agentpull-'))
    try {
      const commitSha = await downloadViaGit(cloneUrl, spec.ref, extractDir, credential)
      if (spec.subdir) {
        await flattenSubdir(extractDir, spec.subdir)
      }
      const files = await listFiles(extractDir)
      return { extractDir, commitSha, files }
    } catch (err) {
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined)
      throw err
    }
  }

  // Tarball flow: resolve SHA via provider API, then download by SHA so the
  // cache key is content-addressed.
  const commitSha = await provider.getCommitSha(spec, credential)
  const cacheDir = await getCacheDir()
  const cacheKey = `${provider.id}-${spec.host}-${spec.owner}-${spec.repo}-${commitSha}${
    spec.subdir ? '-' + hashBuffer(spec.subdir) : ''
  }.tgz`
  const cachePath = join(cacheDir, cacheKey)
  const extractDir = await mkdtemp(join(tmpdir(), 'agentpull-'))

  try {
    if (opts.forceRefresh) {
      await rm(cachePath, { force: true }).catch(() => undefined)
    }
    if (!(await fileExists(cachePath))) {
      // IMPORTANT: download by the resolved commit SHA, not the original
      // ref. CDNs cache tarballs at ref URLs (e.g. /tarball/main) and may
      // serve a stale archive for several seconds after a push. Downloading
      // by SHA is content-addressed and never returns the wrong commit's
      // content — this prevents the cache from being poisoned with a
      // tarball whose contents don't match its (correct) cache key.
      const tarballUrl = provider.getTarballUrl(spec, commitSha)
      const authHeaders = provider.getAuthHeaders(credential)
      const allowedHosts = new Set(provider.getAllowedRedirectHosts(spec))
      await downloadTarball(tarballUrl, cachePath, authHeaders, allowedHosts)
    }

    const strip = provider.getRootDirStrip()
    const files = await extractTarball(cachePath, extractDir, strip, spec.subdir)
    return { extractDir, commitSha, files }
  } catch (err) {
    await rm(extractDir, { recursive: true, force: true }).catch(() => undefined)
    throw err
  }
}
