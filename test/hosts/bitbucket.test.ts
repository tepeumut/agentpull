import { describe, it, expect, vi, afterEach } from 'vitest'
import { bitbucketProvider } from '../../src/hosts/bitbucket.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bitbucket.parseUrl', () => {
  it('parses a flat URL', () => {
    expect(bitbucketProvider.parseUrl('https://bitbucket.org/ws/repo')).toEqual({
      host: 'bitbucket.org',
      owner: 'ws',
      repo: 'repo',
      subdir: undefined,
      ref: undefined,
    })
  })

  it('parses a URL with /src/<ref>/<subdir>', () => {
    expect(
      bitbucketProvider.parseUrl('https://bitbucket.org/ws/repo/src/main/configs/agents'),
    ).toMatchObject({
      owner: 'ws',
      repo: 'repo',
      ref: 'main',
      subdir: 'configs/agents',
    })
  })

  it('parses a #ref suffix', () => {
    expect(bitbucketProvider.parseUrl('https://bitbucket.org/ws/repo#develop')).toMatchObject({
      ref: 'develop',
    })
  })

  it('rejects github URLs', () => {
    expect(bitbucketProvider.parseUrl('https://github.com/o/r')).toBeNull()
  })

  it('rejects gitlab URLs', () => {
    expect(bitbucketProvider.parseUrl('https://gitlab.com/o/r')).toBeNull()
  })

  it('rejects bare owner/repo without scheme', () => {
    expect(bitbucketProvider.parseUrl('owner/repo')).toBeNull()
  })
})

describe('bitbucket.getAuthHeaders', () => {
  it('uses HTTP Basic for username/app-password credentials', () => {
    const h = bitbucketProvider.getAuthHeaders({
      kind: 'basic',
      username: 'alice',
      password: 'secret',
    })
    const expected = `Basic ${Buffer.from('alice:secret').toString('base64')}`
    expect(h).toEqual({ Authorization: expected })
  })

  it('falls back to Bearer for token credentials', () => {
    expect(bitbucketProvider.getAuthHeaders({ kind: 'token', token: 'abc' })).toEqual({
      Authorization: 'Bearer abc',
    })
  })

  it('returns empty for no credential', () => {
    expect(bitbucketProvider.getAuthHeaders()).toEqual({})
  })
})

describe('bitbucket.getCommitSha', () => {
  it('extracts the .hash field from the JSON response', async () => {
    const sha = 'c'.repeat(40)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ hash: sha }), { status: 200 }))
    const got = await bitbucketProvider.getCommitSha({
      host: 'bitbucket.org',
      owner: 'ws',
      repo: 'r',
      ref: 'main',
    })
    expect(got).toBe(sha)
  })

  it('rejects malformed sha', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ hash: 'short' }), { status: 200 }))
    await expect(
      bitbucketProvider.getCommitSha({
        host: 'bitbucket.org',
        owner: 'ws',
        repo: 'r',
        ref: 'main',
      }),
    ).rejects.toThrow(/Unexpected commit SHA/)
  })
})

describe('bitbucket.getTarballUrl', () => {
  it('returns the /get/<sha>.tar.gz endpoint', () => {
    const sha = 'd'.repeat(40)
    expect(
      bitbucketProvider.getTarballUrl({ host: 'bitbucket.org', owner: 'ws', repo: 'r' }, sha),
    ).toBe(`https://bitbucket.org/ws/r/get/${sha}.tar.gz`)
  })
})
