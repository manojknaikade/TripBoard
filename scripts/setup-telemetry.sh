#!/bin/bash
# Tesla Fleet Telemetry Server Setup Script for Oracle Cloud
# For VM.Standard.E2.1.Micro (1 core, 1GB RAM)
# 
# Run this script on your Oracle Cloud instance:
# curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/setup-telemetry.sh | bash

set -e

echo "🚗 Tesla Fleet Telemetry Server Setup"
echo "======================================"

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install dependencies
echo "📦 Installing dependencies..."
sudo apt-get install -y curl git build-essential ufw

# Install Node.js (LTS)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Create app directory
echo "📁 Setting up application directory..."
sudo mkdir -p /opt/tesla-telemetry
sudo chown $(whoami):$(whoami) /opt/tesla-telemetry
cd /opt/tesla-telemetry

# Create the telemetry server
echo "📝 Creating telemetry server..."

cat > package.json << 'EOF'
{
  "name": "tesla-telemetry-server",
  "version": "1.0.0",
  "description": "Tesla Fleet Telemetry WebSocket Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "express": "^4.18.2"
  }
}
EOF

cat > server.js << 'EOF'
const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 443;
const WS_PORT = process.env.WS_PORT || 8443;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ 
    name: 'Tesla Fleet Telemetry Server',
    version: '1.0.0',
    status: 'running'
  });
});

// For HTTP health checks (Tesla checks this)
const httpServer = app.listen(80, () => {
  console.log(`HTTP server running on port 80`);
});

// WebSocket server for telemetry streaming
let wss;

// Check if TLS certs exist
const certPath = '/opt/tesla-telemetry/certs/cert.pem';
const keyPath = '/opt/tesla-telemetry/certs/key.pem';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  }, app);

  wss = new WebSocket.Server({ server: httpsServer });
  
  httpsServer.listen(WS_PORT, () => {
    console.log(`HTTPS/WSS server running on port ${WS_PORT}`);
  });
} else {
  console.log('TLS certificates not found. Running in HTTP-only mode.');
  console.log('To enable telemetry streaming, add certs to /opt/tesla-telemetry/certs/');
  
  wss = new WebSocket.Server({ port: WS_PORT });
  console.log(`WS server running on port ${WS_PORT}`);
}

// Store connected vehicles
const connectedVehicles = new Map();

wss.on('connection', (ws, req) => {
  const vehicleId = req.url.split('/').pop();
  console.log(`Vehicle connected: ${vehicleId}`);
  
  connectedVehicles.set(vehicleId, ws);
  
  ws.on('message', (data) => {
    try {
      const telemetry = JSON.parse(data);
      console.log(`Telemetry from ${vehicleId}:`, telemetry);
      
      // Here you would typically:
      // 1. Store in database
      // 2. Forward to your TripBoard app via API
      // 3. Trigger alerts if needed
      
      // Example: Forward to TripBoard API
      // forwardToTripBoard(vehicleId, telemetry);
      
    } catch (e) {
      console.log(`Raw telemetry from ${vehicleId}:`, data.toString());
    }
  });
  
  ws.on('close', () => {
    console.log(`Vehicle disconnected: ${vehicleId}`);
    connectedVehicles.delete(vehicleId);
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${vehicleId}:`, err.message);
  });
});

console.log('Tesla Fleet Telemetry Server started');
console.log('Waiting for vehicle connections...');
EOF

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Create systemd service
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/tesla-telemetry.service > /dev/null << EOF
[Unit]
Description=Tesla Fleet Telemetry Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/opt/tesla-telemetry
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=tesla-telemetry
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Configure firewall
echo "🔒 Configuring firewall..."
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8443/tcp
sudo ufw allow 22/tcp
sudo ufw --force enable

# Create certs directory
mkdir -p /opt/tesla-telemetry/certs

# Enable and start service
echo "🚀 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable tesla-telemetry
sudo systemctl start tesla-telemetry

echo ""
echo "✅ Tesla Fleet Telemetry Server installed!"
echo ""
echo "📍 Next steps:"
echo "1. Point your domain to this server's IP"
echo "2. Get TLS certificate (run: sudo certbot certonly --standalone -d your-domain.com)"
echo "3. Copy certs to /opt/tesla-telemetry/certs/ (cert.pem and key.pem)"
echo "4. Restart service: sudo systemctl restart tesla-telemetry"
echo "5. Register with Tesla Fleet API (see docs)"
echo ""
echo "📊 Check status: sudo systemctl status tesla-telemetry"
echo "📜 View logs: sudo journalctl -u tesla-telemetry -f"
