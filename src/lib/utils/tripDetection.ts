/**
 * Trip Detection Logic
 * Automatically detects trip start/end based on vehicle state changes
 */

export interface TripWaypoint {
    timestamp: string;
    latitude: number;
    longitude: number;
    speed: number;
    battery_level: number;
    odometer: number;
}

export interface Trip {
    id: string;
    vehicle_id: string;
    start_time: string;
    end_time?: string;
    start_latitude: number;
    start_longitude: number;
    start_address?: string;
    end_latitude?: number;
    end_longitude?: number;
    end_address?: string;
    distance_miles: number;
    start_battery_pct: number;
    end_battery_pct?: number;
    energy_used_kwh?: number;
    max_speed?: number;
    avg_speed?: number;
    waypoints: TripWaypoint[];
    is_complete: boolean;
}

export interface VehicleSnapshot {
    shift_state: string | null;
    speed: number | null;
    latitude: number;
    longitude: number;
    battery_level: number;
    odometer: number;
    charging_state: string;
    state: string;
}

// Trip detection state
let currentTrip: Trip | null = null;
let lastSnapshot: VehicleSnapshot | null = null;
let parkingStartTime: Date | null = null;

// How long vehicle must be parked before trip ends
const PARKING_DURATION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if vehicle is in a "driving" state
 */
function isDriving(snapshot: VehicleSnapshot): boolean {
    return (
        snapshot.shift_state === 'D' ||
        snapshot.shift_state === 'R' ||
        (snapshot.speed !== null && snapshot.speed > 0)
    );
}

/**
 * Check if vehicle is parked
 */
function isParked(snapshot: VehicleSnapshot): boolean {
    return (
        snapshot.shift_state === 'P' ||
        (snapshot.state === 'online' && snapshot.speed === null)
    );
}

/**
 * Process a vehicle snapshot and detect trip events
 */
export function processVehicleSnapshot(
    vehicleId: string,
    snapshot: VehicleSnapshot,
    onTripStart: (trip: Trip) => void,
    onTripUpdate: (trip: Trip) => void,
    onTripEnd: (trip: Trip) => void
): void {
    const now = new Date();
    const wasDriving = lastSnapshot ? isDriving(lastSnapshot) : false;
    const nowDriving = isDriving(snapshot);
    const nowParked = isParked(snapshot);

    // START TRIP: Was not driving, now driving
    if (!wasDriving && nowDriving && !currentTrip) {
        currentTrip = {
            id: `trip_${Date.now()}`,
            vehicle_id: vehicleId,
            start_time: now.toISOString(),
            start_latitude: snapshot.latitude,
            start_longitude: snapshot.longitude,
            start_battery_pct: snapshot.battery_level,
            distance_miles: 0,
            waypoints: [],
            is_complete: false,
        };
        parkingStartTime = null;
        onTripStart(currentTrip);
    }

    // UPDATE TRIP: Currently on a trip
    if (currentTrip && nowDriving) {
        parkingStartTime = null;

        // Add waypoint
        const waypoint: TripWaypoint = {
            timestamp: now.toISOString(),
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            speed: snapshot.speed || 0,
            battery_level: snapshot.battery_level,
            odometer: snapshot.odometer,
        };
        currentTrip.waypoints.push(waypoint);

        // Update trip stats
        if (lastSnapshot) {
            const distanceDelta = snapshot.odometer - lastSnapshot.odometer;
            currentTrip.distance_miles += distanceDelta;
        }

        // Update max/avg speed
        if (snapshot.speed) {
            currentTrip.max_speed = Math.max(currentTrip.max_speed || 0, snapshot.speed);
        }

        onTripUpdate(currentTrip);
    }

    // POTENTIAL END: Vehicle is now parked
    if (currentTrip && nowParked) {
        if (!parkingStartTime) {
            parkingStartTime = now;
        } else {
            const parkingDuration = now.getTime() - parkingStartTime.getTime();

            // END TRIP: Parked long enough
            if (parkingDuration >= PARKING_DURATION_THRESHOLD_MS) {
                currentTrip.end_time = parkingStartTime.toISOString();
                currentTrip.end_latitude = snapshot.latitude;
                currentTrip.end_longitude = snapshot.longitude;
                currentTrip.end_battery_pct = snapshot.battery_level;
                currentTrip.energy_used_kwh =
                    ((currentTrip.start_battery_pct - snapshot.battery_level) / 100) * 75; // Assume 75kWh pack
                currentTrip.is_complete = true;

                // Calculate average speed
                if (currentTrip.waypoints.length > 0) {
                    const totalSpeed = currentTrip.waypoints.reduce((sum, w) => sum + w.speed, 0);
                    currentTrip.avg_speed = totalSpeed / currentTrip.waypoints.length;
                }

                onTripEnd(currentTrip);
                currentTrip = null;
                parkingStartTime = null;
            }
        }
    }

    // Handle vehicle going to sleep
    if (currentTrip && snapshot.state === 'asleep') {
        currentTrip.end_time = now.toISOString();
        currentTrip.end_latitude = snapshot.latitude;
        currentTrip.end_longitude = snapshot.longitude;
        currentTrip.end_battery_pct = snapshot.battery_level;
        currentTrip.is_complete = true;
        onTripEnd(currentTrip);
        currentTrip = null;
        parkingStartTime = null;
    }

    // Handle charging started
    if (currentTrip && snapshot.charging_state === 'Charging') {
        currentTrip.end_time = now.toISOString();
        currentTrip.end_latitude = snapshot.latitude;
        currentTrip.end_longitude = snapshot.longitude;
        currentTrip.end_battery_pct = snapshot.battery_level;
        currentTrip.is_complete = true;
        onTripEnd(currentTrip);
        currentTrip = null;
        parkingStartTime = null;
    }

    lastSnapshot = snapshot;
}

/**
 * Get the current active trip (if any)
 */
export function getCurrentTrip(): Trip | null {
    return currentTrip;
}

/**
 * Reset trip detection state
 */
export function resetTripDetection(): void {
    currentTrip = null;
    lastSnapshot = null;
    parkingStartTime = null;
}
