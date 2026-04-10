import type { AgentHandler } from './types.js'

/**
 * Google Antigravity (agentic IDE, public preview):
 * - AGENTS.md — cross-platform rules (shared with Copilot, Claude Code)
 * - GEMINI.md — Antigravity-specific overrides (takes precedence over AGENTS.md)
 * - .agent/rules/ — rule files with frontmatter (always_on or model_decision activation)
 * - .agent/ — Skills and Workflows
 */
export const antigravityHandler: AgentHandler = {
  type: 'antigravity',
  displayName: 'Google Antigravity',
  patterns: ['GEMINI.md', '.agent/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === 'GEMINI.md' || f.startsWith('.agent/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
