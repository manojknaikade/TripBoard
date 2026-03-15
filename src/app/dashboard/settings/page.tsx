import SettingsClientPage from '@/components/settings/SettingsClientPage';
import {
    DEFAULT_APP_SETTINGS,
    DEFAULT_HOME_LOCATION,
    getAppSettingsSnapshot,
    getHomeLocationSnapshot,
} from '@/lib/settings/appSettings';
import { getTeslaSessionFromServerCookies } from '@/lib/tesla/auth-server';
import { fetchTeslaVehicleSummaries } from '@/lib/tesla/vehicleSummaries';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const [initialSettings, initialHomeLocation] = await Promise.all([
        getAppSettingsSnapshot().catch(() => DEFAULT_APP_SETTINGS),
        getHomeLocationSnapshot().catch(() => DEFAULT_HOME_LOCATION),
    ]);

    let initialVehicles = [] as Awaited<ReturnType<typeof fetchTeslaVehicleSummaries>>;

    if (initialSettings.dataSource === 'telemetry') {
        try {
            const session = await getTeslaSessionFromServerCookies();

            if (session) {
                initialVehicles = await fetchTeslaVehicleSummaries(
                    session.accessToken,
                    initialSettings.region ?? session.region
                );
            }
        } catch (error) {
            console.warn('Failed to prefetch telemetry vehicles for settings:', error);
        }
    }

    return (
        <SettingsClientPage
            initialSettings={initialSettings}
            initialHomeLocation={initialHomeLocation}
            initialVehicles={initialVehicles}
        />
    );
}
