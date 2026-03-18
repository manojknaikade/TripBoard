'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PasswordUpdateFormProps = {
    mode: 'reset' | 'change';
    successRedirectTo: string;
    successMessage?: string;
};

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordUpdateForm({
    mode,
    successRedirectTo,
    successMessage,
}: PasswordUpdateFormProps) {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [hasUser, setHasUser] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const supabase = createClient();

        supabase.auth.getUser()
            .then(({ data: { user } }) => {
                if (!active) {
                    return;
                }

                setHasUser(Boolean(user));
                setCheckingSession(false);
            })
            .catch(() => {
                if (active) {
                    setHasUser(false);
                    setCheckingSession(false);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({
                password,
            });

            if (updateError) {
                throw updateError;
            }

            const nextMessage = successMessage || 'Password updated successfully.';
            setMessage(nextMessage);

            window.setTimeout(() => {
                router.replace(successRedirectTo);
            }, 900);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : 'Unable to update password'
            );
        } finally {
            setLoading(false);
        }
    }

    if (checkingSession) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-red-500" />
            </div>
        );
    }

    if (!hasUser) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-400">
                    {mode === 'reset'
                        ? 'The recovery session is missing or has expired. Request a new reset link.'
                        : 'You need to be signed in before changing your password.'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href={mode === 'reset' ? '/auth/forgot-password' : '/auth/login'}
                        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                    >
                        {mode === 'reset' ? 'Request new reset link' : 'Sign in'}
                    </Link>
                    <Link
                        href="/"
                        className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                    >
                        Back home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                    New password
                </label>
                <div className="relative">
                    <LockKeyhole className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Create a new password"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                    Confirm new password
                </label>
                <div className="relative">
                    <LockKeyhole className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repeat the new password"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-slate-600 bg-slate-700/50 py-3 pl-11 pr-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Minimum {MIN_PASSWORD_LENGTH} characters.
                </p>
            </div>

            {error ? (
                <p className="text-sm text-red-400">{error}</p>
            ) : null}

            {message ? (
                <p className="text-sm text-emerald-300">{message}</p>
            ) : null}

            <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-red-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:border-red-400 hover:shadow-xl disabled:opacity-50"
            >
                {loading ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Updating password...
                    </>
                ) : (
                    mode === 'reset' ? 'Set new password' : 'Update password'
                )}
            </button>
        </form>
    );
}
