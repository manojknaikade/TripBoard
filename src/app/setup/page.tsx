'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Globe } from 'lucide-react';

export default function SetupPage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [region, setRegion] = useState('eu');
    const [domain, setDomain] = useState('');

    const handleRegister = async () => {
        if (!domain) {
            setResult({ success: false, message: 'Please enter your domain from Tesla Developer Portal' });
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const response = await fetch(`/api/tesla/register?region=${region}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            const data = await response.json();

            if (data.success) {
                setResult({ success: true, message: data.message });
            } else {
                setResult({ success: false, message: data.error || 'Registration failed' });
            }
        } catch {
            setResult({ success: false, message: 'Network error' });
        }

        setLoading(false);
    };

    const handleTest = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/tesla/vehicles?summary=1&region=${region}`);
            const data = await response.json();

            if (data.success) {
                setResult({
                    success: true,
                    message: `Connected! Found ${data.count} vehicle(s): ${data.vehicles.map((v: { display_name: string }) => v.display_name).join(', ')}`,
                });
            } else {
                setResult({ success: false, message: data.error });
            }
        } catch {
            setResult({ success: false, message: 'Network error' });
        }
        setLoading(false);
    };

    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-500/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <Link
                    href="/dashboard"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                </Link>

                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 backdrop-blur-xl">
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Globe className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Tesla API Setup</h1>
                            <p className="text-sm text-slate-400">Register with Fleet API</p>
                        </div>
                    </div>

                    {/* Domain Input */}
                    <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-slate-300">
                            Your Domain (from Tesla Developer Portal)
                        </label>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="e.g., myapp.vercel.app"
                            className="w-full rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-red-500"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            This must match the domain in your Tesla app settings
                        </p>
                    </div>

                    {/* Region Selection */}
                    <div className="mb-6">
                        <label className="mb-2 block text-sm font-medium text-slate-300">
                            Region
                        </label>
                        <div className="flex gap-2">
                            {[
                                { id: 'na', label: 'North America' },
                                { id: 'eu', label: 'Europe (CH)' },
                                { id: 'cn', label: 'China' },
                            ].map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setRegion(r.id)}
                                    className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${region === r.id
                                            ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="space-y-3">
                        <button
                            onClick={handleRegister}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Register App with Tesla'}
                        </button>

                        <button
                            onClick={handleTest}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700/50 py-3 font-semibold text-slate-300 transition-all hover:bg-slate-600/50 disabled:opacity-50"
                        >
                            Test Connection
                        </button>
                    </div>

                    {/* Result */}
                    {result && (
                        <div
                            className={`mt-6 flex items-start gap-3 rounded-xl p-4 ${result.success
                                    ? 'bg-green-500/10 text-green-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}
                        >
                            {result.success ? (
                                <CheckCircle className="h-5 w-5 flex-shrink-0" />
                            ) : (
                                <XCircle className="h-5 w-5 flex-shrink-0" />
                            )}
                            <p className="text-sm">{result.message}</p>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
