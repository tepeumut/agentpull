import { rm, copyFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { resolveRepo } from './registry.js'
import { downloadRepo } from './downloader.js'
import { readManifest, addEntry, removeEntry, findEntry } from './manifest.js'
import { readConfig } from './config.js'
import { detectAgents, type DetectionResult } from '../agents/detector.js'
import { getHandler } from '../agents/index.js'
import { scanPath } from '../security/scanner.js'
import { verifyFiles } from '../security/integrity.js'
import { classifyConflicts, hasWarnings } from './classify-conflicts.js'
import { loadCredential } from '../security/keychain.js'
import { appendAuditEntry } from '../security/audit-log.js'
import { hashFile } from '../utils/hash.js'
import { fileExists, removeEmptyDirs } from '../utils/fs.js'
import { SecurityError, AgentpullError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { makeSpinner, promptAgentSelection, promptClassifiedConflicts } from '../utils/prompts.js'
import type { AgentType, InstalledFile } from '../types/common.js'

/**
 * Result returned by `install` / `updateInstalled` so the command layer can
 * tell the difference between "installed something" and "no-op" (nothing
 * detected, user deselected everything, user aborted on conflict, or the
 * entry was already up to date). Prevents misleading "✓ Done" messages.
 */
export interface InstallResult {
  installed: boolean
  fileCount: number
  agentTypes: AgentType[]
}

const EMPTY_RESULT: InstallResult = { installed: false, fileCount: 0, agentTypes: [] }

interface PlanItem {
  src: string
  dest: string
  relPath: string
  sourcePath: string
}

function handlerFor(sourcePath: string, detected: DetectionResult[]) {
  const match = detected.find((d) => d.files.includes(sourcePath))
  return match ? getHandler(match.agentType) : undefined
}

export interface InstallOptions {
  name: string
  projectDir: string
  ref?: string
  agentFilter?: string[]
  scan?: boolean
  conflictResolution?: 'prompt' | 'skip' | 'overwrite'
}

/**
 * Core install step — assumes the repo has already been downloaded and extracted.
 * Shared between `install` and `updateInstalled` so `updateInstalled` does not
 * have to re-download the tarball.
 */
interface PerformInstallArgs {
  name: string
  projectDir: string
  repo: { canonicalUrl: string; ref: string }
  extractDir: string
  commitSha: string
  files: string[]
  agentFilter?: string[]
  scan: boolean
  resolution: 'prompt' | 'skip' | 'overwrite'
  auditOp: 'add' | 'update'
  /**
   * When true, skip the classified-conflict prompt and overwrite every
   * conflicting file unconditionally (including hand-written ones). Set by
   * `agentpull update --force` after the user has explicitly opted in.
   */
  force?: boolean
}

async function performInstall(args: PerformInstallArgs): Promise<InstallResult> {
  const {
    name,
    projectDir,
    repo,
    extractDir,
    commitSha,
    files,
    agentFilter,
    scan,
    resolution,
    auditOp,
    force = false,
  } = args

  // Detect agent types
  const detected = detectAgents(files)
  if (detected.length === 0) {
    logger.warn('No agent configuration files found in this repository')
    return EMPTY_RESULT
  }

  // Filter by agent types if requested
  let toInstall = detected
  if (agentFilter && agentFilter.length > 0) {
    toInstall = detected.filter((d) => agentFilter.includes(d.agentType))
    if (toInstall.length === 0) {
      logger.warn(
        `No matching agent files for filter: ${agentFilter.join(', ')}. ` +
          `Detected: ${detected.map((d) => d.agentType).join(', ')}`,
      )
      return EMPTY_RESULT
    }
  } else {
    const selected = await promptAgentSelection(detected)
    toInstall = detected.filter((d) => selected.includes(d.agentType))
  }

  if (toInstall.length === 0) {
    logger.warn('Nothing selected to install')
    return EMPTY_RESULT
  }

  const filesToInstall = toInstall.flatMap((d) => d.files)

  // Security scan
  if (scan) {
    const scanSpinner = makeSpinner('Scanning for security issues')
    scanSpinner.start()
    let findings
    try {
      findings = await scanPath(extractDir)
    } finally {
      scanSpinner.stop()
    }
    const critical = findings.filter((f) => f.severity === 'critical')
    const warnings = findings.filter((f) => f.severity === 'warning')

    if (critical.length > 0) {
      for (const f of critical) {
        logger.error(`[CRITICAL] ${f.ruleId}: ${f.message} (${f.file}:${f.line})`)
      }
      await appendAuditEntry({
        operation: auditOp,
        name,
        source: repo.canonicalUrl,
        result: 'blocked',
        details: `${critical.length} critical security findings`,
      })
      throw new SecurityError(
        `Installation blocked: ${critical.length} critical security issue(s) found.`,
      )
    }

    for (const f of warnings) {
      logger.warn(`[WARNING] ${f.ruleId}: ${f.message} (${f.file}:${f.line})`)
    }
  } else {
    logger.dim('Skipping security scan (use --scan to enable)')
  }

  // Build install plan + detect conflicts
  const installSpinner = makeSpinner('Checking for conflicts')
  installSpinner.start()
  const conflicts = new Set<string>()
  const installPlan: PlanItem[] = []

  try {
    for (const sourcePath of filesToInstall) {
      const handler = handlerFor(sourcePath, toInstall)
      const relPath = handler?.getTargetPath(sourcePath) ?? sourcePath
      // Validate that the handler-provided target stays inside the project.
      if (relPath.startsWith('/') || relPath.split(/[/\\]/).some((p) => p === '..')) {
        throw new SecurityError(`Unsafe target path from agent handler: ${relPath}`)
      }
      const dest = join(projectDir, relPath)
      installPlan.push({ src: join(extractDir, sourcePath), dest, relPath, sourcePath })
      if (await fileExists(dest)) conflicts.add(relPath)
    }
  } finally {
    installSpinner.stop()
  }

  // Classify each conflict against the *full* manifest so we can warn the
  // user about hand-written files (not tracked by agentpull) and cross-entry
  // collisions. This is the safety net that prevents silently clobbering
  // files the user authored themselves.
  const projectManifest = await readManifest(projectDir)
  const classified = await classifyConflicts({
    projectDir,
    manifest: projectManifest,
    currentEntryName: name,
    conflicts: [...conflicts],
  })

  // Build the set of files that should be SKIPPED based on the user's
  // resolution preferences and the classification. Tracked-clean files are
  // always overwritten silently — they're agentpull content moving forward.
  const skipSet = new Set<string>()

  if (force) {
    // `--force`: pre-confirmed by the user. Overwrite everything including
    // hand-written / locally-modified files. No prompt.
  } else if (resolution === 'skip') {
    // Legacy "skip all conflicts" mode: skip every conflicting file.
    for (const f of conflicts) skipSet.add(f)
  } else if (hasWarnings(classified)) {
    // Default path for both `prompt` and `overwrite`: any time there are
    // warned files (hand-written, tracked-other, locally-modified), show
    // the classified prompt and let the user decide. The default is
    // `skip-warned` so non-agentpull content is never silently destroyed.
    const choice = await promptClassifiedConflicts(name, classified)
    if (choice === 'abort') {
      logger.warn('Installation aborted')
      return EMPTY_RESULT
    }
    if (choice === 'skip-warned') {
      for (const f of classified.handWritten) skipSet.add(f.relPath)
      for (const f of classified.trackedOther) skipSet.add(f.relPath)
      for (const f of classified.trackedModified) skipSet.add(f.relPath)
    }
    // 'overwrite-all' → no skips
  }
  // No warnings → silently overwrite tracked-clean conflicts.

  // Copy files + compute hashes. On any error mid-loop, roll back the files
  // we've already written so the project isn't left in a half-installed state
  // with no manifest entry to describe what's there.
  const copySpinner = makeSpinner('Installing files')
  copySpinner.start()
  const installedFiles: InstalledFile[] = []
  try {
    for (const item of installPlan) {
      if (skipSet.has(item.relPath)) continue
      await mkdir(dirname(item.dest), { recursive: true })
      await copyFile(item.src, item.dest)
      const sha256 = await hashFile(item.dest)
      installedFiles.push({ path: item.relPath, sha256, sourcePath: item.sourcePath })
    }
  } catch (err) {
    copySpinner.fail('Install failed — rolling back')
    for (const f of installedFiles) {
      await rm(join(projectDir, f.path), { force: true }).catch(() => undefined)
      await removeEmptyDirs(dirname(join(projectDir, f.path)), projectDir)
    }
    throw err
  } finally {
    copySpinner.stop()
  }

  // Update manifest (addEntry upserts by name)
  const agentTypes = toInstall.map((d) => d.agentType)
  const now = new Date().toISOString()
  await addEntry(projectDir, {
    name,
    source: repo.canonicalUrl,
    ref: repo.ref,
    commitSha,
    agentTypes,
    files: installedFiles,
    installedAt: now,
    updatedAt: now,
  })

  await appendAuditEntry({
    operation: auditOp,
    name,
    source: repo.canonicalUrl,
    files: installedFiles.map((f) => f.path),
    result: 'success',
  })

  logger.success(`Installed ${installedFiles.length} file(s) for: ${agentTypes.join(', ')}`)

  return {
    installed: installedFiles.length > 0,
    fileCount: installedFiles.length,
    agentTypes,
  }
}

export async function install(opts: InstallOptions): Promise<InstallResult> {
  const config = await readConfig()
  const resolution = opts.conflictResolution ?? config.defaults.conflictResolution
  const shouldScan = opts.scan ?? config.defaults.autoScan

  const spinner = makeSpinner(`Resolving ${opts.name}`)
  spinner.start()
  let extractDir: string | undefined

  try {
    const repo = await resolveRepo(opts.name)
    if (opts.ref) repo.ref = opts.ref

    const credential = await loadCredential(repo.provider, repo.host)
    spinner.text = `Downloading ${repo.canonicalUrl}`
    const download = await downloadRepo(repo, credential ?? undefined)
    extractDir = download.extractDir
    spinner.stop()

    return await performInstall({
      name: opts.name,
      projectDir: opts.projectDir,
      repo,
      extractDir,
      commitSha: download.commitSha,
      files: download.files,
      agentFilter: opts.agentFilter,
      scan: shouldScan,
      resolution,
      auditOp: 'add',
    })
  } catch (err) {
    spinner.stop()
    if (!(err instanceof AgentpullError)) {
      await appendAuditEntry({
        operation: 'add',
        name: opts.name,
        result: 'failure',
        details: (err as Error).message,
      })
    }
    throw err
  } finally {
    if (extractDir) await rm(extractDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export interface UpdateOptions {
  name?: string
  projectDir: string
  scan?: boolean
  /**
   * When true: bypass the "already up to date" SHA short-circuit, evict the
   * cached tarball, and overwrite *every* conflicting file (including
   * hand-written and locally-modified ones) without prompting. The escape
   * hatch for "the update isn't pulling my changes" scenarios.
   */
  force?: boolean
}

export interface UpdateSummary {
  updatedCount: number
  upToDateCount: number
  skippedCount: number
}

export async function updateInstalled(opts: UpdateOptions): Promise<UpdateSummary> {
  const manifest = await readManifest(opts.projectDir)
  const config = await readConfig()
  const shouldScan = opts.scan ?? config.defaults.autoScan

  const entries = opts.name
    ? manifest.installed.filter((e) => e.name === opts.name)
    : manifest.installed

  if (entries.length === 0) {
    logger.warn(opts.name ? `"${opts.name}" is not installed` : 'Nothing installed to update')
    return { updatedCount: 0, upToDateCount: 0, skippedCount: 0 }
  }

  let updatedCount = 0
  let upToDateCount = 0
  let skippedCount = 0

  // Per-entry error handling: when updating multiple entries, a failure in
  // one shouldn't abort the rest. Collect failures and surface them in a
  // summary at the end.
  const failures: Array<{ name: string; error: Error }> = []

  for (const entry of entries) {
    const spinner = makeSpinner(`Updating ${entry.name}`)
    spinner.start()
    let extractDir: string | undefined
    try {
      const repo = await resolveRepo(entry.source)
      repo.ref = entry.ref
      const credential = await loadCredential(repo.provider, repo.host)

      // `--force` evicts the cached tarball and re-downloads, defeating any
      // poisoned cache entries from previous bugged builds. The fix in
      // downloader.ts (download by SHA, not by ref) prevents future poisoning,
      // but existing caches may already be wrong.
      const download = await downloadRepo(repo, credential ?? undefined, {
        forceRefresh: opts.force,
      })
      extractDir = download.extractDir

      if (download.commitSha === entry.commitSha && !opts.force) {
        spinner.succeed(`${entry.name} is already up to date (${entry.commitSha.slice(0, 7)})`)
        upToDateCount++
        continue
      }

      spinner.stop()
      // Show the SHA transition so the user can see what's actually moving.
      // Helps debug "didn't update" reports — if both SHAs are equal under
      // --force, it really is the same content.
      logger.info(
        `Updating ${entry.name}: ${entry.commitSha.slice(0, 7)} → ${download.commitSha.slice(0, 7)}`,
      )

      const result = await performInstall({
        name: entry.name,
        projectDir: opts.projectDir,
        repo,
        extractDir,
        commitSha: download.commitSha,
        files: download.files,
        agentFilter: entry.agentTypes,
        scan: shouldScan,
        // Default `prompt` lets the classified-conflict prompt handle warned
        // files (hand-written, locally-modified, tracked-other). `--force`
        // pre-confirms and overwrites everything.
        resolution: 'prompt',
        force: opts.force,
        auditOp: 'update',
      })
      if (result.installed) updatedCount++
      else skippedCount++
    } catch (err) {
      spinner.stop()
      const error = err as Error
      logger.error(`Failed to update "${entry.name}": ${error.message}`)
      if (!(err instanceof AgentpullError)) {
        await appendAuditEntry({
          operation: 'update',
          name: entry.name,
          result: 'failure',
          details: error.message,
        })
      }
      failures.push({ name: entry.name, error })
    } finally {
      if (extractDir) await rm(extractDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  if (failures.length > 0) {
    const names = failures.map((f) => f.name).join(', ')
    throw new AgentpullError(
      `Update failed for ${failures.length}/${entries.length} entries: ${names}`,
      'UPDATE_PARTIAL_FAILURE',
    )
  }

  return { updatedCount, upToDateCount, skippedCount }
}

export interface UninstallOptions {
  name: string
  projectDir: string
  force?: boolean
}

export async function uninstall(opts: UninstallOptions): Promise<void> {
  const entry = await findEntry(opts.projectDir, opts.name)
  if (!entry) {
    logger.warn(`"${opts.name}" is not installed`)
    return
  }

  for (const f of entry.files) {
    const fullPath = join(opts.projectDir, f.path)
    await rm(fullPath, { force: true }).catch(() => undefined)
    await removeEmptyDirs(dirname(fullPath), opts.projectDir)
  }

  await removeEntry(opts.projectDir, opts.name)
  await appendAuditEntry({ operation: 'remove', name: opts.name, files: entry.files.map((f) => f.path), result: 'success' })
}

export { verifyFiles as verifyIntegrity }
