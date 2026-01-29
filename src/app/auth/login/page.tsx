'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap, Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push('/dashboard');
    };

    const handleSignUp = async () => {
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        setError('Check your email for a confirmation link!');
        setLoading(false);
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
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Welcome back</h1>
                            <p className="text-sm text-slate-400">Sign in to TripBoard</p>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-300">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-300">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className={`text-sm ${error.includes('Check your email') ? 'text-green-400' : 'text-red-400'}`}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="my-6 flex items-center gap-4">
                        <div className="h-px flex-1 bg-slate-700" />
                        <span className="text-sm text-slate-500">or</span>
                        <div className="h-px flex-1 bg-slate-700" />
                    </div>

                    {/* Connect with Tesla */}
                    <a
                        href="/api/auth/tesla"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700/50 py-3 font-semibold text-white transition-all hover:bg-slate-600/50 border border-slate-600"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.5c1.925 0 3.5 1.575 3.5 3.5 0 .725-.224 1.4-.6 1.962l1.6 2.038c.3.3.3.787 0 1.087l-1.6 1.6c-.3.3-.787.3-1.087 0l-1.6-1.6-1.6-1.6c-.3-.3-.3-.787 0-1.087l1.6-2.038A3.494 3.494 0 0 1 8.5 6c0-1.925 1.575-3.5 3.5-3.5z" />
                        </svg>
                        Connect with Tesla
                    </a>

                    {/* Sign up button */}
                    <button
                        onClick={handleSignUp}
                        disabled={loading || !email || !password}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700/50 py-3 font-semibold text-slate-300 transition-all hover:border-slate-500 hover:bg-slate-600/50 disabled:opacity-50"
                    >
                        Create Account
                    </button>

                    {/* API Key link */}
                    <p className="mt-6 text-center text-sm text-slate-400">
                        Have a Tesla API key?{' '}
                        <Link href="/auth/api-key" className="text-red-400 hover:text-red-300">
                            Use API Key instead
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    );
}
