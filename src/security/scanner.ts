import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ALL_RULES } from './rules/index.js'

/**
 * Maximum file size the scanner will read. Agent config files are text and
 * rarely more than a few KB — anything larger is almost certainly either a
 * binary or a pathological input. Reading a multi-GB file into a single JS
 * string would OOM the process, so we stat first and skip oversized files.
 */
export const MAX_SCAN_BYTES = 1 * 1024 * 1024 // 1 MB

/**
 * Lightweight binary-content sniff: if the first 4 KB contains a NUL byte,
 * treat the file as binary and skip it. Running text-oriented regexes against
 * mojibake from `readFile(..., 'utf-8')` on a binary burns CPU and produces
 * spurious findings.
 */
function looksBinary(content: string): boolean {
  const probe = content.length > 4096 ? content.slice(0, 4096) : content
  return probe.includes('\u0000')
}

export type Severity = 'info' | 'warning' | 'critical'

export interface ScanFinding {
  ruleId: string
  severity: Severity
  file: string
  line: number
  message: string
}

export interface ScanRule {
  id: string
  name: string
  severity: Severity
  /**
   * Optional file-type predicate. If present and returns false for a given
   * file path, the rule is skipped for that file. Used to avoid trivial
   * false positives — e.g. shell-injection's backtick pattern firing on
   * markdown inline code, or prompt-injection's "ignore previous" matching
   * a TypeScript variable name.
   */
  appliesTo?(filePath: string): boolean
  scan(filePath: string, content: string): ScanFinding[]
}

/** Scan a single file's content against all rules */
export function scanContent(filePath: string, content: string, rules = ALL_RULES): ScanFinding[] {
  return rules.flatMap((rule) => {
    if (rule.appliesTo && !rule.appliesTo(filePath)) return []
    return rule.scan(filePath, content)
  })
}

/** Scan a single file on disk. Returns empty findings if the file is too
 *  large or appears to be binary. */
export async function scanFile(filePath: string, rules = ALL_RULES): Promise<ScanFinding[]> {
  const st = await stat(filePath).catch(() => null)
  if (!st || !st.isFile() || st.size > MAX_SCAN_BYTES) return []
  const content = await readFile(filePath, 'utf-8').catch(() => null)
  if (content === null || looksBinary(content)) return []
  return scanContent(filePath, content, rules)
}

/** Scan all files in a directory recursively */
export async function scanPath(dirOrFile: string, rules = ALL_RULES): Promise<ScanFinding[]> {
  const findings: ScanFinding[] = []

  const walk = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => null)
    if (!entries) {
      // It's a file
      findings.push(...(await scanFile(current, rules)))
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isSymbolicLink()) continue // don't follow symlinks
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        findings.push(...(await scanFile(full, rules)))
      }
    }
  }

  await walk(dirOrFile)
  return findings
}

export function hasCritical(findings: ScanFinding[]): boolean {
  return findings.some((f) => f.severity === 'critical')
}
