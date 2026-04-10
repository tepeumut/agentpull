import { join } from 'node:path'
import { hashFile } from '../utils/hash.js'
import { fileExists } from '../utils/fs.js'
import type { Manifest } from '../types/manifest.js'

/**
 * How a conflicting file relates to the rest of the project's manifest.
 *
 * The classification drives the prompt: tracked-clean files are silently
 * overwritten (they're agentpull content moving forward), tracked-modified
 * uses the existing locallyModified prompt path, and the two "warned"
 * categories — tracked-other and hand-written — are listed prominently
 * in the new classified-conflicts prompt with a default of "skip".
 */
export type ConflictClass =
  | 'tracked-clean'
  | 'tracked-modified'
  | 'tracked-other'
  | 'hand-written'

export interface ClassifiedConflict {
  /** Project-relative path of the file. */
  relPath: string
  classification: ConflictClass
  /** When tracked-other, the name of the entry that owns it. */
  ownerEntry?: string
}

export interface ClassifyOptions {
  projectDir: string
  manifest: Manifest
  /** Name of the entry currently being installed/updated. */
  currentEntryName: string
  /** Files that exist on disk and would be overwritten. */
  conflicts: string[]
}

export interface ClassifiedResult {
  trackedClean: ClassifiedConflict[]
  trackedModified: ClassifiedConflict[]
  trackedOther: ClassifiedConflict[]
  handWritten: ClassifiedConflict[]
}

/**
 * Classify each conflicting path against the full manifest.
 *
 * Decision matrix per file:
 *
 *   in current entry?
 *     yes → disk hash matches manifest baseline?
 *             yes → tracked-clean   (safe to overwrite, this is just a re-install)
 *             no  → tracked-modified (user edited it; existing locallyModified prompt handles)
 *     no  → in some OTHER entry?
 *             yes → tracked-other   (cross-entry collision; warn the user)
 *             no  → hand-written    (user authored this file themselves; warn loudly)
 */
export async function classifyConflicts(opts: ClassifyOptions): Promise<ClassifiedResult> {
  const { projectDir, manifest, currentEntryName, conflicts } = opts

  // Build path → owner index across the whole manifest. The same path
  // can technically appear under multiple entries; we keep the first
  // match because the classifier only needs to know if it's tracked at all
  // and which entry to attribute it to.
  const ownership = new Map<string, { entryName: string; sha256: string }>()
  for (const entry of manifest.installed) {
    for (const f of entry.files) {
      if (!ownership.has(f.path)) {
        ownership.set(f.path, { entryName: entry.name, sha256: f.sha256 })
      }
    }
  }

  const result: ClassifiedResult = {
    trackedClean: [],
    trackedModified: [],
    trackedOther: [],
    handWritten: [],
  }

  for (const relPath of conflicts) {
    const owner = ownership.get(relPath)

    if (!owner) {
      result.handWritten.push({ relPath, classification: 'hand-written' })
      continue
    }

    if (owner.entryName !== currentEntryName) {
      result.trackedOther.push({
        relPath,
        classification: 'tracked-other',
        ownerEntry: owner.entryName,
      })
      continue
    }

    // Owned by the current entry — compare disk hash to manifest baseline.
    const fullPath = join(projectDir, relPath)
    if (!(await fileExists(fullPath))) {
      // Shouldn't happen (conflicts are pre-filtered to existing files),
      // but treat as clean if the file disappeared.
      result.trackedClean.push({ relPath, classification: 'tracked-clean' })
      continue
    }

    const diskHash = await hashFile(fullPath).catch(() => null)
    if (diskHash === owner.sha256) {
      result.trackedClean.push({ relPath, classification: 'tracked-clean' })
    } else {
      result.trackedModified.push({ relPath, classification: 'tracked-modified' })
    }
  }

  return result
}

/** Files that should be left alone unless the user opts in. */
export function warnedFiles(c: ClassifiedResult): string[] {
  return [...c.handWritten, ...c.trackedOther, ...c.trackedModified].map((f) => f.relPath)
}

/** True if any conflict needs user attention (anything other than tracked-clean). */
export function hasWarnings(c: ClassifiedResult): boolean {
  return c.handWritten.length + c.trackedOther.length + c.trackedModified.length > 0
}
