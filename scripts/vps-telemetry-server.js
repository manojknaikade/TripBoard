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

console.log('=================================');
console.log('Tesla Telemetry Processor Active');
console.log('Monitoring telemetry_raw table...');
console.log('=================================');

const activeCharges = new Map();
let lastProcessedTime = new Date(Date.now() - 60000).toISOString(); // Start 1 min ago

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

                if (chargeStateItem) {
                    const state = chargeStateItem.value.stringValue || chargeStateItem.value.detailedChargeStateValue || chargeStateItem.value;
                    const energy = energyAddedItem ? (energyAddedItem.value.doubleValue || energyAddedItem.value) : 0;
                    const power = chargerPowerItem ? (chargerPowerItem.value.doubleValue || chargerPowerItem.value) : 0;
                    const battery = batteryLevelItem ? Math.round(batteryLevelItem.value.intValue || batteryLevelItem.value.doubleValue || batteryLevelItem.value) : 0;

                    const isFastChargerFlag = fastChargerItem ? Boolean(fastChargerItem.value.booleanValue ?? fastChargerItem.value.boolean_value ?? fastChargerItem.value) : false;
                    const fastChargerTypeValue = fastChargerTypeItem ? (fastChargerTypeItem.value.stringValue || fastChargerTypeItem.value.fastChargerValue || fastChargerTypeItem.value) : null;
                    const isHomeFlag = homeItem ? Boolean(homeItem.value.booleanValue ?? homeItem.value.boolean_value ?? homeItem.value) : false;

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
                        const insertPayload = {
                            vehicle_id: vehicleUuid,
                            start_time: row.created_at,
                            start_battery_pct: battery,
                            latitude: 0,
                            longitude: 0,
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
