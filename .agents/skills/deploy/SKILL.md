---
name: deploy
description: Deploy Dusty to Cloudflare with Alchemy, including first-time account setup (Cloudflare profile with Zero Trust scopes, Access team, .env) and how to check a deploy worked. Use when asked to deploy, ship, or set up a fresh Cloudflare account.
---

# Deploy

Everything is in `alchemy.run.ts`. A deploy needs a Cloudflare profile and
a filled-in `.env`; nothing is set up by hand in the dashboard except
turning on Zero Trust once.

Deploys are outward-facing. Confirm with the user before running
`alchemy deploy` or `alchemy destroy`.

## One-time setup

1. **Workers Paid plan** on the account (200 feeds need more outgoing
   requests and CPU per run than the free plan allows).
2. **Zero Trust** turned on once in the dashboard (free for one user).
   Note the team domain, e.g. `https://your-team.cloudflareaccess.com`.
3. **Alchemy profile with Cloudflare**, including the Zero Trust / Access
   scopes (Alchemy creates the Access application):
   ```sh
   pnpm exec alchemy profile edit --add Cloudflare
   ```
   The user must run this in their own terminal: OAuth is interactive
   only, and it fails with "failed to configure credentials" without a
   TTY (agents' shells and Claude Code's `!` prefix have none). Choose
   OAuth, then "Custom Scopes": keep the preselected ones and also tick
   the "Cloudflare One / Zero Trust" group. The "Basic Scopes" preset
   has no Access scopes, so the Access application step would fail.
   Check it with `pnpm exec alchemy profile show`.
4. **`.env`**: copy `.env.example` and set `OWNER_EMAIL` and
   `ACCESS_TEAM_DOMAIN`.

## Deploy

```sh
pnpm exec alchemy deploy --stage prod
```

It creates or updates the D1 database (applying migrations), the sync
Worker (cron, no public URL), the web Worker on its `workers.dev` URL,
and the Access application allowing only `OWNER_EMAIL`. The stack output
`url` is the app. The Worker names carry a random suffix, so a stage that
is destroyed and deployed again gets a new URL.

To tear a stage down: `pnpm exec alchemy destroy --stage prod`. The
`alchemy-state-store` Worker (deploy state, shared by all stages) stays.

## Gotchas

- Workers with static assets get no `ctx.access` from Cloudflare ("the
  router does not pass `ctx.access` to the user Worker"). So the Access
  application is its own `Cloudflare.Access.Application` resource, and its
  `aud` reaches the Worker as `ACCESS_AUD`. Don't switch back to reading
  `ctx.access`.
- Swapping a Worker between a dedicated and a shared Access application
  fails with `AccessDestinationConflict`, because the new app is enrolled
  before the old one is deleted. Destroy and redeploy the stage instead.
- A 403 from the Worker (not a redirect to the Access login) means Access
  let the request in but the Worker's own check refused it. Its logs say
  why: look for `auth denied` and its `reason`.

## Check it worked

- Open `url` in a private window: you should get the Access login, and
  only the owner's email gets through.
- `curl -i <url>` without a login returns a redirect to Access, never the
  app.
- Workers Observability in the dashboard: a page load produces one trace
  that runs from the web Worker into the sync Worker (`sync.run` span).
- `pnpm exec alchemy logs --stage prod --tail` streams both Workers' logs.
