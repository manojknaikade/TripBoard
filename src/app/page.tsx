import Link from 'next/link';
import { Zap, Map, BarChart3 } from 'lucide-react';

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col">
            {/* Hero Section */}
            <section className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
                {/* Background gradient orbs */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-500/20 blur-3xl" />
                    <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
                </div>

                {/* Logo */}
                <div className="relative mb-8 flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/25">
                        <Zap className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight">TripBoard</h1>
                </div>

                {/* Tagline */}
                <p className="mb-12 max-w-xl text-center text-lg text-slate-400">
                    Your intelligent Tesla trip dashboard. Track every journey, monitor charging,
                    and analyze your driving efficiency—all in real-time.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-4 sm:flex-row">
                    <Link
                        href="/auth/login"
                        className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-8 py-3.5 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl hover:shadow-red-500/30"
                    >
                        <span className="relative z-10">Get Started</span>
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-red-600 to-red-700 transition-transform group-hover:translate-x-0" />
                    </Link>
                    <Link
                        href="/auth/api-key"
                        className="rounded-xl border border-slate-600 bg-slate-800/50 px-8 py-3.5 font-semibold text-slate-300 backdrop-blur-sm transition-all hover:border-slate-500 hover:bg-slate-700/50"
                    >
                        Use API Key
                    </Link>
                </div>

                {/* Feature Cards */}
                <div className="mt-24 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    <FeatureCard
                        icon={<Map className="h-6 w-6" />}
                        title="Trip History"
                        description="Detailed logs of every trip with routes, energy consumption, and efficiency metrics."
                    />
                    <FeatureCard
                        icon={<Zap className="h-6 w-6" />}
                        title="Charging Analytics"
                        description="Track charging sessions, costs, and find the most efficient charging patterns."
                    />
                    <FeatureCard
                        icon={<BarChart3 className="h-6 w-6" />}
                        title="Live Stats"
                        description="Real-time vehicle status with smart polling that respects your battery."
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-800 px-6 py-8">
                <div className="mx-auto flex max-w-5xl items-center justify-between">
                    <p className="text-sm text-slate-500">
                        © 2024 TripBoard. Powered by Tesla Fleet API.
                    </p>
                    <div className="flex gap-6">
                        <a href="#" className="text-sm text-slate-500 transition-colors hover:text-slate-300">
                            Privacy
                        </a>
                        <a href="#" className="text-sm text-slate-500 transition-colors hover:text-slate-300">
                            Terms
                        </a>
                    </div>
                </div>
            </footer>
        </main>
    );
}

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="group rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur-sm transition-all hover:border-slate-600 hover:bg-slate-800/50">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-700/50 text-red-400 transition-colors group-hover:bg-red-500/20">
                {icon}
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{description}</p>
        </div>
    );
}
