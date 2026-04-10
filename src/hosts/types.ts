/**
 * Host provider abstraction.
 *
 * Each git host (GitHub, GitLab, Bitbucket, Azure DevOps, generic git) is
 * implemented as a `HostProvider`. The downloader/registry call into the
 * provider for everything host-specific: URL parsing, commit SHA resolution,
 * tarball URL building, auth headers, and the redirect host allowlist.
 *
 * Adding a new host is now an isolated change — drop a new file under
 * `src/hosts/`, register it in `index.ts`, and the rest of the system picks
 * it up automatically.
 */

export type ProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'git'

/**
 * Credential payload accepted by `HostProvider.getAuthHeaders`. PAT-style
 * providers use `{kind:'token'}`; Bitbucket-style providers that need a
 * username + app password use `{kind:'basic'}`.
 */
export type Credential =
  | { kind: 'token'; token: string }
  | { kind: 'basic'; username: string; password: string }

/**
 * The shape of a repository as parsed from a URL or registry entry.
 * `host` is the hostname (e.g. `github.com`, `gitlab.example.com`); `owner`
 * and `repo` semantics are provider-defined (Azure uses org/project/repo
 * triples that are flattened into these fields).
 */
export interface RepoSpec {
  host: string
  owner: string
  repo: string
  /** Subdirectory within the repo, if any */
  subdir?: string
  /** Ref (branch/tag/commit) if specified */
  ref?: string
}

export interface HostProvider {
  /** Stable identifier used in registry entries and keychain account keys. */
  id: ProviderId
  /** Human-friendly label shown in `select` prompts. */
  displayName: string
  /** Default hostname when the user doesn't specify one. */
  defaultHost: string
  /** True if the user can point this provider at a custom host (gitlab/azure/git). */
  selfHosted: boolean
  /**
   * True if this provider authenticates with a single PAT-style token. False
   * for providers that need a username + secret pair (Bitbucket app passwords).
   */
  usesPAT: boolean

  /** Parse a URL/shorthand into a `RepoSpec`, or `null` if it doesn't match. */
  parseUrl(input: string): RepoSpec | null

  /** Build the canonical https URL for a spec — used as the manifest source. */
  canonicalUrl(spec: RepoSpec): string

  /** Resolve a ref to a 40-char commit SHA via the provider's API. */
  getCommitSha(spec: RepoSpec, credential?: Credential): Promise<string>

  /** Build the URL the downloader should fetch to get a gzipped tarball. */
  getTarballUrl(spec: RepoSpec, sha: string): string

  /** Headers to send on API + tarball requests. Empty object if no credential. */
  getAuthHeaders(credential?: Credential): Record<string, string>

  /**
   * Hostnames the downloader is allowed to follow a redirect to. Tokens are
   * stripped on cross-host redirects, so this list controls which CDNs we'll
   * even talk to.
   */
  getAllowedRedirectHosts(spec: RepoSpec): string[]

  /**
   * Number of leading path components to strip when extracting the tarball.
   * All current providers wrap their archive in a single root directory, so
   * this defaults to 1 — override only if a host emits a flat archive.
   */
  getRootDirStrip(): number

  /**
   * Optional: when this returns a non-empty URL, the downloader uses
   * `git clone` instead of the tarball flow. The Generic Git provider
   * always returns a URL; Azure DevOps returns one as a fallback because
   * its REST API has no stable archive endpoint. Tarball providers return
   * `null`.
   */
  getCloneUrl?(spec: RepoSpec): string | null
}
