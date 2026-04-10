import { execFileSync } from 'node:child_process'
import { platform } from 'node:process'
import { AuthError } from '../utils/errors.js'
import type { Credential, ProviderId } from '../hosts/types.js'

const SERVICE = 'agentpull'

/**
 * Persisted form of a credential. We serialize as JSON inside the OS keychain
 * so providers that need a username + secret pair (Bitbucket app passwords)
 * can roundtrip without needing a second keychain entry.
 *
 * Bare strings written by older versions are still readable: when `loadCredential`
 * sees a value that doesn't parse as JSON, it returns `{kind:'token', token: raw}`.
 */
export type StoredCredential = Credential

function macosStore(account: string, token: string): void {
  // Delete first to avoid duplicate entry error
  try {
    execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', account], {
      stdio: 'ignore',
    })
  } catch {
    // Ignore — not found is fine
  }
  execFileSync(
    'security',
    ['add-generic-password', '-s', SERVICE, '-a', account, '-w', token, '-U'],
    { stdio: 'ignore' },
  )
}

function macosLoad(account: string): string | null {
  try {
    const result = execFileSync(
      'security',
      ['find-generic-password', '-s', SERVICE, '-a', account, '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return result.trim() || null
  } catch {
    return null
  }
}

function macosDelete(account: string): void {
  try {
    execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', account], {
      stdio: 'ignore',
    })
  } catch {
    // Not found — fine
  }
}

function linuxStore(account: string, token: string): void {
  // Requires libsecret-tools (secret-tool). Reads the secret from stdin.
  execFileSync(
    'secret-tool',
    ['store', '--label', `${SERVICE}:${account}`, 'service', SERVICE, 'account', account],
    { input: token, stdio: ['pipe', 'ignore', 'ignore'] },
  )
}

function linuxLoad(account: string): string | null {
  try {
    const result = execFileSync(
      'secret-tool',
      ['lookup', 'service', SERVICE, 'account', account],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return result.trim() || null
  } catch {
    return null
  }
}

function linuxDelete(account: string): void {
  try {
    execFileSync('secret-tool', ['clear', 'service', SERVICE, 'account', account], {
      stdio: 'ignore',
    })
  } catch {
    // Ignore
  }
}

// Windows credential store using PowerShell. To prevent command injection,
// the account name and token value are passed via environment variables and
// referenced as `$env:AGENTPULL_ACCOUNT` / `$env:AGENTPULL_TOKEN` inside the script —
// they are never interpolated into the command string. The account name is
// additionally validated to contain only safe characters before being used
// as part of a filename.
const SAFE_ACCOUNT_RE = /^[A-Za-z0-9._-]+$/

function assertSafeAccount(account: string): void {
  if (!SAFE_ACCOUNT_RE.test(account)) {
    throw new AuthError(`Unsafe account identifier for keychain: ${account}`)
  }
}

const WIN_STORE_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$account = $env:AGENTPULL_ACCOUNT',
  '$token = $env:AGENTPULL_TOKEN',
  '$secure = ConvertTo-SecureString -String $token -AsPlainText -Force',
  '$cred = New-Object System.Management.Automation.PSCredential($account, $secure)',
  '$path = Join-Path $env:APPDATA ("agentpull_" + $account + ".xml")',
  '$cred | Export-CliXml -Path $path',
].join('; ')

const WIN_LOAD_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$account = $env:AGENTPULL_ACCOUNT',
  '$path = Join-Path $env:APPDATA ("agentpull_" + $account + ".xml")',
  '$cred = Import-CliXml -Path $path',
  'Write-Output $cred.GetNetworkCredential().Password',
].join('; ')

const WIN_DELETE_SCRIPT = [
  '$account = $env:AGENTPULL_ACCOUNT',
  '$path = Join-Path $env:APPDATA ("agentpull_" + $account + ".xml")',
  'Remove-Item -Path $path -Force -ErrorAction SilentlyContinue',
].join('; ')

function windowsStore(account: string, token: string): void {
  assertSafeAccount(account)
  execFileSync('powershell', ['-NonInteractive', '-NoProfile', '-Command', WIN_STORE_SCRIPT], {
    stdio: 'ignore',
    env: { ...process.env, AGENTPULL_ACCOUNT: account, AGENTPULL_TOKEN: token },
  })
}

function windowsLoad(account: string): string | null {
  assertSafeAccount(account)
  try {
    const result = execFileSync(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-Command', WIN_LOAD_SCRIPT],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, AGENTPULL_ACCOUNT: account },
      },
    )
    return result.trim() || null
  } catch {
    return null
  }
}

function windowsDelete(account: string): void {
  assertSafeAccount(account)
  try {
    execFileSync(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-Command', WIN_DELETE_SCRIPT],
      {
        stdio: 'ignore',
        env: { ...process.env, AGENTPULL_ACCOUNT: account },
      },
    )
  } catch {
    // Ignore
  }
}

/**
 * Per-provider keychain account key. The legacy `github-pat-{host}` form is
 * kept as a *read-only* fallback so users who authenticated with an older
 * agentpull don't have to log in again — `loadToken` migrates them transparently.
 */
function accountKey(provider: ProviderId, host: string): string {
  return `${provider}-pat-${host}`
}

function legacyGithubAccountKey(host: string): string {
  return `github-pat-${host}`
}

function rawStore(account: string, value: string): void {
  try {
    if (platform === 'darwin') {
      macosStore(account, value)
    } else if (platform === 'linux') {
      linuxStore(account, value)
    } else if (platform === 'win32') {
      windowsStore(account, value)
    } else {
      throw new AuthError(`Unsupported platform for keychain: ${platform}`)
    }
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError(`Failed to store token: ${(err as Error).message}`)
  }
}

function rawLoad(account: string): string | null {
  try {
    if (platform === 'darwin') return macosLoad(account)
    if (platform === 'linux') return linuxLoad(account)
    if (platform === 'win32') return windowsLoad(account)
    return null
  } catch {
    return null
  }
}

function rawDelete(account: string): void {
  if (platform === 'darwin') macosDelete(account)
  else if (platform === 'linux') linuxDelete(account)
  else if (platform === 'win32') windowsDelete(account)
}

export async function storeToken(
  provider: ProviderId,
  host: string,
  token: string,
): Promise<void> {
  rawStore(accountKey(provider, host), token)
}

export async function loadToken(
  provider: ProviderId,
  host: string,
): Promise<string | null> {
  const value = rawLoad(accountKey(provider, host))
  if (value != null) return value
  // Legacy fallback: older agentpull always stored github tokens at
  // `github-pat-{host}`. Migrate transparently on first read so we don't
  // strand users.
  if (provider === 'github') {
    const legacy = rawLoad(legacyGithubAccountKey(host))
    if (legacy != null) {
      try {
        rawStore(accountKey(provider, host), legacy)
      } catch {
        // Migration is best-effort: even if the new write fails we can still
        // hand the value to the caller.
      }
      return legacy
    }
  }
  return null
}

export async function deleteToken(provider: ProviderId, host: string): Promise<void> {
  rawDelete(accountKey(provider, host))
  if (provider === 'github') {
    rawDelete(legacyGithubAccountKey(host))
  }
}

/**
 * Serialize/deserialize a `StoredCredential` to/from the bare-string form
 * that the OS keychain stores. JSON-encoded credentials always start with
 * `{`, so a stored value that doesn't is treated as a legacy bare PAT.
 */
function serializeCredential(credential: StoredCredential): string {
  return JSON.stringify(credential)
}

function deserializeCredential(raw: string): StoredCredential {
  if (!raw.startsWith('{')) {
    return { kind: 'token', token: raw }
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (obj.kind === 'token' && typeof obj.token === 'string') {
        return { kind: 'token', token: obj.token }
      }
      if (
        obj.kind === 'basic' &&
        typeof obj.username === 'string' &&
        typeof obj.password === 'string'
      ) {
        return { kind: 'basic', username: obj.username, password: obj.password }
      }
    }
  } catch {
    // fall through to legacy interpretation
  }
  // Anything else (malformed JSON, wrong shape, wrong field types) is treated
  // as a legacy bare token. The downstream auth header builder won't crash on
  // a string token, even if the value itself is garbage.
  return { kind: 'token', token: raw }
}

/**
 * Polymorphic credential helpers. Use these from any new code path; bare
 * PAT-only flows can still call `storeToken`/`loadToken` directly.
 */
export async function storeCredential(
  provider: ProviderId,
  host: string,
  credential: StoredCredential,
): Promise<void> {
  await storeToken(provider, host, serializeCredential(credential))
}

export async function loadCredential(
  provider: ProviderId,
  host: string,
): Promise<StoredCredential | null> {
  const raw = await loadToken(provider, host)
  if (raw == null) return null
  return deserializeCredential(raw)
}
