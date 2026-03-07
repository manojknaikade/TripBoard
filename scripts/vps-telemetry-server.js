require('dotenv').config({ path: '/home/ubuntu/.env' });
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const https = require('https');

async function reverseGeocode(lat, lng) {
    return new Promise((resolve) => {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const options = { headers: { 'User-Agent': 'TripBoard-VPS/1.0' } };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.address) {
                        const addr = parsed.address;
                        const parts = [];
                        if (addr.road) parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
                        const city = addr.city || addr.town || addr.village || addr.hamlet;
                        if (city) parts.push(city);
                        if (addr.country) parts.push(addr.country);

                        if (parts.length > 0) resolve(parts.join(', '));
                        else resolve(parsed.display_name || null);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

console.log('=================================');
console.log('Tesla Telemetry Processor Active');
console.log('Monitoring telemetry_raw table...');
console.log('=================================');

const activeCharges = new Map();
// FIXED: Pull last processed time from DB or fallback to 1 min ago to avoid missing data on script restart
let lastProcessedTime = new Date(Date.now() - 60000).toISOString();
supabase.from('telemetry_raw').select('created_at').order('created_at', { ascending: false }).limit(1).then(({ data }) => {
    if (data && data.length > 0) {
        // We start processing from the last item we see when the script boots up
        // A better long-term fix is persisting the exact cursor ID.
        lastProcessedTime = data[0].created_at;
        console.log("Resuming telemetry processing from latest DB timestamp:", lastProcessedTime);
    }
});

async function processNewTelemetry() {
    try {
        const { data, error } = await supabase
            .from('telemetry_raw')
            .select('*')
            .gt('created_at', lastProcessedTime)
            .order('created_at', { ascending: true }); // Process chronologically

        if (error) throw error;

        if (data && data.length > 0) {
            for (const row of data) {
                lastProcessedTime = row.created_at; // Update cursor

                const payload = row.payload;
                if (!payload || !payload.data) continue;

                let vehicleUuid = row.vin.replace('vehicle_device.', '');

                const chargeStateItem = payload.data.find(d => d.key === 'DetailedChargeState');
                const energyAddedItem = payload.data.find(d => d.key === 'DCChargingEnergyIn' || d.key === 'ACChargingEnergyIn');
                const chargerPowerItem = payload.data.find(d => d.key === 'DCChargingPower' || d.key === 'ACChargingPower');
                const batteryLevelItem = payload.data.find(d => d.key === 'BatteryLevel');
                const fastChargerItem = payload.data.find(d => d.key === 'FastChargerPresent');
                const fastChargerTypeItem = payload.data.find(d => d.key === 'FastChargerType');
                const homeItem = payload.data.find(d => d.key === 'LocatedAtHome');

                // Location items
                const locationItem = payload.data.find(d => d.key === 'Location');
                const latItem = payload.data.find(d => d.key === 'Latitude' || d.key === 'EstLat');
                const lngItem = payload.data.find(d => d.key === 'Longitude' || d.key === 'EstLng');

                if (chargeStateItem) {
                    const state = chargeStateItem.value.stringValue || chargeStateItem.value.detailedChargeStateValue || chargeStateItem.value;
                    const energy = energyAddedItem ? (energyAddedItem.value.doubleValue || energyAddedItem.value) : 0;
                    const power = chargerPowerItem ? (chargerPowerItem.value.doubleValue || chargerPowerItem.value) : 0;
                    const battery = batteryLevelItem ? Math.round(batteryLevelItem.value.intValue || batteryLevelItem.value.doubleValue || batteryLevelItem.value) : 0;

                    const isFastChargerFlag = fastChargerItem ? Boolean(fastChargerItem.value.booleanValue ?? fastChargerItem.value.boolean_value ?? fastChargerItem.value) : false;
                    const fastChargerTypeValue = fastChargerTypeItem ? (fastChargerTypeItem.value.stringValue || fastChargerTypeItem.value.fastChargerValue || fastChargerTypeItem.value) : null;
                    const isHomeFlag = homeItem ? Boolean(homeItem.value.booleanValue ?? homeItem.value.boolean_value ?? homeItem.value) : false;

                    let lat = 0;
                    let lng = 0;

                    if (locationItem?.value?.locationValue) {
                        lat = locationItem.value.locationValue.latitude || 0;
                        lng = locationItem.value.locationValue.longitude || 0;
                    } else if (latItem && lngItem) {
                        lat = latItem.value.doubleValue || latItem.value;
                        lng = lngItem.value.doubleValue || lngItem.value;
                    }

                    const isCharging = ['DetailedChargeStateCharging', 'DetailedChargeStateStarting'].includes(state);
                    const isCompletedOrDisconnected = ['DetailedChargeStateComplete', 'DetailedChargeStateDisconnected', 'DetailedChargeStateStopped'].includes(state);

                    let resolvedChargerType = 'other';
                    if (isFastChargerFlag || power > 24) {
                        if (fastChargerTypeValue === 'FastChargerSupercharger') {
                            resolvedChargerType = 'supercharger';
                        } else if (fastChargerTypeValue && fastChargerTypeValue !== 'FastChargerUnknown') {
                            // Electrify America, EVgo, etc...
                            resolvedChargerType = '3rd_party_fast';
                        } else {
                            // Fallback to generic supercharger logic if type is missing but power is high
                            resolvedChargerType = 'supercharger';
                        }
                    } else if (isHomeFlag) {
                        resolvedChargerType = 'home';
                    }

                    // Ensure vehicle exists in DB Map
                    if (!vehicleUuid.includes('-')) {
                        const { data: v } = await supabase.from('vehicles').select('id').eq('vin', vehicleUuid).single();
                        if (v && v.id) vehicleUuid = v.id;
                    }

                    const hasActiveCharge = activeCharges.has(vehicleUuid);

                    if (isCharging && !hasActiveCharge) {
                        console.log(`Starting charging session for ${vehicleUuid} at ${row.created_at}`);

                        let locName = null;
                        if (lat !== 0 && lng !== 0) {
                            locName = await reverseGeocode(lat, lng);
                        }

                        const insertPayload = {
                            vehicle_id: vehicleUuid,
                            start_time: row.created_at,
                            start_battery_pct: battery,
                            latitude: lat,
                            longitude: lng,
                            location_name: locName,
                            charger_type: resolvedChargerType,
                            is_complete: false
                        };
                        const { data: inserted, error: insertErr } = await supabase.from('charging_sessions').insert(insertPayload).select().single();
                        if (!insertErr && inserted) {
                            activeCharges.set(vehicleUuid, {
                                id: inserted.id,
                                maxEnergy: energy,
                                maxPower: power,
                                charger_type: insertPayload.charger_type,
                                lastChargingTime: Date.now()
                            });
                        }
                    } else if (hasActiveCharge) {
                        const chargeData = activeCharges.get(vehicleUuid);
                        chargeData.lastChargingTime = Date.now();

                        if (energy > chargeData.maxEnergy) chargeData.maxEnergy = energy;
                        if (power > chargeData.maxPower) {
                            chargeData.maxPower = power;
                        }
                        // Update type dynamically if new flags stream in mid-charge
                        if (resolvedChargerType !== 'other') {
                            chargeData.charger_type = resolvedChargerType;
                        }

                        if (isCompletedOrDisconnected || (Date.now() - chargeData.lastChargingTime) / 60000 >= 10) {
                            console.log(`Ending charging session for ${vehicleUuid} at ${row.created_at}`);
                            await supabase.from('charging_sessions').update({
                                end_time: row.created_at,
                                end_battery_pct: battery,
                                energy_added_kwh: chargeData.maxEnergy,
                                charge_rate_kw: chargeData.maxPower,
                                charger_type: chargeData.charger_type,
                                is_complete: true
                            }).eq('id', chargeData.id);
                            activeCharges.delete(vehicleUuid);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('Processing error:', err.message);
    }
    setTimeout(processNewTelemetry, 5000); // Poll every 5s
}

processNewTelemetry();

http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Telemetry Processor Running V2');
}).listen(8081);
