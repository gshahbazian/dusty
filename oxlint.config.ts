import { defineConfig } from 'oxlint'

/**
 * How imports are written: `#/…` within a package (its package.json
 * `imports`), another package by its name (`@dusty/db`), `~/…` from the
 * repo root only for what isn't a package (`~/infra/dev`). Never relative,
 * never with a `.ts` / `.tsx` extension (every tool resolves without one).
 */
const IMPORT_PATTERNS = [
  {
    regex: '^\\.{1,2}/',
    message:
      'Use `#/…` (this package), a package name (`@dusty/db`), or `~/…` (repo root), not a relative path.',
  },
  {
    regex: '\\.tsx?$',
    message: 'Leave off the .ts / .tsx extension.',
  },
]

/** Inside a package, another package is imported by name, not by path. */
const PACKAGE_PATTERNS = [
  ...IMPORT_PATTERNS,
  {
    regex: '^~/(apps|packages)/',
    message:
      'Import another package by its name (`@dusty/db`, `@dusty/sync/contract`), not its files.',
  },
]

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'import'],
  jsPlugins: [
    '@tanstack/eslint-plugin-router',
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
    {
      name: 'anti-slop-effect',
      specifier: './tools/oxlint/anti-slop/effect/index.ts',
    },
  ],
  categories: {
    correctness: 'error',
  },
  options: {
    typeAware: true,
  },
  env: {
    builtin: true,
  },
  ignorePatterns: [
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.agents/skills/**',
    '.alchemy/**',
    'tools/oxlint/anti-slop/**',
    '**/routeTree.gen.ts',
    '**/dist/**',
    'packages/db/migrations/**',
  ],
  rules: {
    // Gabe style: braces on any `if` that spans lines, return early instead
    // of `else`, and no nested ternaries.
    'eslint/curly': ['error', 'multi-line'],
    'eslint/no-else-return': ['error', { allowElseIf: false }],
    'eslint/no-nested-ternary': 'error',

    'eslint/no-restricted-imports': ['error', { patterns: IMPORT_PATTERNS }],

    // Every file name is kebab-case (`article-list-item.tsx`).
    'unicorn/filename-case': ['error', { case: 'kebabCase' }],

    '@tanstack/router/create-route-property-order': 'error',
    '@tanstack/router/route-param-names': 'error',

    'oxc/no-accumulating-spread': 'error',
    'anti-slop/no-array-filter-map': 'error',
    'anti-slop/no-reduce-accumulator-copy': 'error',
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',

    'anti-slop-effect/no-manual-effect-error-tag': 'error',
    'anti-slop-effect/no-manual-tag-comparison': 'error',
    'anti-slop-effect/no-manual-tagged-construction': 'error',
    'anti-slop-effect/no-service-constructor-imports': 'error',
    'anti-slop-effect/prefer-effect-match': 'error',
  },
  overrides: [
    {
      files: ['apps/**', 'packages/**'],
      rules: {
        'eslint/no-restricted-imports': [
          'error',
          { patterns: PACKAGE_PATTERNS },
        ],
      },
    },
    {
      // shadcn's generated components (added with `shadcn add`), kept as
      // shadcn writes them: a generic <Label> is tied to its control where
      // it is used, and their style casts carry no SAFETY comments.
      files: ['apps/web/src/components/ui/**'],
      rules: {
        'jsx-a11y/label-has-associated-control': 'off',
        'anti-slop/require-safety-comment-for-type-assertion': 'off',
      },
    },
  ],
})
