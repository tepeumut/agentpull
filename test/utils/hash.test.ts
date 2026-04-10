import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashBuffer, hashFile } from '../../src/utils/hash.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-hash-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('hashBuffer', () => {
  it('returns a 64-character hex string', () => {
    const result = hashBuffer('hello')
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces consistent output for the same input', () => {
    expect(hashBuffer('test')).toBe(hashBuffer('test'))
  })

  it('produces different output for different inputs', () => {
    expect(hashBuffer('a')).not.toBe(hashBuffer('b'))
  })

  it('handles empty string', () => {
    const result = hashBuffer('')
    expect(result).toMatch(/^[a-f0-9]{64}$/)
    // SHA-256 of empty string is well-known
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('handles Buffer input', () => {
    const buf = Buffer.from('hello', 'utf-8')
    expect(hashBuffer(buf)).toBe(hashBuffer('hello'))
  })
})

describe('hashFile', () => {
  it('hashes a file on disk', async () => {
    const filePath = join(testDir, 'test.txt')
    await writeFile(filePath, 'hello world')
    const result = await hashFile(filePath)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
    expect(result).toBe(hashBuffer('hello world'))
  })

  it('produces same hash as hashBuffer for same content', async () => {
    const content = 'line1\nline2\nline3'
    const filePath = join(testDir, 'multi.txt')
    await writeFile(filePath, content)
    expect(await hashFile(filePath)).toBe(hashBuffer(content))
  })

  it('handles empty files', async () => {
    const filePath = join(testDir, 'empty.txt')
    await writeFile(filePath, '')
    expect(await hashFile(filePath)).toBe(hashBuffer(''))
  })

  it('rejects for nonexistent files', async () => {
    await expect(hashFile(join(testDir, 'nonexistent'))).rejects.toThrow()
  })

  it('handles binary content', async () => {
    const filePath = join(testDir, 'binary.bin')
    const buf = Buffer.from([0x00, 0x01, 0xff, 0xfe])
    await writeFile(filePath, buf)
    const result = await hashFile(filePath)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })
})
