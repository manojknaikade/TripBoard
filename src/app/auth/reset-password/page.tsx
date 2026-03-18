import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Zap } from 'lucide-react';
import PasswordUpdateForm from '@/components/auth/PasswordUpdateForm';

export default function ResetPasswordPage() {
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
                            <h1 className="text-xl font-bold">Choose a new password</h1>
                            <p className="text-sm text-slate-400">
                                Your recovery session is active. Set the new password now.
                            </p>
                        </div>
                    </div>

                    <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        <div className="mb-2 flex items-center gap-2 font-medium">
                            <ShieldCheck className="h-4 w-4" />
                            Recovery session
                        </div>
                        <p>
                            Once saved, TripBoard will keep using your current signed-in session and the new password for future sign-ins.
                        </p>
                    </div>

                    <PasswordUpdateForm
                        mode="reset"
                        successRedirectTo="/dashboard"
                        successMessage="Password updated. Redirecting to your dashboard..."
                    />
                </div>
            </div>
        </main>
    );
}
