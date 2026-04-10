import type { ScanRule, ScanFinding } from '../scanner.js'
import { isExecutableContext } from '../file-kind.js'

// Patterns are intentionally narrow — we only flag shapes that look like
// actual call sites or module imports, not stray mentions in prose.
// All patterns must NOT use the `g` flag: they're reused across every line
// and stateful `lastIndex` would cause missed matches.
const PATTERNS = [
  { re: /`[^`\n]{1,200}`/, desc: 'Backtick command substitution' },
  { re: /\$\([^)\n]{1,200}\)/, desc: 'Shell command substitution $()' },
  { re: /\bexecSync\s*\(|\bexecFileSync\s*\(|\bspawnSync\s*\(|\bspawn\s*\(|\bexec\s*\(/, desc: 'Node.js child process call' },
  { re: /\bchild_process\b/, desc: 'child_process module reference' },
  { re: /\bos\.system\s*\(|\bsubprocess\.(?:run|Popen|call|check_output|check_call)\s*\(/, desc: 'Python subprocess/os.system' },
  { re: /\beval\s*\(/, desc: 'eval() call' },
]

export const shellInjectionRule: ScanRule = {
  id: 'SHELL_INJECTION',
  name: 'Shell Injection',
  severity: 'critical',
  // Only meaningful in files that actually execute. Markdown inline code
  // (`` `npm install` ``, `` `##` ``, …) is not shell command substitution
  // and was the largest source of false positives before this scoping.
  appliesTo: isExecutableContext,
  scan(filePath: string, content: string): ScanFinding[] {
    const findings: ScanFinding[] = []
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      for (const { re, desc } of PATTERNS) {
        if (re.test(line)) {
          findings.push({
            ruleId: 'SHELL_INJECTION',
            severity: 'critical',
            file: filePath,
            line: i + 1,
            message: `${desc}: ${line.trim().slice(0, 80)}`,
          })
        }
      }
    })
    return findings
  },
}
