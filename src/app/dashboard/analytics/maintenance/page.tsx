import Header from '@/components/Header';
import MaintenanceAnalyticsClient from '@/components/analytics/MaintenanceAnalyticsClient';

export default function MaintenanceAnalyticsPage() {
    return (
        <div className="min-h-screen">
            <Header />
            <MaintenanceAnalyticsClient />
        </div>
    );
}
