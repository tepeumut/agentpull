import type { Command } from 'commander'
import { readAuditLog } from '../security/audit-log.js'
import chalk from 'chalk'

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('View the audit log of all agentpull operations')
    .option('--limit <n>', 'Number of most recent entries to show', '50')
    .option('--operation <op>', 'Filter by operation (add, update, remove, scan, auth)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { limit: string; operation?: string; json?: boolean }) => {
      const entries = await readAuditLog({
        limit: parseInt(opts.limit, 10),
        operation: opts.operation,
      })
      if (opts.json) {
        console.log(JSON.stringify(entries, null, 2))
        return
      }
      if (entries.length === 0) {
        console.log(chalk.dim('No audit log entries found'))
        return
      }
      for (const e of entries) {
        const statusColor = e.result === 'success' ? chalk.green : e.result === 'blocked' ? chalk.yellow : chalk.red
        console.log(
          `${chalk.dim(e.timestamp.slice(0, 19))} ${statusColor(e.result.padEnd(8))} ${chalk.bold(e.operation.padEnd(8))} ${e.name ?? e.source ?? ''}`,
        )
      }
    })
}
