'use client';

type CacheEntry<T> = {
    data?: T;
    expiresAt: number;
    promise?: Promise<T>;
};

const responseCache = new Map<string, CacheEntry<unknown>>();

export function readCachedJson<T>(key: string): T | null {
    const cachedEntry = responseCache.get(key) as CacheEntry<T> | undefined;

    if (!cachedEntry || cachedEntry.data === undefined) {
        return null;
    }

    if (cachedEntry.expiresAt <= Date.now()) {
        responseCache.delete(key);
        return null;
    }

    return cachedEntry.data;
}

export async function fetchCachedJson<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number
): Promise<T> {
    const cachedEntry = responseCache.get(key) as CacheEntry<T> | undefined;

    if (cachedEntry?.data !== undefined && cachedEntry.expiresAt > Date.now()) {
        return cachedEntry.data;
    }

    if (cachedEntry?.promise) {
        return cachedEntry.promise;
    }

    const promise = fetcher()
        .then((data) => {
            responseCache.set(key, {
                data,
                expiresAt: Date.now() + ttlMs,
            });
            return data;
        })
        .catch((error) => {
            responseCache.delete(key);
            throw error;
        });

    responseCache.set(key, {
        data: cachedEntry?.data,
        expiresAt: cachedEntry?.expiresAt ?? 0,
        promise,
    });

    return promise;
}

export function writeCachedJson<T>(key: string, data: T, ttlMs: number) {
    responseCache.set(key, {
        data,
        expiresAt: Date.now() + ttlMs,
    });
}

export function invalidateCachedJson(key: string) {
    responseCache.delete(key);
}

export function invalidateCachedJsonMatching(prefix: string) {
    for (const key of responseCache.keys()) {
        if (key.startsWith(prefix)) {
            responseCache.delete(key);
        }
    }
}
