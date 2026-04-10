import type { AgentHandler } from './types.js'

/**
 * Continue.dev configuration lives entirely under `.continue/`:
 * - `.continue/config.yaml`  — assistant/model configuration
 * - `.continue/rules/**`     — project-level rules
 * - `.continue/checks/**`    — CI-enforced source-controlled checks
 * - `.continue/prompts/**`   — reusable prompts
 */
export const continueHandler: AgentHandler = {
  type: 'continue',
  displayName: 'Continue.dev',
  patterns: ['.continue/**'],
  matchFiles(files: string[]): string[] {
    return files.filter((f) => f.startsWith('.continue/'))
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
