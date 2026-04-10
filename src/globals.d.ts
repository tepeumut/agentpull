/**
 * Build-time constants injected by tsup / vitest via their `define` option.
 * These are replaced in the source by esbuild before it sees them, so they
 * behave like inlined string literals rather than runtime globals.
 */
declare const __AGENTPULL_VERSION__: string
