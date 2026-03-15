import Header from '@/components/Header';
import DrivingAnalyticsClient from '@/components/analytics/DrivingAnalyticsClient';
import { fetchInitialAnalyticsData } from '@/lib/analytics/server';
import type { DrivingAnalyticsData } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    const initialData = await fetchInitialAnalyticsData<DrivingAnalyticsData>(
        '/api/analytics/summary?scope=driving&timeframe=7days'
    );

    return (
        <div className="min-h-screen">
            <Header />
            <DrivingAnalyticsClient initialData={initialData} />
        </div>
    );
}
