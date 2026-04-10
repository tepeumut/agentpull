import type { Command } from 'commander'
import { scanPath } from '../security/scanner.js'
import { logger } from '../utils/logger.js'
import chalk from 'chalk'

export function registerScanCommand(program: Command): void {
  program
    .command('scan <path>')
    .description('Scan files for security issues before installing')
    .option('--json', 'Output findings as JSON')
    .action(async (targetPath: string, opts: { json?: boolean }) => {
      const findings = await scanPath(targetPath)
      if (opts.json) {
        console.log(JSON.stringify(findings, null, 2))
        return
      }
      if (findings.length === 0) {
        logger.success('No security issues found')
        return
      }
      for (const f of findings) {
        const color =
          f.severity === 'critical' ? chalk.red : f.severity === 'warning' ? chalk.yellow : chalk.cyan
        console.log(color(`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.message}`))
        console.log(chalk.dim(`  ${f.file}:${f.line}`))
      }
      const criticals = findings.filter((f) => f.severity === 'critical').length
      if (criticals > 0) {
        logger.error(`${criticals} critical issue(s) found — installation would be blocked`)
        process.exit(1)
      }
    })
}
