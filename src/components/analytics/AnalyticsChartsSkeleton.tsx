'use client';

import { SURFACE_CARD_CLASS } from '@/components/ui/dashboardPage';

interface AnalyticsChartsSkeletonProps {
    cards?: number;
}

export default function AnalyticsChartsSkeleton({
    cards = 4,
}: AnalyticsChartsSkeletonProps) {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: cards }, (_, index) => (
                <div
                    key={index}
                    className={`p-6 ${SURFACE_CARD_CLASS}`}
                >
                    <div className="mb-6 h-6 w-40 animate-pulse rounded bg-slate-700/60" />
                    <div className="h-[250px] animate-pulse rounded-xl bg-slate-700/40" />
                </div>
            ))}
        </div>
    );
}
