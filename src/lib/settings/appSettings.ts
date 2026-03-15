import { createAdminClient } from '@/lib/supabase/admin';
import type { MapStyle } from '@/lib/maps/style';

export type Region = 'na' | 'eu' | 'cn';
export type Units = 'imperial' | 'metric';
export type DataSource = 'polling' | 'telemetry';
export type Currency = 'CHF' | 'USD' | 'EUR' | 'GBP' | string;
export type DateFormat = 'DD/MM' | 'MM/DD';

export type AppSettingsSnapshot = {
    pollingConfig: {
        driving: number;
        charging: number;
        parked: number;
        sleeping: number;
    };
    region: Region;
    units: Units;
    currency: Currency;
    dateFormat: DateFormat;
    notifications: boolean;
    dataSource: DataSource;
    mapStyle: MapStyle;
};

export type HomeLocationSnapshot = {
    latitude: number | null;
    longitude: number | null;
    address: string;
};

export const DEFAULT_APP_SETTINGS: AppSettingsSnapshot = {
    pollingConfig: {
        driving: 30,
        charging: 300,
        parked: 1800,
        sleeping: 3600,
    },
    region: 'eu',
    units: 'imperial',
    currency: 'CHF',
    dateFormat: 'DD/MM',
    notifications: true,
    dataSource: 'polling',
    mapStyle: 'streets',
};

export const DEFAULT_HOME_LOCATION: HomeLocationSnapshot = {
    latitude: null,
    longitude: null,
    address: '',
};

export async function getAppSettingsSnapshot(): Promise<AppSettingsSnapshot> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('app_settings')
        .select('polling_driving, polling_charging, polling_parked, polling_sleeping, region, units, currency, date_format, notifications_enabled, data_source, map_style')
        .eq('id', 'default')
        .single();

    if (error?.code === 'PGRST116' || !data) {
        return DEFAULT_APP_SETTINGS;
    }

    if (error) {
        throw new Error('Failed to load app settings');
    }

    return {
        pollingConfig: {
            driving: data.polling_driving,
            charging: data.polling_charging,
            parked: data.polling_parked,
            sleeping: data.polling_sleeping,
        },
        region: data.region,
        units: data.units,
        currency: data.currency || 'CHF',
        dateFormat: data.date_format || 'DD/MM',
        notifications: data.notifications_enabled,
        dataSource: data.data_source,
        mapStyle: data.map_style || 'streets',
    };
}

export async function getHomeLocationSnapshot(): Promise<HomeLocationSnapshot> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('app_settings')
        .select('home_latitude, home_longitude, home_address')
        .eq('id', 'default')
        .single();

    if (error?.code === 'PGRST116' || !data) {
        return DEFAULT_HOME_LOCATION;
    }

    if (error) {
        throw new Error('Failed to load home location');
    }

    return {
        latitude: data.home_latitude || null,
        longitude: data.home_longitude || null,
        address: data.home_address || '',
    };
}
