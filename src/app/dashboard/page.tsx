import DashboardClient from '@/components/dashboard/DashboardClient';
import { DEFAULT_APP_SETTINGS, getAppSettingsSnapshot } from '@/lib/settings/appSettings';
import { reconcileTeslaAccountOwnership } from '@/lib/tesla/accountLinking';
import { getTeslaSessionFromServerCookies } from '@/lib/tesla/auth-server';
import { fetchTeslaVehicleSummaries } from '@/lib/tesla/vehicleSummaries';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const initialSettings = await getAppSettingsSnapshot().catch(() => DEFAULT_APP_SETTINGS);
    const user = await getAuthenticatedUser().catch(() => null);
    let initialVehicles = [] as Awaited<ReturnType<typeof fetchTeslaVehicleSummaries>>;
    let initialVehiclesError: string | null = null;

    try {
        const session = await getTeslaSessionFromServerCookies();

        if (session) {
            initialVehicles = await fetchTeslaVehicleSummaries(
                session.accessToken,
                initialSettings.region ?? session.region
            );

            if (user && initialVehicles.length > 0) {
                await reconcileTeslaAccountOwnership({
                    currentUserId: user.id,
                    region: initialSettings.region ?? session.region,
                    vehicles: initialVehicles,
                });
            }
        }
    } catch (error) {
        initialVehiclesError = error instanceof Error ? error.message : 'Failed to fetch vehicles';
    }

    return (
        <DashboardClient
            initialSettings={initialSettings}
            initialVehicles={initialVehicles}
            initialVehiclesError={initialVehiclesError}
        />
    );
}
