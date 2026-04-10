import type { AgentHandler } from './types.js'

export const claudeHandler: AgentHandler = {
  type: 'claude',
  displayName: 'Claude Code',
  patterns: ['CLAUDE.md', '.claude/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === 'CLAUDE.md' || f.startsWith('.claude/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
