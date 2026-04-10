import { confirm, isCancel, multiselect, note, select, spinner } from '@clack/prompts'
import chalk from 'chalk'
import type { AgentType } from '../types/common.js'
import type { DetectionResult } from '../agents/detector.js'
import type { ClassifiedResult } from '../core/classify-conflicts.js'

/**
 * Wrap clack's `isCancel` so a Ctrl-C from any prompt becomes a clean exit.
 * Inquirer used to throw `ExitPromptError` on Ctrl-C; clack returns a sentinel
 * symbol instead, so call sites must explicitly handle cancellation.
 */
function exitIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    process.exit(130)
  }
  return value as T
}

export async function promptAgentSelection(detected: DetectionResult[]): Promise<AgentType[]> {
  if (detected.length === 0) return []
  if (detected.length === 1) return [detected[0].agentType]

  const result = await multiselect<AgentType>({
    message: 'Select agent types to install',
    options: detected.map((d) => ({
      value: d.agentType,
      label: `${d.displayName} (${d.files.length} file${d.files.length === 1 ? '' : 's'})`,
    })),
    initialValues: detected.map((d) => d.agentType),
    required: false,
  })

  return exitIfCancelled(result)
}

export async function promptConflictResolution(
  conflictingFiles: string[],
): Promise<'skip' | 'overwrite' | 'abort'> {
  const preview = conflictingFiles.slice(0, 10).join('\n')
  const more =
    conflictingFiles.length > 10 ? `\n... and ${conflictingFiles.length - 10} more` : ''
  note(`${preview}${more}`, 'Conflicting files')

  const result = await select<'skip' | 'overwrite' | 'abort'>({
    message: 'How should conflicts be resolved?',
    options: [
      { value: 'overwrite', label: 'Overwrite all conflicting files' },
      { value: 'skip', label: 'Skip conflicting files' },
      { value: 'abort', label: 'Abort installation' },
    ],
  })

  return exitIfCancelled(result)
}

export async function promptLocalModWarning(locallyModified: string[]): Promise<boolean> {
  const preview = locallyModified.slice(0, 10).join('\n')
  const more =
    locallyModified.length > 10 ? `\n... and ${locallyModified.length - 10} more` : ''
  note(
    `${preview}${more}`,
    chalk.yellow('Local modifications that will be overwritten'),
  )

  const result = await confirm({
    message: 'Continue and overwrite local changes?',
    initialValue: false,
  })

  return exitIfCancelled(result)
}

/**
 * The user's choice for handling classified conflicts.
 *
 * - `skip-warned`   — overwrite tracked-clean files only; leave hand-written,
 *                     tracked-other, and tracked-modified files alone. Default.
 * - `overwrite-all` — overwrite *every* conflicting file, destroying any
 *                     hand-written content or local modifications.
 * - `abort`         — cancel the install entirely.
 */
export type ClassifiedConflictChoice = 'skip-warned' | 'overwrite-all' | 'abort'

const MAX_LIST = 12

function buildList(label: string, files: string[]): string | null {
  if (files.length === 0) return null
  const head = files.slice(0, MAX_LIST).map((f) => `  ${f}`).join('\n')
  const tail =
    files.length > MAX_LIST
      ? '\n' + chalk.dim(`  ... and ${files.length - MAX_LIST} more`)
      : ''
  return `${label}\n${head}${tail}`
}

/**
 * Show a grouped, color-coded summary of every conflicting file before
 * asking the user what to do.
 *
 * The default action is intentionally non-destructive: hand-written and
 * locally-modified files are skipped unless the user explicitly opts in to
 * "overwrite all".
 */
export async function promptClassifiedConflicts(
  entryName: string,
  c: ClassifiedResult,
): Promise<ClassifiedConflictChoice> {
  const sections: string[] = []
  const handWritten = buildList(
    chalk.red.bold('HAND-WRITTEN (not tracked by agentpull — you authored these):'),
    c.handWritten.map((f) => f.relPath),
  )
  if (handWritten) sections.push(handWritten)

  const locallyModified = buildList(
    chalk.yellow.bold('LOCALLY MODIFIED (tracked, but you edited them):'),
    c.trackedModified.map((f) => f.relPath),
  )
  if (locallyModified) sections.push(locallyModified)

  if (c.trackedOther.length > 0) {
    const byOwner = new Map<string, string[]>()
    for (const f of c.trackedOther) {
      const owner = f.ownerEntry ?? '?'
      const list = byOwner.get(owner) ?? []
      list.push(f.relPath)
      byOwner.set(owner, list)
    }
    for (const [owner, files] of byOwner) {
      const block = buildList(
        chalk.yellow.bold(`CONFLICTS WITH OTHER ENTRY "${owner}":`),
        files,
      )
      if (block) sections.push(block)
    }
  }

  if (c.trackedClean.length > 0) {
    sections.push(
      chalk.dim(
        `${c.trackedClean.length} tracked file(s) will be overwritten cleanly (no local changes).`,
      ),
    )
  }

  note(sections.join('\n\n'), `Conflicts for "${chalk.bold(entryName)}"`)

  const result = await select<ClassifiedConflictChoice>({
    message: 'How should conflicts be resolved?',
    initialValue: 'skip-warned',
    options: [
      {
        value: 'skip-warned',
        label: 'Skip warned files (recommended) — keep hand-written / modified content',
      },
      {
        value: 'overwrite-all',
        label: 'Overwrite EVERYTHING — destroys hand-written and locally-modified content',
      },
      { value: 'abort', label: 'Abort installation' },
    ],
  })

  return exitIfCancelled(result)
}

/**
 * Spinner wrapper that mimics ora's `.text`, `.start`, `.stop`, `.succeed`,
 * and `.fail` surface so existing call sites in `installer.ts` don't have to
 * change. clack's spinner exposes `start(msg)`, `stop(msg)`, `error(msg)`,
 * `message(text)` — we map ora semantics onto these.
 */
export interface OraLikeSpinner {
  text: string
  start(): void
  stop(): void
  succeed(text?: string): void
  fail(text?: string): void
}

export function makeSpinner(initial: string): OraLikeSpinner {
  const s = spinner()
  let current = initial
  let started = false
  return {
    get text() {
      return current
    },
    set text(value: string) {
      current = value
      if (started) s.message(value)
    },
    start() {
      started = true
      s.start(current)
    },
    stop() {
      if (started) s.stop(current)
      started = false
    },
    succeed(text?: string) {
      if (text) current = text
      if (started) s.stop(current)
      started = false
    },
    fail(text?: string) {
      if (text) current = text
      if (started) s.error(current)
      started = false
    },
  }
}
