export const SERVICE_TYPE_OPTIONS = [
    { value: 'tyre_season', label: 'Tyre season change' },
    { value: 'tyre_rotation', label: 'Tyre rotation' },
    { value: 'wheel_alignment', label: 'Wheel alignment' },
    { value: 'cabin_air_filter', label: 'Cabin air filter' },
    { value: 'hepa_filter', label: 'HEPA filter' },
    { value: 'brake_fluid_check', label: 'Brake fluid check' },
    { value: 'brake_service', label: 'Brake service' },
    { value: 'wiper_blades', label: 'Wiper blades' },
    { value: 'ac_desiccant_bag', label: 'A/C desiccant bag' },
    { value: 'twelve_volt_battery', label: '12V battery' },
    { value: 'other', label: 'Other' },
] as const;

export const ROTATION_STATUS_OPTIONS = [
    { value: 'rotated', label: 'Rotated' },
    { value: 'not_rotated', label: 'Not rotated' },
    { value: 'unknown', label: 'Unknown' },
    { value: 'not_applicable', label: 'Not applicable' },
] as const;

export const TYRE_SEASON_OPTIONS = [
    { value: 'summer', label: 'Summer' },
    { value: 'winter', label: 'Winter' },
    { value: 'all_season', label: 'All-season' },
] as const;

export const TYRE_SET_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'retired', label: 'Retired' },
] as const;

export const TESLA_MAINTENANCE_GUIDE = [
    {
        serviceType: 'tyre_rotation',
        title: 'Tyre rotation',
        cadence: 'Every 10,000 km or if wear differs between axles',
    },
    {
        serviceType: 'wheel_alignment',
        title: 'Wheel alignment',
        cadence: 'As needed after pothole impacts or uneven tyre wear',
    },
    {
        serviceType: 'cabin_air_filter',
        title: 'Cabin air filter',
        cadence: 'About every 2 years',
    },
    {
        serviceType: 'hepa_filter',
        title: 'HEPA filter',
        cadence: 'About every 3 years on equipped models',
    },
    {
        serviceType: 'brake_fluid_check',
        title: 'Brake fluid check',
        cadence: 'Roughly every 4 years',
    },
    {
        serviceType: 'wiper_blades',
        title: 'Wiper blades',
        cadence: 'As needed',
    },
    {
        serviceType: 'ac_desiccant_bag',
        title: 'A/C desiccant bag',
        cadence: 'Typically 4 to 6 years depending on model guidance',
    },
] as const;

export type MaintenanceServiceType = (typeof SERVICE_TYPE_OPTIONS)[number]['value'];
export type RotationStatus = (typeof ROTATION_STATUS_OPTIONS)[number]['value'];
export type TyreSeason = (typeof TYRE_SEASON_OPTIONS)[number]['value'];
export type TyreSetStatus = (typeof TYRE_SET_STATUS_OPTIONS)[number]['value'];

export interface TyreSet {
    id: string;
    source_key: string | null;
    name: string;
    season: TyreSeason;
    purchase_date: string | null;
    purchase_odometer_km: number | null;
    status: TyreSetStatus;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface MaintenanceRecord {
    id: string;
    source_key: string | null;
    tyre_set_id: string | null;
    service_type: MaintenanceServiceType;
    title: string;
    start_date: string;
    end_date: string | null;
    start_odometer_km: number | null;
    end_odometer_km: number | null;
    odometer_km: number | null;
    cost_amount: number | null;
    cost_currency: string | null;
    season: TyreSeason | null;
    rotation_status: RotationStatus;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export function isTyreSeasonRecord(serviceType: MaintenanceServiceType) {
    return serviceType === 'tyre_season';
}

export function isTyreLinkedRecord(serviceType: MaintenanceServiceType) {
    return serviceType === 'tyre_season' || serviceType === 'tyre_rotation';
}
