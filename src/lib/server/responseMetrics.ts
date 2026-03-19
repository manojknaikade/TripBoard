import { NextResponse } from 'next/server';

export type RouteMetric = {
    name: string;
    durationMs: number;
    description?: string;
};

type JsonWithMetricsOptions = {
    metrics?: RouteMetric[];
    headers?: Record<string, string | number | boolean | null | undefined>;
};

function sanitizeMetricName(name: string) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formatDuration(durationMs: number) {
    return Math.max(0, Math.round(durationMs * 10) / 10);
}

function formatServerTiming(metrics: RouteMetric[]) {
    return metrics
        .filter((metric) => Number.isFinite(metric.durationMs))
        .map((metric) => {
            const parts = [
                sanitizeMetricName(metric.name),
                `dur=${formatDuration(metric.durationMs)}`,
            ];

            if (metric.description) {
                parts.push(`desc="${metric.description.replace(/"/g, "'")}"`);
            }

            return parts.join(';');
        })
        .join(', ');
}

export function jsonWithMetrics<T>(
    body: T,
    init?: ResponseInit,
    options?: JsonWithMetricsOptions
) {
    const response = NextResponse.json(body, init);
    const payloadBytes = Buffer.byteLength(JSON.stringify(body));

    response.headers.set('X-TripBoard-Payload-Bytes', String(payloadBytes));

    if (options?.metrics && options.metrics.length > 0) {
        response.headers.set('Server-Timing', formatServerTiming(options.metrics));
    }

    if (options?.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
            if (value === undefined || value === null) {
                continue;
            }

            response.headers.set(key, String(value));
        }
    }

    return response;
}
