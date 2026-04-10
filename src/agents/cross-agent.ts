import type { AgentHandler } from './types.js'

/**
 * Cross-agent shared standard files:
 * - AGENTS.md — read by Copilot coding agent, Claude Code, Antigravity, and others
 * - .agents/skills/<name>/SKILL.md — cross-agent skill standard
 *
 * AGENTS.md is intentionally NOT listed in the copilot or antigravity handlers
 * to avoid double-counting; this handler owns it.
 */
export const crossAgentHandler: AgentHandler = {
  type: 'cross-agent',
  displayName: 'Cross-Agent (AGENTS.md / Skills)',
  patterns: ['AGENTS.md', '.agents/skills/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === 'AGENTS.md' || f.startsWith('.agents/skills/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
