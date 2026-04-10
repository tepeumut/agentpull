export const AGENT_TYPES = [
  'cursor',
  'copilot',
  'vscode',
  'claude',
  'windsurf',
  'antigravity',
  'aider',
  'cline',
  'continue',
  'cross-agent',
] as const

export type AgentType = (typeof AGENT_TYPES)[number]

export interface InstalledFile {
  /** Relative path in the user's project */
  path: string
  /** SHA-256 checksum at install time */
  sha256: string
  /** Path within the source repo */
  sourcePath: string
}

export interface InstalledEntry {
  /** Short name or full URL used in agentpull add */
  name: string
  /** Canonical GitHub URL */
  source: string
  /** Branch, tag, or commit ref used */
  ref: string
  /** Pinned commit SHA at install time */
  commitSha: string
  /** Which agent types were installed from this source */
  agentTypes: AgentType[]
  /** Every file installed */
  files: InstalledFile[]
  /** ISO timestamp of initial install */
  installedAt: string
  /** ISO timestamp of last update */
  updatedAt: string
}

export type RegistryProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'git'

export interface RegistryEntry {
  /** Short name (e.g., "project-a") */
  name: string
  /** Full canonical repository URL */
  url: string
  /**
   * Optional provider hint. When absent, the resolver infers it from the URL.
   * Set this for self-hosted instances or when forcing the generic git fallback.
   */
  provider?: RegistryProviderId
  /** Optional host override (for self-hosted instances). */
  host?: string
  /** Optional subdirectory within the repo */
  subdir?: string
  /** Optional default branch/tag */
  defaultRef?: string
}

export interface AgentpullDefaults {
  conflictResolution: 'prompt' | 'skip' | 'overwrite'
  autoScan: boolean
}
