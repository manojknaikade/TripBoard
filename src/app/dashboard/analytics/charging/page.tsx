import Header from '@/components/Header';
import ChargingAnalyticsClient from '@/components/analytics/ChargingAnalyticsClient';
import { fetchInitialAnalyticsData } from '@/lib/analytics/server';
import type { ChargingAnalyticsData } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export default async function ChargingAnalyticsPage() {
    const initialData = await fetchInitialAnalyticsData<ChargingAnalyticsData>(
        '/api/analytics/summary?scope=charging&timeframe=7days'
    );

    return (
        <div className="min-h-screen">
            <Header />
            <ChargingAnalyticsClient initialData={initialData} />
        </div>
    );
}
