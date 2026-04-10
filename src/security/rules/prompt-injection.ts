import type { ScanRule, ScanFinding } from '../scanner.js'
import { isTextFile } from '../file-kind.js'

// Known prompt injection and jailbreak patterns. No `g` flag — we test each
// line individually and stateful regexes would miss matches.
const PATTERNS = [
  { re: /ignore\s+(?:previous|all|above)\s+instructions?/i, desc: 'Classic prompt override instruction' },
  { re: /system\s+prompt\s+override/i, desc: 'System prompt override attempt' },
  { re: /you\s+are\s+now\s+(?:in\s+)?(?:developer|jailbreak|dan|unrestricted)\s+mode/i, desc: 'Mode-switching jailbreak' },
  { re: /disregard\s+(?:your|all|any)\s+(?:previous\s+)?(?:instructions?|rules?|guidelines?)/i, desc: 'Instruction disregard' },
  {
    // Long base64-looking blobs. Threshold deliberately high so SHA-256 hex
    // (64 chars), NPM integrity fields (~88 chars), and UUIDs don't trip it.
    // Requires standalone whitespace/line boundaries to avoid substring noise.
    re: /(?:^|[\s"'`])[A-Za-z0-9+/]{200,}={0,2}(?:$|[\s"'`])/,
    desc: 'Long base64-encoded payload (potential hidden instructions)',
    severity: 'warning' as const,
  },
  {
    re: /[\u200b-\u200f\u202a-\u202e\ufeff]/,
    desc: 'Hidden unicode (zero-width / direction-override characters)',
  },
  { re: /\bACT\s+AS\s+(?:an?\s+)?(?:evil|unrestricted|jailbroken)/i, desc: 'Role-play jailbreak' },
]

export const promptInjectionRule: ScanRule = {
  id: 'PROMPT_INJECTION',
  name: 'Prompt Injection',
  severity: 'critical',
  // Prompts live in markdown / plain text. Running this on TypeScript would
  // flag a `IGNORE_PREVIOUS_INSTRUCTIONS` constant name as a jailbreak.
  appliesTo: isTextFile,
  scan(filePath: string, content: string): ScanFinding[] {
    const findings: ScanFinding[] = []
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      for (const p of PATTERNS) {
        if (p.re.test(line)) {
          findings.push({
            ruleId: 'PROMPT_INJECTION',
            severity: (p as { severity?: 'critical' | 'warning' | 'info' }).severity ?? 'critical',
            file: filePath,
            line: i + 1,
            message: `${p.desc}: ${line.trim().slice(0, 80)}`,
          })
        }
      }
    })
    return findings
  },
}
