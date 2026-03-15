'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { ChevronDown, Loader2, Plus, X } from 'lucide-react';
import {
    ROTATION_STATUS_OPTIONS,
    SERVICE_TYPE_OPTIONS,
    TYRE_SEASON_OPTIONS,
    isTyreLinkedRecord,
    isTyreSeasonRecord,
    type MaintenanceServiceType,
    type RotationStatus,
    type TyreSet,
} from '@/lib/maintenance';
import type { DistanceUnits, MaintenanceFormState } from '@/lib/maintenanceUi';

const SUBTLE_PANEL_CLASS = 'rounded-xl border border-slate-700/50 bg-slate-900/25';
const FIELD_CLASS = 'w-full rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-red-500';

type MaintenanceRecordModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    maintenanceForm: MaintenanceFormState;
    setMaintenanceForm: Dispatch<SetStateAction<MaintenanceFormState>>;
    mountedTyreSetId: string;
    tyreSets: TyreSet[];
    units: DistanceUnits;
    preferredCurrency: string;
    recordSaving: boolean;
    recordError: string | null;
    recordSuccess: string | null;
    onCancelEdit: () => void;
};

const seasonLabels = Object.fromEntries(
    TYRE_SEASON_OPTIONS.map((option) => [option.value, option.label])
) as Record<MaintenanceFormState['season'], string>;

export default function MaintenanceRecordModal({
    open,
    onClose,
    onSubmit,
    maintenanceForm,
    setMaintenanceForm,
    mountedTyreSetId,
    tyreSets,
    units,
    preferredCurrency,
    recordSaving,
    recordError,
    recordSuccess,
    onCancelEdit,
}: MaintenanceRecordModalProps) {
    if (!open) {
        return null;
    }

    const distanceUnitLabel = units === 'metric' ? 'km' : 'mi';
    const showTyreFields = isTyreSeasonRecord(maintenanceForm.serviceType);
    const showRotationStatus = maintenanceForm.serviceType === 'tyre_rotation' || showTyreFields;
    const showTyreSetPicker = isTyreLinkedRecord(maintenanceForm.serviceType);

    return (
        <ModalShell
            open={open}
            title={maintenanceForm.id ? 'Edit maintenance record' : 'Maintenance record'}
            description="Create or update a service entry. For tyre work, you can link an existing set or create a new one inline."
            onClose={onClose}
            maxWidthClass="max-w-3xl"
        >
            <form className="space-y-4" onSubmit={onSubmit}>
                <FormField label="Service type">
                    <SelectField
                        value={maintenanceForm.serviceType}
                        onChange={(event) => setMaintenanceForm((current) => ({
                            ...current,
                            serviceType: event.target.value as MaintenanceServiceType,
                            tyreSetId: isTyreLinkedRecord(event.target.value as MaintenanceServiceType)
                                ? (current.tyreSetId || mountedTyreSetId)
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
                            value={maintenanceForm.costCurrency || preferredCurrency}
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
                                    season: event.target.value as MaintenanceFormState['season'],
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
                            onClick={onCancelEdit}
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
