# Dusty: notes for agents

Dusty is a single-user RSS reader on Cloudflare. **Read
`docs/001_project_spec.md` first**; it says what to build and why. Decisions
made after the spec are recorded below and in `docs/`.

## Layout

| Path                        | What                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy.run.ts`            | The whole deployment: D1, both Workers, Access, cron.                                                                                   |
| `infra/`                    | Shared infra declarations (the D1 database, dev ports).                                                                                 |
| `apps/web`                  | TanStack Start, SPA mode (no SSR) plus server functions. `src/worker.ts` is the Worker entry: auth runs first on every request.         |
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
- Code style: return early instead of `if`/`else` chains; braces on any
  `if` whose body is on its own line (one-line `if (x) return y` is fine);
  ternaries only when both branches are short and obvious; React props typed
  inline at the component. Lint enforces the first two.
- Commit titles are all lowercase; bodies use normal punctuation.
