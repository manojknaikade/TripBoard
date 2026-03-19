import type { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
    AUTHENTICATED_USER_ID_HEADER,
    AUTH_STATE_HEADER,
} from '@/lib/supabase/requestAuthHeaders';

function isMissingAuthSessionError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /auth session missing/i.test(error.message);
}

async function readRequestScopedUserId() {
    try {
        const requestHeaders = await headers();

        if (requestHeaders.get(AUTH_STATE_HEADER) !== '1') {
            return undefined;
        }

        return requestHeaders.get(AUTHENTICATED_USER_ID_HEADER);
    } catch {
        return undefined;
    }
}

export async function getAuthenticatedUserId(): Promise<string | null> {
    const requestScopedUserId = await readRequestScopedUserId();

    if (requestScopedUserId !== undefined) {
        return requestScopedUserId || null;
    }

    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error) {
        if (isMissingAuthSessionError(error)) {
            return null;
        }

        throw new Error(`Failed to load authenticated user: ${error.message}`);
    }

    return user?.id || null;
}

export async function getAuthenticatedUser(): Promise<User | null> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
        return null;
    }

    return { id: userId } as User;
}

export async function requireAuthenticatedUser(nextPath = '/dashboard'): Promise<User> {
    const user = await getAuthenticatedUser();

    if (!user) {
        redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }

    return user;
}
