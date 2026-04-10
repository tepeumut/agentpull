import type { AgentType } from '../types/common.js'

export interface AgentHandler {
  type: AgentType
  displayName: string
  /** Glob patterns that identify this agent's files in a source repo */
  patterns: string[]
  /** Given a list of relative file paths, return those belonging to this agent */
  matchFiles(files: string[]): string[]
  /** Map a source file path to its target path in the user's project */
  getTargetPath(sourcePath: string): string
}
