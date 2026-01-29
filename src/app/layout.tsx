import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export const metadata: Metadata = {
    title: 'TripBoard - Tesla Trip Dashboard',
    description: 'Track your Tesla trips, charging sessions, and vehicle analytics',
    keywords: ['Tesla', 'EV', 'Trip Tracker', 'Fleet API', 'Dashboard'],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable} suppressHydrationWarning>
            <body className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white antialiased">
                {children}
            </body>
        </html>
    );
}
