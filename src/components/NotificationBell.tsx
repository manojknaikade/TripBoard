'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Bell, Zap, Car, Check, X } from 'lucide-react';
import {
    invalidateNotificationUnreadCount,
    isNotificationPollingDisabled,
    refreshNotificationUnreadCount,
    setNotificationUnreadCount,
    subscribeNotificationUnreadCount,
    getNotificationUnreadSnapshot,
} from '@/lib/client/notificationUnreadStore';
import {
    fetchCachedJson,
    invalidateCachedJson,
} from '@/lib/client/fetchCache';

const NOTIFICATIONS_LIST_CACHE_KEY = 'notifications:dropdown:unread';
const NOTIFICATIONS_LIST_TTL_MS = 15_000;
const UNREAD_COUNT_POLL_INTERVAL_MS = 60_000;

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown>;
    is_read: boolean;
    created_at: string;
}

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notificationsRequestRef = useRef<Promise<void> | null>(null);
    const { unreadCount } = useSyncExternalStore(
        subscribeNotificationUnreadCount,
        getNotificationUnreadSnapshot,
        getNotificationUnreadSnapshot
    );

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (notificationsRequestRef.current) {
            return notificationsRequestRef.current;
        }

        setLoading(true);
        const requestPromise = (async () => {
            try {
                const data = await fetchCachedJson<{
                    success?: boolean;
                    notifications?: Notification[];
                    unread_count?: number;
                    error?: string;
                }>(NOTIFICATIONS_LIST_CACHE_KEY, async () => {
                    const res = await fetch('/api/notifications?unread_only=true&limit=20', {
                        cache: 'no-store',
                    });

                    if (res.status === 401) {
                        throw Object.assign(new Error('Not authenticated'), { status: 401 });
                    }

                    return res.json();
                }, NOTIFICATIONS_LIST_TTL_MS);

                if (data.success) {
                    setNotifications(data.notifications || []);
                    setNotificationUnreadCount(data.unread_count || 0);
                }
            } catch (error) {
                if (error instanceof Error && 'status' in error && error.status === 401) {
                    setNotifications([]);
                    setNotificationUnreadCount(0);
                    return;
                }

                try {
                    await refreshNotificationUnreadCount({ force: true });
                } catch {
                    // silently fail
                }
            } finally {
                setLoading(false);
                notificationsRequestRef.current = null;
            }
        })();

        notificationsRequestRef.current = requestPromise;
        return requestPromise;
    }, []);

    useEffect(() => {
        let timeoutId: number | null = null;
        let cancelled = false;

        const schedulePoll = (delayMs: number) => {
            timeoutId = window.setTimeout(async () => {
                if (cancelled) {
                    return;
                }

                if (
                    document.visibilityState === 'visible'
                    && !isOpen
                    && !isNotificationPollingDisabled()
                ) {
                    try {
                        await refreshNotificationUnreadCount();
                    } catch {
                        // silently fail
                    }
                }

                if (!cancelled) {
                    schedulePoll(UNREAD_COUNT_POLL_INTERVAL_MS);
                }
            }, delayMs);
        };

        if (
            document.visibilityState === 'visible'
            && !isOpen
            && !isNotificationPollingDisabled()
        ) {
            void refreshNotificationUnreadCount();
        }

        const handleVisibilityChange = () => {
            if (
                document.visibilityState !== 'visible'
                || isOpen
                || isNotificationPollingDisabled()
            ) {
                return;
            }

            void refreshNotificationUnreadCount();
        };

        schedulePoll(UNREAD_COUNT_POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            cancelled = true;

            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }

            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isOpen]);

    const toggleDropdown = () => {
        if (!isOpen) {
            void fetchNotifications();
        }
        setIsOpen(!isOpen);
    };

    const markAllRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mark_all: true }),
            });
            invalidateCachedJson(NOTIFICATIONS_LIST_CACHE_KEY);
            invalidateNotificationUnreadCount();
            setNotifications([]);
            setNotificationUnreadCount(0);
        } catch {
            // silently fail
        }
    };

    const markOneRead = async (id: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [id] }),
            });
            invalidateCachedJson(NOTIFICATIONS_LIST_CACHE_KEY);
            invalidateNotificationUnreadCount();
            setNotifications(prev => prev.filter(n => n.id !== id));
            setNotificationUnreadCount(unreadCount - 1);
        } catch {
            // silently fail
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'charging_complete':
                return <Zap className="h-4 w-4 text-green-400" />;
            case 'trip_summary':
                return <Car className="h-4 w-4 text-blue-400" />;
            default:
                return <Bell className="h-4 w-4 text-slate-400" />;
        }
    };

    const getNotificationLink = (n: Notification): string => {
        if (n.type === 'charging_complete' && n.data?.session_id) {
            return `/dashboard/charging/${n.data.session_id}`;
        }
        if (n.type === 'trip_summary') {
            return '/dashboard/trips';
        }
        return '#';
    };

    const formatTimeAgo = (dateStr: string): string => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={toggleDropdown}
                className="relative flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Notifications"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-700/50 bg-slate-900 shadow-2xl shadow-black/50 z-[60] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                                >
                                    <Check className="h-3 w-3" />
                                    Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-red-500" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                                <Bell className="mb-2 h-8 w-8" />
                                <p className="text-sm">No unread notifications</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <Link
                                    key={n.id}
                                    href={getNotificationLink(n)}
                                    onClick={() => {
                                        if (!n.is_read) markOneRead(n.id);
                                        setIsOpen(false);
                                    }}
                                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/50 ${!n.is_read ? 'bg-slate-800/30' : ''
                                        }`}
                                >
                                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800">
                                        {getNotificationIcon(n.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-medium ${!n.is_read ? 'text-white' : 'text-slate-300'}`}>
                                                {n.title}
                                            </span>
                                            {!n.is_read && (
                                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{n.message}</p>
                                        <p className="mt-1 text-[10px] text-slate-600">{formatTimeAgo(n.created_at)}</p>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
