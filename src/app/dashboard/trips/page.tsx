import TripsPageClient, { type TripsListResponse } from '@/components/trips/TripsPageClient';
import { fetchInitialRouteData } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

const TRIPS_PAGE_SIZE = 20;

function buildInitialTripsPath() {
    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        limit: String(TRIPS_PAGE_SIZE),
        offset: '0',
        includeSummary: '1',
    });

    return `/api/trips?${params.toString()}`;
}

export default async function TripsPage() {
    const initialData = await fetchInitialRouteData<TripsListResponse>(buildInitialTripsPath());

    return <TripsPageClient initialData={initialData} />;
}
