import MaintenancePageClient, { type MaintenanceBootstrapResponse } from '@/components/maintenance/MaintenancePageClient';
import { fetchInitialRouteData } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

const HISTORY_PAGE_SIZE = 20;

export default async function MaintenancePage() {
    const initialData = await fetchInitialRouteData<MaintenanceBootstrapResponse>(
        `/api/maintenance/bootstrap?limit=${HISTORY_PAGE_SIZE}`
    );

    return <MaintenancePageClient initialData={initialData} />;
}
