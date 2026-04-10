import type { AgentHandler } from './types.js'

/**
 * Cursor reads configuration from several locations under `.cursor/`:
 * - `.cursorrules`         — legacy single-file rules
 * - `.cursor/rules/**`     — MDC rule files (new format)
 * - `.cursor/commands/**`  — reusable slash commands
 * - `.cursor/agents/**`    — custom agent/persona definitions (community convention)
 *
 * We match everything under `.cursor/` so that new subdirectories Cursor adds
 * don't require a handler update. Each project's `.cursor/` directory is
 * the full Cursor configuration surface by convention.
 */
export const cursorHandler: AgentHandler = {
  type: 'cursor',
  displayName: 'Cursor',
  patterns: ['.cursorrules', '.cursor/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f === '.cursorrules' || f.startsWith('.cursor/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
