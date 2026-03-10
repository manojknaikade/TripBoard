---
description: checklist to run before committing major changes
---

# Pre-Commit Checklist

Before committing major changes (new features, schema changes, trigger modifications), run through this checklist:

## 1. Update Documentation

// turbo

- [ ] Update `README.md` — Features, Tech Stack, Project Structure, Database Setup sections
- [ ] Update `database_schema.sql` if any columns or tables were added/modified
- [ ] Add or update any relevant `.agents/skills/*.md` knowledge docs

## 2. Verify Build

// turbo

- Run `npm run build` to ensure no TypeScript compilation errors

## 3. Check for Lint Errors

- Review any lint/type errors in modified files
- Fix `costByType`-style "used before declaration" issues by checking variable scoping

## 4. Database Migrations

- Ensure any new SQL migrations are saved in `supabase/migrations/`
- Add a comment in the README's "Database Setup" section if the user needs to run them manually

## 5. Test Locally

// turbo

- Run `npm run dev` and verify the changed pages work
- Check the terminal for any API errors (500s, crashes)

## 6. Git Status

// turbo

- Run `git diff --stat` to review all changed files
- Ensure no temporary/debug files are included (e.g., `/tmp/*.js`, `investigate-*.js`)
