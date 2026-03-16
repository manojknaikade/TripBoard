'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { handleSignOut } from '@/lib/utils/auth';
import { useVehicleStore } from '@/stores/vehicleStore';
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
    Car,
    ChevronDown,
} from 'lucide-react';

const FOCUS_RING_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

const NotificationBell = dynamic(() => import('@/components/NotificationBell'), {
    ssr: false,
});

export default function Header() {
    const pathname = usePathname();
    const vehicles = useVehicleStore((state) => state.vehicles);
    const selectedVehicleId = useVehicleStore((state) => state.selectedVehicleId);
    const selectVehicle = useVehicleStore((state) => state.selectVehicle);
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
        <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
                {/* Logo */}
                <div className="flex shrink-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/15">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-xl font-semibold text-transparent">TripBoard</span>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
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
                    {vehicles.length > 0 && (
                        <VehicleSelector
                            vehicles={vehicles}
                            selectedVehicleId={selectedVehicleId}
                            onChange={selectVehicle}
                        />
                    )}
                    <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />} active={pathname === '/dashboard/settings'}>
                        Settings
                    </NavLink>
                </nav>

                {/* Desktop Notification Bell + Sign Out */}
                <div className="hidden md:flex shrink-0 items-center gap-2">
                    {isDesktop ? <NotificationBell /> : null}
                    <button
                        onClick={handleSignOut}
                        className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white ${FOCUS_RING_CLASS}`}
                    >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                    </button>
                </div>

                {/* Mobile Hamburger Button */}
                <button
                    onClick={toggleMobileMenu}
                    className={`flex items-center justify-center rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white md:hidden ${FOCUS_RING_CLASS}`}
                    aria-label="Toggle mobile menu"
                >
                    {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
            </div>

            {/* Mobile Navigation Menu */}
            {isMobileMenuOpen && (
                <div className="absolute w-full border-t border-slate-700/50 bg-slate-950 px-4 py-4 shadow-2xl md:hidden">
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
                        {vehicles.length > 0 && (
                            <VehicleSelector
                                vehicles={vehicles}
                                selectedVehicleId={selectedVehicleId}
                                onChange={selectVehicle}
                                mobile
                            />
                        )}
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
                            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${FOCUS_RING_CLASS}`}
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

function VehicleSelector({
    vehicles,
    selectedVehicleId,
    onChange,
    mobile = false,
}: {
    vehicles: Array<{ id: string; display_name: string }>;
    selectedVehicleId: string | null;
    onChange: (id: string) => void;
    mobile?: boolean;
}) {
    return (
        <div className={`relative shrink-0 ${mobile ? 'w-full' : 'w-[180px]'}`}>
            <Car className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${mobile ? 'text-slate-400' : 'text-red-400'}`} />
            <select
                value={selectedVehicleId ?? vehicles[0]?.id ?? ''}
                onChange={(e) => onChange(e.target.value)}
                className={`h-10 w-full appearance-none rounded-xl border border-slate-700/80 bg-slate-900/55 pl-11 pr-10 text-sm text-white transition-colors hover:border-slate-600 ${mobile ? 'mt-2 h-12 rounded-2xl bg-slate-900/80 text-base' : ''} ${FOCUS_RING_CLASS}`}
                aria-label="Select vehicle"
            >
                {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.display_name}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
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
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${active
                ? 'border border-red-500/20 bg-slate-800/85 text-white'
                : 'border border-transparent text-slate-300 hover:bg-slate-800/70 hover:text-white'
                } ${FOCUS_RING_CLASS}`}
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
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 ${active
                ? 'border border-red-500/20 bg-slate-800/85 text-white'
                : 'border border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
                } ${FOCUS_RING_CLASS}`}
        >
            {icon}
            {children}
        </Link>
    );
}
