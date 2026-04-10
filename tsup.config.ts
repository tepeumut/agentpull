import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  entry: { 'bin/agentpull': 'bin/agentpull.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Inlined at build time so the bundle does not need package.json at runtime.
  define: {
    __AGENTPULL_VERSION__: JSON.stringify(pkg.version),
  },
})
