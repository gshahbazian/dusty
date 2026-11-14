import { defineProject } from 'vitest/config'

export default defineProject({
  // `~/…` (the repo root) resolves through tsconfig `paths`.
  resolve: { tsconfigPaths: true },
  test: { name: 'db', include: ['test/**/*.test.ts'] },
})
