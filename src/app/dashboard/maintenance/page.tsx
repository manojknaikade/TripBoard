'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BookOpen,
    Gauge,
    Loader2,
    Package,
    Plus,
    Snowflake,
    Sun,
    Wrench,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import VirtualizedList from '@/components/VirtualizedList';
import { invalidateCachedJson, readCachedJson, writeCachedJson } from '@/lib/client/fetchCache';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    ROTATION_STATUS_OPTIONS,
    SERVICE_TYPE_OPTIONS,
    TYRE_SEASON_OPTIONS,
    isTyreLinkedRecord,
    isTyreSeasonRecord,
    type MaintenanceRecord,
    type MaintenanceServiceType,
    type RotationStatus,
    type TyreSeason,
    type TyreSet,
} from '@/lib/maintenance';
import type { DistanceUnits, MaintenanceFormState, TyreSetSummary } from '@/lib/maintenanceUi';

type TyreSetDerivedStatus = TyreSetSummary['derivedStatus'];
type MaintenanceSummary = {
    totalRecords: number;
    tyreRecords: number;
    otherRecords: number;
    latestLoggedOdometerKm: number | null;
};

type MaintenanceBootstrapResponse = {
    success: boolean;
    linkedRecords: MaintenanceRecord[];
    historyRecords: MaintenanceRecord[];
    tyreSets: TyreSet[];
    summary: MaintenanceSummary | null;
    currentVehicleOdometerKm: number | null;
    hasMoreHistory: boolean;
    nextHistoryOffset: number;
};

const KM_NUMBER_FORMATTER = new Intl.NumberFormat('en-CH');
const MILES_TO_KM = 1.60934;
const KM_TO_MI = 0.621371;
const HISTORY_PAGE_SIZE = 20;
const MAINTENANCE_BOOTSTRAP_CACHE_KEY = `maintenance:bootstrap:${HISTORY_PAGE_SIZE}`;
const MAINTENANCE_BOOTSTRAP_CACHE_TTL_MS = 45_000;

const MaintenanceRecordModal = dynamic(() => import('@/components/maintenance/MaintenanceRecordModal'), {
    ssr: false,
});

const MaintenanceGuideModal = dynamic(() => import('@/components/maintenance/MaintenanceGuideModal'), {
    ssr: false,
});

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function createDefaultMaintenanceForm(startDate = ''): MaintenanceFormState {
    return {
        id: null,
        serviceType: 'tyre_rotation',
        tyreSetId: '',
        createTyreSet: false,
        newTyreSetName: '',
        newTyreSetNotes: '',
        title: '',
        startDate,
        endDate: '',
        startOdometerKm: '',
        endOdometerKm: '',
        costAmount: '',
        costCurrency: '',
        season: 'summer',
        rotationStatus: 'rotated',
        notes: '',
    };
}

function toDisplayDistanceNumber(valueKm: number, units: DistanceUnits) {
    return units === 'metric' ? valueKm : valueKm * KM_TO_MI;
}

function fromDisplayDistanceNumber(value: number, units: DistanceUnits) {
    return units === 'metric' ? value : value * MILES_TO_KM;
}

function formatDistanceValue(valueKm: number | null, units: DistanceUnits) {
    if (valueKm == null) {
        return 'Not available';
    }

    return `${KM_NUMBER_FORMATTER.format(Math.round(toDisplayDistanceNumber(valueKm, units)))} ${units === 'metric' ? 'km' : 'mi'}`;
}

function formatDistanceInputValue(valueKm: number | null, units: DistanceUnits) {
    if (valueKm == null) {
        return '';
    }

    return Math.round(toDisplayDistanceNumber(valueKm, units)).toString();
}

function parseDistanceInputValue(value: string, units: DistanceUnits) {
    if (!value.trim()) {
        return '';
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return value;
    }

    return Math.round(fromDisplayDistanceNumber(parsed, units));
}

function createMaintenanceFormFromRecord(record: MaintenanceRecord, units: DistanceUnits): MaintenanceFormState {
    return {
        id: record.id,
        serviceType: record.service_type,
        tyreSetId: record.tyre_set_id || '',
        createTyreSet: false,
        newTyreSetName: '',
        newTyreSetNotes: '',
        title: record.title,
        startDate: record.start_date,
        endDate: record.end_date || '',
        startOdometerKm: formatDistanceInputValue(record.start_odometer_km, units),
        endOdometerKm: formatDistanceInputValue(record.end_odometer_km ?? record.odometer_km, units),
        costAmount: record.cost_amount?.toString() || '',
        costCurrency: record.cost_currency || '',
        season: record.season || 'summer',
        rotationStatus: record.rotation_status,
        notes: record.notes || '',
    };
}

const serviceTypeLabels = Object.fromEntries(
    SERVICE_TYPE_OPTIONS.map((option) => [option.value, option.label])
) as Record<MaintenanceServiceType, string>;

const seasonLabels = Object.fromEntries(
    TYRE_SEASON_OPTIONS.map((option) => [option.value, option.label])
) as Record<TyreSeason, string>;

const rotationLabels = Object.fromEntries(
    ROTATION_STATUS_OPTIONS.map((option) => [option.value, option.label])
) as Record<RotationStatus, string>;

function sortRecords(records: MaintenanceRecord[]) {
    return [...records].sort((a, b) => {
        const startDiff = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        if (startDiff !== 0) {
            return startDiff;
        }

        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

function sortRecordsDesc(records: MaintenanceRecord[]) {
    return sortRecords(records).reverse();
}

function formatDate(value: string | null) {
    if (!value) {
        return 'Current';
    }

    return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatCurrency(value: number | null, currency: string | null) {
    if (value == null) {
        return 'No cost';
    }

    try {
        return new Intl.NumberFormat('en-CH', {
            style: 'currency',
            currency: currency || 'CHF',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency || 'CHF'} ${value.toFixed(2)}`;
    }
}

function formatCompactDate(value: string | null) {
    if (!value) {
        return 'Current';
    }

    return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
    });
}

function getTyreSetMarkerClass(_status: TyreSetDerivedStatus, season: TyreSeason) {
    if (season === 'winter') {
        return 'bg-cyan-400/75';
    }

    if (season === 'summer') {
        return 'bg-amber-400/75';
    }

    return 'bg-slate-500';
}

function getSeasonBadgeClass(season: TyreSeason | null) {
    if (season === 'winter') {
        return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200';
    }

    if (season === 'summer') {
        return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
    }

    return 'border-slate-600 bg-slate-800 text-slate-300';
}

function getStatusBadgeClass(status: TyreSetDerivedStatus | RotationStatus | 'default') {
    if (status === 'mounted' || status === 'rotated') {
        return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
    }

    if (status === 'stored') {
        return 'border-slate-500/40 bg-slate-700/40 text-slate-200';
    }

    if (status === 'retired' || status === 'not_rotated') {
        return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
    }

    if (status === 'unknown') {
        return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
    }

    return 'border-slate-600 bg-slate-800 text-slate-300';
}

function getRecordBorderClass(record: MaintenanceRecord) {
    if (record.service_type === 'tyre_rotation') {
        return 'border-l-sky-400/80';
    }

    if (record.season === 'winter') {
        return 'border-l-cyan-400/80';
    }

    if (record.season === 'summer') {
        return 'border-l-amber-400/80';
    }

    return 'border-l-slate-600/90';
}

function formatTyreSetStatus(status: TyreSetDerivedStatus) {
    if (status === 'mounted') {
        return 'Mounted';
    }

    if (status === 'stored') {
        return 'Stored';
    }

    return 'Retired';
}

function buildRecordMeta(record: MaintenanceRecord, units: DistanceUnits, preferredCurrency: string) {
    const parts: string[] = [];

    if (record.start_odometer_km != null) {
        parts.push(`Start ${formatDistanceValue(record.start_odometer_km, units)}`);
    }

    if (record.end_odometer_km != null) {
        parts.push(`End ${formatDistanceValue(record.end_odometer_km, units)}`);
    }

    if (record.cost_amount != null) {
        parts.push(formatCurrency(record.cost_amount, record.cost_currency || preferredCurrency));
    }

    return parts;
}

function deriveTyreSetSummaries(
    tyreSets: TyreSet[],
    records: MaintenanceRecord[],
    currentVehicleOdometer: number | null,
    latestLoggedOdometer: number | null
) {
    const seasonRecords = sortRecords(
        records.filter((record) => record.service_type === 'tyre_season' && record.tyre_set_id)
    );

    const summaries = new Map<string, TyreSetSummary>(
        tyreSets.map((tyreSet) => [
            tyreSet.id,
            {
                ...tyreSet,
                derivedStatus: tyreSet.status === 'retired' ? 'retired' : 'stored',
                totalMileageKm: 0,
                currentMountedMileageKm: null,
                latestRecord: null,
                firstMountedOdometerKm: null,
            },
        ])
    );

    for (const record of seasonRecords) {
        if (!record.tyre_set_id) {
            continue;
        }

        const summary = summaries.get(record.tyre_set_id);

        if (!summary) {
            continue;
        }

        const segmentStartOdometer = record.start_odometer_km;
        const segmentEndOdometer = record.end_odometer_km
            ?? record.odometer_km
            ?? (record.end_date ? null : (currentVehicleOdometer ?? latestLoggedOdometer));

        if (segmentStartOdometer != null && segmentEndOdometer != null && segmentEndOdometer >= segmentStartOdometer) {
            const segmentMileage = segmentEndOdometer - segmentStartOdometer;
            summary.totalMileageKm += segmentMileage;

            if (!record.end_date) {
                summary.currentMountedMileageKm = segmentMileage;
            }
        }

        if (!summary.latestRecord || new Date(record.start_date).getTime() >= new Date(summary.latestRecord.start_date).getTime()) {
            summary.latestRecord = record;
        }

        if (summary.firstMountedOdometerKm == null && record.start_odometer_km != null) {
            summary.firstMountedOdometerKm = record.start_odometer_km;
        }

        if (!record.end_date) {
            summary.derivedStatus = summary.status === 'retired' ? 'retired' : 'mounted';
        }
    }

    for (const summary of summaries.values()) {
        if (summary.status === 'retired') {
            summary.derivedStatus = 'retired';
        } else if (summary.latestRecord?.end_date) {
            summary.derivedStatus = 'stored';
        }
    }

    return [...summaries.values()].sort((a, b) => {
        const statusRank = { mounted: 0, stored: 1, retired: 2 } as const;
        const rankDiff = statusRank[a.derivedStatus] - statusRank[b.derivedStatus];
        if (rankDiff !== 0) {
            return rankDiff;
        }

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

function applyBootstrapData(
    bootstrapData: MaintenanceBootstrapResponse,
    setters: {
        setRecords: React.Dispatch<React.SetStateAction<MaintenanceRecord[]>>;
        setHistoryRecords: React.Dispatch<React.SetStateAction<MaintenanceRecord[]>>;
        setTyreSets: React.Dispatch<React.SetStateAction<TyreSet[]>>;
        setMaintenanceSummary: React.Dispatch<React.SetStateAction<MaintenanceSummary | null>>;
        setCurrentVehicleOdometer: React.Dispatch<React.SetStateAction<number | null>>;
        setHistoryHasMore: React.Dispatch<React.SetStateAction<boolean>>;
        setHistoryOffset: React.Dispatch<React.SetStateAction<number>>;
    }
) {
    const fetchedRecords = sortRecordsDesc(bootstrapData.linkedRecords || []);
    const fetchedHistoryRecords = sortRecordsDesc(bootstrapData.historyRecords || []);

    setters.setRecords(fetchedRecords);
    setters.setHistoryRecords(fetchedHistoryRecords);
    setters.setTyreSets(bootstrapData.tyreSets || []);
    setters.setMaintenanceSummary(bootstrapData.summary || null);
    setters.setCurrentVehicleOdometer(bootstrapData.currentVehicleOdometerKm ?? null);
    setters.setHistoryHasMore(Boolean(bootstrapData.hasMoreHistory));
    setters.setHistoryOffset(bootstrapData.nextHistoryOffset || fetchedHistoryRecords.length);
}

export default function MaintenancePage() {
    const preferredCurrency = useSettingsStore((state) => state.currency);
    const units = useSettingsStore((state) => state.units);
    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [historyRecords, setHistoryRecords] = useState<MaintenanceRecord[]>([]);
    const [tyreSets, setTyreSets] = useState<TyreSet[]>([]);
    const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceSummary | null>(null);
    const [currentVehicleOdometer, setCurrentVehicleOdometer] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [deletingTyreSetId, setDeletingTyreSetId] = useState<string | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [recordSaving, setRecordSaving] = useState(false);
    const [recordError, setRecordError] = useState<string | null>(null);
    const [recordSuccess, setRecordSuccess] = useState<string | null>(null);
    const [recordModalOpen, setRecordModalOpen] = useState(false);
    const [guideModalOpen, setGuideModalOpen] = useState(false);
    const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>(() => createDefaultMaintenanceForm());
    const historyLoadMoreRef = useRef<HTMLDivElement | null>(null);
    const distanceUnitLabel = units === 'metric' ? 'km' : 'mi';

    useEffect(() => {
        setMaintenanceForm((current) => current.costCurrency ? current : { ...current, costCurrency: preferredCurrency || 'CHF' });
    }, [preferredCurrency]);

    const latestLoggedOdometer = maintenanceSummary?.latestLoggedOdometerKm ?? null;

    const loadPageData = useCallback(async (signal?: AbortSignal, options?: { showLoading?: boolean }) => {
        let hydratedFromCache = false;
        const shouldShowLoading = options?.showLoading !== false;
        setPageError(null);

        try {
            const cachedBootstrap = shouldShowLoading
                ? readCachedJson<MaintenanceBootstrapResponse>(MAINTENANCE_BOOTSTRAP_CACHE_KEY)
                : null;

            if (cachedBootstrap?.success) {
                applyBootstrapData(cachedBootstrap, {
                    setRecords,
                    setHistoryRecords,
                    setTyreSets,
                    setMaintenanceSummary,
                    setCurrentVehicleOdometer,
                    setHistoryHasMore,
                    setHistoryOffset,
                });
                hydratedFromCache = true;
                if (shouldShowLoading) {
                    setLoading(false);
                }
            } else if (shouldShowLoading) {
                setLoading(true);
            }

            const response = await fetch(`/api/maintenance/bootstrap?limit=${HISTORY_PAGE_SIZE}`, {
                cache: 'no-store',
                signal,
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to load maintenance data');
            }

            if (signal?.aborted) {
                return;
            }

            writeCachedJson(MAINTENANCE_BOOTSTRAP_CACHE_KEY, data, MAINTENANCE_BOOTSTRAP_CACHE_TTL_MS);
            applyBootstrapData(data as MaintenanceBootstrapResponse, {
                setRecords,
                setHistoryRecords,
                setTyreSets,
                setMaintenanceSummary,
                setCurrentVehicleOdometer,
                setHistoryHasMore,
                setHistoryOffset,
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            if (!hydratedFromCache) {
                setPageError(error instanceof Error ? error.message : 'Failed to load maintenance data');
            }
        } finally {
            if (!signal?.aborted && shouldShowLoading && !hydratedFromCache) {
                setLoading(false);
            }
        }
    }, []);

    const loadMoreHistory = useCallback(async () => {
        if (historyLoadingMore || !historyHasMore) {
            return;
        }

        setHistoryLoadingMore(true);

        try {
            const response = await fetch(`/api/maintenance?limit=${HISTORY_PAGE_SIZE}&offset=${historyOffset}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to load more maintenance history');
            }

            const nextRecords = sortRecordsDesc(data.records || []);

            setHistoryRecords((current) => {
                const seenIds = new Set(current.map((record) => record.id));
                const mergedRecords = [...current];

                for (const record of nextRecords) {
                    if (!seenIds.has(record.id)) {
                        mergedRecords.push(record);
                    }
                }

                return mergedRecords;
            });
            const nextOffset = data.nextOffset || historyOffset + nextRecords.length;
            setHistoryHasMore(
                maintenanceSummary
                    ? nextOffset < maintenanceSummary.totalRecords
                    : Boolean(data.hasMore)
            );
            setHistoryOffset(nextOffset);
        } catch (error) {
            setPageError(error instanceof Error ? error.message : 'Failed to load more maintenance history');
        } finally {
            setHistoryLoadingMore(false);
        }
    }, [historyHasMore, historyLoadingMore, historyOffset, maintenanceSummary]);

    useEffect(() => {
        setMaintenanceForm((current) => current.startDate ? current : { ...current, startDate: getTodayDate() });
        const controller = new AbortController();
        void loadPageData(controller.signal);

        return () => controller.abort();
    }, [loadPageData]);

    useEffect(() => {
        if (!historyHasMore || historyLoadingMore || loading || !historyLoadMoreRef.current) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        void loadMoreHistory();
                        break;
                    }
                }
            },
            { rootMargin: '240px' }
        );

        observer.observe(historyLoadMoreRef.current);

        return () => observer.disconnect();
    }, [historyHasMore, historyLoadingMore, loadMoreHistory, loading]);

    const tyreSetSummaries = useMemo(
        () => deriveTyreSetSummaries(tyreSets, records, currentVehicleOdometer, latestLoggedOdometer),
        [tyreSets, records, currentVehicleOdometer, latestLoggedOdometer]
    );

    const tyreSetById = useMemo(
        () => new Map(tyreSets.map((tyreSet) => [tyreSet.id, tyreSet])),
        [tyreSets]
    );

    const mountedTyreSet = useMemo(
        () => tyreSetSummaries.find((summary) => summary.derivedStatus === 'mounted') || null,
        [tyreSetSummaries]
    );

    const storedTyreSets = useMemo(
        () => tyreSetSummaries.filter((summary) => summary.derivedStatus === 'stored'),
        [tyreSetSummaries]
    );

    const seasonalDistanceEstimate = useMemo(
        () => tyreSetSummaries.reduce((sum, summary) => sum + summary.totalMileageKm, 0),
        [tyreSetSummaries]
    );

    const unknownRotationCount = useMemo(
        () => records.filter((record) =>
            isTyreLinkedRecord(record.service_type) && record.rotation_status === 'unknown'
        ).length,
        [records]
    );

    const handleQuickAdd = (serviceType: MaintenanceServiceType, title: string) => {
        setGuideModalOpen(false);
        setRecordModalOpen(true);
        setMaintenanceForm((current) => ({
            ...createDefaultMaintenanceForm(current.startDate || getTodayDate()),
            serviceType,
            title,
            tyreSetId: current.tyreSetId || mountedTyreSet?.id || '',
            costCurrency: current.costCurrency || preferredCurrency || 'CHF',
            rotationStatus: serviceType === 'tyre_rotation' ? 'rotated' : current.rotationStatus,
        }));
        setRecordSuccess(null);
    };

    const handleSaveMaintenanceRecord = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRecordSaving(true);
        setRecordError(null);
        setRecordSuccess(null);

        try {
            let tyreSetId = maintenanceForm.tyreSetId;

            if (showTyreSetPicker && maintenanceForm.createTyreSet) {
                if (!maintenanceForm.newTyreSetName.trim()) {
                    setRecordError('New tyre set name is required');
                    return;
                }

                const purchaseOdometerKm = showTyreFields
                    ? parseDistanceInputValue(maintenanceForm.startOdometerKm, units)
                    : parseDistanceInputValue(maintenanceForm.endOdometerKm, units);

                const tyreSetResponse = await fetch('/api/maintenance/tyre-sets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: maintenanceForm.newTyreSetName.trim(),
                        season: maintenanceForm.season,
                        purchaseDate: maintenanceForm.startDate || null,
                        purchaseOdometerKm: purchaseOdometerKm || null,
                        notes: maintenanceForm.newTyreSetNotes.trim() || null,
                    }),
                });
                const tyreSetData = await tyreSetResponse.json();

                if (!tyreSetResponse.ok || !tyreSetData.success) {
                    setRecordError(tyreSetData.error || 'Failed to create tyre set');
                    return;
                }

                const newTyreSet = tyreSetData.tyreSet as TyreSet;
                setTyreSets((current) => [newTyreSet, ...current]);
                tyreSetId = newTyreSet.id;
                invalidateCachedJson(MAINTENANCE_BOOTSTRAP_CACHE_KEY);
            }

            const isEditing = Boolean(maintenanceForm.id);
            const response = await fetch(isEditing ? `/api/maintenance/${maintenanceForm.id}` : '/api/maintenance', {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...maintenanceForm,
                    startOdometerKm: parseDistanceInputValue(maintenanceForm.startOdometerKm, units),
                    endOdometerKm: parseDistanceInputValue(maintenanceForm.endOdometerKm, units),
                    tyreSetId,
                }),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                setRecordError(data.error || 'Failed to save maintenance record');
                return;
            }

            setMaintenanceForm((current) => createDefaultMaintenanceForm(current.startDate || getTodayDate()));
            setRecordSuccess(isEditing ? 'Maintenance record updated.' : 'Maintenance record saved.');
            invalidateCachedJson(MAINTENANCE_BOOTSTRAP_CACHE_KEY);
            void loadPageData(undefined, { showLoading: false });
        } catch {
            setRecordError('Failed to save maintenance record');
        } finally {
            setRecordSaving(false);
        }
    };

    const handleEditRecord = (record: MaintenanceRecord) => {
        setRecordModalOpen(true);
        setRecordError(null);
        setRecordSuccess(null);
        setMaintenanceForm(createMaintenanceFormFromRecord(record, units));
    };

    const handleCancelEdit = () => {
        setMaintenanceForm({
            ...createDefaultMaintenanceForm(getTodayDate()),
            costCurrency: preferredCurrency || 'CHF',
        });
        setRecordError(null);
        setRecordSuccess(null);
    };

    const handleDeleteTyreSet = async (tyreSet: TyreSet) => {
        const confirmed = window.confirm(
            `Delete "${tyreSet.name}"? Linked maintenance records will stay in history and be unlinked from this tyre set.`
        );

        if (!confirmed) {
            return;
        }

        setDeletingTyreSetId(tyreSet.id);
        setPageError(null);

        try {
            const response = await fetch(`/api/maintenance/tyre-sets/${tyreSet.id}`, {
                method: 'DELETE',
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                setPageError(data.error || 'Failed to delete tyre set');
                return;
            }

            if (maintenanceForm.tyreSetId === tyreSet.id) {
                setMaintenanceForm((current) => ({
                    ...current,
                    tyreSetId: '',
                }));
            }

            invalidateCachedJson(MAINTENANCE_BOOTSTRAP_CACHE_KEY);
            void loadPageData(undefined, { showLoading: false });
        } catch {
            setPageError('Failed to delete tyre set');
        } finally {
            setDeletingTyreSetId(null);
        }
    };

    const showTyreFields = isTyreSeasonRecord(maintenanceForm.serviceType);
    const showTyreSetPicker = isTyreLinkedRecord(maintenanceForm.serviceType);

    return (
        <div className="min-h-screen">
            <Header />

            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-8 max-w-3xl">
                    <h1 className="text-3xl font-semibold tracking-tight text-white">Maintenance</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        See what is mounted, what is in storage, and log seasonal swaps, rotations, and service cost in one place.
                    </p>
                </div>

                {pageError && (
                    <div className="mb-6">
                        <InlineMessage tone="error" message={pageError} />
                    </div>
                )}

                <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        icon={mountedTyreSet?.season === 'winter' ? <Snowflake className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        label="Currently mounted"
                        value={mountedTyreSet?.name || 'No open set'}
                        valueClassName="text-xl leading-tight md:text-[1.375rem] xl:whitespace-nowrap"
                        helper={mountedTyreSet?.currentMountedMileageKm != null
                            ? `Current stint ${formatDistanceValue(mountedTyreSet.currentMountedMileageKm, units)}`
                            : 'Add an open seasonal record'}
                    />
                    <SummaryCard
                        icon={<Package className="h-4 w-4" />}
                        label="In storage"
                        value={`${storedTyreSets.length} set${storedTyreSets.length === 1 ? '' : 's'}`}
                        helper={storedTyreSets[0]
                            ? `${storedTyreSets[0].name} ${formatDistanceValue(storedTyreSets[0].totalMileageKm, units)}`
                            : 'No active stored sets'}
                    />
                    <SummaryCard
                        icon={<Gauge className="h-4 w-4" />}
                        label="Current odometer"
                        value={currentVehicleOdometer != null
                            ? formatDistanceValue(Math.round(currentVehicleOdometer), units)
                            : latestLoggedOdometer != null
                                ? formatDistanceValue(latestLoggedOdometer, units)
                                : 'Not available'}
                        helper={currentVehicleOdometer != null ? 'Live telemetry' : 'Using last logged changeover'}
                    />
                    <SummaryCard
                        icon={<Wrench className="h-4 w-4" />}
                        label="Tracked tyre mileage"
                        value={formatDistanceValue(seasonalDistanceEstimate, units)}
                        helper={unknownRotationCount > 0
                            ? `${unknownRotationCount} rotation status${unknownRotationCount === 1 ? '' : 'es'} to review`
                            : 'Rotation history looks complete'}
                    />
                </div>

                <div className="mb-6 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => setRecordModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:shadow-red-500/30"
                    >
                        <Plus className="h-4 w-4" />
                        Maintenance record
                    </button>
                    <button
                        type="button"
                        onClick={() => setGuideModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800/45"
                    >
                        <BookOpen className="h-4 w-4" />
                        Tesla maintenance guide
                    </button>
                </div>

                <section className="mb-6">
                    <SectionHeader
                        title="Tyre sets"
                        description="Mounted and stored sets across the full width, with total mileage as the headline and the key lifecycle details underneath."
                        meta={`${tyreSetSummaries.length} sets`}
                        fullWidthDescription
                    />

                    {loading ? (
                        <LoadingState />
                    ) : tyreSetSummaries.length === 0 ? (
                        <EmptyState message="No tyre sets yet. Add your summer or winter set to start tracking mounted and stored mileage." />
                    ) : (
                        <div className="grid gap-5 xl:grid-cols-2">
                            {tyreSetSummaries.map((summary) => (
                                <article
                                    key={summary.id}
                                    className="relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/10 p-5"
                                >
                                    <span className={`absolute inset-y-0 left-0 w-1 ${getTyreSetMarkerClass(summary.derivedStatus, summary.season)}`} />

                                    <div className="flex items-start justify-between gap-4 pl-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Pill className={getSeasonBadgeClass(summary.season)}>
                                                    {seasonLabels[summary.season]}
                                                </Pill>
                                                <Pill className={getStatusBadgeClass(summary.derivedStatus)}>
                                                    {formatTyreSetStatus(summary.derivedStatus)}
                                                </Pill>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTyreSet(summary)}
                                            disabled={deletingTyreSetId === summary.id}
                                            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-800/40 hover:text-rose-300 disabled:opacity-50"
                                        >
                                            {deletingTyreSetId === summary.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>

                                    <div className="mt-4 grid gap-4 pl-2 lg:grid-cols-[minmax(0,1fr)_168px] lg:items-start">
                                        <div className="min-w-0">
                                            <h3 className="text-xl font-semibold leading-[1.15] tracking-tight text-white md:text-[1.375rem]">
                                                {summary.name}
                                            </h3>
                                            <p className="mt-3 text-sm leading-6 text-slate-400">
                                                {summary.latestRecord
                                                    ? `Last mounted ${formatCompactDate(summary.latestRecord.start_date)}`
                                                    : 'No seasonal history logged yet'}
                                            </p>
                                        </div>

                                        <div className="text-left lg:text-right">
                                            <div className="flex items-end gap-2 lg:justify-end">
                                                <div className="text-xl font-semibold tabular-nums tracking-tight text-white md:text-[1.375rem]">
                                                    {KM_NUMBER_FORMATTER.format(Math.round(toDisplayDistanceNumber(summary.totalMileageKm, units)))}
                                                </div>
                                                <div className="pb-0.5 text-sm text-slate-400">{distanceUnitLabel}</div>
                                            </div>
                                            <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Total mileage</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 border-t border-slate-700/50 pt-4 pl-2 sm:grid-cols-3">
                                        <InlineMetric
                                            label="Current stint"
                                            value={summary.currentMountedMileageKm != null ? formatDistanceValue(summary.currentMountedMileageKm, units) : 'Not mounted'}
                                        />
                                        <InlineMetric
                                            label="Started at"
                                            value={summary.firstMountedOdometerKm != null ? formatDistanceValue(summary.firstMountedOdometerKm, units) : 'Not set'}
                                        />
                                        <InlineMetric
                                            label="Last mounted"
                                            value={summary.latestRecord ? formatCompactDate(summary.latestRecord.start_date) : 'Not logged'}
                                        />
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <SectionHeader
                        title="Service history"
                        description="Full-width maintenance cards with the record details, dates, odometer values, and cost aligned for scanning."
                        meta={`${maintenanceSummary?.totalRecords ?? historyRecords.length} records`}
                        fullWidthDescription
                    />

                    {loading ? (
                        <LoadingState />
                    ) : historyRecords.length === 0 ? (
                        <EmptyState message="No maintenance records yet." />
                    ) : (
                        <div>
                            <VirtualizedList
                                key={`maintenance:${historyRecords[0]?.id || 'empty'}:${historyRecords[historyRecords.length - 1]?.id || 'empty'}:${historyRecords.length}`}
                                items={historyRecords}
                                getItemKey={(record) => record.id}
                                estimateHeight={() => 184}
                                overscanPx={1000}
                                renderItem={(record) => {
                                    const linkedTyreSet = record.tyre_set_id ? (tyreSetById.get(record.tyre_set_id) || null) : null;

                                    return (
                                        <div className="pb-4">
                                            <article
                                                className={`rounded-xl border border-slate-700/50 bg-slate-900/20 p-5 border-l-2 ${getRecordBorderClass(record)}`}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-3 flex flex-wrap items-center gap-2">
                                                            <Pill className="border-slate-600/80 bg-slate-800/80 text-slate-200">
                                                                {serviceTypeLabels[record.service_type]}
                                                            </Pill>
                                                            {linkedTyreSet && (
                                                                <Pill className="border-slate-600/80 bg-slate-800/80 text-slate-300">
                                                                    {linkedTyreSet.name}
                                                                </Pill>
                                                            )}
                                                        </div>

                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="min-w-0">
                                                                <h3 className="text-lg font-semibold leading-6 text-white">{record.title}</h3>
                                                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                                                                    {record.season && (
                                                                        <span>{seasonLabels[record.season]} set</span>
                                                                    )}
                                                                    {record.rotation_status !== 'not_applicable' && (
                                                                        <span className={record.rotation_status === 'unknown' ? 'text-amber-300' : 'text-slate-400'}>
                                                                            Rotation {rotationLabels[record.rotation_status]}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditRecord(record)}
                                                                className="shrink-0 rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
                                                            >
                                                                Edit
                                                            </button>
                                                        </div>

                                                        <div className="mt-4 flex flex-col gap-2 border-t border-slate-700/50 pt-4 text-sm md:flex-row md:items-center md:justify-between">
                                                            <div className="text-slate-300">
                                                                {formatDate(record.start_date)}
                                                                {record.end_date ? ` to ${formatDate(record.end_date)}` : ' onward'}
                                                            </div>
                                                            <div className="text-left tabular-nums text-slate-400 md:text-right">
                                                                {buildRecordMeta(record, units, preferredCurrency).join(' • ') || 'No odometer or cost logged'}
                                                            </div>
                                                        </div>

                                                        {record.notes && (
                                                            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{record.notes}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        </div>
                                    );
                                }}
                            />
                            {historyHasMore && (
                                <div ref={historyLoadMoreRef} className="flex items-center justify-center py-4 text-sm text-slate-500">
                                    {historyLoadingMore ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading more records...
                                        </span>
                                    ) : (
                                        'Scroll for more history'
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </main>

            {(recordModalOpen || recordSaving || recordError || recordSuccess) && (
                <MaintenanceRecordModal
                    open={recordModalOpen}
                    onClose={() => setRecordModalOpen(false)}
                    onSubmit={handleSaveMaintenanceRecord}
                    maintenanceForm={maintenanceForm}
                    setMaintenanceForm={setMaintenanceForm}
                    mountedTyreSetId={mountedTyreSet?.id || ''}
                    tyreSets={tyreSets}
                    units={units}
                    preferredCurrency={preferredCurrency}
                    recordSaving={recordSaving}
                    recordError={recordError}
                    recordSuccess={recordSuccess}
                    onCancelEdit={handleCancelEdit}
                />
            )}

            {guideModalOpen && (
                <MaintenanceGuideModal
                    open={guideModalOpen}
                    onClose={() => setGuideModalOpen(false)}
                    onQuickAdd={handleQuickAdd}
                    tyreRecordCount={maintenanceSummary?.tyreRecords ?? records.length}
                    otherRecordCount={maintenanceSummary?.otherRecords ?? Math.max(0, historyRecords.length - records.length)}
                />
            )}
        </div>
    );
}

function SummaryCard({
    icon,
    label,
    value,
    helper,
    valueClassName,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    helper: string;
    valueClassName?: string;
}) {
    return (
        <div className="flex min-h-[148px] flex-col rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-900/35 text-red-400">
                {icon}
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-3 font-semibold tracking-tight text-white ${valueClassName || 'text-2xl'}`}>{value}</p>
            <p className="mt-auto pt-4 text-sm leading-6 text-slate-400">{helper}</p>
        </div>
    );
}

function SectionHeader({
    title,
    description,
    meta,
    fullWidthDescription = false,
}: {
    title: string;
    description: string;
    meta?: string;
    fullWidthDescription?: boolean;
}) {
    return (
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className={fullWidthDescription ? 'max-w-none flex-1 pr-4' : 'max-w-2xl'}>
                <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
            </div>
            {meta && (
                <div className="shrink-0 rounded-full border border-slate-700/50 bg-slate-900/25 px-3 py-1 text-xs font-medium text-slate-400">
                    {meta}
                </div>
            )}
        </div>
    );
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/20 p-6 text-sm leading-6 text-slate-400">
            {message}
        </div>
    );
}

function Pill({
    children,
    className,
}: {
    children: React.ReactNode;
    className: string;
}) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
            {children}
        </span>
    );
}

function InlineMetric({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div>
            <div className="text-sm font-medium leading-5 text-slate-100">{value}</div>
            <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
        </div>
    );
}

function InlineMessage({
    tone,
    message,
}: {
    tone: 'error' | 'success';
    message: string;
}) {
    const toneClass = tone === 'error'
        ? 'border border-red-500/20 bg-red-500/10 text-red-300'
        : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300';

    return (
        <div className={`rounded-xl px-4 py-3 text-sm ${toneClass}`}>
            {message}
        </div>
    );
}
