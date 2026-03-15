import { headers } from 'next/headers';

export async function fetchInitialAnalyticsData<T>(path: string): Promise<T | null> {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');

    if (!host) {
        return null;
    }

    const protocol = requestHeaders.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');

    try {
        const response = await fetch(`${protocol}://${host}${path}`, {
            cache: 'no-store',
            headers: {
                cookie: requestHeaders.get('cookie') || '',
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data?.success ? data : null;
    } catch {
        return null;
    }
}
