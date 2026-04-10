import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readManifest,
  writeManifest,
  addEntry,
  removeEntry,
  findEntry,
  isInitialized,
} from '../../src/core/manifest.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-manifest-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

const sampleEntry = {
  name: 'test-repo',
  source: 'https://github.com/owner/repo',
  ref: 'main',
  commitSha: 'a'.repeat(40),
  agentTypes: ['cursor' as const],
  files: [{ path: '.cursorrules', sha256: 'b'.repeat(64), sourcePath: '.cursorrules' }],
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('manifest', () => {
  it('returns empty manifest when file does not exist', async () => {
    const m = await readManifest(testDir)
    expect(m.version).toBe(1)
    expect(m.installed).toHaveLength(0)
  })

  it('isInitialized returns false when manifest missing', async () => {
    expect(await isInitialized(testDir)).toBe(false)
  })

  it('writes and reads a manifest', async () => {
    await writeManifest(testDir, { version: 1, installed: [sampleEntry] })
    const m = await readManifest(testDir)
    expect(m.installed).toHaveLength(1)
    expect(m.installed[0].name).toBe('test-repo')
  })

  it('isInitialized returns true after write', async () => {
    await writeManifest(testDir, { version: 1, installed: [] })
    expect(await isInitialized(testDir)).toBe(true)
  })

  it('addEntry adds a new entry', async () => {
    await addEntry(testDir, sampleEntry)
    const m = await readManifest(testDir)
    expect(m.installed).toHaveLength(1)
  })

  it('addEntry updates an existing entry', async () => {
    await addEntry(testDir, sampleEntry)
    await addEntry(testDir, { ...sampleEntry, ref: 'v2' })
    const m = await readManifest(testDir)
    expect(m.installed).toHaveLength(1)
    expect(m.installed[0].ref).toBe('v2')
  })

  it('removeEntry removes an entry', async () => {
    await addEntry(testDir, sampleEntry)
    const removed = await removeEntry(testDir, 'test-repo')
    expect(removed).toBe(true)
    const m = await readManifest(testDir)
    expect(m.installed).toHaveLength(0)
  })

  it('removeEntry returns false when entry not found', async () => {
    const removed = await removeEntry(testDir, 'nonexistent')
    expect(removed).toBe(false)
  })

  it('findEntry returns the entry', async () => {
    await addEntry(testDir, sampleEntry)
    const found = await findEntry(testDir, 'test-repo')
    expect(found?.name).toBe('test-repo')
  })

  it('findEntry returns undefined when not found', async () => {
    const found = await findEntry(testDir, 'missing')
    expect(found).toBeUndefined()
  })
})
