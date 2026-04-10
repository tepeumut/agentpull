import type { AgentHandler } from './types.js'

/**
 * Windsurf configuration locations:
 * - `.windsurfrules`            — legacy single-file rules
 * - `.windsurf/rules/**`        — directory-based markdown rules
 * - `.windsurf/workflows/**`    — invokable Cascade workflows (/<name>)
 */
export const windsurfHandler: AgentHandler = {
  type: 'windsurf',
  displayName: 'Windsurf',
  patterns: ['.windsurfrules', '.windsurf/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === '.windsurfrules' || f.startsWith('.windsurf/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
