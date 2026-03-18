import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getAuthenticatedUser(): Promise<User | null> {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error) {
        throw new Error(`Failed to load authenticated user: ${error.message}`);
    }

    return user;
}

export async function requireAuthenticatedUser(nextPath = '/dashboard'): Promise<User> {
    const user = await getAuthenticatedUser();

    if (!user) {
        redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }

    return user;
}
