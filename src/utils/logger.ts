import chalk from 'chalk'

export const logger = {
  info(message: string): void {
    console.log(chalk.cyan('ℹ'), message)
  },

  success(message: string): void {
    console.log(chalk.green('✓'), message)
  },

  warn(message: string): void {
    console.warn(chalk.yellow('⚠'), message)
  },

  error(message: string): void {
    console.error(chalk.red('✗'), message)
  },

  dim(message: string): void {
    console.log(chalk.dim(message))
  },

  bold(message: string): void {
    console.log(chalk.bold(message))
  },

  /**
   * Section header — adds vertical breathing room and an underlined title.
   * Use for top-level groupings in command output (e.g. `agentpull list`).
   */
  section(title: string): void {
    console.log('')
    console.log(chalk.bold.underline(title))
  },

  /**
   * Two-column key/value table with right-aligned, dimmed keys. Used by
   * `list` and `registry list` to lay out structured data without pulling
   * in a heavyweight table library.
   */
  table(rows: Array<[string, string]>): void {
    if (rows.length === 0) return
    const keyWidth = Math.max(...rows.map(([k]) => k.length))
    for (const [k, v] of rows) {
      console.log(`  ${chalk.dim(k.padStart(keyWidth))}  ${v}`)
    }
  },
}
