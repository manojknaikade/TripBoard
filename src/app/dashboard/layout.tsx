import type { ReactNode } from 'react';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import Header from '@/components/Header';

export default async function DashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    await requireAuthenticatedUser('/dashboard');

    return (
        <>
            <Header />
            {children}
        </>
    );
}
