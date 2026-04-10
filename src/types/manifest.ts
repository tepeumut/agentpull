import { z } from 'zod'
import type { InstalledEntry } from './common.js'
import { AGENT_TYPES } from './common.js'

const safeRelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.startsWith('\\'), 'Must be a relative path')
  .refine((p) => !p.split(/[/\\]/).some((part) => part === '..'), 'Must not contain ".." segments')

const InstalledFileSchema = z.object({
  path: safeRelativePath,
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a valid SHA-256 hex string'),
  sourcePath: safeRelativePath,
})

const InstalledEntrySchema = z.object({
  name: z.string().min(1),
  source: z.string().url(),
  ref: z.string().min(1),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/, 'Must be a valid git SHA'),
  agentTypes: z.array(z.enum(AGENT_TYPES)).min(1),
  files: z.array(InstalledFileSchema),
  installedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const ManifestSchema = z.object({
  version: z.literal(1),
  installed: z.array(InstalledEntrySchema),
})

export type Manifest = z.infer<typeof ManifestSchema>

export const EMPTY_MANIFEST: Manifest = {
  version: 1,
  installed: [],
}

export type { InstalledEntry }
