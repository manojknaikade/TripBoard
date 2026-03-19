export default function AnalyticsLoading() {
    return (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <section className="mb-6 rounded-[28px] border border-slate-700/50 bg-slate-800/30 px-6 py-5 shadow-[0_18px_56px_-44px_rgba(15,23,42,0.85)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-4">
                        <div className="h-10 w-64 animate-pulse rounded bg-slate-700/55" />
                        <div className="h-5 max-w-2xl animate-pulse rounded bg-slate-700/35" />
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                        {Array.from({ length: 4 }, (_, index) => (
                            <div
                                key={index}
                                className="h-10 w-28 animate-pulse rounded-full border border-slate-700/55 bg-slate-900/28"
                            />
                        ))}
                    </div>
                </div>
            </section>

            <div className="mb-6 flex flex-wrap gap-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <div
                        key={index}
                        className="h-11 w-36 animate-pulse rounded-full border border-slate-700/55 bg-slate-900/28"
                    />
                ))}
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => (
                    <div
                        key={index}
                        className="min-h-[10.75rem] rounded-[28px] border border-slate-700/50 bg-slate-800/30 p-5"
                    >
                        <div className="mb-5 h-11 w-11 animate-pulse rounded-2xl bg-slate-700/45" />
                        <div className="h-3 w-24 animate-pulse rounded bg-slate-700/35" />
                        <div className="mt-4 h-10 w-28 animate-pulse rounded bg-slate-700/55" />
                        <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-700/30" />
                    </div>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[28px] border border-slate-700/50 bg-slate-800/30 p-6"
                    >
                        <div className="mb-6 h-6 w-40 animate-pulse rounded bg-slate-700/55" />
                        <div className="h-[250px] animate-pulse rounded-xl bg-slate-700/35" />
                    </div>
                ))}
            </div>
        </main>
    );
}
