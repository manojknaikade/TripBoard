import Header from '@/components/Header';
import DrivingAnalyticsClient from '@/components/analytics/DrivingAnalyticsClient';

export default function AnalyticsPage() {
    return (
        <div className="min-h-screen">
            <Header />
            <DrivingAnalyticsClient />
        </div>
    );
}
