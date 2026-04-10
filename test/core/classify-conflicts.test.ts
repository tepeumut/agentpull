import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyConflicts, hasWarnings, warnedFiles } from '../../src/core/classify-conflicts.js'
import { hashBuffer } from '../../src/utils/hash.js'
import type { Manifest } from '../../src/types/manifest.js'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'agentpull-classify-test-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

async function writeProjectFile(relPath: string, content: string): Promise<string> {
  const full = join(projectDir, relPath)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
  return hashBuffer(content)
}

function buildManifest(...entries: Array<{ name: string; files: Array<{ path: string; sha256: string }> }>): Manifest {
  return {
    version: 1,
    installed: entries.map((e) => ({
      name: e.name,
      source: 'https://github.com/x/y',
      ref: 'main',
      commitSha: 'a'.repeat(40),
      agentTypes: ['cursor'],
      files: e.files.map((f) => ({ path: f.path, sha256: f.sha256, sourcePath: f.path })),
      installedAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T00:00:00.000Z',
    })),
  }
}

describe('classifyConflicts', () => {
  it('classifies a hand-written file (not in any manifest entry)', async () => {
    await writeProjectFile('.cursor/agents/foo.md', 'hand-written content')
    const manifest = buildManifest({ name: 'team', files: [] })
    const result = await classifyConflicts({
      projectDir,
      manifest,
      currentEntryName: 'team',
      conflicts: ['.cursor/agents/foo.md'],
    })
    expect(result.handWritten).toHaveLength(1)
    expect(result.handWritten[0].relPath).toBe('.cursor/agents/foo.md')
    expect(result.trackedClean).toHaveLength(0)
    expect(result.trackedModified).toHaveLength(0)
    expect(result.trackedOther).toHaveLength(0)
  })

  it('classifies a tracked, unchanged file as tracked-clean', async () => {
    const sha = await writeProjectFile('.cursorrules', 'rules content')
    const manifest = buildManifest({
      name: 'team',
      files: [{ path: '.cursorrules', sha256: sha }],
    })
    const result = await classifyConflicts({
      projectDir,
      manifest,
      currentEntryName: 'team',
      conflicts: ['.cursorrules'],
    })
    expect(result.trackedClean).toHaveLength(1)
    expect(result.handWritten).toHaveLength(0)
    expect(result.trackedModified).toHaveLength(0)
  })

  it('classifies a tracked, edited file as tracked-modified', async () => {
    await writeProjectFile('.cursorrules', 'edited locally')
    // Manifest baseline has a different hash
    const manifest = buildManifest({
      name: 'team',
      files: [{ path: '.cursorrules', sha256: 'b'.repeat(64) }],
    })
    const result = await classifyConflicts({
      projectDir,
      manifest,
      currentEntryName: 'team',
      conflicts: ['.cursorrules'],
    })
    expect(result.trackedModified).toHaveLength(1)
    expect(result.trackedClean).toHaveLength(0)
    expect(result.handWritten).toHaveLength(0)
  })

  it('classifies cross-entry collisions as tracked-other', async () => {
    const sha = await writeProjectFile('AGENTS.md', 'shared content')
    // File is owned by a DIFFERENT entry from the one being installed
    const manifest = buildManifest({
      name: 'legacy-team',
      files: [{ path: 'AGENTS.md', sha256: sha }],
    })
    const result = await classifyConflicts({
      projectDir,
      manifest,
      currentEntryName: 'new-team',
      conflicts: ['AGENTS.md'],
    })
    expect(result.trackedOther).toHaveLength(1)
    expect(result.trackedOther[0].ownerEntry).toBe('legacy-team')
    expect(result.handWritten).toHaveLength(0)
  })

  it('handles a mix of all four classifications in one call', async () => {
    const cleanSha = await writeProjectFile('clean.md', 'clean')
    await writeProjectFile('modified.md', 'edited')
    const otherSha = await writeProjectFile('other.md', 'other')
    await writeProjectFile('hand.md', 'handwritten')

    const manifest = buildManifest(
      {
        name: 'team',
        files: [
          { path: 'clean.md', sha256: cleanSha },
          { path: 'modified.md', sha256: 'b'.repeat(64) }, // baseline differs
        ],
      },
      {
        name: 'other-team',
        files: [{ path: 'other.md', sha256: otherSha }],
      },
    )

    const result = await classifyConflicts({
      projectDir,
      manifest,
      currentEntryName: 'team',
      conflicts: ['clean.md', 'modified.md', 'other.md', 'hand.md'],
    })

    expect(result.trackedClean.map((f) => f.relPath)).toEqual(['clean.md'])
    expect(result.trackedModified.map((f) => f.relPath)).toEqual(['modified.md'])
    expect(result.trackedOther.map((f) => f.relPath)).toEqual(['other.md'])
    expect(result.handWritten.map((f) => f.relPath)).toEqual(['hand.md'])
  })

  it('hasWarnings is true when any non-clean conflict exists', async () => {
    const result = {
      trackedClean: [],
      trackedModified: [],
      trackedOther: [],
      handWritten: [{ relPath: 'foo.md', classification: 'hand-written' as const }],
    }
    expect(hasWarnings(result)).toBe(true)
  })

  it('hasWarnings is false when only tracked-clean conflicts exist', async () => {
    const result = {
      trackedClean: [{ relPath: 'foo.md', classification: 'tracked-clean' as const }],
      trackedModified: [],
      trackedOther: [],
      handWritten: [],
    }
    expect(hasWarnings(result)).toBe(false)
  })

  it('warnedFiles returns hand-written + tracked-other + tracked-modified', () => {
    const result = {
      trackedClean: [{ relPath: 'a.md', classification: 'tracked-clean' as const }],
      trackedModified: [{ relPath: 'b.md', classification: 'tracked-modified' as const }],
      trackedOther: [{ relPath: 'c.md', classification: 'tracked-other' as const }],
      handWritten: [{ relPath: 'd.md', classification: 'hand-written' as const }],
    }
    const warned = warnedFiles(result)
    expect(warned).toEqual(['d.md', 'c.md', 'b.md'])
    expect(warned).not.toContain('a.md')
  })
})
