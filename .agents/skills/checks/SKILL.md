---
name: checks
description: The checks every change to Dusty must pass before it is done or committed (format, lint with anti-slop rules, typecheck, tests). Use before finishing any code change.
---

# Checks before you finish

Run all of them; a change is not done until they pass.

```sh
pnpm format:write   # oxfmt (fix formatting)
pnpm lint:fix       # oxlint, including the vendored anti-slop rules
pnpm check          # format:check + lint + typecheck + unit tests
```

If you changed anything the browser touches, also run the end-to-end
tests against a running stack (see the `local-dev` skill):

```sh
pnpm test:e2e
```

## Notes

- Lint rules live in `oxlint.config.ts`. The anti-slop rules are vendored
  in `tools/oxlint/anti-slop/` (see its `PROVENANCE.md`). Fix the code
  rather than disabling a rule; if a rule is wrong for this repo, change
  the config and say why in the commit.
- `oxlint --fix` and `oxfmt` can disagree on blank lines. Run
  `lint:fix` after `format:write`, then `pnpm check`.
- Commit titles are all lowercase.
