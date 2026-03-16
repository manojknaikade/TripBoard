export interface AnalyticTrip {
    id: string;
    date: string;
    distance: number;
    efficiency: number;
}

export interface WeeklyDatum {
    day: string;
    dateKey: string;
    axisLabel: string;
    tooltipLabel: string;
    distance: number;
    energy: number;
    trips: number;
}

export interface EfficiencyDatum {
    time: string;
    efficiency: number;
}

export interface DrivingAnalyticsData {
    summary: {
        totalDistance: number;
        totalEnergy: number;
        avgEfficiency: number;
        drivingTime: number;
        tripCount: number;
        vampireDrainKwh: number;
        trends?: {
            distance: number;
            energy: number;
            efficiency: number;
            drivingTime: number;
            vampireDrain: number;
        };
    };
    weeklyData: WeeklyDatum[];
    efficiencyData: EfficiencyDatum[];
    leaderboard: {
        longest: AnalyticTrip | null;
        shortest: AnalyticTrip | null;
        mostEfficient: AnalyticTrip | null;
    };
    temperatureImpact: Array<{ temp: number; efficiency: number }>;
}

export interface ChargingAnalyticsData {
    summary: {
        chargingSessions: number;
        totalChargingEnergy: number;
        totalChargingBatteryEnergy: number;
        totalChargingDeliveredEnergy: number;
        totalChargingLossEnergy: number;
        totalChargingLossCost: number;
        totalChargingCost: number;
        avgCostPerKwh: number;
        avgChargingLossPct: number;
    };
    dailyChargingData: Array<{
        day: string;
        dateKey: string;
        axisLabel: string;
        tooltipLabel: string;
        batteryEnergy: number;
        deliveredEnergy: number;
        lossEnergy: number;
        cost: number;
        sessions: number;
    }>;
    chargingMix: Array<{ name: string; value: number; color: string; }>;
    costBySource: Array<{ name: string; cost: number; color: string; }>;
}

export interface MaintenanceAnalyticsData {
    summary: {
        totalRecords: number;
        paidRecords: number;
        totalSpend: number | null;
        averagePaidCost: number | null;
        spendCurrency: string | null;
        mixedCurrencies: boolean;
        seasonChanges: number;
        rotations: number;
        tyreWorkRecords: number;
        activeTyreSets: number;
    };
    activityData: Array<{ period: string; records: number; spend: number }>;
    serviceTypeBreakdown: Array<{ serviceType: MaintenanceServiceType; records: number }>;
    tyreSetMileage: Array<{ name: string; season: TyreSeason; status: 'active' | 'retired'; mileageKm: number }>;
    currencyTotals: Array<{ currency: string; total: number }>;
}
import type { MaintenanceServiceType, TyreSeason } from '@/lib/maintenance';
