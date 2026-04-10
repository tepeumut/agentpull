import { describe, it, expect, vi, afterEach } from 'vitest'
import { azureProvider } from '../../src/hosts/azure.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('azure.parseUrl', () => {
  it('parses a dev.azure.com URL', () => {
    expect(
      azureProvider.parseUrl('https://dev.azure.com/myorg/myproj/_git/myrepo'),
    ).toEqual({
      host: 'dev.azure.com',
      owner: 'myorg/myproj',
      repo: 'myrepo',
      subdir: undefined,
      ref: undefined,
    })
  })

  it('parses a legacy visualstudio.com URL', () => {
    expect(
      azureProvider.parseUrl('https://myorg.visualstudio.com/myproj/_git/myrepo'),
    ).toMatchObject({
      host: 'myorg.visualstudio.com',
      owner: 'myorg/myproj',
      repo: 'myrepo',
    })
  })

  it('extracts a ref from ?version=GBmain', () => {
    expect(
      azureProvider.parseUrl('https://dev.azure.com/o/p/_git/r?version=GBmain'),
    ).toMatchObject({ ref: 'main' })
  })

  it('prefers explicit #ref over ?version', () => {
    expect(
      azureProvider.parseUrl('https://dev.azure.com/o/p/_git/r?version=GBmain#develop'),
    ).toMatchObject({ ref: 'develop' })
  })

  it('rejects github URLs', () => {
    expect(azureProvider.parseUrl('https://github.com/o/r')).toBeNull()
  })

  it('rejects URLs without _git segment', () => {
    expect(azureProvider.parseUrl('https://dev.azure.com/org/proj/notgit/repo')).toBeNull()
  })

  it('rejects bare slugs without scheme', () => {
    expect(azureProvider.parseUrl('org/proj/_git/repo')).toBeNull()
  })
})

describe('azure.getAuthHeaders', () => {
  it('uses Basic auth with empty username for PAT', () => {
    const h = azureProvider.getAuthHeaders({ kind: 'token', token: 'mypat' })
    const expected = `Basic ${Buffer.from(':mypat').toString('base64')}`
    expect(h).toEqual({ Authorization: expected })
  })

  it('returns empty for no credential', () => {
    expect(azureProvider.getAuthHeaders()).toEqual({})
  })
})

describe('azure.getTarballUrl', () => {
  it('throws (provider has no tarball endpoint)', () => {
    expect(() =>
      azureProvider.getTarballUrl(
        { host: 'dev.azure.com', owner: 'o/p', repo: 'r' },
        'a'.repeat(40),
      ),
    ).toThrow(/does not provide a tarball API/)
  })
})

describe('azure.getCommitSha', () => {
  it('extracts commitId from value[0]', async () => {
    const sha = 'e'.repeat(40)
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ value: [{ commitId: sha }] }), { status: 200 }),
    )
    const got = await azureProvider.getCommitSha({
      host: 'dev.azure.com',
      owner: 'o/p',
      repo: 'r',
      ref: 'main',
    })
    expect(got).toBe(sha)
  })

  it('throws when value is empty', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ value: [] }), { status: 200 }))
    await expect(
      azureProvider.getCommitSha({ host: 'dev.azure.com', owner: 'o/p', repo: 'r', ref: 'main' }),
    ).rejects.toThrow(/Unexpected commit SHA/)
  })
})
