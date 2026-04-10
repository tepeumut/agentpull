import { describe, it, expect } from 'vitest'
import { ManifestSchema, EMPTY_MANIFEST } from '../../src/types/manifest.js'

describe('ManifestSchema', () => {
  it('validates empty manifest', () => {
    expect(ManifestSchema.safeParse(EMPTY_MANIFEST).success).toBe(true)
  })

  it('validates manifest with installed entry', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/owner/repo',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [{ path: '.cursorrules', sha256: 'b'.repeat(64), sourcePath: '.cursorrules' }],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects wrong version', () => {
    expect(ManifestSchema.safeParse({ version: 2, installed: [] }).success).toBe(false)
  })

  it('rejects installed file with absolute path', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [{ path: '/etc/passwd', sha256: 'b'.repeat(64), sourcePath: '.cursorrules' }],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects installed file with .. traversal', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [{ path: '../../.bashrc', sha256: 'b'.repeat(64), sourcePath: '.cursorrules' }],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid commit SHA (too short)', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'abc123', // too short
          agentTypes: ['cursor'],
          files: [],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid SHA-256 hash in files', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [{ path: '.cursorrules', sha256: 'not-a-hash', sourcePath: '.cursorrules' }],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty agent types array', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: [], // must have at least 1
          files: [],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid agent type', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['nonexistent'],
          files: [],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid agent types', () => {
    const types = ['cursor', 'copilot', 'vscode', 'claude', 'windsurf', 'antigravity', 'aider', 'cline', 'continue', 'cross-agent']
    for (const type of types) {
      const result = ManifestSchema.safeParse({
        version: 1,
        installed: [
          {
            name: 'test',
            source: 'https://github.com/x/y',
            ref: 'main',
            commitSha: 'a'.repeat(40),
            agentTypes: [type],
            files: [],
            installedAt: '2026-04-09T12:00:00.000Z',
            updatedAt: '2026-04-09T12:00:00.000Z',
          },
        ],
      })
      expect(result.success, `agent type "${type}" should be valid`).toBe(true)
    }
  })

  it('rejects invalid source URL', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'not-a-url',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [],
          installedAt: '2026-04-09T12:00:00.000Z',
          updatedAt: '2026-04-09T12:00:00.000Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-datetime timestamps', () => {
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        {
          name: 'test',
          source: 'https://github.com/x/y',
          ref: 'main',
          commitSha: 'a'.repeat(40),
          agentTypes: ['cursor'],
          files: [],
          installedAt: 'yesterday',
          updatedAt: 'today',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple installed entries', () => {
    const entry = {
      name: 'test',
      source: 'https://github.com/x/y',
      ref: 'main',
      commitSha: 'a'.repeat(40),
      agentTypes: ['cursor' as const],
      files: [],
      installedAt: '2026-04-09T12:00:00.000Z',
      updatedAt: '2026-04-09T12:00:00.000Z',
    }
    const result = ManifestSchema.safeParse({
      version: 1,
      installed: [
        entry,
        { ...entry, name: 'test2', source: 'https://github.com/a/b', agentTypes: ['claude' as const] },
      ],
    })
    expect(result.success).toBe(true)
  })
})
