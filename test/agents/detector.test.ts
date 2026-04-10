import { describe, it, expect } from 'vitest'
import { detectAgents } from '../../src/agents/detector.js'

describe('detectAgents', () => {
  it('detects cursor rules', () => {
    const results = detectAgents(['.cursorrules', 'README.md'])
    expect(results.some((r) => r.agentType === 'cursor')).toBe(true)
  })

  it('detects copilot instruction files', () => {
    const results = detectAgents(['.github/copilot-instructions.md'])
    expect(results.some((r) => r.agentType === 'copilot')).toBe(true)
  })

  it('detects copilot prompt files', () => {
    const results = detectAgents(['.github/prompts/fix-bug.prompt.md'])
    expect(results.some((r) => r.agentType === 'copilot')).toBe(true)
  })

  it('detects copilot agent files', () => {
    const results = detectAgents(['.github/agents/reviewer.agent.md'])
    expect(results.some((r) => r.agentType === 'copilot')).toBe(true)
  })

  it('detects copilot skills', () => {
    const results = detectAgents(['.github/skills/typescript/SKILL.md'])
    expect(results.some((r) => r.agentType === 'copilot')).toBe(true)
  })

  it('detects VS Code agent files', () => {
    const results = detectAgents(['.vscode/agents/reviewer.md'])
    expect(results.some((r) => r.agentType === 'vscode')).toBe(true)
  })

  it('detects claude files', () => {
    const results = detectAgents(['CLAUDE.md', '.claude/settings.json'])
    const claude = results.find((r) => r.agentType === 'claude')
    expect(claude?.files).toContain('CLAUDE.md')
  })

  it('detects windsurf rules', () => {
    const results = detectAgents(['.windsurfrules'])
    expect(results.some((r) => r.agentType === 'windsurf')).toBe(true)
  })

  it('detects antigravity files', () => {
    const results = detectAgents(['GEMINI.md', '.agent/rules/style.md'])
    expect(results.some((r) => r.agentType === 'antigravity')).toBe(true)
  })

  it('detects aider config', () => {
    const results = detectAgents(['.aider.conf.yml'])
    expect(results.some((r) => r.agentType === 'aider')).toBe(true)
  })

  it('detects AGENTS.md as cross-agent', () => {
    const results = detectAgents(['AGENTS.md'])
    expect(results.some((r) => r.agentType === 'cross-agent')).toBe(true)
  })

  it('detects cursor agents under .cursor/agents/', () => {
    const results = detectAgents(['.cursor/agents/doc-writer.md'])
    expect(results.some((r) => r.agentType === 'cursor')).toBe(true)
  })

  it('detects windsurf workflows under .windsurf/workflows/', () => {
    const results = detectAgents(['.windsurf/workflows/deploy.md'])
    expect(results.some((r) => r.agentType === 'windsurf')).toBe(true)
  })

  it('detects cline rules (single file)', () => {
    const results = detectAgents(['.clinerules'])
    expect(results.some((r) => r.agentType === 'cline')).toBe(true)
  })

  it('detects cline rules (directory)', () => {
    const results = detectAgents(['.clinerules/style.md'])
    expect(results.some((r) => r.agentType === 'cline')).toBe(true)
  })

  it('detects continue.dev configs', () => {
    const results = detectAgents(['.continue/config.yaml', '.continue/rules/style.md'])
    expect(results.some((r) => r.agentType === 'continue')).toBe(true)
  })

  it('detects multiple agent types in one repo', () => {
    const results = detectAgents([
      '.cursorrules',
      '.github/copilot-instructions.md',
      'CLAUDE.md',
      'GEMINI.md',
      'AGENTS.md',
    ])
    const types = results.map((r) => r.agentType)
    expect(types).toContain('cursor')
    expect(types).toContain('copilot')
    expect(types).toContain('claude')
    expect(types).toContain('antigravity')
    expect(types).toContain('cross-agent')
  })

  it('returns empty array when no agent files found', () => {
    const results = detectAgents(['README.md', 'package.json', 'src/index.ts'])
    expect(results).toHaveLength(0)
  })
})
