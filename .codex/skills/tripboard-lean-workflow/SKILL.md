---
name: tripboard-lean-workflow
description: Use for follow-up TripBoard tasks when the current branch already contains relevant context and the goal is to minimize token usage, repeated repo scans, and redundant explanation.
---

# TripBoard Lean Workflow

Use this skill when the user is extending recent TripBoard work rather than starting a new subsystem.

## Start Small

- First read only:
  - `git status --short`
  - `git diff --stat`
  - targeted `rg`/`sed` on files already mentioned in the thread or current diff
- Do not re-open large files or re-scan the repo unless the task clearly expands scope.

## Continuation Defaults

- Treat `go ahead`, `continue`, and short follow-ups as continuation of the current branch and prior conclusions.
- Reuse earlier verification unless the changed files affect it.
- Prefer extending existing helpers/components/routes over introducing parallel abstractions.

## Stable Repo Truths

- Perceived slowness must be compared across `next dev`, `next start`, and deployed Vercel before assuming production regressions.
- Notification slowness often comes from polling overlap or remount churn before it comes from raw DB latency.
- After adding a Supabase migration:
  - apply it with the CLI against the linked project
  - dump the live public schema back into `supabase/schema.sql`
- Charging telemetry semantics:
  - `energy_added_kwh` should prefer `DCChargingEnergyIn`
  - fall back to `ACChargingEnergyIn`
  - never sum both
- Charger-type differentiation is independent of the energy-added field.
- Analytics bucketing should keep daily bars through `3months`; only longer ranges should aggregate.

## Communication

- Commentary updates: 1 to 2 short sentences, only for current action or new findings.
- Final responses: outcome, verification, and any remaining risk. Keep file-by-file detail out unless it helps the answer.
