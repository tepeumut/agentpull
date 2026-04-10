import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  // Mirror tsup's define so __AGENTPULL_VERSION__ is resolvable under vitest too.
  define: {
    __AGENTPULL_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
