import { describe, it, expect } from 'vitest'
import { ALL_HANDLERS, getHandler } from '../../src/agents/index.js'
import { AGENT_TYPES } from '../../src/types/common.js'

describe('agent handler registry', () => {
  it('has a handler for every defined agent type', () => {
    for (const type of AGENT_TYPES) {
      const handler = getHandler(type)
      expect(handler, `Missing handler for agent type "${type}"`).toBeDefined()
      expect(handler!.type).toBe(type)
    }
  })

  it('has exactly as many handlers as agent types', () => {
    expect(ALL_HANDLERS.length).toBe(AGENT_TYPES.length)
  })

  it('every handler has a non-empty displayName', () => {
    for (const handler of ALL_HANDLERS) {
      expect(handler.displayName.length).toBeGreaterThan(0)
    }
  })

  it('every handler has at least one pattern', () => {
    for (const handler of ALL_HANDLERS) {
      expect(handler.patterns.length, `${handler.type} has no patterns`).toBeGreaterThan(0)
    }
  })

  it('getHandler returns undefined for unknown types', () => {
    expect(getHandler('nonexistent')).toBeUndefined()
  })

  it('handler types are unique', () => {
    const types = ALL_HANDLERS.map((h) => h.type)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })

  it('no handler patterns overlap dangerously', () => {
    // AGENTS.md should only be matched by cross-agent, not by copilot or antigravity
    const agentsMdMatchers = ALL_HANDLERS.filter((h) => h.matchFiles(['AGENTS.md']).length > 0)
    expect(agentsMdMatchers).toHaveLength(1)
    expect(agentsMdMatchers[0].type).toBe('cross-agent')
  })

  it('GEMINI.md is only matched by antigravity', () => {
    const matchers = ALL_HANDLERS.filter((h) => h.matchFiles(['GEMINI.md']).length > 0)
    expect(matchers).toHaveLength(1)
    expect(matchers[0].type).toBe('antigravity')
  })

  it('CLAUDE.md is only matched by claude', () => {
    const matchers = ALL_HANDLERS.filter((h) => h.matchFiles(['CLAUDE.md']).length > 0)
    expect(matchers).toHaveLength(1)
    expect(matchers[0].type).toBe('claude')
  })

  it('.cursorrules is only matched by cursor', () => {
    const matchers = ALL_HANDLERS.filter((h) => h.matchFiles(['.cursorrules']).length > 0)
    expect(matchers).toHaveLength(1)
    expect(matchers[0].type).toBe('cursor')
  })
})
