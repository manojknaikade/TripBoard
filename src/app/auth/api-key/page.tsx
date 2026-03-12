'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Key, ArrowLeft, Loader2, Info } from 'lucide-react';

export default function ApiKeyPage() {
    const router = useRouter();
    const [accessToken, setAccessToken] = useState('');
    const [refreshToken, setRefreshToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/tesla/vehicles', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken, refreshToken }),
            });

            if (!response.ok) {
                throw new Error('Invalid token or API error');
            }

            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to validate token');
            setLoading(false);
        }
    };

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
                            <Key className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Use API Key</h1>
                            <p className="text-sm text-slate-400">Enter your Tesla API token</p>
                        </div>
                    </div>

                    {/* Info box */}
                    <div className="mb-6 flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                        <Info className="h-5 w-5 flex-shrink-0 text-blue-400" />
                        <p className="text-sm text-blue-300">
                            You can get your API token from the Tesla app or by using the{' '}
                            <a
                                href="https://developer.tesla.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-blue-200"
                            >
                                Tesla Developer Portal
                            </a>
                            .
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-300">
                                Access Token <span className="text-red-400">*</span>
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                <textarea
                                    value={accessToken}
                                    onChange={(e) => setAccessToken(e.target.value)}
                                    placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI..."
                                    required
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 font-mono text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-300">
                                Refresh Token <span className="text-slate-500">(optional)</span>
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                <textarea
                                    value={refreshToken}
                                    onChange={(e) => setRefreshToken(e.target.value)}
                                    placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI..."
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 font-mono text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                Provide a refresh token for automatic renewal
                            </p>
                        </div>

                        {error && (
                            <p className="text-sm text-red-400">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !accessToken}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Validating...
                                </>
                            ) : (
                                'Connect Vehicle'
                            )}
                        </button>
                    </form>

                    {/* Login link */}
                    <p className="mt-6 text-center text-sm text-slate-400">
                        Prefer email login?{' '}
                        <Link href="/auth/login" className="text-red-400 hover:text-red-300">
                            Sign in with email
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    );
}
