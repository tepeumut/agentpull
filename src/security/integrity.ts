import { join } from 'node:path'
import { hashFile } from '../utils/hash.js'
import type { InstalledEntry, InstalledFile } from '../types/common.js'

export interface IntegrityResult {
  ok: boolean
  /** Files whose on-disk hash differs from the manifest hash */
  modified: string[]
  /** Files listed in manifest but missing from disk */
  missing: string[]
}

export async function computeFileHashes(
  dir: string,
  files: string[],
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>()
  await Promise.all(
    files.map(async (f) => {
      const hash = await hashFile(join(dir, f))
      hashes.set(f, hash)
    }),
  )
  return hashes
}

export async function verifyFiles(
  projectDir: string,
  installedFiles: InstalledFile[],
): Promise<IntegrityResult> {
  const modified: string[] = []
  const missing: string[] = []

  await Promise.all(
    installedFiles.map(async (f) => {
      const fullPath = join(projectDir, f.path)
      try {
        const currentHash = await hashFile(fullPath)
        if (currentHash !== f.sha256) {
          modified.push(f.path)
        }
      } catch {
        missing.push(f.path)
      }
    }),
  )

  return { ok: modified.length === 0 && missing.length === 0, modified, missing }
}
