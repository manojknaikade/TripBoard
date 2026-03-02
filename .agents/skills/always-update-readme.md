---
name: Always Update README
description: Instructions to ensure the project documentation stays synchronized with architectural and feature changes.
---

# Always Update README

🚨 **CRITICAL RULE**: The project's `README.md` is the primary source of truth for the application's capabilities, architecture, and setup instructions. It must be kept strictly up to date.

## When to Update the README

You MUST update the `README.md` file whenever you make changes that affect any of the following:

1. **Features**: Adding a new feature, removing an old one, or making a significant change to an existing feature (e.g., adding export capabilities, changing chart types, adding new analytics metrics).
2. **Architecture**: Changing how the application works fundamentally (e.g., changing auth from Supabase to Tesla OAuth, changing state management, altering the database schema).
3. **Environment Setup**: Adding, modifying, or removing required environment variables in `.env.local` / `.env.example`.
4. **Database Setup**: Adding new tables (like `app_settings`), altering existing core tables, or creating new SQL migration scripts that a developer needs to run.
5. **Project Structure**: Adding new significant directories or files that define the project's layout (e.g., new API route structures, new top-level component folders).
6. **Tech Stack**: Adding a major new dependency or removing one (e.g., switching charting libraries).

## How to Update

When the criteria above are met, before concluding your session or task:

1. Review the `README.md`.
2. Determine which sections (Features, Tech Stack, Getting Started/Environment, Project Structure) are impacted by your recent code changes.
3. Update the text to accurately reflect the current, working state of the application.
4. Commit the `README.md` changes alongside your code changes.
