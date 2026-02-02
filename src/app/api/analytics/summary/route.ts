import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const supabase = await createClient()

    // Get timeframe from query params
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || 'week'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Calculate date range based on timeframe
    let fromDate: Date
    const toDate = new Date()

    if (timeframe === 'custom' && startDate && endDate) {
        fromDate = new Date(startDate)
        toDate.setTime(new Date(endDate).getTime())
    } else {
        switch (timeframe) {
            case '7days':
                fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000)
                break
            case 'month':
                fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1)
                break
            case '30days':
                fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)
                break
            case '3months':
                fromDate = new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000)
                break
            case 'week':
            default:
                // Start of current week (Monday)
                const day = toDate.getDay()
                const diff = toDate.getDate() - day + (day === 0 ? -6 : 1)
                fromDate = new Date(toDate.setDate(diff))
                fromDate.setHours(0, 0, 0, 0)
                break
        }
    }

    try {
        // Fetch completed trips in the date range
        const { data: trips, error } = await supabase
            .from('trips')
            .select('*')
            .eq('is_complete', true)
            .gte('start_time', fromDate.toISOString())
            .lte('start_time', toDate.toISOString())
            .order('start_time', { ascending: true })

        if (error) {
            console.error('Error fetching trips:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Calculate summary stats
        let totalDistance = 0
        let totalEnergy = 0
        let totalDrivingTime = 0
        const dailyData: Record<string, { distance: number; energy: number; trips: number }> = {}
        const hourlyEfficiency: Record<number, { total: number; count: number }> = {}

        for (const trip of trips || []) {
            // Distance
            const distance = trip.distance_miles ||
                ((trip.end_odometer && trip.start_odometer)
                    ? trip.end_odometer - trip.start_odometer
                    : 0)
            totalDistance += distance

            // Energy
            const energy = trip.energy_used_kwh ||
                ((trip.start_battery_pct && trip.end_battery_pct)
                    ? (trip.start_battery_pct - trip.end_battery_pct) * 0.75 // Approx kWh
                    : 0)
            totalEnergy += energy

            // Driving time
            if (trip.start_time && trip.end_time) {
                const duration = new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()
                totalDrivingTime += duration / (1000 * 60 * 60) // Hours
            }

            // Daily aggregation
            const day = new Date(trip.start_time).toLocaleDateString('en-US', { weekday: 'short' })
            if (!dailyData[day]) {
                dailyData[day] = { distance: 0, energy: 0, trips: 0 }
            }
            dailyData[day].distance += distance
            dailyData[day].energy += energy
            dailyData[day].trips += 1

            // Hourly efficiency
            const hour = new Date(trip.start_time).getHours()
            const efficiency = distance > 0 ? (energy * 1000) / distance : 0 // Wh/mi
            if (efficiency > 0) {
                if (!hourlyEfficiency[hour]) {
                    hourlyEfficiency[hour] = { total: 0, count: 0 }
                }
                hourlyEfficiency[hour].total += efficiency
                hourlyEfficiency[hour].count += 1
            }
        }

        // Format daily data for charts
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const weeklyData = weekDays.map(day => ({
            day,
            distance: Math.round((dailyData[day]?.distance || 0) * 10) / 10,
            energy: Math.round((dailyData[day]?.energy || 0) * 10) / 10,
            trips: dailyData[day]?.trips || 0,
        }))

        // Format efficiency by time of day
        const efficiencyData = [
            { time: '6am', efficiency: Math.round(hourlyEfficiency[6]?.total / (hourlyEfficiency[6]?.count || 1)) || 250 },
            { time: '9am', efficiency: Math.round(hourlyEfficiency[9]?.total / (hourlyEfficiency[9]?.count || 1)) || 265 },
            { time: '12pm', efficiency: Math.round(hourlyEfficiency[12]?.total / (hourlyEfficiency[12]?.count || 1)) || 260 },
            { time: '3pm', efficiency: Math.round(hourlyEfficiency[15]?.total / (hourlyEfficiency[15]?.count || 1)) || 258 },
            { time: '6pm', efficiency: Math.round(hourlyEfficiency[18]?.total / (hourlyEfficiency[18]?.count || 1)) || 275 },
            { time: '9pm', efficiency: Math.round(hourlyEfficiency[21]?.total / (hourlyEfficiency[21]?.count || 1)) || 252 },
        ]

        // Average efficiency
        const avgEfficiency = totalDistance > 0
            ? Math.round((totalEnergy * 1000) / totalDistance)
            : 260 // Default

        // Fetch charging sessions for the period
        const { data: chargingSessions } = await supabase
            .from('charging_sessions')
            .select('*')
            .eq('is_complete', true)
            .gte('start_time', fromDate.toISOString())
            .lte('start_time', toDate.toISOString())

        // Calculate charging mix from real data
        const chargingByType: Record<string, number> = { home: 0, supercharger: 0, destination: 0, other: 0 }
        let totalChargingEnergy = 0

        for (const session of chargingSessions || []) {
            const energy = session.energy_added_kwh || 0
            totalChargingEnergy += energy
            const type = session.charging_type || 'other'
            chargingByType[type] = (chargingByType[type] || 0) + energy
        }

        // Calculate percentages
        const chargingMix = totalChargingEnergy > 0 ? [
            { name: 'Home', value: Math.round((chargingByType.home / totalChargingEnergy) * 100), color: '#22c55e' },
            { name: 'Supercharger', value: Math.round((chargingByType.supercharger / totalChargingEnergy) * 100), color: '#ef4444' },
            { name: 'Destination', value: Math.round((chargingByType.destination / totalChargingEnergy) * 100), color: '#3b82f6' },
            { name: 'Other', value: Math.round((chargingByType.other / totalChargingEnergy) * 100), color: '#6b7280' },
        ].filter(item => item.value > 0) : [
            // Default if no charging data
            { name: 'No Data', value: 100, color: '#334155' },
        ]

        return NextResponse.json({
            success: true,
            timeframe,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            summary: {
                totalDistance: Math.round(totalDistance * 10) / 10,
                totalEnergy: Math.round(totalEnergy * 10) / 10,
                avgEfficiency,
                drivingTime: Math.round(totalDrivingTime * 10) / 10,
                tripCount: trips?.length || 0,
                chargingSessions: chargingSessions?.length || 0,
                totalChargingEnergy: Math.round(totalChargingEnergy * 10) / 10,
            },
            weeklyData,
            efficiencyData,
            chargingMix,
        })
    } catch (err) {
        console.error('Analytics error:', err)
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
}
