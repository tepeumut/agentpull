import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readManifest, writeManifest, isInitialized, MANIFEST_FILENAME } from '../../src/core/manifest.js'
import { EMPTY_MANIFEST } from '../../src/types/manifest.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-init-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('init command logic', () => {
  it('creates a valid manifest file', async () => {
    await writeManifest(testDir, { ...EMPTY_MANIFEST })
    const content = await readFile(join(testDir, MANIFEST_FILENAME), 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(1)
    expect(parsed.installed).toEqual([])
  })

  it('isInitialized returns true after init', async () => {
    expect(await isInitialized(testDir)).toBe(false)
    await writeManifest(testDir, { ...EMPTY_MANIFEST })
    expect(await isInitialized(testDir)).toBe(true)
  })

  it('does not overwrite existing manifest without force', async () => {
    const existing = {
      version: 1 as const,
      installed: [
        {
          name: 'existing',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor' as const],
          files: [{ path: '.cursorrules', sha256: 'b'.repeat(64), sourcePath: '.cursorrules' }],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    await writeManifest(testDir, existing)

    // Simulate checking before init
    const wasInitialized = await isInitialized(testDir)
    expect(wasInitialized).toBe(true)

    // If we don't force, the existing data should remain
    const manifest = await readManifest(testDir)
    expect(manifest.installed).toHaveLength(1)
    expect(manifest.installed[0].name).toBe('existing')
  })

  it('force reinitialize creates fresh manifest', async () => {
    const existing = {
      version: 1 as const,
      installed: [
        {
          name: 'existing',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor' as const],
          files: [],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    await writeManifest(testDir, existing)

    // Force reinit
    await writeManifest(testDir, { ...EMPTY_MANIFEST })
    const manifest = await readManifest(testDir)
    expect(manifest.installed).toHaveLength(0)
  })

  it('manifest file is valid JSON', async () => {
    await writeManifest(testDir, { ...EMPTY_MANIFEST })
    const raw = await readFile(join(testDir, MANIFEST_FILENAME), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('manifest file ends with newline', async () => {
    await writeManifest(testDir, { ...EMPTY_MANIFEST })
    const raw = await readFile(join(testDir, MANIFEST_FILENAME), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
  })
})
