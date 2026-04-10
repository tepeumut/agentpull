import type { AgentHandler } from './types.js'

export const aiderHandler: AgentHandler = {
  type: 'aider',
  displayName: 'Aider',
  patterns: ['.aider.conf.yml', '.aiderignore', '.aider.model.settings.yml'],
  matchFiles(files: string[]): string[] {
    return files.filter(
      (f) =>
        f === '.aider.conf.yml' ||
        f === '.aiderignore' ||
        f === '.aider.model.settings.yml',
    )
  },
  getTargetPath(sourcePath: string): string {
    return sourcePath
  },
}
