import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Redirect ~/.agentpull to a per-test temp dir by mocking os.homedir before
// importing the config module — CONFIG_PATH is computed at import time.
let testHome: string

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => testHome,
  }
})

beforeEach(async () => {
  testHome = await mkdtemp(join(tmpdir(), 'agentpull-config-test-'))
  vi.resetModules()
})

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true })
})

async function loadConfigModule() {
  return await import('../../src/core/config.js')
}

describe('agentpull config (defaults)', () => {
  it('readConfig returns DEFAULT_CONFIG when no file exists', async () => {
    const { readConfig } = await loadConfigModule()
    const c = await readConfig()
    expect(c.defaults.conflictResolution).toBe('prompt')
    expect(c.defaults.autoScan).toBe(false)
  })

  it('setDefault persists a single key', async () => {
    const { setDefault, readConfig } = await loadConfigModule()
    await setDefault('autoScan', true)
    const c = await readConfig()
    expect(c.defaults.autoScan).toBe(true)
    // unrelated default unchanged
    expect(c.defaults.conflictResolution).toBe('prompt')
  })

  it('setDefault writes to ~/.agentpull/config.json with mode 0o600', async () => {
    const { setDefault } = await loadConfigModule()
    await setDefault('conflictResolution', 'overwrite')
    const path = join(testHome, '.agentpull', 'config.json')
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.defaults.conflictResolution).toBe('overwrite')
  })

  it('setDefault rejects an invalid enum value', async () => {
    const { setDefault } = await loadConfigModule()
    await expect(
      setDefault('conflictResolution', 'nonsense' as never),
    ).rejects.toThrow(/Invalid value for conflictResolution/)
  })

  it('setDefault rejects an invalid type for autoScan', async () => {
    const { setDefault } = await loadConfigModule()
    await expect(
      setDefault('autoScan', 'yes' as never),
    ).rejects.toThrow(/Invalid value for autoScan/)
  })

  it('unsetDefault resets to schema default', async () => {
    const { setDefault, unsetDefault, readConfig } = await loadConfigModule()
    await setDefault('autoScan', true)
    expect((await readConfig()).defaults.autoScan).toBe(true)
    await unsetDefault('autoScan')
    expect((await readConfig()).defaults.autoScan).toBe(false)
  })

  it('isValidConfigKey rejects unknown keys', async () => {
    const { isValidConfigKey } = await loadConfigModule()
    expect(isValidConfigKey('autoScan')).toBe(true)
    expect(isValidConfigKey('conflictResolution')).toBe(true)
    expect(isValidConfigKey('autoscan')).toBe(false) // case-sensitive
    expect(isValidConfigKey('foo')).toBe(false)
    expect(isValidConfigKey('')).toBe(false)
  })

  it('preserves registries when updating defaults', async () => {
    const { addRegistry, setDefault, readConfig } = await loadConfigModule()
    await addRegistry({
      name: 'team',
      url: 'https://github.com/org/repo',
    })
    await setDefault('autoScan', true)
    const c = await readConfig()
    expect(c.registries).toHaveLength(1)
    expect(c.registries[0].name).toBe('team')
    expect(c.defaults.autoScan).toBe(true)
  })
})
