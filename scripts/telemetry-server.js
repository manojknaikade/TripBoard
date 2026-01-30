// Tesla Fleet Telemetry Server
// Receives streaming data from Tesla vehicles and stores in Supabase

const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// Configuration from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const HTTP_PORT = process.env.HTTP_PORT || 443;
const CERT_PATH = "/etc/letsencrypt/live/tripboard.manojnaikade.com";
const USE_HTTPS = fs.existsSync(`${CERT_PATH}/fullchain.pem`);

// Initialize Supabase client
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

console.log("Supabase URL:", SUPABASE_URL ? "configured" : "missing");
console.log("Supabase Key:", SUPABASE_SERVICE_KEY ? "configured" : "missing");

// Express app for health checks
const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => res.json({
    name: "Tesla Fleet Telemetry Server",
    status: "running",
    supabase: !!supabase,
    https: USE_HTTPS,
}));

// API endpoint to receive telemetry via HTTP POST (fallback)
app.post("/telemetry", async (req, res) => {
    try {
        const data = req.body;
        await processTelemetryData(data);
        res.json({ success: true });
    } catch (err) {
        console.error("Telemetry POST error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Track active trips per vehicle
const activeTrips = new Map();

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

    // Trip detection logic
    await detectTripState(vehicleId, { latitude, longitude, speed, batteryLevel });
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
                const { error } = await supabase
                    .from("trips")
                    .update({
                        end_time: new Date().toISOString(),
                        end_latitude: event.latitude,
                        end_longitude: event.longitude,
                        end_battery_pct: event.batteryLevel,
                        max_speed_mph: tripData.maxSpeed,
                        avg_speed_mph: avgSpeed,
                        is_complete: true,
                    })
                    .eq("id", tripData.tripId);

                if (error) {
                    console.error("Trip end error:", error);
                } else {
                    console.log("Trip ended:", tripData.tripId);
                }
            }

            activeTrips.delete(vehicleId);
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
    server = https.createServer(options, app);
    console.log("Starting HTTPS server...");
} else {
    const http = require("http");
    server = http.createServer(app);
    console.log("Starting HTTP server (no TLS certs found)...");
}

// WebSocket server for Tesla telemetry streaming
const wss = new WebSocket.Server({ server });

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

// Start server
server.listen(HTTP_PORT, () => {
    console.log(`=================================`);
    console.log(`Tesla Telemetry Server`);
    console.log(`Port: ${HTTP_PORT}`);
    console.log(`HTTPS: ${USE_HTTPS ? "Enabled" : "Disabled"}`);
    console.log(`Supabase: ${supabase ? "Connected" : "Not configured"}`);
    console.log(`=================================`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("Shutting down...");
    wss.close();
    server.close();
    process.exit(0);
});
