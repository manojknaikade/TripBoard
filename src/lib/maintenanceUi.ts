import type {
    MaintenanceRecord,
    MaintenanceServiceType,
    RotationStatus,
    TyreSeason,
    TyreSet,
} from '@/lib/maintenance';

export type DistanceUnits = 'imperial' | 'metric';

export type MaintenanceFormState = {
    id: string | null;
    serviceType: MaintenanceServiceType;
    tyreSetId: string;
    createTyreSet: boolean;
    newTyreSetName: string;
    newTyreSetNotes: string;
    title: string;
    startDate: string;
    endDate: string;
    startOdometerKm: string;
    endOdometerKm: string;
    costAmount: string;
    costCurrency: string;
    season: TyreSeason;
    rotationStatus: RotationStatus;
    notes: string;
};

export type TyreSetDerivedStatus = 'mounted' | 'stored' | 'retired';

export type TyreSetSummary = TyreSet & {
    derivedStatus: TyreSetDerivedStatus;
    totalMileageKm: number;
    currentMountedMileageKm: number | null;
    latestRecord: MaintenanceRecord | null;
    firstMountedOdometerKm: number | null;
};
