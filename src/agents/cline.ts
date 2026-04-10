import type { AgentHandler } from './types.js'

/**
 * Cline (VS Code autonomous coding agent extension) reads rules from either:
 * - `.clinerules`       — single text file at project root (legacy)
 * - `.clinerules/**`    — directory of markdown files (newer, supports
 *                         multiple rule files per project)
 */
export const clineHandler: AgentHandler = {
  type: 'cline',
  displayName: 'Cline',
  patterns: ['.clinerules', '.clinerules/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === '.clinerules' || f.startsWith('.clinerules/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
