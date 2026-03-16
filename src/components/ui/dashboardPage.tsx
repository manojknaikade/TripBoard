'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import type { ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

export const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';
export const SURFACE_CARD_CLASS = 'rounded-[28px] border border-slate-700/50 bg-slate-800/30';
export const SUBCARD_CLASS = 'rounded-2xl border border-slate-700/40 bg-slate-900/18';
export const SUBDUED_BADGE_CLASS = 'inline-flex items-center rounded-full border border-slate-700/55 bg-slate-900/28 px-3 py-1 text-xs font-medium text-slate-300';
export const PAGE_MAIN_CLASS = 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8';
export const PAGE_HEADER_CARD_CLASS = `mb-6 px-6 py-5 shadow-[0_18px_56px_-44px_rgba(15,23,42,0.85)] ${SURFACE_CARD_CLASS}`;
export const INPUT_CLASS = `h-11 rounded-2xl border border-slate-700/80 bg-slate-900/55 px-4 text-sm text-white transition-colors hover:border-slate-600 ${FOCUS_RING_CLASS}`;
export const LIST_CARD_CLASS = `block p-5 transition-colors hover:border-slate-600 hover:bg-slate-800/45 ${SURFACE_CARD_CLASS}`;

type Tone = 'brand' | 'live' | 'warning' | 'quiet';

const toneClassMap: Record<Tone, string> = {
    brand: 'border-red-500/20 bg-red-500/10 text-red-300',
    live: 'border-green-500/20 bg-green-500/10 text-green-300',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    quiet: 'border-slate-700/60 bg-slate-900/25 text-slate-300',
};

export function PageShell({ children }: { children: ReactNode }) {
    return <main className={PAGE_MAIN_CLASS}>{children}</main>;
}

export function PageHero({
    title,
    description,
    badge,
    meta,
    actions,
}: {
    title: ReactNode;
    description?: ReactNode;
    badge?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <section className={PAGE_HEADER_CARD_CLASS}>
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
                        {badge}
                    </div>
                    {description ? (
                        <p className="max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
                    ) : null}
                    {meta ? (
                        <div className="flex flex-wrap items-center gap-3">
                            {meta}
                        </div>
                    ) : null}
                </div>
                {actions ? (
                    <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                        {actions}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export function StatusBadge({
    children,
    tone = 'quiet',
    className,
}: {
    children: ReactNode;
    tone?: Tone;
    className?: string;
}) {
    return (
        <span className={cx('inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium', toneClassMap[tone], className)}>
            {children}
        </span>
    );
}

export function DashboardStatCard({
    icon,
    label,
    value,
    helper,
    tone = 'quiet',
    aside,
    valueClassName,
    iconClassName,
}: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    helper?: ReactNode;
    tone?: Tone;
    aside?: ReactNode;
    valueClassName?: string;
    iconClassName?: string;
}) {
    return (
        <div className={cx('flex h-full min-h-[10.75rem] flex-col p-5', SURFACE_CARD_CLASS)}>
            <div className={cx('mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border', iconClassName || toneClassMap[tone])}>
                {icon}
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <div className="mt-3 min-h-[3.25rem]">
                <div className="flex items-end justify-between gap-3">
                    <div className={cx('text-3xl font-semibold tracking-tight text-white', valueClassName)}>
                        {value}
                    </div>
                    {aside}
                </div>
            </div>
            {helper ? (
                <div className="mt-2 text-sm leading-6 text-slate-400">{helper}</div>
            ) : null}
        </div>
    );
}

export function EmptyStateCard({
    icon,
    title,
    description,
    secondary,
}: {
    icon: ReactNode;
    title: string;
    description: ReactNode;
    secondary?: ReactNode;
}) {
    return (
        <div className={cx('p-12 text-center', SURFACE_CARD_CLASS)}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/50 bg-slate-900/30 text-slate-500">
                {icon}
            </div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
            {secondary ? (
                <p className="mt-4 text-sm text-slate-500">{secondary}</p>
            ) : null}
        </div>
    );
}

export function SectionDateHeader({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center gap-2 pb-3 text-sm font-medium text-slate-400">
            {children}
        </div>
    );
}

type TimeframeOption = {
    id: string;
    label: string;
};

export function TimeframeSelector({
    options,
    selected,
    onSelect,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    showCustomPicker,
    onToggleCustomPicker,
    align = 'right',
}: {
    options: TimeframeOption[];
    selected: string;
    onSelect: (id: string) => void;
    customStart?: string;
    customEnd?: string;
    onCustomStartChange?: (value: string) => void;
    onCustomEndChange?: (value: string) => void;
    showCustomPicker?: boolean;
    onToggleCustomPicker?: () => void;
    align?: 'left' | 'right';
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className={cx('flex flex-wrap gap-2', align === 'right' && 'xl:justify-end')}>
                {options.map((option) => {
                    const isActive = selected === option.id;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                                onSelect(option.id);
                                if (option.id === 'custom' && onToggleCustomPicker) {
                                    onToggleCustomPicker();
                                }
                            }}
                            className={cx(
                                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'border-red-500/30 bg-red-500/15 text-red-100'
                                    : 'border-slate-700/55 bg-slate-900/28 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60',
                                FOCUS_RING_CLASS
                            )}
                        >
                            {option.id === 'custom' ? <Calendar className="h-3.5 w-3.5" /> : null}
                            {option.label}
                        </button>
                    );
                })}
            </div>

            {selected === 'custom' && showCustomPicker && onCustomStartChange && onCustomEndChange ? (
                <div className={cx('grid gap-3 p-3 sm:grid-cols-2', SUBCARD_CLASS)}>
                    <label className="flex flex-col gap-2 text-sm text-slate-400">
                        <span>From</span>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(event) => onCustomStartChange(event.target.value)}
                            className={INPUT_CLASS}
                        />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-slate-400">
                        <span>To</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(event) => onCustomEndChange(event.target.value)}
                            className={INPUT_CLASS}
                        />
                    </label>
                </div>
            ) : null}
        </div>
    );
}

export function AnalyticsTabs({
    activeHref,
}: {
    activeHref: string;
}) {
    const tabs = [
        { href: '/dashboard/analytics', label: 'Driving Activity' },
        { href: '/dashboard/analytics/charging', label: 'Charging' },
        { href: '/dashboard/analytics/maintenance', label: 'Maintenance' },
    ];

    return (
        <div className={cx('mb-6 flex flex-wrap gap-2 p-3', SURFACE_CARD_CLASS)}>
            {tabs.map((tab) => {
                const isActive = tab.href === activeHref;

                if (isActive) {
                    return (
                        <span
                            key={tab.href}
                            className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-100"
                        >
                            {tab.label}
                        </span>
                    );
                }

                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cx(
                            'inline-flex items-center rounded-full border border-slate-700/55 bg-slate-900/28 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/60 hover:text-white',
                            FOCUS_RING_CLASS
                        )}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
