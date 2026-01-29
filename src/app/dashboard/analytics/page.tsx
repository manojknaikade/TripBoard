'use client';

import Link from 'next/link';
import {
    Zap,
    Gauge,
    History,
    BarChart3,
    Settings,
    LogOut,
    TrendingUp,
    TrendingDown,
    Battery,
    Navigation,
    Clock,
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
} from 'recharts';

// Mock analytics data
const weeklyData = [
    { day: 'Mon', distance: 45, energy: 12.5, trips: 4 },
    { day: 'Tue', distance: 32, energy: 8.2, trips: 3 },
    { day: 'Wed', distance: 28, energy: 7.1, trips: 2 },
    { day: 'Thu', distance: 52, energy: 14.3, trips: 5 },
    { day: 'Fri', distance: 38, energy: 9.8, trips: 3 },
    { day: 'Sat', distance: 65, energy: 17.2, trips: 6 },
    { day: 'Sun', distance: 22, energy: 5.5, trips: 2 },
];

const efficiencyData = [
    { time: '6am', efficiency: 248 },
    { time: '9am', efficiency: 275 },
    { time: '12pm', efficiency: 262 },
    { time: '3pm', efficiency: 258 },
    { time: '6pm', efficiency: 285 },
    { time: '9pm', efficiency: 252 },
];

const chargingMix = [
    { name: 'Home', value: 68, color: '#22c55e' },
    { name: 'Supercharger', value: 25, color: '#ef4444' },
    { name: 'Other', value: 7, color: '#6b7280' },
];

export default function AnalyticsPage() {
    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600">
                            <Zap className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xl font-bold">TripBoard</span>
                    </div>

                    <nav className="flex items-center gap-2">
                        <NavLink href="/dashboard" icon={<Gauge className="h-4 w-4" />}>
                            Dashboard
                        </NavLink>
                        <NavLink href="/dashboard/trips" icon={<History className="h-4 w-4" />}>
                            Trips
                        </NavLink>
                        <NavLink href="/dashboard/analytics" icon={<BarChart3 className="h-4 w-4" />} active>
                            Analytics
                        </NavLink>
                        <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>
                            Settings
                        </NavLink>
                    </nav>

                    <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                        <LogOut className="h-4 w-4" />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-7xl px-6 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Analytics</h1>
                    <p className="text-slate-400">Insights into your driving patterns and efficiency</p>
                </div>

                {/* Stats Cards */}
                <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={<Navigation className="h-5 w-5" />}
                        label="This Week"
                        value="282 mi"
                        change={12}
                        color="blue"
                    />
                    <StatCard
                        icon={<Battery className="h-5 w-5" />}
                        label="Energy Used"
                        value="74.6 kWh"
                        change={-5}
                        color="green"
                    />
                    <StatCard
                        icon={<Gauge className="h-5 w-5" />}
                        label="Avg Efficiency"
                        value="264 Wh/mi"
                        change={-3}
                        color="purple"
                    />
                    <StatCard
                        icon={<Clock className="h-5 w-5" />}
                        label="Driving Time"
                        value="8.5 hrs"
                        change={8}
                        color="orange"
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Weekly Distance */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Weekly Distance</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Bar dataKey="distance" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Efficiency Over Time */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Efficiency by Time of Day</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={efficiencyData}>
                                <defs>
                                    <linearGradient id="efficiencyGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} domain={[240, 300]} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="efficiency"
                                    stroke="#ef4444"
                                    fill="url(#efficiencyGradient)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Energy by Day */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Energy Consumption</h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={weeklyData}>
                                <defs>
                                    <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="energy"
                                    stroke="#22c55e"
                                    fill="url(#energyGradient)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Charging Mix */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6">
                        <h2 className="mb-6 text-lg font-semibold">Charging Sources</h2>
                        <div className="flex items-center justify-center">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={chargingMix}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {chargingMix.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '8px',
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 flex justify-center gap-6">
                            {chargingMix.map((item) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-sm text-slate-400">
                                        {item.name} ({item.value}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
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
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
        >
            {icon}
            {children}
        </Link>
    );
}

function StatCard({
    icon,
    label,
    value,
    change,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    change: number;
    color: 'blue' | 'green' | 'purple' | 'orange';
}) {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-400',
        green: 'bg-green-500/10 text-green-400',
        purple: 'bg-purple-500/10 text-purple-400',
        orange: 'bg-orange-500/10 text-orange-400',
    };

    const isPositive = change > 0;

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${colors[color]}`}>{icon}</div>
            <p className="text-sm text-slate-400">{label}</p>
            <div className="flex items-end justify-between">
                <p className="text-2xl font-bold">{value}</p>
                <div
                    className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'
                        }`}
                >
                    {isPositive ? (
                        <TrendingUp className="h-4 w-4" />
                    ) : (
                        <TrendingDown className="h-4 w-4" />
                    )}
                    {Math.abs(change)}%
                </div>
            </div>
        </div>
    );
}
