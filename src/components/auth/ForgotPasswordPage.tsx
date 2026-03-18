'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mail, ShieldCheck, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
        setMessage(null);
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const redirectTo = new URL('/auth/callback', window.location.origin);
            redirectTo.searchParams.set('next', '/auth/reset-password');

            const supabase = createClient();
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectTo.toString(),
            });

            if (authError) {
                throw authError;
            }

            setMessage('Check your email for the password reset link.');
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Unable to send the password reset email'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-500/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <Link
                    href="/auth/login"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                </Link>

                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 backdrop-blur-xl">
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Reset your password</h1>
                            <p className="text-sm text-slate-400">
                                Supabase will email you a secure recovery link.
                            </p>
                        </div>
                    </div>

                    <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        <div className="mb-2 flex items-center gap-2 font-medium">
                            <ShieldCheck className="h-4 w-4" />
                            Recovery flow
                        </div>
                        <p>
                            The reset link signs you into a short-lived recovery session so you can set a new password safely.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-300">
                                Email address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                    className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                        </div>

                        {error ? (
                            <p className="text-sm text-red-400">{error}</p>
                        ) : null}

                        {message ? (
                            <p className="text-sm text-emerald-300">{message}</p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:border-red-400 hover:shadow-xl disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Sending reset link...
                                </>
                            ) : (
                                'Send password reset email'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
