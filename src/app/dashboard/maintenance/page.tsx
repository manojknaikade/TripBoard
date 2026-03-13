'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    BookOpen,
    ChevronDown,
    CheckCircle2,
    Gauge,
    Loader2,
    Package,
    Plus,
    Snowflake,
    Sun,
    Wrench,
    X,
} from 'lucide-react';
import Header from '@/components/Header';
import { useSettingsStore } from '@/stores/settingsStore';
import {
    ROTATION_STATUS_OPTIONS,
    SERVICE_TYPE_OPTIONS,
    TESLA_MAINTENANCE_GUIDE,
    TYRE_SEASON_OPTIONS,
    isTyreLinkedRecord,
    isTyreSeasonRecord,
    type MaintenanceRecord,
    type MaintenanceServiceType,
    type RotationStatus,
    type TyreSeason,
    type TyreSet,
} from '@/lib/maintenance';

type DistanceUnits = 'imperial' | 'metric';

type MaintenanceFormState = {
    id: string | null;
    serviceType: MaintenanceServiceType;
    tyreSetId: string;
    createTyreSet: boolean;
    newTyreSetName: string;
    newTyreSetNotes: string;
    title: string;
    startDate: string;
    endDate: string;
    startOdometerKm: string;
    endOdometerKm: string;
    costAmount: string;
    costCurrency: string;
    season: TyreSeason;
    rotationStatus: RotationStatus;
    notes: string;
};

type TyreSetDerivedStatus = 'mounted' | 'stored' | 'retired';

type TyreSetSummary = TyreSet & {
    derivedStatus: TyreSetDerivedStatus;
    totalMileageKm: number;
    currentMountedMileageKm: number | null;
    latestRecord: MaintenanceRecord | null;
    firstMountedOdometerKm: number | null;
};

const KM_NUMBER_FORMATTER = new Intl.NumberFormat('en-CH');
const MILES_TO_KM = 1.60934;
const KM_TO_MI = 0.621371;
const SUBTLE_PANEL_CLASS = 'rounded-xl border border-slate-700/50 bg-slate-900/25';
const FIELD_CLASS = 'w-full rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-red-500';

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

function toKilometersFromMiles(value: number | null) {
    if (value == null) {
        return null;
    }

    return Math.round(value * MILES_TO_KM);
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

export default function MaintenancePage() {
    const { currency: preferredCurrency, units } = useSettingsStore();
    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [tyreSets, setTyreSets] = useState<TyreSet[]>([]);
    const [currentVehicleOdometer, setCurrentVehicleOdometer] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [deletingTyreSetId, setDeletingTyreSetId] = useState<string | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [recordSaving, setRecordSaving] = useState(false);
    const [recordError, setRecordError] = useState<string | null>(null);
    const [recordSuccess, setRecordSuccess] = useState<string | null>(null);
    const [recordModalOpen, setRecordModalOpen] = useState(false);
    const [guideModalOpen, setGuideModalOpen] = useState(false);
    const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>(() => createDefaultMaintenanceForm());
    const distanceUnitLabel = units === 'metric' ? 'km' : 'mi';

    useEffect(() => {
        setMaintenanceForm((current) => current.costCurrency ? current : { ...current, costCurrency: preferredCurrency || 'CHF' });
    }, [preferredCurrency]);

    const latestLoggedOdometer = useMemo(
        () => records.reduce<number | null>((highest, record) => {
            if (record.odometer_km == null) {
                return highest;
            }

            if (highest == null || record.odometer_km > highest) {
                return record.odometer_km;
            }

            return highest;
        }, null),
        [records]
    );

    const loadPageData = useCallback(async () => {
        setLoading(true);
        setPageError(null);

        try {
            const [recordsResponse, tyreSetsResponse, vehicleStatusResponse] = await Promise.all([
                fetch('/api/maintenance'),
                fetch('/api/maintenance/tyre-sets'),
                fetch('/api/vehicle/status').catch(() => null),
            ]);

            const recordsData = await recordsResponse.json();
            const tyreSetsData = await tyreSetsResponse.json();

            if (!recordsResponse.ok || !recordsData.success) {
                throw new Error(recordsData.error || 'Failed to load maintenance records');
            }

            if (!tyreSetsResponse.ok || !tyreSetsData.success) {
                throw new Error(tyreSetsData.error || 'Failed to load tyre sets');
            }

            const fetchedRecords = sortRecordsDesc(recordsData.records || []);
            const fetchedLatestLoggedOdometer = fetchedRecords.reduce<number | null>((highest, record) => {
                if (record.odometer_km == null) {
                    return highest;
                }

                if (highest == null || record.odometer_km > highest) {
                    return record.odometer_km;
                }

                return highest;
            }, null);

            setRecords(fetchedRecords);
            setTyreSets((tyreSetsData.tyreSets || []) as TyreSet[]);

            if (vehicleStatusResponse?.ok) {
                const vehicleStatusData = await vehicleStatusResponse.json();
                const rawOdometer = vehicleStatusData.odometer;
                const parsedOdometer = typeof rawOdometer === 'number'
                    ? rawOdometer
                    : typeof rawOdometer === 'string'
                        ? Number(rawOdometer)
                        : null;
                const convertedOdometer = parsedOdometer != null && Number.isFinite(parsedOdometer)
                    ? toKilometersFromMiles(parsedOdometer)
                    : null;
                const odometer = convertedOdometer != null && fetchedLatestLoggedOdometer != null
                    ? Math.max(convertedOdometer, fetchedLatestLoggedOdometer)
                    : convertedOdometer;
                setCurrentVehicleOdometer(odometer);
            } else {
                setCurrentVehicleOdometer(null);
            }
        } catch (error) {
            setPageError(error instanceof Error ? error.message : 'Failed to load maintenance data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setMaintenanceForm((current) => current.startDate ? current : { ...current, startDate: getTodayDate() });
        loadPageData();
    }, [loadPageData]);

    const tyreRecords = useMemo(
        () => records.filter((record) => isTyreLinkedRecord(record.service_type)),
        [records]
    );

    const otherRecords = useMemo(
        () => records.filter((record) => !isTyreLinkedRecord(record.service_type)),
        [records]
    );

    const tyreSetSummaries = useMemo(
        () => deriveTyreSetSummaries(tyreSets, records, currentVehicleOdometer, latestLoggedOdometer),
        [tyreSets, records, currentVehicleOdometer, latestLoggedOdometer]
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

            setRecords((current) => {
                const next = isEditing
                    ? current.map((record) => record.id === data.record.id ? data.record : record)
                    : [data.record, ...current];

                return sortRecordsDesc(next);
            });
            setMaintenanceForm((current) => createDefaultMaintenanceForm(current.startDate || getTodayDate()));
            setRecordSuccess(isEditing ? 'Maintenance record updated.' : 'Maintenance record saved.');
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

            setTyreSets((current) => current.filter((item) => item.id !== tyreSet.id));
            setRecords((current) => current.map((record) => (
                record.tyre_set_id === tyreSet.id
                    ? { ...record, tyre_set_id: null }
                    : record
            )));

            if (maintenanceForm.tyreSetId === tyreSet.id) {
                setMaintenanceForm((current) => ({
                    ...current,
                    tyreSetId: '',
                }));
            }
        } catch {
            setPageError('Failed to delete tyre set');
        } finally {
            setDeletingTyreSetId(null);
        }
    };

    const showTyreFields = isTyreSeasonRecord(maintenanceForm.serviceType);
    const showRotationStatus = maintenanceForm.serviceType === 'tyre_rotation' || showTyreFields;
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
                        meta={`${records.length} records`}
                        fullWidthDescription
                    />

                    {loading ? (
                        <LoadingState />
                    ) : records.length === 0 ? (
                        <EmptyState message="No maintenance records yet." />
                    ) : (
                        <div className="space-y-4">
                            {records.map((record) => {
                                const linkedTyreSet = tyreSets.find((tyreSet) => tyreSet.id === record.tyre_set_id) || null;

                                return (
                                    <article
                                        key={record.id}
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
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>

            <ModalShell
                open={recordModalOpen}
                title={maintenanceForm.id ? 'Edit maintenance record' : 'Maintenance record'}
                description="Create or update a service entry. For tyre work, you can link an existing set or create a new one inline."
                onClose={() => setRecordModalOpen(false)}
                maxWidthClass="max-w-3xl"
            >
                <form className="space-y-4" onSubmit={handleSaveMaintenanceRecord}>
                    <FormField label="Service type">
                        <SelectField
                            value={maintenanceForm.serviceType}
                            onChange={(event) => setMaintenanceForm((current) => ({
                                ...current,
                                serviceType: event.target.value as MaintenanceServiceType,
                                tyreSetId: isTyreLinkedRecord(event.target.value as MaintenanceServiceType)
                                    ? (current.tyreSetId || mountedTyreSet?.id || '')
                                    : '',
                            }))}
                        >
                            {SERVICE_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </SelectField>
                    </FormField>

                    {showTyreSetPicker && !maintenanceForm.createTyreSet && (
                        <FormField label="Tyre set">
                            <SelectField
                                value={maintenanceForm.tyreSetId}
                                onChange={(event) => {
                                    const tyreSet = tyreSets.find((item) => item.id === event.target.value) || null;

                                    setMaintenanceForm((current) => ({
                                        ...current,
                                        tyreSetId: event.target.value,
                                        season: tyreSet?.season || current.season,
                                    }));
                                }}
                            >
                                <option value="">Select tyre set</option>
                                {tyreSets.map((tyreSet) => (
                                    <option key={tyreSet.id} value={tyreSet.id}>
                                        {tyreSet.name} ({seasonLabels[tyreSet.season]})
                                    </option>
                                ))}
                            </SelectField>
                        </FormField>
                    )}

                    {showTyreSetPicker && (
                        <label className={`${SUBTLE_PANEL_CLASS} flex items-center gap-3 px-4 py-3 text-sm text-slate-300`}>
                            <input
                                type="checkbox"
                                checked={maintenanceForm.createTyreSet}
                                onChange={(event) => setMaintenanceForm((current) => ({
                                    ...current,
                                    createTyreSet: event.target.checked,
                                    tyreSetId: event.target.checked ? '' : current.tyreSetId,
                                }))}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-red-500 focus:ring-red-500"
                            />
                            <span>Create a new tyre set with this record</span>
                        </label>
                    )}

                    {showTyreSetPicker && maintenanceForm.createTyreSet && (
                        <div className="grid gap-4">
                            <FormField label="New tyre set name">
                                <input
                                    type="text"
                                    value={maintenanceForm.newTyreSetName}
                                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, newTyreSetName: event.target.value }))}
                                    placeholder="e.g. Michelin winter set"
                                    className={FIELD_CLASS}
                                />
                            </FormField>

                            <FormField label="New tyre set notes">
                                <textarea
                                    rows={3}
                                    value={maintenanceForm.newTyreSetNotes}
                                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, newTyreSetNotes: event.target.value }))}
                                    placeholder="Optional brand, size, or purchase note"
                                    className={FIELD_CLASS}
                                />
                            </FormField>
                        </div>
                    )}

                    <FormField label="Title">
                        <input
                            type="text"
                            value={maintenanceForm.title}
                            onChange={(event) => setMaintenanceForm((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Winter set installed"
                            className={FIELD_CLASS}
                        />
                    </FormField>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label={showTyreFields ? 'Installed on' : 'Service date'}>
                            <input
                                type="date"
                                value={maintenanceForm.startDate}
                                onChange={(event) => setMaintenanceForm((current) => ({ ...current, startDate: event.target.value }))}
                                className={FIELD_CLASS}
                            />
                        </FormField>

                        <FormField label={showTyreFields ? 'Removed on' : `Service odometer (${distanceUnitLabel})`}>
                            {showTyreFields ? (
                                <input
                                    type="date"
                                    value={maintenanceForm.endDate}
                                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, endDate: event.target.value }))}
                                    className={FIELD_CLASS}
                                />
                            ) : (
                                <input
                                    type="number"
                                    min="0"
                                    value={maintenanceForm.endOdometerKm}
                                    onChange={(event) => setMaintenanceForm((current) => ({ ...current, endOdometerKm: event.target.value }))}
                                    placeholder="Optional"
                                    className={FIELD_CLASS}
                                />
                            )}
                        </FormField>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                        <FormField label="Cost">
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={maintenanceForm.costAmount}
                                onChange={(event) => setMaintenanceForm((current) => ({ ...current, costAmount: event.target.value }))}
                                placeholder="Optional"
                                className={FIELD_CLASS}
                            />
                        </FormField>

                        <FormField label="Currency">
                            <input
                                type="text"
                                value={maintenanceForm.costCurrency}
                                onChange={(event) => setMaintenanceForm((current) => ({ ...current, costCurrency: event.target.value.toUpperCase() }))}
                                className={FIELD_CLASS}
                            />
                        </FormField>
                    </div>

                    {(showTyreFields || (showTyreSetPicker && maintenanceForm.createTyreSet)) && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField label="Season">
                                <SelectField
                                    value={maintenanceForm.season}
                                    onChange={(event) => setMaintenanceForm((current) => ({
                                        ...current,
                                        season: event.target.value as TyreSeason,
                                    }))}
                                >
                                    {TYRE_SEASON_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </SelectField>
                            </FormField>

                            {showTyreFields ? (
                                <FormField label={`Start odometer (${distanceUnitLabel})`}>
                                    <input
                                        type="number"
                                        min="0"
                                        value={maintenanceForm.startOdometerKm}
                                        onChange={(event) => setMaintenanceForm((current) => ({ ...current, startOdometerKm: event.target.value }))}
                                        placeholder="Optional"
                                        className={FIELD_CLASS}
                                    />
                                </FormField>
                            ) : (
                                <div className={`${SUBTLE_PANEL_CLASS} px-4 py-3 text-sm text-slate-400`}>
                                    New tyre sets will start from the service odometer entered for this record.
                                </div>
                            )}
                        </div>
                    )}

                    {showTyreFields && (
                        <FormField label={`End odometer (${distanceUnitLabel})`}>
                            <input
                                type="number"
                                min="0"
                                value={maintenanceForm.endOdometerKm}
                                onChange={(event) => setMaintenanceForm((current) => ({ ...current, endOdometerKm: event.target.value }))}
                                placeholder="Recorded at swap-out"
                                className={FIELD_CLASS}
                            />
                        </FormField>
                    )}

                    {showRotationStatus && (
                        <FormField label="Rotation status">
                            <SelectField
                                value={maintenanceForm.rotationStatus}
                                onChange={(event) => setMaintenanceForm((current) => ({
                                    ...current,
                                    rotationStatus: event.target.value as RotationStatus,
                                }))}
                            >
                                {ROTATION_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </SelectField>
                        </FormField>
                    )}

                    <FormField label="Notes">
                        <textarea
                            rows={4}
                            value={maintenanceForm.notes}
                            onChange={(event) => setMaintenanceForm((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Workshop, wear, or storage detail"
                            className={FIELD_CLASS}
                        />
                    </FormField>

                    {recordError && <InlineMessage tone="error" message={recordError} />}
                    {recordSuccess && <InlineMessage tone="success" message={recordSuccess} />}

                    <div className="flex gap-3">
                        {maintenanceForm.id && (
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/60"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={recordSaving}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:shadow-red-500/30 disabled:opacity-50"
                        >
                            {recordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {maintenanceForm.id ? 'Save changes' : 'Save record'}
                        </button>
                    </div>
                </form>
            </ModalShell>

            <ModalShell
                open={guideModalOpen}
                title="Tesla maintenance guide"
                description="Reference items you can turn into a maintenance record with one click."
                onClose={() => setGuideModalOpen(false)}
                maxWidthClass="max-w-2xl"
            >
                <div className="space-y-3">
                    {TESLA_MAINTENANCE_GUIDE.map((item) => (
                        <button
                            key={item.title}
                            type="button"
                            onClick={() => handleQuickAdd(item.serviceType, item.title)}
                            className="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-700/50 bg-slate-900/20 px-4 py-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/40"
                        >
                            <div>
                                <div className="font-medium text-white">{item.title}</div>
                                <div className="mt-1 text-sm text-slate-400">{item.cadence}</div>
                            </div>
                            <span className="text-xs font-medium text-red-300">Use in record</span>
                        </button>
                    ))}

                    <div className={`${SUBTLE_PANEL_CLASS} px-4 py-3 text-sm text-slate-400`}>
                        Tyre records: {tyreRecords.length}. Other maintenance records: {otherRecords.length}.
                    </div>
                </div>
            </ModalShell>
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

function FormField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
            {children}
        </label>
    );
}

function SelectField({
    value,
    onChange,
    children,
}: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={onChange}
                className={`${FIELD_CLASS} appearance-none pr-12`}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
    const isError = tone === 'error';

    return (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${isError
            ? 'border border-red-500/20 bg-red-500/10 text-red-300'
            : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            }`}
        >
            {isError
                ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <span>{message}</span>
        </div>
    );
}

function ModalShell({
    open,
    title,
    description,
    onClose,
    children,
    maxWidthClass = 'max-w-3xl',
}: {
    open: boolean;
    title: string;
    description: string;
    onClose: () => void;
    children: React.ReactNode;
    maxWidthClass?: string;
}) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
            <div className={`w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/95 shadow-2xl shadow-black/40`}>
                <div className="flex items-start justify-between gap-4 border-b border-slate-700/50 px-6 py-5">
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-2 text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
                        aria-label="Close dialog"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
                    {children}
                </div>
            </div>
        </div>
    );
}
