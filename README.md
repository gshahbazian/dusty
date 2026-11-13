# Dusty

A personal, single-user RSS reader on Cloudflare. See
[`docs/001_project_spec.md`](docs/001_project_spec.md) for what it does and why.

## Quick start (local, no Cloudflare account)

```sh
.agents/skills/local-dev/scripts/setup.sh
pnpm dev            # http://localhost:5173
```

## Deploy

See [`.agents/skills/deploy/SKILL.md`](.agents/skills/deploy/SKILL.md).

## Checks

```sh
pnpm check          # format, lint, typecheck, unit tests
pnpm test:e2e       # browser tests against `pnpm dev`
```
