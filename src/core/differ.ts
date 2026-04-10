import { join } from 'node:path'
import { hashFile } from '../utils/hash.js'
import type { InstalledFile } from '../types/common.js'

export interface DiffResult {
  /** Files that are new in the downloaded version */
  added: string[]
  /** Files that changed content */
  modified: string[]
  /** Files in the manifest no longer in the downloaded version */
  removed: string[]
  /** Files that are locally modified (diverged from manifest hash) */
  locallyModified: string[]
}

export async function diffFiles(
  extractDir: string,
  newFiles: string[],
  installedFiles: InstalledFile[],
  projectDir: string,
): Promise<DiffResult> {
  const newSet = new Set(newFiles)
  const oldSet = new Set(installedFiles.map((f) => f.sourcePath))

  const added = newFiles.filter((f) => !oldSet.has(f))
  const removed = installedFiles.filter((f) => !newSet.has(f.sourcePath)).map((f) => f.sourcePath)

  const modified: string[] = []
  const locallyModified: string[] = []

  await Promise.all(
    installedFiles
      .filter((f) => newSet.has(f.sourcePath))
      .map(async (f) => {
        // Check if the new version differs from what was installed
        const newHash = await hashFile(join(extractDir, f.sourcePath)).catch(() => null)
        if (newHash !== null && newHash !== f.sha256) {
          modified.push(f.sourcePath)
        }

        // Check if the user has locally modified the installed file
        const currentHash = await hashFile(join(projectDir, f.path)).catch(() => null)
        if (currentHash !== null && currentHash !== f.sha256) {
          locallyModified.push(f.path)
        }
      }),
  )

  return { added, modified, removed, locallyModified }
}
