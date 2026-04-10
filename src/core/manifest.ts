import { join } from 'node:path'
import { ManifestSchema, EMPTY_MANIFEST } from '../types/manifest.js'
import type { Manifest } from '../types/manifest.js'
import type { InstalledEntry } from '../types/common.js'
import { readJson, writeJson, fileExists } from '../utils/fs.js'
import { ManifestError } from '../utils/errors.js'

export const MANIFEST_FILENAME = '.agentpull.json'

export function getManifestPath(projectDir: string): string {
  return join(projectDir, MANIFEST_FILENAME)
}

export async function readManifest(projectDir: string): Promise<Manifest> {
  const path = getManifestPath(projectDir)
  if (!(await fileExists(path))) {
    return { ...EMPTY_MANIFEST }
  }
  try {
    const raw = await readJson<unknown>(path)
    const result = ManifestSchema.safeParse(raw)
    if (!result.success) {
      throw new ManifestError(`Invalid manifest at ${path}: ${result.error.message}`)
    }
    return result.data
  } catch (err) {
    if (err instanceof ManifestError) throw err
    throw new ManifestError(`Failed to read manifest: ${(err as Error).message}`)
  }
}

export async function writeManifest(projectDir: string, manifest: Manifest): Promise<void> {
  try {
    await writeJson(getManifestPath(projectDir), manifest)
  } catch (err) {
    throw new ManifestError(`Failed to write manifest: ${(err as Error).message}`)
  }
}

export async function addEntry(projectDir: string, entry: InstalledEntry): Promise<void> {
  const manifest = await readManifest(projectDir)
  const idx = manifest.installed.findIndex((e) => e.name === entry.name)
  if (idx !== -1) {
    manifest.installed[idx] = entry
  } else {
    manifest.installed.push(entry)
  }
  await writeManifest(projectDir, manifest)
}

export async function removeEntry(projectDir: string, name: string): Promise<boolean> {
  const manifest = await readManifest(projectDir)
  const before = manifest.installed.length
  manifest.installed = manifest.installed.filter((e) => e.name !== name)
  if (manifest.installed.length === before) return false
  await writeManifest(projectDir, manifest)
  return true
}

export async function findEntry(
  projectDir: string,
  name: string,
): Promise<InstalledEntry | undefined> {
  const manifest = await readManifest(projectDir)
  return manifest.installed.find((e) => e.name === name)
}

export async function isInitialized(projectDir: string): Promise<boolean> {
  return fileExists(getManifestPath(projectDir))
}
