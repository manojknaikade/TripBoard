// Tesla Fleet Telemetry Server
// Receives streaming data from Tesla vehicles and stores in Supabase

const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const HTTP_PORT = process.env.HTTP_PORT || 443;
const USE_HTTPS = fs.existsSync("/etc/letsencrypt/live/tripboard.manojnaikade.com/fullchain.pem");

// Initialize Supabase client
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

// Express app for health checks
const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => res.json({
    name: "Tesla Fleet Telemetry",
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
    console.log("Received telemetry:", JSON.stringify(data).slice(0, 200));

    const vehicleId = data.vin || data.vehicle_id;
    if (!vehicleId) {
        console.log("No vehicle ID in telemetry data");
        return;
    }

    // Extract relevant fields
    const telemetryEvent = {
        vehicle_id: vehicleId,
        event_type: data.type || "unknown",
        event_data: data,
        latitude: data.location?.latitude || data.EstLat,
        longitude: data.location?.longitude || data.EstLng,
        speed: data.VehicleSpeed,
        battery_level: data.BatteryLevel,
        created_at: new Date().toISOString(),
    };

    // Store telemetry event
    if (supabase) {
        const { error } = await supabase
            .from("telemetry_events")
            .insert(telemetryEvent);

        if (error) {
            console.error("Supabase insert error:", error);
        }
    }

    // Trip detection logic
    await detectTripState(vehicleId, telemetryEvent);
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
                vehicle_id: vehicleId,
                started_at: new Date().toISOString(),
                start_latitude: event.latitude,
                start_longitude: event.longitude,
                start_battery_level: event.battery_level,
                status: "in_progress",
            })
            .select()
            .single();

        if (!error && trip) {
            activeTrips.set(vehicleId, {
                tripId: trip.id,
                startOdometer: event.odometer,
                maxSpeed: event.speed || 0,
                speedReadings: [event.speed || 0],
                lastUpdate: Date.now(),
            });
        }
    }

    // Update active trip with telemetry
    if (hasActiveTrip) {
        const tripData = activeTrips.get(vehicleId);
        tripData.lastUpdate = Date.now();

        if (event.speed > tripData.maxSpeed) {
            tripData.maxSpeed = event.speed;
        }
        tripData.speedReadings.push(event.speed || 0);

        // Link telemetry event to trip
        if (supabase && event.id) {
            await supabase
                .from("telemetry_events")
                .update({ trip_id: tripData.tripId })
                .eq("id", event.id);
        }
    }

    // End trip if not moving for 5+ minutes
    if (hasActiveTrip && !isMoving) {
        const tripData = activeTrips.get(vehicleId);
        const idleMinutes = (Date.now() - tripData.lastUpdate) / 60000;

        if (idleMinutes >= 5) {
            console.log(`Ending trip for vehicle ${vehicleId}`);

            const avgSpeed = tripData.speedReadings.length > 0
                ? tripData.speedReadings.reduce((a, b) => a + b, 0) / tripData.speedReadings.length
                : 0;

            if (supabase) {
                await supabase
                    .from("trips")
                    .update({
                        ended_at: new Date().toISOString(),
                        end_latitude: event.latitude,
                        end_longitude: event.longitude,
                        end_battery_level: event.battery_level,
                        max_speed: tripData.maxSpeed,
                        avg_speed: avgSpeed,
                        status: "completed",
                    })
                    .eq("id", tripData.tripId);
            }

            activeTrips.delete(vehicleId);
        }
    }
}

// Create server (HTTPS or HTTP)
let server;
if (USE_HTTPS) {
    const options = {
        cert: fs.readFileSync("/etc/letsencrypt/live/tripboard.manojnaikade.com/fullchain.pem"),
        key: fs.readFileSync("/etc/letsencrypt/live/tripboard.manojnaikade.com/privkey.pem"),
    };
    server = https.createServer(options, app);
    console.log("Starting HTTPS server...");
} else {
    const http = require("http");
    server = http.createServer(app);
    console.log("Starting HTTP server (no TLS certs found)...");
}

// WebSocket server for Tesla telemetry
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Vehicle connected from ${clientIp}`);

    ws.on("message", async (data) => {
        try {
            const message = JSON.parse(data.toString());
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
    console.log(`Tesla Telemetry Server running on port ${HTTP_PORT}`);
    console.log(`Supabase: ${supabase ? "Connected" : "Not configured"}`);
    console.log(`HTTPS: ${USE_HTTPS ? "Enabled" : "Disabled"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("Shutting down...");
    wss.close();
    server.close();
    process.exit(0);
});
