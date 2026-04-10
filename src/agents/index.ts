import type { AgentHandler } from './types.js'
import { cursorHandler } from './cursor.js'
import { copilotHandler } from './copilot.js'
import { vscodeHandler } from './vscode.js'
import { claudeHandler } from './claude.js'
import { windsurfHandler } from './windsurf.js'
import { antigravityHandler } from './antigravity.js'
import { aiderHandler } from './aider.js'
import { clineHandler } from './cline.js'
import { continueHandler } from './continue.js'
import { crossAgentHandler } from './cross-agent.js'

export const ALL_HANDLERS: AgentHandler[] = [
  cursorHandler,
  copilotHandler,
  vscodeHandler,
  claudeHandler,
  windsurfHandler,
  antigravityHandler,
  aiderHandler,
  clineHandler,
  continueHandler,
  crossAgentHandler,
]

export function getHandler(type: string): AgentHandler | undefined {
  return ALL_HANDLERS.find((h) => h.type === type)
}

export {
  cursorHandler,
  copilotHandler,
  vscodeHandler,
  claudeHandler,
  windsurfHandler,
  antigravityHandler,
  aiderHandler,
  clineHandler,
  continueHandler,
  crossAgentHandler,
}
