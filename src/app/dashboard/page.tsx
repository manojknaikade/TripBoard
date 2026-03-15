import DashboardClient from '@/components/dashboard/DashboardClient';
import { DEFAULT_APP_SETTINGS, getAppSettingsSnapshot } from '@/lib/settings/appSettings';
import { getTeslaSessionFromServerCookies } from '@/lib/tesla/auth-server';
import { fetchTeslaVehicleSummaries } from '@/lib/tesla/vehicleSummaries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const initialSettings = await getAppSettingsSnapshot().catch(() => DEFAULT_APP_SETTINGS);
    let initialVehicles = [] as Awaited<ReturnType<typeof fetchTeslaVehicleSummaries>>;
    let initialVehiclesError: string | null = null;

    try {
        const session = await getTeslaSessionFromServerCookies();

        if (session) {
            initialVehicles = await fetchTeslaVehicleSummaries(
                session.accessToken,
                initialSettings.region ?? session.region
            );
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
