import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeFileHashes, verifyFiles } from '../../src/security/integrity.js'
import { hashBuffer } from '../../src/utils/hash.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-integrity-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('computeFileHashes', () => {
  it('computes hashes for multiple files', async () => {
    await writeFile(join(testDir, 'a.txt'), 'aaa')
    await writeFile(join(testDir, 'b.txt'), 'bbb')

    const hashes = await computeFileHashes(testDir, ['a.txt', 'b.txt'])
    expect(hashes.size).toBe(2)
    expect(hashes.get('a.txt')).toBe(hashBuffer('aaa'))
    expect(hashes.get('b.txt')).toBe(hashBuffer('bbb'))
  })

  it('returns empty map for empty file list', async () => {
    const hashes = await computeFileHashes(testDir, [])
    expect(hashes.size).toBe(0)
  })
})

describe('verifyFiles', () => {
  it('returns ok:true when all files match', async () => {
    const content = 'hello world'
    const sha = hashBuffer(content)
    await writeFile(join(testDir, 'file.md'), content)

    const result = await verifyFiles(testDir, [
      { path: 'file.md', sha256: sha, sourcePath: 'file.md' },
    ])

    expect(result.ok).toBe(true)
    expect(result.modified).toEqual([])
    expect(result.missing).toEqual([])
  })

  it('detects modified files', async () => {
    const originalSha = hashBuffer('original')
    await writeFile(join(testDir, 'file.md'), 'modified content')

    const result = await verifyFiles(testDir, [
      { path: 'file.md', sha256: originalSha, sourcePath: 'file.md' },
    ])

    expect(result.ok).toBe(false)
    expect(result.modified).toEqual(['file.md'])
  })

  it('detects missing files', async () => {
    const result = await verifyFiles(testDir, [
      { path: 'gone.md', sha256: 'a'.repeat(64), sourcePath: 'gone.md' },
    ])

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['gone.md'])
  })

  it('handles mix of valid, modified, and missing', async () => {
    const goodContent = 'good'
    const goodSha = hashBuffer(goodContent)
    await writeFile(join(testDir, 'good.md'), goodContent)

    const modifiedSha = hashBuffer('version1')
    await writeFile(join(testDir, 'changed.md'), 'version2')

    const result = await verifyFiles(testDir, [
      { path: 'good.md', sha256: goodSha, sourcePath: 'good.md' },
      { path: 'changed.md', sha256: modifiedSha, sourcePath: 'changed.md' },
      { path: 'missing.md', sha256: 'f'.repeat(64), sourcePath: 'missing.md' },
    ])

    expect(result.ok).toBe(false)
    expect(result.modified).toEqual(['changed.md'])
    expect(result.missing).toEqual(['missing.md'])
  })

  it('returns ok:true for empty file list', async () => {
    const result = await verifyFiles(testDir, [])
    expect(result.ok).toBe(true)
  })
})
