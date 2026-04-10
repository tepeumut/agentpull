import { z } from 'zod'

export const ProviderIdSchema = z.enum([
  'github',
  'gitlab',
  'bitbucket',
  'azure',
  'git',
])

const RegistryEntrySchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  /**
   * Optional provider hint. When absent, `resolveRepo` infers it from the URL
   * via `detectProvider`. Set this for self-hosted instances or when the URL
   * is ambiguous (e.g. forcing the generic `git` provider).
   */
  provider: ProviderIdSchema.optional(),
  /** Optional host override for self-hosted instances (gitlab.example.com). */
  host: z.string().optional(),
  subdir: z.string().optional(),
  defaultRef: z.string().optional(),
})

const DefaultsSchema = z.object({
  conflictResolution: z.enum(['prompt', 'skip', 'overwrite']).default('prompt'),
  autoScan: z.boolean().default(false),
})

export const ConfigSchema = z.object({
  version: z.literal(1),
  registries: z.array(RegistryEntrySchema).default([]),
  defaults: DefaultsSchema.default({}),
})

export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  version: 1,
  registries: [],
  defaults: {
    conflictResolution: 'prompt',
    autoScan: false,
  },
}
