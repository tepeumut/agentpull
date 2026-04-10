import { describe, it, expect } from 'vitest'
import { gitProvider } from '../../src/hosts/git.js'

describe('git.parseUrl', () => {
  it('parses an https://...git URL', () => {
    expect(gitProvider.parseUrl('https://example.com/owner/repo.git')).toEqual({
      host: 'example.com',
      owner: 'owner',
      repo: 'repo',
      subdir: undefined,
      ref: undefined,
    })
  })

  it('parses a git:// URL', () => {
    expect(gitProvider.parseUrl('git://example.com/owner/repo.git')).toMatchObject({
      host: 'example.com',
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('parses an SCP-style URL', () => {
    expect(gitProvider.parseUrl('git@example.com:owner/repo.git')).toMatchObject({
      host: 'example.com',
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('parses an ssh:// URL', () => {
    expect(gitProvider.parseUrl('ssh://git@example.com/owner/repo.git')).toMatchObject({
      host: 'example.com',
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('parses a #ref suffix on https URL', () => {
    expect(gitProvider.parseUrl('https://example.com/o/r.git#main')).toMatchObject({
      ref: 'main',
    })
  })

  it('parses a #ref suffix on SCP URL', () => {
    expect(gitProvider.parseUrl('git@example.com:o/r.git#develop')).toMatchObject({
      ref: 'develop',
    })
  })

  it('parses nested-group git path', () => {
    expect(gitProvider.parseUrl('https://example.com/group/sub/repo.git')).toMatchObject({
      owner: 'group/sub',
      repo: 'repo',
    })
  })

  it('does NOT auto-claim plain https URLs without a .git suffix', () => {
    // Otherwise it would hijack URLs that GitHub/GitLab/etc should handle.
    expect(gitProvider.parseUrl('https://example.com/owner/repo')).toBeNull()
  })

  it('does NOT auto-claim github.com URLs', () => {
    expect(gitProvider.parseUrl('https://github.com/owner/repo')).toBeNull()
  })

  it('declares getCloneUrl to trigger the clone branch', () => {
    const url = gitProvider.getCloneUrl?.({
      host: 'example.com',
      owner: 'o',
      repo: 'r',
    })
    expect(url).toBe('https://example.com/o/r.git')
  })
})
