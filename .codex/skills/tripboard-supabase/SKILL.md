---
name: tripboard-supabase
description: Use for Supabase migrations, schema refreshes, migration history repair, and remote database sync in TripBoard. Covers db push/dump/list, keeping supabase/schema.sql current, and repo hygiene around manual SQL changes.
---

# TripBoard Supabase

- Prefer tracked files in `supabase/migrations/` over pasting SQL directly into the Supabase SQL editor.
- If SQL is applied manually, add the equivalent migration file in git and refresh `supabase/schema.sql` from the live database.
- After adding or applying migrations, keep `README.md` aligned with any new setup or operational dependency.
- Do not commit `supabase/.temp/`.

## Core Commands

```bash
supabase migration list --db-url '<remote-postgres-url>'
supabase db push --db-url '<remote-postgres-url>' --include-all --yes
supabase db dump --db-url '<remote-postgres-url>' --schema public --file supabase/schema.sql
```

## Repo-Specific Notes

- `supabase/schema.sql` is the checked-in public-schema snapshot for fresh projects.
- If migration history drifts from the remote schema, verify `supabase migration list` before using `db push`; do not assume replaying old migrations is safe.
- Recent SQL performance helpers used by the app include:
  - `get_maintenance_summary()`
  - `get_charging_analytics_summary()`
  - `get_charging_analytics_daily()`
  - `get_trip_list_summary()`
  - `get_charging_list_summary()`
