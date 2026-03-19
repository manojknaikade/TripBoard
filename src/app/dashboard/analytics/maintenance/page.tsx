import MaintenanceAnalyticsClient from '@/components/analytics/MaintenanceAnalyticsClient';
import { fetchInitialAnalyticsData } from '@/lib/analytics/server';
import type { MaintenanceAnalyticsData } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export default async function MaintenanceAnalyticsPage() {
    const initialData = await fetchInitialAnalyticsData<MaintenanceAnalyticsData>(
        '/api/analytics/maintenance?timeframe=year'
    );

    return <MaintenanceAnalyticsClient initialData={initialData} />;
}
