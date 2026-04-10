import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, stat, chmod } from 'node:fs/promises'
import { tmpdir, platform } from 'node:os'
import { join } from 'node:path'

// Redirect ~/.agentpull to a per-test temp dir by mocking os.homedir *before*
// importing the module — AUDIT_PATH is computed at import time.
let testHome: string

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => testHome,
  }
})

beforeEach(async () => {
  testHome = await mkdtemp(join(tmpdir(), 'agentpull-audit-test-'))
  vi.resetModules()
})

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true })
})

async function loadModule() {
  return await import('../../src/security/audit-log.js')
}

describe('audit-log', () => {
  it('appendAuditEntry writes a JSON line to ~/.agentpull/audit.log', async () => {
    const { appendAuditEntry } = await loadModule()
    await appendAuditEntry({ operation: 'add', name: 'x', result: 'success' })

    const auditPath = join(testHome, '.agentpull', 'audit.log')
    const raw = await readFile(auditPath, 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(raw.trim())
    expect(parsed.operation).toBe('add')
    expect(parsed.name).toBe('x')
    expect(parsed.result).toBe('success')
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(typeof parsed.user).toBe('string')
  })

  it('appends multiple entries without clobbering', async () => {
    const { appendAuditEntry, readAuditLog } = await loadModule()
    await appendAuditEntry({ operation: 'add', name: 'a', result: 'success' })
    await appendAuditEntry({ operation: 'remove', name: 'a', result: 'success' })
    await appendAuditEntry({ operation: 'update', name: 'a', result: 'failure' })

    const entries = await readAuditLog()
    expect(entries).toHaveLength(3)
    // readAuditLog returns most-recent first
    expect(entries[0].operation).toBe('update')
    expect(entries[2].operation).toBe('add')
  })

  it('readAuditLog returns [] when file does not exist', async () => {
    const { readAuditLog } = await loadModule()
    expect(await readAuditLog()).toEqual([])
  })

  it('readAuditLog filters by operation', async () => {
    const { appendAuditEntry, readAuditLog } = await loadModule()
    await appendAuditEntry({ operation: 'add', result: 'success' })
    await appendAuditEntry({ operation: 'remove', result: 'success' })
    await appendAuditEntry({ operation: 'add', result: 'blocked' })

    const adds = await readAuditLog({ operation: 'add' })
    expect(adds).toHaveLength(2)
    expect(adds.every((e) => e.operation === 'add')).toBe(true)
  })

  it('readAuditLog respects limit and returns most-recent first', async () => {
    const { appendAuditEntry, readAuditLog } = await loadModule()
    for (let i = 0; i < 5; i++) {
      await appendAuditEntry({ operation: 'add', name: `entry-${i}`, result: 'success' })
    }
    const limited = await readAuditLog({ limit: 2 })
    expect(limited).toHaveLength(2)
    expect(limited[0].name).toBe('entry-4')
    expect(limited[1].name).toBe('entry-3')
  })

  it('skips malformed JSON lines instead of crashing', async () => {
    const { appendAuditEntry, readAuditLog } = await loadModule()
    await appendAuditEntry({ operation: 'add', result: 'success' })
    // Manually append a garbage line
    const auditPath = join(testHome, '.agentpull', 'audit.log')
    const { appendFile } = await import('node:fs/promises')
    await appendFile(auditPath, 'not json\n')
    await appendAuditEntry({ operation: 'remove', result: 'success' })

    const entries = await readAuditLog()
    expect(entries).toHaveLength(2)
  })

  it('audit log file has owner-only permissions', async () => {
    if (platform() === 'win32') return // no POSIX modes on Windows
    const { appendAuditEntry } = await loadModule()
    await appendAuditEntry({ operation: 'add', result: 'success' })
    const auditPath = join(testHome, '.agentpull', 'audit.log')
    const st = await stat(auditPath)
    // Low 9 bits = rwxrwxrwx; 0o600 = owner read/write only.
    expect(st.mode & 0o777).toBe(0o600)
  })

  it('tightens permissions on a pre-existing loose audit log', async () => {
    if (platform() === 'win32') return
    const { appendAuditEntry } = await loadModule()
    // First write creates the file with 0o600.
    await appendAuditEntry({ operation: 'add', result: 'success' })
    const auditPath = join(testHome, '.agentpull', 'audit.log')
    // Simulate a loosened file (e.g., from an older version).
    await chmod(auditPath, 0o644)
    // Next append should tighten it back to 0o600.
    await appendAuditEntry({ operation: 'add', result: 'success' })
    const st = await stat(auditPath)
    expect(st.mode & 0o777).toBe(0o600)
  })
})
