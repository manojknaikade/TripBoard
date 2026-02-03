// Shared sign out utility for dashboard pages
import { createClient } from '@/lib/supabase/client';

export async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
}
