import type { ScanRule, ScanFinding } from '../scanner.js'
import { isExecutableContext } from '../file-kind.js'

// Patterns target references to likely-sensitive variables, not every
// $VAR reference. `$PATH`, `$HOME`, `$USER`, etc. are extremely common in
// legitimate shell scripts and produced huge false-positive rates.
const PATTERNS = [
  { re: /process\.env\b/, desc: 'Node.js process.env access' },
  {
    re: /\$\{?[A-Z_]*(?:TOKEN|SECRET|KEY|PASS(?:WORD)?|AUTH|CREDENTIAL|DATABASE|DB_URL|API_KEY)[A-Z_]*\}?/,
    desc: 'Sensitive shell environment variable reference',
  },
  { re: /\bos\.environ\b/, desc: 'Python os.environ access' },
  { re: /\bgetenv\s*\(/, desc: 'getenv() call' },
  // Transmission patterns combined with env access
  { re: /(?:curl|wget|fetch|http)\S*\$(?:ENV|env|HOME|USER|PASS|TOKEN|KEY|SECRET)/i, desc: 'Env var transmitted via HTTP tool' },
]

export const envExfiltrationRule: ScanRule = {
  id: 'ENV_EXFILTRATION',
  name: 'Environment Variable Exfiltration',
  severity: 'warning',
  // Same scoping as shell-injection: a doc that mentions `process.env` is
  // not exfiltrating anything.
  appliesTo: isExecutableContext,
  scan(filePath: string, content: string): ScanFinding[] {
    const findings: ScanFinding[] = []
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      for (const { re, desc } of PATTERNS) {
        if (re.test(line)) {
          findings.push({
            ruleId: 'ENV_EXFILTRATION',
            severity: 'warning',
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
