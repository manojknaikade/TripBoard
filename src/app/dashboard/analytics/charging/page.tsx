import Header from '@/components/Header';
import ChargingAnalyticsClient from '@/components/analytics/ChargingAnalyticsClient';

export default function ChargingAnalyticsPage() {
    return (
        <div className="min-h-screen">
            <Header />
            <ChargingAnalyticsClient />
        </div>
    );
}
