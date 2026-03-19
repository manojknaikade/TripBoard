'use client';

import {
    fetchCachedJson,
    invalidateCachedJson,
    readCachedJson,
    writeCachedJson,
} from '@/lib/client/fetchCache';

const UNREAD_COUNT_CACHE_KEY = 'notifications:unread-count';
const UNREAD_COUNT_TTL_MS = 60_000;

type NotificationUnreadSnapshot = {
    unreadCount: number;
    initialized: boolean;
    pollingDisabled: boolean;
};

const listeners = new Set<() => void>();

let snapshot: NotificationUnreadSnapshot = {
    unreadCount: 0,
    initialized: false,
    pollingDisabled: false,
};

let unreadCountPromise: Promise<number> | null = null;

function emitChange() {
    listeners.forEach((listener) => listener());
}

function updateSnapshot(next: Partial<NotificationUnreadSnapshot>) {
    const updatedSnapshot = {
        ...snapshot,
        ...next,
    };

    if (
        updatedSnapshot.unreadCount === snapshot.unreadCount
        && updatedSnapshot.initialized === snapshot.initialized
        && updatedSnapshot.pollingDisabled === snapshot.pollingDisabled
    ) {
        return;
    }

    snapshot = updatedSnapshot;
    emitChange();
}

function hydrateUnreadCountFromCache() {
    const cachedUnreadCount = readCachedJson<number>(UNREAD_COUNT_CACHE_KEY);

    if (cachedUnreadCount === null) {
        return false;
    }

    updateSnapshot({
        unreadCount: cachedUnreadCount,
        initialized: true,
    });
    return true;
}

export function subscribeNotificationUnreadCount(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getNotificationUnreadSnapshot() {
    hydrateUnreadCountFromCache();
    return snapshot;
}

export function setNotificationUnreadCount(unreadCount: number) {
    const safeUnreadCount = Math.max(0, Math.floor(unreadCount));
    writeCachedJson(UNREAD_COUNT_CACHE_KEY, safeUnreadCount, UNREAD_COUNT_TTL_MS);
    updateSnapshot({
        unreadCount: safeUnreadCount,
        initialized: true,
        pollingDisabled: false,
    });
}

export function invalidateNotificationUnreadCount() {
    invalidateCachedJson(UNREAD_COUNT_CACHE_KEY);
}

export function isNotificationPollingDisabled() {
    return snapshot.pollingDisabled;
}

export async function refreshNotificationUnreadCount(options?: { force?: boolean }) {
    const force = options?.force ?? false;

    if (!force && hydrateUnreadCountFromCache()) {
        return snapshot.unreadCount;
    }

    if (unreadCountPromise) {
        return unreadCountPromise;
    }

    const fetchUnreadCount = async () => {
        const response = await fetch('/api/notifications?count_only=true', {
            cache: 'no-store',
        });

        if (response.status === 401) {
            setNotificationUnreadCount(0);
            updateSnapshot({
                pollingDisabled: true,
            });
            return 0;
        }

        const data = await response.json();
        return data.success ? (data.unread_count || 0) : 0;
    };

    const requestPromise = (force
        ? fetchUnreadCount()
        : fetchCachedJson<number>(UNREAD_COUNT_CACHE_KEY, fetchUnreadCount, UNREAD_COUNT_TTL_MS))
        .then((unreadCount) => {
            setNotificationUnreadCount(unreadCount);
            return unreadCount;
        })
        .catch((error) => {
            hydrateUnreadCountFromCache();
            updateSnapshot({
                initialized: true,
            });
            throw error;
        })
        .finally(() => {
            unreadCountPromise = null;
        });

    unreadCountPromise = requestPromise;
    return requestPromise;
}
