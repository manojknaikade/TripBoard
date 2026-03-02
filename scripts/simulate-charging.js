// Simulate incoming Tesla Fleet Telemetry payloads for charging detection
const http = require("http");

const TELEMETRY_URL = "http://localhost:8081/telemetry";

// Wait helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTelemetry(data) {
    return new Promise((resolve, reject) => {
        const req = http.request(TELEMETRY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runSimulation() {
    console.log("Starting telemetry charging simulation...");

    const vin = "SIM_VIN_CHG_123";

    // 1. Send normal parked state
    console.log("1. Sending parked state...");
    await sendTelemetry({
        vin,
        location: { latitude: 37.7749, longitude: -122.4194 },
        BatteryLevel: 40,
        ChargeState: "Disconnected",
        VehicleSpeed: 0
    });
    await sleep(2000);

    // 2. Start charging
    console.log("2. Sending start charging state...");
    await sendTelemetry({
        vin,
        location: { latitude: 37.7749, longitude: -122.4194 },
        BatteryLevel: 40,
        ChargeState: "Starting",
        ChargeEnergyAdded: 0,
        ChargerPower: 11.5,
        FastChargerPresent: false,
        VehicleSpeed: 0
    });
    await sleep(2000);

    // 3. Charging progress
    console.log("3. Sending charging progress...");
    await sendTelemetry({
        vin,
        location: { latitude: 37.7749, longitude: -122.4194 },
        BatteryLevel: 45,
        ChargeState: "Charging",
        ChargeEnergyAdded: 3.2,
        ChargerPower: 11.5,
        FastChargerPresent: false,
        VehicleSpeed: 0
    });
    await sleep(2000);

    // 4. Charging complete
    console.log("4. Sending charging complete...");
    await sendTelemetry({
        vin,
        location: { latitude: 37.7749, longitude: -122.4194 },
        BatteryLevel: 80,
        ChargeState: "Complete",
        ChargeEnergyAdded: 28.5,
        ChargerPower: 0,
        FastChargerPresent: false,
        VehicleSpeed: 0
    });
    console.log("Simulation complete!");
}

runSimulation().catch(console.error);
