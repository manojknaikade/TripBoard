# Repository Rules

- Keep `README.md` up to date whenever app behavior, setup steps, performance characteristics, or operational workflows change.
- Keep `supabase/schema.sql` in sync with the live remote public schema whenever database migrations are added or applied.
- Do not commit `supabase/.temp/` or other Supabase CLI working-state files.
- Prefer tracked Supabase migrations over pasting SQL directly into the Supabase SQL editor. If SQL is applied manually, add the equivalent migration file in git and refresh `supabase/schema.sql`.
- Useful Supabase commands for this repo:
  - `supabase db push --db-url '<remote-postgres-url>' --include-all --yes`
  - `supabase db dump --db-url '<remote-postgres-url>' --schema public --file supabase/schema.sql`
  - `supabase migration list --db-url '<remote-postgres-url>'`
- Default verification for app changes is:
  - `npm run lint`
  - `npm run build`

# Maintainer PR Workflow

- Admin PR flow:
  - Read the PR summary and confirm it targets `master`.
  - Check CI before reviewing deeply.
  - Pull the branch locally for user-facing, telemetry, auth, settings, or schema-sensitive changes.
  - Run the default verification commands:
    - `npm run lint`
    - `npm run build`
  - Manually test the affected flow.
  - Review for regressions, stale-state issues, wrong data-source usage, and incomplete migration/doc follow-through.
  - Approve or request changes on GitHub.
  - Prefer `Squash and merge` unless preserving commit structure matters.
  - Delete the branch after merge and sync local `master`.
- Review checklist:
  - Scope is focused and does not mix unrelated refactors.
  - Behavior matches the bug report or feature request.
  - Nearby flows are not obviously regressed.
  - API writes hit the correct source of truth.
  - Telemetry, region, and settings changes use the intended inputs.
  - `README.md` is updated if setup, behavior, or operations changed.
  - `supabase/schema.sql` is refreshed if migrations changed.
  - No secrets, temp files, or generated junk are committed.

# Token-Saving Rules

- Prefer incremental follow-ups over fresh audits. If the user says `go ahead`, `continue`, or asks for a small extension, continue from the current branch/diff/context unless new evidence says the prior understanding is wrong.
- Start with the smallest useful context pull: `git status --short`, `git diff --stat`, and targeted `rg`/`sed` on the files already in play. Avoid broad repo scans unless the task truly changes scope.
- Reuse established repo truths instead of re-deriving them:
  - Local `next dev` can be much slower than `next start` or Vercel under route churn.
  - After any Supabase migration, use the CLI path and re-dump `supabase/schema.sql` from the live project.
  - Charging `energy_added_kwh` should prefer telemetry `DCChargingEnergyIn` and only fall back to `ACChargingEnergyIn`; do not sum both.
  - Charging-session type classification is separate from energy-added math and still depends on charger metadata, power, and home-location checks.
  - Analytics should preserve daily bars through the `3months` range; only longer ranges should aggregate.
- Keep progress updates short and skip restating prior findings unless they materially changed.
- In final responses, summarize outcome, verification, and any remaining risk. Do not repeat file inventories unless the user asked for them.

# Local Skills

- `tripboard-supabase`: [/.codex/skills/tripboard-supabase/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-supabase/SKILL.md)
  - Use for Supabase migrations, schema refreshes, migration-history drift, and DB workflow updates.
- `tripboard-performance`: [/.codex/skills/tripboard-performance/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-performance/SKILL.md)
  - Use for perceived-performance work across dashboard, trips, charging, maintenance, and analytics.
- `tripboard-telemetry`: [/.codex/skills/tripboard-telemetry/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-telemetry/SKILL.md)
  - Use for telemetry ingestion, VPS/systemd workflows, and Tesla charging-sync worker tasks.
- `tripboard-dashboard-ui`: [/.codex/skills/tripboard-dashboard-ui/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-dashboard-ui/SKILL.md)
  - Use for dashboard UI audits, screenshot-driven spacing fixes, card hierarchy work, and preserving the established TripBoard dashboard visual system.
- `tripboard-lean-workflow`: [/.codex/skills/tripboard-lean-workflow/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-lean-workflow/SKILL.md)
  - Use for follow-up TripBoard work when prior branch context already exists and the goal is to minimize token usage, repeated audits, and redundant explanation.
