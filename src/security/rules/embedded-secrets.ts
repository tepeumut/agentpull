import type { ScanRule, ScanFinding } from '../scanner.js'

const PATTERNS = [
  { re: /\bghp_[A-Za-z0-9]{36,}\b/, desc: 'GitHub classic PAT (ghp_)' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/, desc: 'GitHub fine-grained PAT' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, desc: 'AWS Access Key ID' },
  { re: /\b[0-9a-z]{32}\b[^\n]{0,60}?(?:secret|key|token)/i, desc: 'Potential 32-char secret' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, desc: 'Private key block' },
  { re: /sk-[A-Za-z0-9]{48}/, desc: 'OpenAI API key' },
  { re: /sk-ant-api[A-Za-z0-9\-_]{50,}/, desc: 'Anthropic API key' },
  { re: /eyJ[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}/, desc: 'JWT token' },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, desc: 'Slack token' },
]

export const embeddedSecretsRule: ScanRule = {
  id: 'EMBEDDED_SECRETS',
  name: 'Embedded Secrets',
  severity: 'critical',
  scan(filePath: string, content: string): ScanFinding[] {
    const findings: ScanFinding[] = []
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      for (const { re, desc } of PATTERNS) {
        if (re.test(line)) {
          findings.push({
            ruleId: 'EMBEDDED_SECRETS',
            severity: 'critical',
            file: filePath,
            line: i + 1,
            message: `${desc} detected`,
          })
        }
      }
    })
    return findings
  },
}
