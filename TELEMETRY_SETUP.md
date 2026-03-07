# How We Built the Tesla Telemetry Ingester

## 1. The Challenge

Tesla's Fleet Telemetry sends data in a proprietary binary format over WebSockets.

- **Protocol:** WebSocket (Secure w/ mTLS)
- **Format:** `FlatBuffers` (Envelope) wrapping a `Protobuf` (Payload).
- **Difficulty:** Decoding requires the specific Schema definitions (`.fbs` and `.proto` files).

## 2. The Solution

We built a custom **Go Server** on an Oracle VM.
We chose **Go** (Golang) because Tesla's official repository is written in Go, which allowed us to import their decoder libraries directly, avoiding the need to manually reverse-engineer the binary schemas.

### Architecture

1. **Ingester (Go):** Listens on port 443 (HTTPS/WSS).
2. **Authentication:** Validates the Client Certificate (mTLS) from the car.
3. **Decoding:**
    - Strips the **FlatBuffers** header.
    - Decodes the **Protobuf** payload into a struct.
4. **Storage:** Converts the data to JSON and pushes it to **Supabase** (`telemetry_raw` table).

## 3. Implementation Steps

### Step A: Server Setup (Oracle VM)

1. **Install Go:** `sudo apt-get install golang-go`
2. **Clone Tesla Repo:**

    ```bash
    git clone https://github.com/teslamotors/fleet-telemetry.git /opt/tesla-telemetry/fleet-telemetry
    ```

3. **Initialize Decoder Module:**
    We created a new Go module (`tripboard-telemetry`) and linked it to the local `fleet-telemetry` folder to use its packages.

### Step B: The Code (`main.go`)

The core logic resides in a single Go file that:

1. Starts a WebSocket Server using `github.com/gorilla/websocket`.
2. Reads the binary message.
3. Calls `messages.StreamMessageFromBytes(msg)` (Tesla's library) to unwrap the FlatBuffer.
4. Calls `proto.Unmarshal` to decode the Payload.
5. Sends the JSON to Supabase via HTTP POST.

### Step C: Database (Supabase)

We created a table `telemetry_raw` to store the raw JSON.
This allows us to save *everything* now and figure out complex queries (like Trip Detection) later using SQL Triggers.

## 4. Running as a Systemd Service

The ingester runs as a systemd service for automatic startup and reliability.

**Service file:** `/etc/systemd/system/tesla-ingester.service`

```bash
# Check status
sudo systemctl status tesla-ingester

# View logs (live)
sudo journalctl -u tesla-ingester -f

# Restart if needed
sudo systemctl restart tesla-ingester

# Stop/Start
sudo systemctl stop tesla-ingester
sudo systemctl start tesla-ingester
```

## 5. Building the Binary

```bash
cd /opt/tesla-telemetry/go-decoder
go build -o ingest main.go
```

## 6. Result

- **Latency:** Real-time (<500ms).
- **Data:** Full vehicle telemetry (Speed, Location, Battery, Temperature).
- **Stability:** Handles disconnects and auto-restarts via systemd.
- **DetailedChargeState:** Migrated to the modern `DetailedChargeState` for robust charging analytics.

## 7. Key Learnings (DetailedChargeState Migration)

During our migration to `DetailedChargeState`, we discovered several critical aspects of Tesla's telemetry:

### A. Field Deprecation

Tesla has deprecated the standard `ChargeState` field in favor of `DetailedChargeState`. Using the legacy field may result in `invalid` or missing data in the stream.

### B. Enum Format Discrepancies

The new `DetailedChargeState` uses prefixed string values in its Protobuf definitions. While the old field sent `"Charging"`, the new one sends `"DetailedChargeStateCharging"`. Our `telemetry-server.js` and database triggers must handle both for backward compatibility.

### C. Active Configuration Pushing

Updating the code logic *does not* automatically change what the car streams. A explicit `POST` to the `fleet-telemetry-config-create` endpoint is required to update the car's field list. We integrated a **"Push Configuration"** button in the App Settings to automate this process.

### D. Dual Processing Logic

While a Go ingester handles the high-performance binary-to-JSON conversion and raw storage, we use a separate **Node.js Telemetry Processor** on the VPS to handle complex state transitions (like identifying the start and end of a charging session and updating the `charging_sessions` table).

### E. Extracting Location Names (Reverse Geocoding)

Tesla's raw telemetry stream only transmits raw `Latitude` and `Longitude` coordinates. There is no string representing the town or physical address. To resolve this, our Node.js VPS script (`vps-telemetry-server.js`) utilizes the **OpenStreetMap Nominatim API**.
When a new charging session begins, the VPS executes an internal `https.get` request (supplying the essential `User-Agent` header) to reverse-geocode those coordinates back into a city or street name. This derived string is then permanently written directly to the Supabase `location_name` column, ensuring the web application's Charging grid displays meaningful human-readable addresses instantly without front-end rate limiting!
