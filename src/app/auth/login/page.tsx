'use client';

import Link from 'next/link';
import { Zap, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            {/* Background effects */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-500/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Back link */}
                <Link
                    href="/"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to home
                </Link>

                {/* Card */}
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 backdrop-blur-xl">
                    {/* Header */}
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Welcome back</h1>
                            <p className="text-sm text-slate-400">Sign in to TripBoard</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Connect with Tesla */}
                        <a
                            href="/api/auth/tesla"
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl border border-transparent hover:border-red-400"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.5c1.925 0 3.5 1.575 3.5 3.5 0 .725-.224 1.4-.6 1.962l1.6 2.038c.3.3.3.787 0 1.087l-1.6 1.6c-.3.3-.787.3-1.087 0l-1.6-1.6-1.6-1.6c-.3-.3-.3-.787 0-1.087l1.6-2.038A3.494 3.494 0 0 1 8.5 6c0-1.925 1.575-3.5 3.5-3.5z" />
                            </svg>
                            Connect with Tesla
                        </a>

                        {/* API Key link */}
                        <p className="mt-6 text-center text-sm text-slate-400">
                            Have a Tesla API key?{' '}
                            <Link href="/auth/api-key" className="text-red-400 hover:text-red-300">
                                Use API Key instead
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
