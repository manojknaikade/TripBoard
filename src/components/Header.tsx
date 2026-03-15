'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { handleSignOut } from '@/lib/utils/auth';
import {
    Zap,
    Gauge,
    History,
    BarChart3,
    Settings,
    Wrench,
    LogOut,
    Menu,
    X,
} from 'lucide-react';

const NotificationBell = dynamic(() => import('@/components/NotificationBell'), {
    ssr: false,
});

export default function Header() {
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

        syncDesktopState();
        mediaQuery.addEventListener('change', syncDesktopState);

        return () => mediaQuery.removeEventListener('change', syncDesktopState);
    }, []);

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    return (
        <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
                {/* Logo */}
                <div className="flex shrink-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/20">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">TripBoard</span>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex flex-1 items-center justify-center gap-2">
                    <NavLink href="/dashboard" icon={<Gauge className="h-4 w-4" />} active={pathname === '/dashboard'}>
                        Dashboard
                    </NavLink>
                    <NavLink href="/dashboard/trips" icon={<History className="h-4 w-4" />} active={pathname?.startsWith('/dashboard/trips')}>
                        Trips
                    </NavLink>
                    <NavLink href="/dashboard/charging" icon={<Zap className="h-4 w-4" />} active={pathname?.startsWith('/dashboard/charging')}>
                        Charging
                    </NavLink>
                    <NavLink href="/dashboard/analytics" icon={<BarChart3 className="h-4 w-4" />} active={pathname?.startsWith('/dashboard/analytics')}>
                        Analytics
                    </NavLink>
                    <NavLink href="/dashboard/maintenance" icon={<Wrench className="h-4 w-4" />} active={pathname?.startsWith('/dashboard/maintenance')}>
                        Maintenance
                    </NavLink>
                    <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />} active={pathname === '/dashboard/settings'}>
                        Settings
                    </NavLink>
                </nav>

                {/* Desktop Notification Bell + Sign Out */}
                <div className="hidden md:flex shrink-0 items-center gap-2">
                    {isDesktop ? <NotificationBell /> : null}
                    <button
                        onClick={handleSignOut}
                        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                    </button>
                </div>

                {/* Mobile Hamburger Button */}
                <button
                    onClick={toggleMobileMenu}
                    className="flex md:hidden items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    aria-label="Toggle mobile menu"
                >
                    {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            </div>

            {/* Mobile Navigation Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden border-t border-slate-700/50 bg-slate-900 px-4 py-4 absolute w-full shadow-2xl">
                    <nav className="flex flex-col gap-2">
                        <MobileNavLink
                            href="/dashboard"
                            icon={<Gauge className="h-5 w-5" />}
                            active={pathname === '/dashboard'}
                            onClick={toggleMobileMenu}
                        >
                            Dashboard
                        </MobileNavLink>
                        <MobileNavLink
                            href="/dashboard/trips"
                            icon={<History className="h-5 w-5" />}
                            active={pathname?.startsWith('/dashboard/trips')}
                            onClick={toggleMobileMenu}
                        >
                            Trips
                        </MobileNavLink>
                        <MobileNavLink
                            href="/dashboard/charging"
                            icon={<Zap className="h-5 w-5" />}
                            active={pathname?.startsWith('/dashboard/charging')}
                            onClick={toggleMobileMenu}
                        >
                            Charging
                        </MobileNavLink>
                        <MobileNavLink
                            href="/dashboard/analytics"
                            icon={<BarChart3 className="h-5 w-5" />}
                            active={pathname?.startsWith('/dashboard/analytics')}
                            onClick={toggleMobileMenu}
                        >
                            Analytics
                        </MobileNavLink>
                        <MobileNavLink
                            href="/dashboard/maintenance"
                            icon={<Wrench className="h-5 w-5" />}
                            active={pathname?.startsWith('/dashboard/maintenance')}
                            onClick={toggleMobileMenu}
                        >
                            Maintenance
                        </MobileNavLink>
                        <MobileNavLink
                            href="/dashboard/settings"
                            icon={<Settings className="h-5 w-5" />}
                            active={pathname === '/dashboard/settings'}
                            onClick={toggleMobileMenu}
                        >
                            Settings
                        </MobileNavLink>

                        <div className="h-px w-full bg-slate-700/50 my-2" />

                        <button
                            onClick={() => {
                                toggleMobileMenu();
                                handleSignOut();
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-base text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                        >
                            <LogOut className="h-5 w-5" />
                            Sign Out
                        </button>
                    </nav>
                </div>
            )}
        </header>
    );
}

function NavLink({
    href,
    icon,
    children,
    active,
}: {
    href: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <Link
            href={href}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${active
                ? 'bg-red-500/10 text-red-500 ring-1 ring-red-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
        >
            {icon}
            {children}
        </Link>
    );
}

function MobileNavLink({
    href,
    icon,
    children,
    active,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-all duration-200 ${active
                ? 'bg-red-500/10 text-red-500 border-l-2 border-red-500'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border-l-2 border-transparent'
                }`}
        >
            {icon}
            {children}
        </Link>
    );
}
