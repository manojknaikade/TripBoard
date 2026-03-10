// Tesla Fleet Telemetry Server
// Receives streaming data from Tesla vehicles and stores in Supabase
//Manoj - this is depricated, trips table is generated in supbase by a database-level trigger converting raw telemetry into trip records. go server igest raw telemetry data to supbase.

const https = require("https");
const fs = require("fs");
let WebSocket;
try {
    WebSocket = require("ws");
} catch (e) {
    console.warn("WebSocket module not found. Server will only accept HTTP POST telemetry.");
}
let createClient;
try {
    const supabaseModule = require("@supabase/supabase-js");
    createClient = supabaseModule.createClient;
} catch (e) {
    console.warn("Supabase module not found. Server will process telemetry but not save to DB.");
}

// Configuration from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const HTTP_PORT = process.env.HTTP_PORT || 8081;
const CERT_PATH = "/etc/letsencrypt/live/tripboard.manojnaikade.com";
const USE_HTTPS = fs.existsSync(`${CERT_PATH}/fullchain.pem`);

// Initialize Supabase client
let supabase = null;
if (createClient && SUPABASE_URL && (SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
} else {
    console.warn("Using MOCK Supabase Client for local simulation testing.");
    supabase = {
        from: (table) => ({
            insert: (data) => {
                console.log(`[MOCK DB] INSERT INTO ${table}:`, data);
                return { select: () => ({ single: async () => ({ data: { id: "mock_session_1" }, error: null }) }) };
            },
            update: (data) => {
                console.log(`[MOCK DB] UPDATE ${table}:`, data);
                return { eq: async () => ({ error: null }) };
            },
            select: () => {
                return { eq: () => ({ single: async () => ({ data: { id: "mock_uuid" } }) }) };
            }
        })
    };
}

console.log("Supabase URL:", SUPABASE_URL ? "configured" : "missing");
console.log("Supabase Key:", SUPABASE_SERVICE_KEY ? "configured" : "missing");

// HTTP server for health checks and webhook handling
const handleHttpRequest = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: "ok" }));
        return;
    }

    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            name: "Tesla Fleet Telemetry Server",
            status: "running",
            supabase: !!supabase,
            https: USE_HTTPS,
        }));
        return;
    }

    if (req.method === 'POST' && req.url === '/telemetry') {
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    await processTelemetryData(data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    console.error("Telemetry process error:", err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        } catch (err) {
            console.error("Telemetry POST error:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    res.writeHead(404);
    res.end();
};

// Track active trips and charging sessions per vehicle
const activeTrips = new Map();
const activeCharges = new Map();

// Process incoming telemetry data
async function processTelemetryData(data) {
    console.log("Received telemetry:", JSON.stringify(data).slice(0, 300));

    const vehicleId = data.vin || data.vehicle_id || data.VIN;
    if (!vehicleId) {
        console.log("No vehicle ID in telemetry data");
        return;
    }

    // Extract common fields from Tesla telemetry format
    const latitude = data.location?.latitude || data.EstLat || data.Latitude;
    const longitude = data.location?.longitude || data.EstLng || data.Longitude;
    const speed = data.VehicleSpeed || data.speed || 0;
    const batteryLevel = data.BatteryLevel || data.Soc || data.battery_level;

    // Charging specific fields
    const chargeState = data.DetailedChargeState || data.ChargeState || data.charge_state || "";
    const acEnergy = data.ACChargingEnergyIn || data.ac_charging_energy_in || 0;
    const dcEnergy = data.DCChargingEnergyIn || data.dc_charging_energy_in || 0;
    const chargeEnergyAdded = (acEnergy + dcEnergy) || data.ChargeEnergyAdded || data.charge_energy_added || 0;

    const acPower = data.ACChargingPower || data.ac_charging_power || 0;
    const dcPower = data.DCChargingPower || data.dc_charging_power || 0;
    const chargerPower = (acPower + dcPower) || data.ChargerPower || data.charger_power || 0;

    const fastChargerPresent = data.FastChargerPresent || data.fast_charger_present || data.FastChargerType !== undefined || false;
    const outsideTemp = data.OutsideTemp || data.outside_temp || data.OutsideTemp_C || null;

    // Store telemetry event in Supabase
    if (supabase) {
        const telemetryEvent = {
            vehicle_id: String(vehicleId),
            event_type: data.type || data.msgType || "unknown",
            event_data: data,
            latitude: latitude,
            longitude: longitude,
            speed: speed,
            battery_level: batteryLevel,
        };

        const { error } = await supabase
            .from("telemetry_events")
            .insert(telemetryEvent);

        if (error) {
            console.error("Supabase telemetry insert error:", error);
        } else {
            console.log("Telemetry saved for vehicle:", vehicleId);
        }
    }

    // Trip and Charging detection logic
    await detectTripState(vehicleId, { latitude, longitude, speed, batteryLevel, outsideTemp });
    await detectChargingState(vehicleId, {
        latitude,
        longitude,
        batteryLevel,
        chargeState,
        chargeEnergyAdded,
        chargerPower,
        fastChargerPresent
    });
}

// Detect if vehicle is starting/ending a trip
async function detectTripState(vehicleId, event) {
    const isMoving = event.speed && event.speed > 0;
    const hasActiveTrip = activeTrips.has(vehicleId);

    // Start new trip if moving and no active trip
    if (isMoving && !hasActiveTrip && supabase) {
        console.log(`Starting new trip for vehicle ${vehicleId}`);

        const { data: trip, error } = await supabase
            .from("trips")
            .insert({
                vehicle_id: String(vehicleId),
                start_time: new Date().toISOString(),
                start_latitude: event.latitude,
                start_longitude: event.longitude,
                start_battery_pct: event.batteryLevel,
                is_complete: false,
            })
            .select()
            .single();

        if (error) {
            console.error("Trip start error:", error);
        } else if (trip) {
            activeTrips.set(vehicleId, {
                tripId: trip.id,
                maxSpeed: event.speed || 0,
                speedReadings: [event.speed || 0],
                lastMovingTime: Date.now(),
                tempReadings: event.outsideTemp !== null ? [event.outsideTemp] : [],
            });
            console.log("Trip started:", trip.id);
        }
    }

    // Update active trip tracking
    if (hasActiveTrip && isMoving) {
        const tripData = activeTrips.get(vehicleId);
        tripData.lastMovingTime = Date.now();

        if (event.speed > tripData.maxSpeed) {
            tripData.maxSpeed = event.speed;
        }
        tripData.speedReadings.push(event.speed);
        if (event.outsideTemp !== null && event.outsideTemp !== undefined) {
            tripData.tempReadings.push(event.outsideTemp);
        }
    }

    // End trip if not moving for 5+ minutes
    if (hasActiveTrip) {
        const tripData = activeTrips.get(vehicleId);
        const idleMinutes = (Date.now() - tripData.lastMovingTime) / 60000;

        if (idleMinutes >= 5 && !isMoving) {
            console.log(`Ending trip for vehicle ${vehicleId} (idle ${idleMinutes.toFixed(1)} min)`);

            const avgSpeed = tripData.speedReadings.length > 0
                ? tripData.speedReadings.reduce((a, b) => a + b, 0) / tripData.speedReadings.length
                : 0;

            if (supabase) {
                const temps = tripData.tempReadings;
                const minTemp = temps.length > 0 ? Math.min(...temps) : null;
                const maxTemp = temps.length > 0 ? Math.max(...temps) : null;
                const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

                const { error } = await supabase
                    .from("trips")
                    .update({
                        end_time: new Date().toISOString(),
                        end_latitude: event.latitude,
                        end_longitude: event.longitude,
                        end_battery_pct: event.batteryLevel,
                        max_speed_mph: tripData.maxSpeed,
                        avg_speed_mph: avgSpeed,
                        min_outside_temp: minTemp,
                        max_outside_temp: maxTemp,
                        avg_outside_temp: avgTemp,
                        is_complete: true,
                    })
                    .eq("id", tripData.tripId);

                if (error) {
                    console.error("Trip end error:", error);
                } else {
                    console.log("Trip ended with temp stats:", tripData.tripId, { avgTemp });
                }
            }

            activeTrips.delete(vehicleId);
        }
    }
}

// Detect if vehicle is starting/ending a charging session
async function detectChargingState(vehicleId, event) {
    const isCharging = ["Charging", "DetailedChargeStateCharging", "Starting", "DetailedChargeStateStarting"].includes(event.chargeState);
    const hasActiveCharge = activeCharges.has(vehicleId);

    // Start new charging session if charging and no active session
    if (isCharging && !hasActiveCharge && supabase) {
        console.log(`Starting new charging session for vehicle ${vehicleId}`);

        // Try to get vehicle UUID from VIN (since telemetry often uses VIN)
        let vehicleUuid = String(vehicleId);

        // If vehicleId doesn't look like a UUID, we need to map the VIN to get the UUID
        if (vehicleUuid.length > 17 || !vehicleUuid.includes('-')) {
            const { data: v } = await supabase
                .from('vehicles')
                .select('id')
                .eq('vin', vehicleId)
                .single();

            if (v && v.id) {
                vehicleUuid = v.id;
            }
        }

        // Determine charger type (rough approximation based on power and fast charger flag)
        let chargerType = "other";
        if (event.fastChargerPresent) {
            chargerType = "supercharger";
        } else if (event.latitude && event.longitude) {
            // Very basic heuristic for Home vs Destination - ideally we'd check saved bounds
            chargerType = "home"; // This could be improved if location boundaries are used
        }

        const { data: chargeSession, error } = await supabase
            .from("charging_sessions")
            .insert({
                vehicle_id: vehicleUuid,
                start_time: new Date().toISOString(),
                start_battery_pct: event.batteryLevel,
                latitude: event.latitude,
                longitude: event.longitude,
                charger_type: chargerType,
                is_complete: false,
            })
            .select()
            .single();

        if (error) {
            console.error("Charging session start error:", error);
        } else if (chargeSession) {
            activeCharges.set(vehicleId, {
                sessionId: chargeSession.id,
                vehicleUuid: vehicleUuid,
                maxEnergyAdded: event.chargeEnergyAdded || 0,
                maxChargePower: event.chargerPower || 0,
                lastChargingTime: Date.now(),
            });
            console.log("Charging session started:", chargeSession.id);
        }
    }

    // Update active charging session tracking
    if (hasActiveCharge) {
        const chargeData = activeCharges.get(vehicleId);
        chargeData.lastChargingTime = Date.now();

        if (event.chargeEnergyAdded > chargeData.maxEnergyAdded) {
            chargeData.maxEnergyAdded = event.chargeEnergyAdded;
        }
        if (event.chargerPower > chargeData.maxChargePower) {
            chargeData.maxChargePower = event.chargerPower;
        }
    }

    // End charging session if not charging for a while or state changed
    if (hasActiveCharge) {
        const chargeData = activeCharges.get(vehicleId);

        const isCompletedOrDisconnected = ["Complete", "DetailedChargeStateComplete", "Disconnected", "DetailedChargeStateDisconnected", "Stopped", "DetailedChargeStateStopped"].includes(event.chargeState);
        const idleMinutes = (Date.now() - chargeData.lastChargingTime) / 60000;

        // End session if state is expressly done or hasn't received a charge state for 10+ minutes
        if (isCompletedOrDisconnected || (idleMinutes >= 10 && !isCharging)) {
            console.log(`Ending charging session for vehicle ${vehicleId}`);

            if (supabase) {
                const { error } = await supabase
                    .from("charging_sessions")
                    .update({
                        end_time: new Date().toISOString(),
                        end_battery_pct: event.batteryLevel,
                        energy_added_kwh: chargeData.maxEnergyAdded,
                        charge_rate_kw: chargeData.maxChargePower,
                        is_complete: true,
                    })
                    .eq("id", chargeData.sessionId);

                if (error) {
                    console.error("Charging session end error:", error);
                } else {
                    console.log("Charging session ended:", chargeData.sessionId);
                }
            }

            activeCharges.delete(vehicleId);
        }
    }
}

// Create server (HTTPS or HTTP)
let server;
if (USE_HTTPS) {
    const options = {
        cert: fs.readFileSync(`${CERT_PATH}/fullchain.pem`),
        key: fs.readFileSync(`${CERT_PATH}/privkey.pem`),
    };
    server = https.createServer(options, handleHttpRequest);
    console.log("Starting HTTPS server...");
} else {
    const http = require("http");
    server = http.createServer(handleHttpRequest);
    console.log("Starting HTTP server (no TLS certs found)...");
}

// WebSocket server for Tesla telemetry streaming
let wss;
if (WebSocket) {
    wss = new WebSocket.Server({ server });

    wss.on("connection", (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        console.log(`Vehicle connected from ${clientIp}`);

        ws.on("message", async (data) => {
            try {
                // Tesla sends Protocol Buffers, but may also send JSON
                let message;
                if (Buffer.isBuffer(data)) {
                    // Try to parse as JSON first (some implementations use JSON)
                    try {
                        message = JSON.parse(data.toString());
                    } catch {
                        // It's likely Protocol Buffers - log raw for now
                        console.log("Received binary data:", data.length, "bytes");
                        // TODO: Add protobuf parsing when needed
                        return;
                    }
                } else {
                    message = JSON.parse(data.toString());
                }
                await processTelemetryData(message);
            } catch (err) {
                console.error("WebSocket message error:", err);
            }
        });

        ws.on("close", () => {
            console.log(`Vehicle disconnected from ${clientIp}`);
        });

        ws.on("error", (err) => {
            console.error("WebSocket error:", err);
        });
    });
}

// Start server
server.listen(HTTP_PORT, () => {
    console.log(`=================================`);
    console.log(`Tesla Telemetry Server`);
    console.log(`Port: ${HTTP_PORT}`);
    console.log(`HTTPS: ${USE_HTTPS ? "Enabled" : "Disabled"}`);
    console.log(`Supabase: ${supabase ? "Connected" : "Not configured"}`);
    console.log(`=================================`);
    // Keep process alive for local simulation testing lacking persistent connections
    setInterval(() => { }, 10000);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("Shutting down...");
    if (wss) wss.close();
    server.close();
    process.exit(0);
});
