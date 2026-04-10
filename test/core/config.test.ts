import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// We need to mock the config paths to use temp dirs
let testDir: string
let configPath: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'agentpull-config-test-'))
  configPath = join(testDir, 'config.json')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// Since the config module uses hardcoded paths, we test the schemas and logic
// by directly importing the schema validators
import { ConfigSchema, DEFAULT_CONFIG } from '../../src/types/config.js'

describe('ConfigSchema', () => {
  it('validates default config', () => {
    const result = ConfigSchema.safeParse(DEFAULT_CONFIG)
    expect(result.success).toBe(true)
  })

  it('validates config with registries', () => {
    const config = {
      version: 1,
      registries: [
        { name: 'test', url: 'https://github.com/owner/repo' },
        { name: 'with-extras', url: 'https://github.com/owner/repo', subdir: 'agents', defaultRef: 'main' },
      ],
      defaults: { conflictResolution: 'prompt', autoScan: true },
    }
    const result = ConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects invalid version', () => {
    const result = ConfigSchema.safeParse({ version: 2, registries: [], defaults: {} })
    expect(result.success).toBe(false)
  })

  it('rejects invalid conflict resolution value', () => {
    const result = ConfigSchema.safeParse({
      version: 1,
      registries: [],
      defaults: { conflictResolution: 'invalid', autoScan: true },
    })
    expect(result.success).toBe(false)
  })

  it('applies defaults for missing defaults fields', () => {
    const result = ConfigSchema.safeParse({ version: 1, registries: [] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.defaults.conflictResolution).toBe('prompt')
      expect(result.data.defaults.autoScan).toBe(false)
    }
  })

  it('rejects registry with empty name', () => {
    const result = ConfigSchema.safeParse({
      version: 1,
      registries: [{ name: '', url: 'https://github.com/x/y' }],
      defaults: { conflictResolution: 'prompt', autoScan: true },
    })
    expect(result.success).toBe(false)
  })

  it('rejects registry with invalid URL', () => {
    const result = ConfigSchema.safeParse({
      version: 1,
      registries: [{ name: 'test', url: 'not-a-url' }],
      defaults: { conflictResolution: 'prompt', autoScan: true },
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid conflict resolution values', () => {
    for (const value of ['prompt', 'skip', 'overwrite'] as const) {
      const result = ConfigSchema.safeParse({
        version: 1,
        registries: [],
        defaults: { conflictResolution: value, autoScan: false },
      })
      expect(result.success).toBe(true)
    }
  })
})
