import type { AgentHandler } from './types.js'

/**
 * GitHub Copilot supports a rich ecosystem of files:
 * - .github/copilot-instructions.md  — repo-wide custom instructions
 * - .github/instructions/*.instructions.md — path-scoped instructions
 * - .github/prompts/*.prompt.md — reusable prompt files (invoked via /)
 * - .github/agents/*.agent.md — custom agent personas with tool access
 * - .github/skills/<name>/SKILL.md — auto-loaded task skills
 * - AGENTS.md — cross-agent instructions (also read by Claude, Antigravity)
 */
export const copilotHandler: AgentHandler = {
  type: 'copilot',
  displayName: 'GitHub Copilot',
  patterns: [
    '.github/copilot-instructions.md',
    '.github/instructions/*.instructions.md',
    '.github/prompts/*.prompt.md',
    '.github/agents/*.agent.md',
    '.github/skills/*/SKILL.md',
    '.github/skills/**',
  ],
  matchFiles(files: string[]): string[] {
    return files.filter(
      (f) =>
        f === '.github/copilot-instructions.md' ||
        (f.startsWith('.github/instructions/') && f.endsWith('.instructions.md')) ||
        (f.startsWith('.github/prompts/') && f.endsWith('.prompt.md')) ||
        (f.startsWith('.github/agents/') && f.endsWith('.agent.md')) ||
        f.startsWith('.github/skills/'),
    )
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
