const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const exec = require('child_process').exec;
const app = express();
const port = 3000;

// Determine writable data directory for persistence (works when packaged)
function getDataDir() {
    if (process.env.APPDATA) {
        return path.join(process.env.APPDATA, 'network-mapper');
    }
    if (process.env.XDG_DATA_HOME) {
        return path.join(process.env.XDG_DATA_HOME, 'network-mapper');
    }
    return path.join(require('os').homedir(), '.local', 'share', 'network-mapper');
}

const DATA_DIR = getDataDir();
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ping configuration
const PING_COUNT = 4; // Number of pings to send
const statusCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

// Function to perform local ping
async function performPing(ip) {
    return new Promise((resolve, reject) => {
        // Construct ping command based on OS
        const cmd = process.platform === 'win32' 
            ? `ping -n ${PING_COUNT} ${ip}`
            : `ping -c ${PING_COUNT} ${ip}`;

        exec(cmd, (error, stdout, stderr) => {
            if (error && error.code !== 1) { // error.code 1 can mean partial success
                console.error(`Error pinging ${ip}:`, error);
                resolve({
                    status: 'error',
                    latency: null,
                    loss: 100,
                    lastCheck: new Date().toISOString()
                });
                return;
            }

            try {
                let loss = 100;
                let latency = null;
                let status = 'unknown';

                // Parse ping output
                if (process.platform === 'win32') {
                    // Windows parsing
                    const lossMatch = stdout.match(/Lost = (\d+)/);
                    const latencyMatch = stdout.match(/Average = (\d+)ms/);
                    
                    if (lossMatch) {
                        loss = (parseInt(lossMatch[1]) / PING_COUNT) * 100;
                    }
                    if (latencyMatch) {
                        latency = parseInt(latencyMatch[1]);
                    }
                } else {
                    // Linux/Unix parsing
                    const lossMatch = stdout.match(/(\d+)% packet loss/);
                    const latencyMatch = stdout.match(/min\/avg\/max\/.+?\s=\s[\d.]+\/([\d.]+)/);
                    
                    if (lossMatch) {
                        loss = parseFloat(lossMatch[1]);
                    }
                    if (latencyMatch) {
                        latency = parseFloat(latencyMatch[1]);
                    }
                }

                // Determine status
                if (loss !== null && latency !== null) {
                    if (loss >= 20) {
                        status = 'critical';
                    } else if (latency > 100) {
                        status = 'warning';
                    } else {
                        status = 'good';
                    }
                }

                resolve({
                    status,
                    latency,
                    loss,
                    lastCheck: new Date().toISOString()
                });
            } catch (err) {
                console.error(`Error parsing ping results for ${ip}:`, err);
                resolve({
                    status: 'error',
                    latency: null,
                    loss: 100,
                    lastCheck: new Date().toISOString()
                });
            }
        });
    });
}

// Cache management
async function getNodeStatus(ip) {
    const now = Date.now();
    const cached = statusCache.get(ip);
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }

    try {
        const data = await performPing(ip);
        statusCache.set(ip, {
            timestamp: now,
            data
        });
        return data;
    } catch (error) {
        console.error(`Error getting status for ${ip}:`, error);
        return {
            status: 'error',
            latency: null,
            loss: null,
            lastCheck: null
        };
    }
}

// Serve static files
app.use(express.static(__dirname));
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Endpoint to get node status
app.get('/api/node-status/:ip', async (req, res) => {
    try {
        const status = await getNodeStatus(req.params.ip);
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save property endpoint
app.post('/api/properties/save', (req, res) => {
    try {
        const { filename, content } = req.body;
        const safeName = path.basename(filename);
        const outPath = path.join(DATA_DIR, safeName);
        fs.writeFileSync(outPath, content);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get list of JSON files
app.get('/api/properties', (req, res) => {
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
                return JSON.parse(content);
            });
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set up file watcher
const watcher = chokidar.watch('*.json', {
    cwd: DATA_DIR,
    ignoreInitial: false,
    persistent: true
});

// WebSocket setup for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

wss.broadcast = function(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

watcher.on('all', (event, path) => {
    if (path.endsWith('.json')) {
        try {
            const content = fs.readFileSync(path, 'utf8');
            wss.broadcast({
                event,
                path,
                content: JSON.parse(content)
            });
        } catch (error) {
            console.error(`Error processing ${path}:`, error);
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});