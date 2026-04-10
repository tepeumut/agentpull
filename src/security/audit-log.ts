import { mkdir, readFile, open } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, userInfo } from 'node:os'
import { fileExists } from '../utils/fs.js'

const AUDIT_DIR = join(homedir(), '.agentpull')
const AUDIT_PATH = join(AUDIT_DIR, 'audit.log')

export type AuditOperation = 'add' | 'update' | 'remove' | 'scan' | 'auth'
export type AuditResult = 'success' | 'failure' | 'blocked'

export interface AuditEntry {
  timestamp: string
  operation: AuditOperation
  source?: string
  name?: string
  files?: string[]
  user: string
  result: AuditResult
  details?: string
}

export async function appendAuditEntry(entry: Omit<AuditEntry, 'timestamp' | 'user'>): Promise<void> {
  await mkdir(AUDIT_DIR, { recursive: true, mode: 0o700 })
  const full: AuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    user: (() => { try { return userInfo().username } catch { return 'unknown' } })(),
  }
  // Open with O_APPEND and owner-only mode. The mode flag on `open` only
  // applies when the file is created, so we also chmod after opening to
  // tighten permissions on any pre-existing file (e.g., one created by an
  // older agentpull version or loosened by an admin).
  const fh = await open(AUDIT_PATH, 'a', 0o600)
  try {
    await fh.chmod(0o600).catch(() => undefined)
    await fh.appendFile(JSON.stringify(full) + '\n', 'utf-8')
  } finally {
    await fh.close()
  }
}

export interface ReadAuditOptions {
  limit?: number
  operation?: string
}

export async function readAuditLog(opts: ReadAuditOptions = {}): Promise<AuditEntry[]> {
  if (!(await fileExists(AUDIT_PATH))) return []

  const raw = await readFile(AUDIT_PATH, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)
  let entries: AuditEntry[] = []

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as AuditEntry)
    } catch {
      // Skip malformed lines
    }
  }

  if (opts.operation) {
    entries = entries.filter((e) => e.operation === opts.operation)
  }

  // Return most recent first
  entries.reverse()

  if (opts.limit) {
    entries = entries.slice(0, opts.limit)
  }

  return entries
}
