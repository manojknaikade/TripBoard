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

# Local Skills

- `tripboard-supabase`: [/.codex/skills/tripboard-supabase/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-supabase/SKILL.md)
  - Use for Supabase migrations, schema refreshes, migration-history drift, and DB workflow updates.
- `tripboard-performance`: [/.codex/skills/tripboard-performance/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-performance/SKILL.md)
  - Use for perceived-performance work across dashboard, trips, charging, maintenance, and analytics.
- `tripboard-telemetry`: [/.codex/skills/tripboard-telemetry/SKILL.md](/Users/manojnaikade/Documents/TripBoard/.codex/skills/tripboard-telemetry/SKILL.md)
  - Use for telemetry ingestion, VPS/systemd workflows, and Tesla charging-sync worker tasks.
