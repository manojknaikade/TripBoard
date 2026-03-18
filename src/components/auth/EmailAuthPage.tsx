'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, LockKeyhole, Mail, ShieldCheck, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type AuthMode = 'login' | 'signup';

type EmailAuthPageProps = {
    mode: AuthMode;
    nextPath?: string;
    initialError?: string | null;
    initialMessage?: string | null;
};

const MIN_PASSWORD_LENGTH = 8;

export default function EmailAuthPage({
    mode,
    nextPath = '/dashboard',
    initialError = null,
    initialMessage = null,
}: EmailAuthPageProps) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingAction, setLoadingAction] = useState<'password' | 'magic' | null>(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [error, setError] = useState<string | null>(initialError);
    const [message, setMessage] = useState<string | null>(initialMessage);

    const next = useMemo(() => nextPath || '/dashboard', [nextPath]);
    const isSignup = mode === 'signup';

    useEffect(() => {
        let active = true;
        const supabase = createClient();

        supabase.auth.getUser()
            .then(({ data: { user } }) => {
                if (!active) {
                    return;
                }

                if (user) {
                    router.replace(next);
                    return;
                }

                setCheckingSession(false);
            })
            .catch(() => {
                if (active) {
                    setCheckingSession(false);
                }
            });

        return () => {
            active = false;
        };
    }, [next, router]);

    useEffect(() => {
        setError(initialError);
    }, [initialError]);

    useEffect(() => {
        setMessage(initialMessage);
    }, [initialMessage]);

    function getCallbackRedirect(nextDestination: string) {
        const redirectTo = new URL('/auth/callback', window.location.origin);
        redirectTo.searchParams.set('next', nextDestination);
        return redirectTo.toString();
    }

    function validatePasswordForm() {
        if (password.length < MIN_PASSWORD_LENGTH) {
            return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        }

        if (isSignup && password !== confirmPassword) {
            return 'Passwords do not match.';
        }

        return null;
    }

    async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoadingAction('password');
        setError(null);
        setMessage(null);

        try {
            const supabase = createClient();

            if (isSignup) {
                const validationError = validatePasswordForm();
                if (validationError) {
                    throw new Error(validationError);
                }

                const { data, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: getCallbackRedirect(next),
                    },
                });

                if (authError) {
                    throw authError;
                }

                if (data.session) {
                    router.replace(next);
                    return;
                }

                setMessage('Check your email to confirm your account, then sign in with your password or a magic link.');
                return;
            }

            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                throw authError;
            }

            router.replace(next);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : (isSignup ? 'Unable to create account' : 'Unable to sign in')
            );
        } finally {
            setLoadingAction(null);
        }
    }

    async function handleMagicLink() {
        setLoadingAction('magic');
        setError(null);
        setMessage(null);

        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: getCallbackRedirect(next),
                    shouldCreateUser: isSignup,
                },
            });

            if (authError) {
                throw authError;
            }

            setMessage(
                isSignup
                    ? 'Check your email to confirm your account, then continue to TripBoard.'
                    : 'Check your email for your secure sign-in link.'
            );
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Unable to send the sign-in link'
            );
        } finally {
            setLoadingAction(null);
        }
    }

    if (checkingSession) {
        return (
            <main className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-red-500" />
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-red-500/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <Link
                    href="/"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to home
                </Link>

                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 backdrop-blur-xl">
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">
                                {isSignup ? 'Create your account' : 'Sign in securely'}
                            </h1>
                            <p className="text-sm text-slate-400">
                                {isSignup
                                    ? 'Use a password or magic link before linking Tesla.'
                                    : 'Use your password or a magic link, then connect Tesla inside TripBoard.'}
                            </p>
                        </div>
                    </div>

                    <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        <div className="mb-2 flex items-center gap-2 font-medium">
                            <ShieldCheck className="h-4 w-4" />
                            Secure flow
                        </div>
                        <p>
                            TripBoard uses Supabase native authentication for the app session.
                            Tesla OAuth is only used after sign-in to link your vehicle account.
                        </p>
                    </div>

                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label className="block text-sm font-medium text-slate-300">
                                    Password
                                </label>
                                {!isSignup ? (
                                    <Link
                                        href="/auth/forgot-password"
                                        className="text-xs text-red-400 hover:text-red-300"
                                    >
                                        Forgot password?
                                    </Link>
                                ) : null}
                            </div>
                            <div className="relative">
                                <LockKeyhole className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder={isSignup ? 'Create a password' : 'Enter your password'}
                                    required
                                    minLength={MIN_PASSWORD_LENGTH}
                                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                                    className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                />
                            </div>
                            {isSignup ? (
                                <p className="mt-2 text-xs text-slate-500">
                                    Minimum {MIN_PASSWORD_LENGTH} characters.
                                </p>
                            ) : null}
                        </div>

                        {isSignup ? (
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-300">
                                    Confirm password
                                </label>
                                <div className="relative">
                                    <LockKeyhole className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        placeholder="Repeat your password"
                                        required
                                        minLength={MIN_PASSWORD_LENGTH}
                                        autoComplete="new-password"
                                        className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                        ) : null}

                        {error ? (
                            <p className="text-sm text-red-400">{error}</p>
                        ) : null}

                        {message ? (
                            <p className="text-sm text-emerald-300">{message}</p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={loadingAction !== null || !email || !password || (isSignup && !confirmPassword)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:border-red-400 hover:shadow-xl disabled:opacity-50"
                        >
                            {loadingAction === 'password' ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    {isSignup ? 'Creating account...' : 'Signing in...'}
                                </>
                            ) : (
                                isSignup ? 'Create account with password' : 'Sign in with password'
                            )}
                        </button>
                    </form>

                    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                        <div className="h-px flex-1 bg-slate-700/60" />
                        Or
                        <div className="h-px flex-1 bg-slate-700/60" />
                    </div>

                    <button
                        type="button"
                        disabled={loadingAction !== null || !email}
                        onClick={handleMagicLink}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/35 py-3 font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800/50 disabled:opacity-50"
                    >
                        {loadingAction === 'magic' ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                Sending link...
                            </>
                        ) : (
                            isSignup ? 'Create account with magic link' : 'Email me a magic link'
                        )}
                    </button>

                    <p className="mt-6 text-center text-sm text-slate-400">
                        {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
                        <Link
                            href={isSignup ? `/auth/login?next=${encodeURIComponent(next)}` : `/auth/signup?next=${encodeURIComponent(next)}`}
                            className="text-red-400 hover:text-red-300"
                        >
                            {isSignup ? 'Sign in' : 'Create one'}
                        </Link>
                    </p>
                </div>
            </div>
        </main>
    );
}
