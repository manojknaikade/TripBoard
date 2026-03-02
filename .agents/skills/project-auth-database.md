---
name: TripBoard Auth and Database Security Model
description: Crucial instructions for handling authentication and Supabase database interactions in the TripBoard project.
---

# TripBoard Auth and Database Security Model

🚨 **CRITICAL CONTEXT**: This project does **NOT** use standard Supabase Authentication for user sessions.

## 1. Authentication Architecture

- The application authenticates users via **Tesla OAuth** (see `/src/app/api/auth/tesla/callback/route.ts`).
- User session tokens are stored in cookies (`tesla_access_token`, `tesla_refresh_token`).
- **There are no users in the Supabase `auth.users` table.**

## 2. Supabase Client Usage

Because there is no active Supabase Auth session, calling `supabase.auth.getUser()` in API endpoints will **always fail/return null**.

### Client-side reads

- Safe to use the standard client for querying tables that have RLS enabling public/anon reads (e.g., public trip data if configured).

### Server-side writes & secured endpoints

- **NEVER** attempt to write using the standard anon client if the table has Row-Level Security (RLS) policies requiring an authenticated user.
- **DO NOT** create foreign keys pointing to `auth.users`, as the UUIDs will not exist.

## 3. The `admin` Client Bypass

For server operations requiring database writes (like saving user settings), you **must** use the Admin client to bypass RLS:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
    const supabaseAdmin = createAdminClient(); // Uses SUPABASE_SERVICE_ROLE_KEY
    
    // You can now read/write any table, bypassing RLS
    const { data, error } = await supabaseAdmin
        .from('app_settings')
        .update({ ... })
        .eq('id', 'default');
}
```

## 4. Single-User Design

TripBoard is currently designed as a single-user dashboard per deployment.

- Tables storing preferences (like `app_settings`) should use a fixed primary key (e.g., `id = 'default'`).
- Avoid multi-tenant table designs (like `user_id` columns) unless specifically requested by the user for a multi-user roadmap.

## 5. Security Best Practices for this App

- Keep `SUPABASE_SERVICE_ROLE_KEY` strictly on the server (never expose via `NEXT_PUBLIC_`).
- Only use `createAdminClient()` inside secure Next.js API Routes or Server Actions where you have verified the context (e.g., checking for the presence of the `tesla_access_token` cookie if you want to ensure the requester is the car owner).
- For public/unsafe API routes, ensure you manually validate the request before executing admin inserts.
