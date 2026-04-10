import type { AgentType } from '../types/common.js'
import type { AgentHandler } from './types.js'
import { ALL_HANDLERS } from './index.js'

export interface DetectionResult {
  agentType: AgentType
  displayName: string
  files: string[]
}

/**
 * Given a list of relative file paths from a downloaded repo,
 * return which agent types are present and which files belong to each.
 */
export function detectAgents(files: string[], handlers: AgentHandler[] = ALL_HANDLERS): DetectionResult[] {
  const results: DetectionResult[] = []
  for (const handler of handlers) {
    const matched = handler.matchFiles(files)
    if (matched.length > 0) {
      results.push({
        agentType: handler.type,
        displayName: handler.displayName,
        files: matched,
      })
    }
  }
  return results
}
