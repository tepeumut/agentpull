import type { AgentHandler } from './types.js'

/**
 * VS Code AI agent configuration files:
 * - .vscode/agents/*.md — workspace-specific custom agent definitions
 * - .vscode/*.agent.md — agent files at workspace root
 *
 * These are separate from Copilot's .github/ files and used by
 * VS Code's AI Toolkit and built-in agent builder.
 */
export const vscodeHandler: AgentHandler = {
  type: 'vscode',
  displayName: 'VS Code',
  patterns: ['.vscode/agents/**', '.vscode/*.agent.md'],
  matchFiles(files: string[]): string[] {
    return files.filter(
      (f) =>
        f.startsWith('.vscode/agents/') ||
        (f.startsWith('.vscode/') && f.endsWith('.agent.md')),
    )
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
