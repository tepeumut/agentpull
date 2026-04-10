import { describe, it, expect } from 'vitest'
import { cursorHandler } from '../../src/agents/cursor.js'
import { copilotHandler } from '../../src/agents/copilot.js'
import { vscodeHandler } from '../../src/agents/vscode.js'
import { claudeHandler } from '../../src/agents/claude.js'
import { windsurfHandler } from '../../src/agents/windsurf.js'
import { antigravityHandler } from '../../src/agents/antigravity.js'
import { aiderHandler } from '../../src/agents/aider.js'
import { clineHandler } from '../../src/agents/cline.js'
import { continueHandler } from '../../src/agents/continue.js'
import { crossAgentHandler } from '../../src/agents/cross-agent.js'

describe('cursorHandler', () => {
  it('matches .cursorrules', () => {
    expect(cursorHandler.matchFiles(['.cursorrules'])).toEqual(['.cursorrules'])
  })

  it('matches .cursor/rules/ directory files', () => {
    const files = ['.cursor/rules/typescript.mdc', '.cursor/rules/testing.mdc']
    expect(cursorHandler.matchFiles(files)).toEqual(files)
  })

  it('matches .cursor/commands/ directory files', () => {
    const files = ['.cursor/commands/review.md', '.cursor/commands/deploy.md']
    expect(cursorHandler.matchFiles(files)).toEqual(files)
  })

  it('matches .cursor/agents/ directory files', () => {
    const files = ['.cursor/agents/doc-writer.md', '.cursor/agents/reviewer.md']
    expect(cursorHandler.matchFiles(files)).toEqual(files)
  })

  it('matches any future subdirectory under .cursor/', () => {
    const files = ['.cursor/hypothetical-new-feature/config.json']
    expect(cursorHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match unrelated files', () => {
    expect(cursorHandler.matchFiles(['package.json', 'src/index.ts'])).toEqual([])
  })

  it('does not match partial names', () => {
    expect(cursorHandler.matchFiles(['.cursorrules-backup', 'my.cursorrules'])).toEqual([])
  })

  it('preserves target path', () => {
    expect(cursorHandler.getTargetPath('.cursorrules')).toBe('.cursorrules')
    expect(cursorHandler.getTargetPath('.cursor/agents/doc.md')).toBe('.cursor/agents/doc.md')
  })
})

describe('copilotHandler', () => {
  it('matches copilot-instructions.md', () => {
    expect(copilotHandler.matchFiles(['.github/copilot-instructions.md'])).toEqual([
      '.github/copilot-instructions.md',
    ])
  })

  it('matches .instructions.md files', () => {
    const files = ['.github/instructions/python.instructions.md']
    expect(copilotHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match non-.instructions.md files in instructions dir', () => {
    expect(copilotHandler.matchFiles(['.github/instructions/readme.md'])).toEqual([])
  })

  it('matches .prompt.md files', () => {
    const files = ['.github/prompts/fix-bug.prompt.md', '.github/prompts/review.prompt.md']
    expect(copilotHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match non-.prompt.md files in prompts dir', () => {
    expect(copilotHandler.matchFiles(['.github/prompts/notes.md'])).toEqual([])
  })

  it('matches .agent.md files', () => {
    const files = ['.github/agents/security-reviewer.agent.md']
    expect(copilotHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match non-.agent.md files in agents dir', () => {
    expect(copilotHandler.matchFiles(['.github/agents/readme.md'])).toEqual([])
  })

  it('matches skills directory files', () => {
    const files = ['.github/skills/typescript/SKILL.md', '.github/skills/testing/helpers.sh']
    expect(copilotHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match AGENTS.md (belongs to cross-agent)', () => {
    expect(copilotHandler.matchFiles(['AGENTS.md'])).toEqual([])
  })

  it('does not match other .github files', () => {
    expect(copilotHandler.matchFiles(['.github/workflows/ci.yml', '.github/CODEOWNERS'])).toEqual([])
  })

  it('matches all copilot file types together', () => {
    const files = [
      '.github/copilot-instructions.md',
      '.github/instructions/go.instructions.md',
      '.github/prompts/deploy.prompt.md',
      '.github/agents/planner.agent.md',
      '.github/skills/rust/SKILL.md',
      '.github/workflows/ci.yml', // should NOT match
      'README.md', // should NOT match
    ]
    const matched = copilotHandler.matchFiles(files)
    expect(matched).toHaveLength(5)
    expect(matched).not.toContain('.github/workflows/ci.yml')
    expect(matched).not.toContain('README.md')
  })
})

describe('vscodeHandler', () => {
  it('matches .vscode/agents/ files', () => {
    expect(vscodeHandler.matchFiles(['.vscode/agents/reviewer.md'])).toEqual(['.vscode/agents/reviewer.md'])
  })

  it('matches .vscode/*.agent.md files', () => {
    expect(vscodeHandler.matchFiles(['.vscode/custom.agent.md'])).toEqual(['.vscode/custom.agent.md'])
  })

  it('does not match regular .vscode files', () => {
    expect(vscodeHandler.matchFiles(['.vscode/settings.json', '.vscode/extensions.json'])).toEqual([])
  })

  it('does not match .vscode/launch.json', () => {
    expect(vscodeHandler.matchFiles(['.vscode/launch.json'])).toEqual([])
  })
})

describe('claudeHandler', () => {
  it('matches CLAUDE.md', () => {
    expect(claudeHandler.matchFiles(['CLAUDE.md'])).toEqual(['CLAUDE.md'])
  })

  it('matches .claude/ directory files', () => {
    const files = ['.claude/settings.json', '.claude/commands/test.md']
    expect(claudeHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match claude in subdirectory', () => {
    expect(claudeHandler.matchFiles(['docs/CLAUDE.md'])).toEqual([])
  })

  it('is case-sensitive', () => {
    expect(claudeHandler.matchFiles(['claude.md'])).toEqual([])
  })
})

describe('windsurfHandler', () => {
  it('matches .windsurfrules', () => {
    expect(windsurfHandler.matchFiles(['.windsurfrules'])).toEqual(['.windsurfrules'])
  })

  it('matches .windsurf/rules/ directory files', () => {
    const files = ['.windsurf/rules/style.md', '.windsurf/rules/testing.md']
    expect(windsurfHandler.matchFiles(files)).toEqual(files)
  })

  it('matches .windsurf/workflows/ directory files', () => {
    const files = ['.windsurf/workflows/deploy.md']
    expect(windsurfHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match other files', () => {
    expect(windsurfHandler.matchFiles(['windsurfrules', '.windsurfrules.bak'])).toEqual([])
  })
})

describe('antigravityHandler', () => {
  it('matches GEMINI.md', () => {
    expect(antigravityHandler.matchFiles(['GEMINI.md'])).toEqual(['GEMINI.md'])
  })

  it('matches .agent/ directory', () => {
    const files = ['.agent/rules/style.md', '.agent/skills/deploy/run.sh', '.agent/workflows/ci.yml']
    expect(antigravityHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match AGENTS.md (belongs to cross-agent)', () => {
    expect(antigravityHandler.matchFiles(['AGENTS.md'])).toEqual([])
  })

  it('does not match gemini.md lowercase', () => {
    expect(antigravityHandler.matchFiles(['gemini.md'])).toEqual([])
  })
})

describe('aiderHandler', () => {
  it('matches .aider.conf.yml', () => {
    expect(aiderHandler.matchFiles(['.aider.conf.yml'])).toEqual(['.aider.conf.yml'])
  })

  it('matches .aiderignore', () => {
    expect(aiderHandler.matchFiles(['.aiderignore'])).toEqual(['.aiderignore'])
  })

  it('matches .aider.model.settings.yml', () => {
    expect(aiderHandler.matchFiles(['.aider.model.settings.yml'])).toEqual(['.aider.model.settings.yml'])
  })

  it('does not match other aider-like files', () => {
    expect(aiderHandler.matchFiles(['aider.conf', '.aider.log'])).toEqual([])
  })
})

describe('clineHandler', () => {
  it('matches .clinerules single file', () => {
    expect(clineHandler.matchFiles(['.clinerules'])).toEqual(['.clinerules'])
  })

  it('matches .clinerules/ directory files', () => {
    const files = ['.clinerules/style.md', '.clinerules/testing.md']
    expect(clineHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match unrelated files', () => {
    expect(clineHandler.matchFiles(['.clinerules-backup', 'clinerules.md'])).toEqual([])
  })
})

describe('continueHandler', () => {
  it('matches .continue/ directory files', () => {
    const files = [
      '.continue/config.yaml',
      '.continue/rules/style.md',
      '.continue/checks/lint.md',
      '.continue/prompts/refactor.md',
    ]
    expect(continueHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match unrelated .continue-like files', () => {
    expect(continueHandler.matchFiles(['continue.yaml', '.continue-backup/x.md'])).toEqual([])
  })
})

describe('crossAgentHandler', () => {
  it('matches AGENTS.md', () => {
    expect(crossAgentHandler.matchFiles(['AGENTS.md'])).toEqual(['AGENTS.md'])
  })

  it('matches .agents/skills/ directory', () => {
    const files = ['.agents/skills/typescript/SKILL.md']
    expect(crossAgentHandler.matchFiles(files)).toEqual(files)
  })

  it('does not match GEMINI.md or CLAUDE.md', () => {
    expect(crossAgentHandler.matchFiles(['GEMINI.md', 'CLAUDE.md'])).toEqual([])
  })

  it('does not match nested AGENTS.md', () => {
    expect(crossAgentHandler.matchFiles(['docs/AGENTS.md'])).toEqual([])
  })
})
