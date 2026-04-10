import { describe, it, expect, vi, afterEach } from 'vitest'
import { gitlabProvider, gitlabProjectId } from '../../src/hosts/gitlab.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gitlabProjectId', () => {
  it('URL-encodes a flat owner/repo', () => {
    expect(gitlabProjectId('owner', 'repo')).toBe('owner%2Frepo')
  })

  it('URL-encodes nested subgroups', () => {
    expect(gitlabProjectId('group/subgroup', 'repo')).toBe('group%2Fsubgroup%2Frepo')
  })

  it('URL-encodes deeply nested subgroups', () => {
    expect(gitlabProjectId('a/b/c/d', 'repo')).toBe('a%2Fb%2Fc%2Fd%2Frepo')
  })
})

describe('gitlab.parseUrl', () => {
  it('parses a flat gitlab.com URL', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/owner/repo')).toEqual({
      host: 'gitlab.com',
      owner: 'owner',
      repo: 'repo',
      subdir: undefined,
      ref: undefined,
    })
  })

  it('parses a nested-subgroup URL', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/group/sub/repo')).toMatchObject({
      owner: 'group/sub',
      repo: 'repo',
    })
  })

  it('parses a deeply-nested-subgroup URL', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/a/b/c/d/repo')).toMatchObject({
      owner: 'a/b/c/d',
      repo: 'repo',
    })
  })

  it('parses a self-hosted URL', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.example.com/team/repo')).toMatchObject({
      host: 'gitlab.example.com',
      owner: 'team',
      repo: 'repo',
    })
  })

  it('parses a #ref suffix', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/o/r#main')).toMatchObject({
      ref: 'main',
    })
  })

  it('parses /-/tree/<ref>/<subdir>', () => {
    expect(
      gitlabProvider.parseUrl('https://gitlab.com/group/repo/-/tree/develop/configs/agents'),
    ).toMatchObject({
      owner: 'group',
      repo: 'repo',
      ref: 'develop',
      subdir: 'configs/agents',
    })
  })

  it('rejects github URLs', () => {
    expect(gitlabProvider.parseUrl('https://github.com/owner/repo')).toBeNull()
  })

  it('rejects bare owner/repo without scheme', () => {
    // We can't disambiguate from GitHub shorthand without an explicit gitlab.* host
    expect(gitlabProvider.parseUrl('owner/repo')).toBeNull()
  })

  it('URL-normalises any `..` in subdir before parsing', () => {
    // `new URL()` collapses `..` segments before we ever see them, so by the
    // time `parseUrl` runs the subdir is already free of traversal sequences.
    const r = gitlabProvider.parseUrl('https://gitlab.com/o/r/-/tree/main/../etc')
    // Either null or a spec with a clean subdir is acceptable; the invariant
    // is that the result never carries a literal `..` segment.
    if (r?.subdir) {
      expect(r.subdir.split('/')).not.toContain('..')
    }
  })
})

describe('gitlab.getTarballUrl', () => {
  it('uses the encoded project id and sha query', () => {
    const url = gitlabProvider.getTarballUrl(
      { host: 'gitlab.com', owner: 'group/sub', repo: 'repo' },
      'a'.repeat(40),
    )
    expect(url).toBe(
      `https://gitlab.com/api/v4/projects/group%2Fsub%2Frepo/repository/archive.tar.gz?sha=${'a'.repeat(40)}`,
    )
  })
})

describe('gitlab.getAuthHeaders', () => {
  it('uses PRIVATE-TOKEN header (not Bearer)', () => {
    expect(gitlabProvider.getAuthHeaders({ kind: 'token', token: 'xyz' })).toEqual({
      'PRIVATE-TOKEN': 'xyz',
    })
  })

  it('returns empty object with no credential', () => {
    expect(gitlabProvider.getAuthHeaders()).toEqual({})
  })
})

describe('gitlab.getCommitSha', () => {
  it('extracts the .id field from the JSON response', async () => {
    const sha = 'b'.repeat(40)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: sha }), { status: 200 }))
    const got = await gitlabProvider.getCommitSha({
      host: 'gitlab.com',
      owner: 'g',
      repo: 'r',
      ref: 'main',
    })
    expect(got).toBe(sha)
  })

  it('rejects non-SHA responses', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: 'not-a-sha' }), { status: 200 }))
    await expect(
      gitlabProvider.getCommitSha({ host: 'gitlab.com', owner: 'g', repo: 'r', ref: 'main' }),
    ).rejects.toThrow(/Unexpected commit SHA/)
  })

  it('throws on non-2xx', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }))
    await expect(
      gitlabProvider.getCommitSha({ host: 'gitlab.com', owner: 'g', repo: 'r', ref: 'main' }),
    ).rejects.toThrow(/GitLab API error 404/)
  })
})
