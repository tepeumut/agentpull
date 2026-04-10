import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import * as tar from 'tar'

// Redirect ~/.agentpull to a per-test temp dir so the cache doesn't pollute
// the user's real cache.
let testHome: string

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => testHome,
  }
})

beforeEach(async () => {
  testHome = await mkdtemp(join(tmpdir(), 'agentpull-downloader-test-'))
  vi.resetModules()
  vi.restoreAllMocks()
})

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true })
})

/**
 * Build a tiny in-memory gzipped tarball with one file inside it. The file's
 * top-level dir is `owner-repo-sha/` (matching the GitHub tarball layout)
 * with a single child file inside, so `tar.x({ strip: 1 })` strips the root
 * and leaves the file at the extract root.
 */
async function makeTarball(rootName: string, files: Record<string, string>): Promise<Buffer> {
  const stagingDir = await mkdtemp(join(tmpdir(), 'agentpull-tar-fixture-'))
  const root = join(stagingDir, rootName)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(root, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content)
  }
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const stream = tar.c({ gzip: true, cwd: stagingDir }, [rootName])
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  await rm(stagingDir, { recursive: true, force: true })
  return Buffer.concat(chunks)
}

describe('downloadRepo (tarball staleness regression)', () => {
  it('downloads the tarball using the resolved commit SHA, not the ref', async () => {
    const fakeSha = 'a'.repeat(40)
    const tarball = await makeTarball(`owner-repo-${fakeSha}`, {
      'README.md': '# fixture',
    })

    const fetchCalls: Array<{ url: string }> = []
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      fetchCalls.push({ url })

      // 1) getCommitSha → return SHA
      if (url.includes('/commits/')) {
        return new Response(fakeSha, { status: 200 })
      }
      // 2) tarball API → 302 redirect to codeload
      if (url.includes('api.github.com') && url.includes('/tarball/')) {
        return new Response(null, {
          status: 302,
          headers: { location: `https://codeload.github.com/owner/repo/tar.gz/${fakeSha}` },
        })
      }
      // 3) codeload → return the tarball body
      if (url.includes('codeload.github.com')) {
        return new Response(Readable.toWeb(Readable.from([tarball])) as ReadableStream, {
          status: 200,
        })
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`)
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { downloadRepo } = await import('../../src/core/downloader.js')
    const result = await downloadRepo({
      canonicalUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
      ref: 'main', // user-provided ref
      name: 'repo',
    })

    try {
      // The tarball URL must use the resolved SHA, NOT the original ref.
      // This is the regression test for the cache-poisoning bug: codeload
      // serves stale content at /tarball/main but always-fresh content at
      // /tarball/<sha>.
      const tarballRequest = fetchCalls.find((c) => c.url.includes('/tarball/'))
      expect(tarballRequest).toBeDefined()
      expect(tarballRequest!.url).toContain(`/tarball/${fakeSha}`)
      expect(tarballRequest!.url).not.toContain('/tarball/main')

      expect(result.commitSha).toBe(fakeSha)
      expect(result.files).toContain('README.md')
    } finally {
      await rm(result.extractDir, { recursive: true, force: true })
    }
  })

  it('forceRefresh evicts the cached tarball before re-downloading', async () => {
    const fakeSha = 'b'.repeat(40)
    const tarball = await makeTarball(`owner-repo-${fakeSha}`, { 'rules.md': 'v1' })

    let downloadCount = 0
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('/commits/')) return new Response(fakeSha, { status: 200 })
      if (url.includes('api.github.com') && url.includes('/tarball/')) {
        return new Response(null, {
          status: 302,
          headers: { location: `https://codeload.github.com/x/y/tar.gz/${fakeSha}` },
        })
      }
      if (url.includes('codeload.github.com')) {
        downloadCount++
        return new Response(Readable.toWeb(Readable.from([tarball])) as ReadableStream, {
          status: 200,
        })
      }
      throw new Error(`unexpected: ${url}`)
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { downloadRepo } = await import('../../src/core/downloader.js')
    const repo = {
      canonicalUrl: 'https://github.com/owner/repo',
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      name: 'repo',
    }

    // First download — populates the cache.
    const r1 = await downloadRepo(repo)
    await rm(r1.extractDir, { recursive: true, force: true })
    expect(downloadCount).toBe(1)

    // Second download without forceRefresh — cache hit, no new download.
    const r2 = await downloadRepo(repo)
    await rm(r2.extractDir, { recursive: true, force: true })
    expect(downloadCount).toBe(1)

    // Third download WITH forceRefresh — cache evicted, fresh download.
    const r3 = await downloadRepo(repo, undefined, { forceRefresh: true })
    await rm(r3.extractDir, { recursive: true, force: true })
    expect(downloadCount).toBe(2)
  })

  it('rejects an invalid commit SHA from the API', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('/commits/')) {
        return new Response('not-a-sha', { status: 200 })
      }
      throw new Error(`unexpected: ${url}`)
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { downloadRepo } = await import('../../src/core/downloader.js')
    await expect(
      downloadRepo({
        canonicalUrl: 'https://github.com/owner/repo',
        owner: 'owner',
        repo: 'repo',
        ref: 'main',
        name: 'repo',
      }),
    ).rejects.toThrow(/Unexpected commit SHA/)
  })
})
