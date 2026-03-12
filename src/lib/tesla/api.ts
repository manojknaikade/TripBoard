export const REGIONAL_ENDPOINTS = {
    na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
} as const;

export type TeslaRegion = keyof typeof REGIONAL_ENDPOINTS;

const REGION_DISCOVERY_ORDER: TeslaRegion[] = ['eu', 'na', 'cn'];

export function normalizeTeslaRegion(region?: string | null): TeslaRegion | null {
    if (!region) {
        return null;
    }

    return region in REGIONAL_ENDPOINTS ? (region as TeslaRegion) : null;
}

export function getTeslaRegionCandidates(preferredRegion?: string | null): TeslaRegion[] {
    const normalizedRegion = normalizeTeslaRegion(preferredRegion);
    return normalizedRegion ? [normalizedRegion] : REGION_DISCOVERY_ORDER;
}

export async function fetchTeslaApi(
    accessToken: string,
    region: TeslaRegion,
    path: string,
    init: RequestInit = {}
) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);

    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(`${REGIONAL_ENDPOINTS[region]}${path}`, {
        ...init,
        headers,
    });
}

export async function discoverTeslaVehicles(
    accessToken: string,
    preferredRegion?: string | null
): Promise<
    | {
        ok: true;
        region: TeslaRegion;
        data: unknown;
    }
    | {
        ok: false;
        region: TeslaRegion | null;
        status: number;
        error: unknown;
    }
> {
    let lastFailure: {
        region: TeslaRegion | null;
        status: number;
        error: unknown;
    } = {
        region: null,
        status: 500,
        error: { error: 'Unable to contact Tesla Fleet API' },
    };

    for (const region of getTeslaRegionCandidates(preferredRegion)) {
        const response = await fetchTeslaApi(accessToken, region, '/api/1/vehicles');
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            return {
                ok: true,
                region,
                data,
            };
        }

        lastFailure = {
            region,
            status: response.status,
            error: data,
        };
    }

    return {
        ok: false,
        ...lastFailure,
    };
}
