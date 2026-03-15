'use client';

import { X } from 'lucide-react';
import { TESLA_MAINTENANCE_GUIDE, type MaintenanceServiceType } from '@/lib/maintenance';

type MaintenanceGuideModalProps = {
    open: boolean;
    onClose: () => void;
    onQuickAdd: (serviceType: MaintenanceServiceType, title: string) => void;
    tyreRecordCount: number;
    otherRecordCount: number;
};

const SUBTLE_PANEL_CLASS = 'rounded-xl border border-slate-700/50 bg-slate-900/25';

export default function MaintenanceGuideModal({
    open,
    onClose,
    onQuickAdd,
    tyreRecordCount,
    otherRecordCount,
}: MaintenanceGuideModalProps) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/95 shadow-2xl shadow-black/40">
                <div className="flex items-start justify-between gap-4 border-b border-slate-700/50 px-6 py-5">
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-tight text-white">Tesla maintenance guide</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                            Reference items you can turn into a maintenance record with one click.
                        </p>
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
                    <div className="space-y-3">
                        {TESLA_MAINTENANCE_GUIDE.map((item) => (
                            <button
                                key={item.title}
                                type="button"
                                onClick={() => onQuickAdd(item.serviceType, item.title)}
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
                            Tyre records: {tyreRecordCount}. Other maintenance records: {otherRecordCount}.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
