# Dusty: notes for agents

Dusty is a single-user RSS reader on Cloudflare. **Read
`docs/001-project-spec.md` first**; it says what to build and why. Decisions
made after the spec are recorded below and in `docs/`.

## Layout

| Path                        | What                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy.run.ts`            | The whole deployment: D1, both Workers, Access, cron.                                                                                   |
| `infra/`                    | Shared infra declarations (the D1 database, dev ports).                                                                                 |
| `apps/web`                  | TanStack Start, SPA mode (no SSR) plus server functions. `src/worker.ts` is the Worker entry: auth runs first on every request.         |
| `apps/web/src/components/`  | React components; plain helpers (sorting, wording) sit next to them and are unit tested in `apps/web/test/`.                            |
| `apps/web/src/server/auth/` | The only place that knows how login works. Everything else asks it "owner or nobody?".                                                  |
| `apps/sync`                 | Sync service: an Effect-native Worker. Cron trigger plus a typed RPC method (`syncNow`) reached only via the web app's service binding. |
| `packages/db`               | Drizzle schema, migrations and the SQL both apps share. Plain async functions over D1.                                                  |
| `tools/oxlint/anti-slop`    | Vendored lint rules (ours to edit; see `PROVENANCE.md`).                                                                                |
| `.agents/skills/`           | Agent skills (also visible as `.claude/skills`).                                                                                        |

## Skills

Read the matching `SKILL.md` before doing these:

- `.agents/skills/local-dev/SKILL.md`: run the stack locally, query the local DB,
  fire the cron, run browser tests.
- `.agents/skills/checks/SKILL.md`: what must pass before a change is done.
- `.agents/skills/deploy/SKILL.md`: deploying and first-time Cloudflare setup.

## Rules of the road

- Effect is for the sync service. The web app is plain TypeScript and
  React; it calls the sync service through `toRpcAsync`.
- All shared SQL lives in `packages/db`, tested against a real local D1
  (`createTestD1`), never mocks. Module mocking is banned by lint.
- Every server function uses the `ownerOnly` middleware.
- Article HTML is untrusted. It is cleaned with a strict allowlist when
  stored and shown under a strict Content Security Policy.
- "Mark all above as read" acts on exactly the article IDs the client had
  on screen, in one atomic write, and undo matches on `read_action_id`.
- Times are integer epoch milliseconds in the database.
- Sync work must be traced: wrap units of work in `Effect.fn` /
  `Effect.withSpan` and annotate spans with the same details as logs.
- The sync engine's design (schema, run budget, pruning, health, metrics)
  is in `docs/002-m1-sync-design.md`. Every sync setting is an env var
  listed in `SETTING_DEFAULTS` (`apps/sync/src/config.ts`) and
  `.env.example`; add new ones there so they reach the deployed Worker.
- Sync talks to the web only through the `HttpFetch` service. Tests serve
  fixture feeds through it; don't call `fetch` directly.
- Code style: return early instead of `if`/`else` chains; braces on any
  `if` whose body is on its own line (one-line `if (x) return y` is fine);
  ternaries only when both branches are short and obvious; React props typed
  inline at the component; Tailwind classes written inline on the JSX
  element, never kept in variables, constants or maps, and conditional
  classes joined with `cn` (`import { cn } from 'cn'`), never template
  strings or ternaries. Lint enforces the first two.
- UI controls are shadcn components on Base UI (`components.json`, style
  `base-lyra`), in `apps/web/src/components/ui/`; add more with
  `pnpm dlx shadcn@latest add <name>` from `apps/web`, and import them as
  `#/components/ui/<name>`. Those files are shadcn's generated code,
  so their `cva` class maps are fine (the inline-classes rule is for our
  own components). A link styled as a button stays a link: use
  `buttonVariants` on `<Link>` / `<a>`, not `<Button render>`, which
  would give it `role="button"`. Dropdowns are `NativeSelect` (a real
  `<select>`, so phones get their own picker). Colours come from the
  theme in `styles.css` (`text-muted-foreground`, `bg-primary`…), and dark
  mode follows the system setting through `prefers-color-scheme`.
- Imports are never relative and never end in `.ts` / `.tsx`; lint
  enforces both. Within a package, `#/…` (its `src/`, from the package's
  `package.json` `imports`; the sync tests also have `#test/…`). Another
  package by its name: `@dusty/db`, `@dusty/sync/contract`,
  `@dusty/sync/urls` (its `exports`), never `~/packages/…` / `~/apps/…`.
  `~/…` (the repo root, tsconfig `paths`) only for what isn't a package:
  `~/infra/dev`, `~/alchemy.run`, `~/e2e/helpers`; `alchemy.run.ts` also
  reaches the sync Worker's source with it.
- File names are kebab-case: `article-list-item.tsx`, `use-unread-list.ts`,
  `001-project-spec.md`. Lint enforces it for code (`unicorn/filename-case`).
  The exceptions are names that tools look for (`README.md`, `AGENTS.md`,
  `CLAUDE.md`, `SKILL.md`, `LICENSE`) and TanStack Router's route files
  (`__root.tsx`, `feeds.$feedId.tsx`, the generated `routeTree.gen.ts`).
- Commit titles are all lowercase; bodies use normal punctuation.
