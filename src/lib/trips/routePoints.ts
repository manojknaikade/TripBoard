export type TripRoutePoint = {
    timestamp: string;
    latitude: number;
    longitude: number;
    speed_mph: number | null;
    battery_level: number | null;
    odometer: number | null;
    heading: number | null;
};

type TelemetryValue = {
    key?: string;
    value?: {
        doubleValue?: number | string;
        intValue?: number | string;
        stringValue?: string;
        locationValue?: {
            latitude?: number | string;
            longitude?: number | string;
        };
        [key: string]: unknown;
    };
};

type TelemetryPayload = {
    data?: TelemetryValue[];
};

function toNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

export function extractRoutePointFromTelemetry(
    timestamp: string,
    payload: TelemetryPayload | null | undefined
): TripRoutePoint | null {
    const entries = Array.isArray(payload?.data) ? payload.data : [];

    let latitude: number | null = null;
    let longitude: number | null = null;
    let speed: number | null = null;
    let batteryLevel: number | null = null;
    let odometer: number | null = null;
    let heading: number | null = null;

    for (const entry of entries) {
        const key = entry?.key;
        const value = entry?.value;

        if (!key || !value) {
            continue;
        }

        if (key === 'Location') {
            latitude = toNullableNumber(value.locationValue?.latitude);
            longitude = toNullableNumber(value.locationValue?.longitude);
            continue;
        }

        if (key === 'VehicleSpeed') {
            speed = toNullableNumber(value.doubleValue ?? value.intValue);
            continue;
        }

        if (key === 'BatteryLevel') {
            batteryLevel = toNullableNumber(value.doubleValue ?? value.intValue);
            continue;
        }

        if (key === 'Odometer') {
            odometer = toNullableNumber(value.doubleValue ?? value.intValue);
            continue;
        }

        if (key === 'Heading') {
            heading = toNullableNumber(value.doubleValue ?? value.intValue);
        }
    }

    if (latitude === null || longitude === null) {
        return null;
    }

    return {
        timestamp,
        latitude,
        longitude,
        speed_mph: speed,
        battery_level: batteryLevel,
        odometer,
        heading,
    };
}

export function dedupeRoutePoints(points: TripRoutePoint[]): TripRoutePoint[] {
    if (points.length < 2) {
        return points;
    }

    const sorted = [...points].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const deduped: TripRoutePoint[] = [];

    for (const point of sorted) {
        const previous = deduped[deduped.length - 1];

        if (
            previous &&
            previous.latitude === point.latitude &&
            previous.longitude === point.longitude &&
            previous.timestamp === point.timestamp
        ) {
            continue;
        }

        deduped.push(point);
    }

    return deduped;
}

export function sampleRoutePoints(
    points: TripRoutePoint[],
    maxPoints: number
): TripRoutePoint[] {
    if (points.length <= maxPoints || maxPoints < 3) {
        return points;
    }

    const sampled: TripRoutePoint[] = [points[0]];
    const interiorCount = maxPoints - 2;
    const lastIndex = points.length - 1;

    for (let index = 1; index <= interiorCount; index += 1) {
        const sampleIndex = Math.round((index * lastIndex) / (interiorCount + 1));
        const point = points[sampleIndex];

        if (point) {
            sampled.push(point);
        }
    }

    sampled.push(points[lastIndex]);

    return dedupeRoutePoints(sampled);
}
