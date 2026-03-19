import ChargingPageClient, { type ChargingListResponse } from '@/components/charging/ChargingPageClient';
import { fetchInitialRouteData } from '@/lib/analytics/server';
import { DEFAULT_APP_SETTINGS, getAppSettingsSnapshot } from '@/lib/settings/appSettings';

export const dynamic = 'force-dynamic';

const CHARGING_PAGE_SIZE = 20;

function buildInitialChargingPath(preferredCurrency: string) {
    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        limit: String(CHARGING_PAGE_SIZE),
        offset: '0',
        includeSummary: '1',
        preferredCurrency,
    });

    return `/api/charging?${params.toString()}`;
}

export default async function ChargingPage() {
    const initialSettings = await getAppSettingsSnapshot().catch(() => DEFAULT_APP_SETTINGS);
    const preferredCurrency = initialSettings.currency || DEFAULT_APP_SETTINGS.currency;
    const initialData = await fetchInitialRouteData<ChargingListResponse>(
        buildInitialChargingPath(preferredCurrency)
    );

    return <ChargingPageClient initialData={initialData} />;
}
