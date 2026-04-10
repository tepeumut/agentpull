import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  access,
  rm,
  readdir,
  rename,
  chmod,
} from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface WriteJsonOptions {
  /** File mode (chmod) to apply to the written file. Ignored on Windows. */
  mode?: number
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content) as T
}

/** Write JSON atomically via a temp file + rename to prevent partial writes */
export async function writeJson(
  filePath: string,
  data: unknown,
  opts: WriteJsonOptions = {},
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`
  try {
    // Pass `mode` directly to writeFile so the file is created with the
    // restricted permissions from the start — there is no window where the
    // temp file is world-readable.
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', {
      encoding: 'utf-8',
      mode: opts.mode,
    })
    // Re-apply chmod after writeFile in case the file already existed with
    // looser permissions (writeFile's `mode` only applies to newly-created files).
    if (opts.mode !== undefined) await chmod(tmp, opts.mode).catch(() => undefined)
    await rename(tmp, filePath)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function safeCopy(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}

export async function isEmptyDir(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath)
    return entries.length === 0
  } catch {
    return false
  }
}

export async function removeEmptyDirs(dirPath: string, stopAt: string): Promise<void> {
  // Use path.relative so containment is separator-agnostic (works on Windows).
  // Bail if dirPath === stopAt (rel === ''), escapes stopAt (starts with '..'),
  // or sits on a different volume on Windows (rel is absolute).
  const rel = relative(stopAt, dirPath)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return
  if (await isEmptyDir(dirPath)) {
    await rm(dirPath, { recursive: true, force: true })
    await removeEmptyDirs(dirname(dirPath), stopAt)
  }
}

export { join, dirname }
