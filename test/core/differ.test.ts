import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffFiles } from '../../src/core/differ.js'
import { hashBuffer } from '../../src/utils/hash.js'

let extractDir: string
let projectDir: string

beforeEach(async () => {
  extractDir = await mkdtemp(join(tmpdir(), 'agentpull-diff-extract-'))
  projectDir = await mkdtemp(join(tmpdir(), 'agentpull-diff-project-'))
})

afterEach(async () => {
  await rm(extractDir, { recursive: true, force: true })
  await rm(projectDir, { recursive: true, force: true })
})

describe('diffFiles', () => {
  it('detects added files', async () => {
    // New version has a file that didn't exist before
    await writeFile(join(extractDir, 'new-file.md'), 'new content')

    const result = await diffFiles(extractDir, ['new-file.md'], [], projectDir)
    expect(result.added).toEqual(['new-file.md'])
    expect(result.modified).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('detects removed files', async () => {
    // Old version had a file that no longer exists in the new version
    const oldContent = 'old content'
    const sha = hashBuffer(oldContent)

    const result = await diffFiles(extractDir, [], [
      { path: '.cursorrules', sha256: sha, sourcePath: '.cursorrules' },
    ], projectDir)

    expect(result.removed).toEqual(['.cursorrules'])
    expect(result.added).toEqual([])
  })

  it('detects modified files (upstream changed)', async () => {
    const oldContent = 'version 1'
    const newContent = 'version 2'
    const oldSha = hashBuffer(oldContent)

    await writeFile(join(extractDir, 'rules.md'), newContent)
    await writeFile(join(projectDir, 'rules.md'), oldContent)

    const result = await diffFiles(
      extractDir,
      ['rules.md'],
      [{ path: 'rules.md', sha256: oldSha, sourcePath: 'rules.md' }],
      projectDir,
    )

    expect(result.modified).toEqual(['rules.md'])
  })

  it('detects locally modified files', async () => {
    const originalContent = 'original'
    const localContent = 'user edited this'
    const originalSha = hashBuffer(originalContent)

    // Upstream still has the same content
    await writeFile(join(extractDir, 'rules.md'), originalContent)
    // But user modified it locally
    await writeFile(join(projectDir, 'rules.md'), localContent)

    const result = await diffFiles(
      extractDir,
      ['rules.md'],
      [{ path: 'rules.md', sha256: originalSha, sourcePath: 'rules.md' }],
      projectDir,
    )

    expect(result.locallyModified).toEqual(['rules.md'])
  })

  it('reports no changes when nothing changed', async () => {
    const content = 'same content'
    const sha = hashBuffer(content)

    await writeFile(join(extractDir, 'file.md'), content)
    await writeFile(join(projectDir, 'file.md'), content)

    const result = await diffFiles(
      extractDir,
      ['file.md'],
      [{ path: 'file.md', sha256: sha, sourcePath: 'file.md' }],
      projectDir,
    )

    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.locallyModified).toEqual([])
  })

  it('handles complex scenario with mixed changes', async () => {
    const keepContent = 'keep'
    const keepSha = hashBuffer(keepContent)
    const changedOld = 'old'
    const changedOldSha = hashBuffer(changedOld)
    const changedNew = 'new'

    await writeFile(join(extractDir, 'kept.md'), keepContent)
    await writeFile(join(extractDir, 'changed.md'), changedNew)
    await writeFile(join(extractDir, 'added.md'), 'brand new')

    await writeFile(join(projectDir, 'kept.md'), keepContent)
    await writeFile(join(projectDir, 'changed.md'), changedOld)

    const result = await diffFiles(
      extractDir,
      ['kept.md', 'changed.md', 'added.md'],
      [
        { path: 'kept.md', sha256: keepSha, sourcePath: 'kept.md' },
        { path: 'changed.md', sha256: changedOldSha, sourcePath: 'changed.md' },
        { path: 'removed.md', sha256: 'x'.repeat(64), sourcePath: 'removed.md' },
      ],
      projectDir,
    )

    expect(result.added).toEqual(['added.md'])
    expect(result.modified).toEqual(['changed.md'])
    expect(result.removed).toEqual(['removed.md'])
  })

  it('handles missing project file gracefully', async () => {
    const sha = hashBuffer('content')
    await writeFile(join(extractDir, 'file.md'), 'content')
    // Project file doesn't exist (user deleted it)

    const result = await diffFiles(
      extractDir,
      ['file.md'],
      [{ path: 'file.md', sha256: sha, sourcePath: 'file.md' }],
      projectDir,
    )

    // Should not crash, and should not report as locally modified (file is missing)
    expect(result.locallyModified).toEqual([])
  })
})
