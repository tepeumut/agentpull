import { describe, it, expect } from 'vitest'
import {
  AgentpullError,
  ConfigError,
  ManifestError,
  RegistryError,
  DownloadError,
  SecurityError,
  AuthError,
  ConflictError,
} from '../../src/utils/errors.js'

describe('errors', () => {
  it('AgentpullError has message and code', () => {
    const err = new AgentpullError('test message', 'TEST_CODE')
    expect(err.message).toBe('test message')
    expect(err.code).toBe('TEST_CODE')
    expect(err.name).toBe('AgentpullError')
    expect(err).toBeInstanceOf(Error)
  })

  it('ConfigError sets correct code', () => {
    const err = new ConfigError('bad config')
    expect(err.code).toBe('CONFIG_ERROR')
    expect(err.name).toBe('ConfigError')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('ManifestError sets correct code', () => {
    const err = new ManifestError('bad manifest')
    expect(err.code).toBe('MANIFEST_ERROR')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('RegistryError sets correct code', () => {
    const err = new RegistryError('not found')
    expect(err.code).toBe('REGISTRY_ERROR')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('DownloadError sets correct code', () => {
    const err = new DownloadError('network error')
    expect(err.code).toBe('DOWNLOAD_ERROR')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('SecurityError sets correct code', () => {
    const err = new SecurityError('blocked')
    expect(err.code).toBe('SECURITY_ERROR')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('AuthError sets correct code', () => {
    const err = new AuthError('no token')
    expect(err.code).toBe('AUTH_ERROR')
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('ConflictError carries conflicting files list', () => {
    const err = new ConflictError('conflict', ['.cursorrules', 'CLAUDE.md'])
    expect(err.code).toBe('CONFLICT_ERROR')
    expect(err.conflictingFiles).toEqual(['.cursorrules', 'CLAUDE.md'])
    expect(err).toBeInstanceOf(AgentpullError)
  })

  it('all error types are catchable as AgentpullError', () => {
    const errors = [
      new ConfigError('x'),
      new ManifestError('x'),
      new RegistryError('x'),
      new DownloadError('x'),
      new SecurityError('x'),
      new AuthError('x'),
      new ConflictError('x', []),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(AgentpullError)
      expect(err).toBeInstanceOf(Error)
    }
  })
})
