import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fileExists,
  readJson,
  writeJson,
  ensureDir,
  safeCopy,
  isEmptyDir,
  removeEmptyDirs,
} from '../../src/utils/fs.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-fs-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('fileExists', () => {
  it('returns true for existing file', async () => {
    const p = join(testDir, 'exists.txt')
    await writeFile(p, 'content')
    expect(await fileExists(p)).toBe(true)
  })

  it('returns false for nonexistent file', async () => {
    expect(await fileExists(join(testDir, 'nope.txt'))).toBe(false)
  })

  it('returns true for directories', async () => {
    expect(await fileExists(testDir)).toBe(true)
  })
})

describe('readJson / writeJson', () => {
  it('round-trips an object', async () => {
    const p = join(testDir, 'data.json')
    const data = { version: 1, items: ['a', 'b'] }
    await writeJson(p, data)
    const read = await readJson<typeof data>(p)
    expect(read).toEqual(data)
  })

  it('pretty-prints with 2 spaces and trailing newline', async () => {
    const p = join(testDir, 'pretty.json')
    await writeJson(p, { a: 1 })
    const raw = await readFile(p, 'utf-8')
    expect(raw).toBe('{\n  "a": 1\n}\n')
  })

  it('creates parent directories if needed', async () => {
    const p = join(testDir, 'a', 'b', 'c', 'deep.json')
    await writeJson(p, { deep: true })
    expect(await readJson(p)).toEqual({ deep: true })
  })

  it('overwrites existing file', async () => {
    const p = join(testDir, 'overwrite.json')
    await writeJson(p, { v: 1 })
    await writeJson(p, { v: 2 })
    expect(await readJson(p)).toEqual({ v: 2 })
  })

  it('throws on malformed JSON', async () => {
    const p = join(testDir, 'bad.json')
    await writeFile(p, '{invalid json}')
    await expect(readJson(p)).rejects.toThrow()
  })
})

describe('ensureDir', () => {
  it('creates directory recursively', async () => {
    const p = join(testDir, 'x', 'y', 'z')
    await ensureDir(p)
    expect(await fileExists(p)).toBe(true)
  })

  it('does not throw if directory already exists', async () => {
    await ensureDir(testDir)
    expect(await fileExists(testDir)).toBe(true)
  })
})

describe('safeCopy', () => {
  it('copies a file to a new location', async () => {
    const src = join(testDir, 'src.txt')
    const dest = join(testDir, 'dest.txt')
    await writeFile(src, 'hello')
    await safeCopy(src, dest)
    expect(await readFile(dest, 'utf-8')).toBe('hello')
  })

  it('creates parent dirs for the destination', async () => {
    const src = join(testDir, 'src.txt')
    const dest = join(testDir, 'sub', 'dir', 'dest.txt')
    await writeFile(src, 'data')
    await safeCopy(src, dest)
    expect(await readFile(dest, 'utf-8')).toBe('data')
  })

  it('overwrites existing destination', async () => {
    const src = join(testDir, 'src.txt')
    const dest = join(testDir, 'dest.txt')
    await writeFile(src, 'new')
    await writeFile(dest, 'old')
    await safeCopy(src, dest)
    expect(await readFile(dest, 'utf-8')).toBe('new')
  })
})

describe('isEmptyDir', () => {
  it('returns true for an empty directory', async () => {
    const p = join(testDir, 'empty')
    await mkdir(p)
    expect(await isEmptyDir(p)).toBe(true)
  })

  it('returns false for a non-empty directory', async () => {
    await writeFile(join(testDir, 'file.txt'), '')
    expect(await isEmptyDir(testDir)).toBe(false)
  })

  it('returns false for a nonexistent path', async () => {
    expect(await isEmptyDir(join(testDir, 'nope'))).toBe(false)
  })
})

describe('removeEmptyDirs', () => {
  it('removes nested empty dirs up to stopAt', async () => {
    const deep = join(testDir, 'a', 'b', 'c')
    await mkdir(deep, { recursive: true })
    await removeEmptyDirs(deep, testDir)
    // a/b/c, a/b, a should all be removed
    expect(await fileExists(join(testDir, 'a'))).toBe(false)
  })

  it('stops when directory is not empty', async () => {
    const deep = join(testDir, 'a', 'b', 'c')
    await mkdir(deep, { recursive: true })
    await writeFile(join(testDir, 'a', 'keep.txt'), 'keep')
    await removeEmptyDirs(deep, testDir)
    // c and b are removed, but a stays because it has keep.txt
    expect(await fileExists(join(testDir, 'a', 'keep.txt'))).toBe(true)
    expect(await fileExists(join(testDir, 'a', 'b'))).toBe(false)
  })

  it('does not go above stopAt', async () => {
    const deep = join(testDir, 'a')
    await mkdir(deep)
    await removeEmptyDirs(deep, testDir)
    // testDir itself should still exist
    expect(await fileExists(testDir)).toBe(true)
  })
})
