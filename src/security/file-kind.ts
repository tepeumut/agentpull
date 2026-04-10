import { extname, basename } from 'node:path'

/**
 * Classify a file path into a kind so scanner rules can scope themselves to
 * the file types where their patterns are meaningful. The shell-injection
 * rule's backtick pattern, for example, is fundamentally incompatible with
 * markdown's inline-code convention — every `` `npm install` `` in a doc
 * would otherwise be flagged as command substitution.
 */

const CODE_EXTS = new Set([
  '.sh', '.bash', '.zsh', '.fish', '.ksh',
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.tsx', '.mts', '.cts',
  '.py', '.pyi', '.pyw',
  '.rb', '.erb',
  '.pl', '.pm',
  '.php',
  '.ps1', '.psm1',
  '.lua',
  '.go',
  '.rs',
  '.java', '.kt', '.kts', '.scala',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp',
  '.cs',
  '.swift',
])

const TEXT_EXTS = new Set([
  '.md', '.mdc', '.markdown', '.mdx',
  '.txt', '.text',
  '.rst', '.adoc', '.asciidoc',
  '.org',
])

const CONFIG_EXTS = new Set([
  '.yml', '.yaml',
  '.toml',
  '.json', '.jsonc', '.json5',
  '.ini', '.cfg', '.conf',
  '.env',
  '.xml',
  '.properties',
])

/** Files with these exact basenames are treated as text/markdown even
 *  though they have no extension or a non-text extension. */
const TEXT_BASENAMES = new Set([
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'CONVENTIONS.md',
  'README',
  'LICENSE',
  'COPYING',
])

function ext(p: string): string {
  return extname(p).toLowerCase()
}

/** True for source-code files where shell-injection / call-site patterns
 *  are meaningful. */
export function isCodeFile(filePath: string): boolean {
  return CODE_EXTS.has(ext(filePath))
}

/** True for human-readable text/markdown files where prompt-injection
 *  patterns are meaningful. */
export function isTextFile(filePath: string): boolean {
  if (TEXT_EXTS.has(ext(filePath))) return true
  const base = basename(filePath)
  if (TEXT_BASENAMES.has(base)) return true
  // No extension and not in the explicit list — most likely a script (e.g.
  // `Makefile`) or a binary; treat as not-text so prompt-injection skips it.
  return false
}

/** True for structured config / data files. Env vars referenced here may
 *  legitimately be sensitive. */
export function isConfigFile(filePath: string): boolean {
  return CONFIG_EXTS.has(ext(filePath))
}

/** True for files where shell/code patterns can plausibly execute —
 *  source code OR config files that often embed shell snippets (YAML CI
 *  workflows, Dockerfiles, .env files). */
export function isExecutableContext(filePath: string): boolean {
  if (isCodeFile(filePath)) return true
  if (isConfigFile(filePath)) return true
  const base = basename(filePath)
  return base === 'Dockerfile' || base === 'Makefile' || base.startsWith('Dockerfile.')
}
