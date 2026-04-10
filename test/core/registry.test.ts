import { describe, it, expect } from 'vitest'
import { parseRepoUrl } from '../../src/core/registry.js'

describe('parseRepoUrl', () => {
  it('parses a full https URL', () => {
    const r = parseRepoUrl('https://github.com/anthropics/claude-code')
    expect(r).toMatchObject({ owner: 'anthropics', repo: 'claude-code', name: 'claude-code', canonicalUrl: 'https://github.com/anthropics/claude-code' })
    expect(r?.subdir).toBeUndefined()
    expect(r?.ref).toBeUndefined()
  })

  it('parses github.com/ prefix without scheme', () => {
    const r = parseRepoUrl('github.com/owner/repo')
    expect(r).toMatchObject({ owner: 'owner', repo: 'repo', canonicalUrl: 'https://github.com/owner/repo' })
  })

  it('parses bare owner/repo', () => {
    const r = parseRepoUrl('owner/repo')
    expect(r).toMatchObject({ owner: 'owner', repo: 'repo' })
  })

  it('parses URL with subdirectory', () => {
    const r = parseRepoUrl('github.com/company/agents/project-a')
    expect(r).toMatchObject({
      owner: 'company',
      repo: 'agents',
      subdir: 'project-a',
      name: 'project-a',
      canonicalUrl: 'https://github.com/company/agents',
    })
  })

  it('parses URL with nested subdirectory', () => {
    const r = parseRepoUrl('github.com/company/monorepo/agents/typescript')
    expect(r).toMatchObject({
      subdir: 'agents/typescript',
      name: 'typescript',
    })
  })

  it('parses ref from # suffix', () => {
    const r = parseRepoUrl('owner/repo/subdir#main')
    expect(r).toMatchObject({ subdir: 'subdir', ref: 'main' })
  })

  it('returns null for unrecognised URLs', () => {
    expect(parseRepoUrl('not-a-url')).toBeNull()
    expect(parseRepoUrl('https://example.com/owner/repo')).toBeNull()
  })

  it('parses gitlab URLs into the gitlab provider', () => {
    const r = parseRepoUrl('https://gitlab.com/owner/repo')
    expect(r).toMatchObject({ provider: 'gitlab', host: 'gitlab.com', owner: 'owner', repo: 'repo' })
  })

  it('handles http:// scheme', () => {
    const r = parseRepoUrl('http://github.com/owner/repo')
    expect(r).toMatchObject({ owner: 'owner', repo: 'repo' })
  })

  it('handles trailing slash on repo', () => {
    const r = parseRepoUrl('github.com/owner/repo/')
    // Trailing slash creates empty subdir which normalises to undefined
    expect(r).not.toBeNull()
    expect(r?.owner).toBe('owner')
    expect(r?.repo).toBe('repo')
  })

  it('handles trailing slash on subdirectory', () => {
    const r = parseRepoUrl('github.com/owner/repo/subdir/')
    expect(r?.subdir).toBe('subdir')
  })

  it('derives name from repo when no subdir', () => {
    const r = parseRepoUrl('owner/my-rules')
    expect(r?.name).toBe('my-rules')
  })

  it('derives name from last subdir segment', () => {
    const r = parseRepoUrl('owner/repo/deep/nested/folder')
    expect(r?.name).toBe('folder')
  })

  it('handles ref with tag-like format', () => {
    const r = parseRepoUrl('owner/repo#v1.2.3')
    expect(r?.ref).toBe('v1.2.3')
  })

  it('handles ref with commit SHA', () => {
    const sha = 'abc123def456'
    const r = parseRepoUrl(`owner/repo#${sha}`)
    expect(r?.ref).toBe(sha)
  })

  it('handles ref with subdir', () => {
    const r = parseRepoUrl('owner/repo/configs#develop')
    expect(r?.subdir).toBe('configs')
    expect(r?.ref).toBe('develop')
  })

  it('trims whitespace', () => {
    const r = parseRepoUrl('  github.com/owner/repo  ')
    expect(r?.owner).toBe('owner')
  })

  it('returns null for empty string', () => {
    expect(parseRepoUrl('')).toBeNull()
  })

  it('returns null for just a slash', () => {
    expect(parseRepoUrl('/')).toBeNull()
  })

  it('returns null for just owner (no repo)', () => {
    // This becomes github.com/owner which doesn't match our regex requiring /repo
    expect(parseRepoUrl('owner')).toBeNull()
  })

  it('rejects subdir with .. traversal', () => {
    expect(parseRepoUrl('owner/repo/../../etc')).toBeNull()
  })

  it('rejects subdir with empty segment', () => {
    expect(parseRepoUrl('owner/repo/foo//bar')).toBeNull()
  })
})
