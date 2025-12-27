import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeSentinelCheck, processShipmentState, setEventEmitter } from './orchestrator.js';
import { getSystemState, updateState, PHASES, initShipmentIfMissing } from './stateManager.js';
import { initializeStorage, getDataPath, getLogPath } from './storage.js';

// Initialize storage (copies seed data if needed)
initializeStorage();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// Serve static files with absolute path
app.use(express.static(path.join(__dirname, 'ui')));

// Fallback to serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

// --- SSE SETUP ---
let clients = [];

function sendEventToAll(data) {
    // --- FIX 2: TIMESTAMP HYGIENE ---
    const payload = {
        ...data,
        timestamp: new Date().toISOString()
    };
    clients.forEach(client => client.res.write(`data: ${JSON.stringify(payload)}\n\n`));
}

// Wire up the orchestrator to send events via SSE
setEventEmitter(sendEventToAll);

app.get('/events', (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);

    // Send initial state on connection
    const systemState = getSystemState();
    res.write(`data: ${JSON.stringify({ type: 'initial_state', state: systemState })}\n\n`);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});
// -----------------

// --- THE HEARTBEAT ---
// Real systems don't just react to HTTP requests; they have background workers.
// This simulates a worker process checking the DB for jobs.
setInterval(async () => {
    // In a real app, we'd query for all "Active" shipments.
    // Here we just focus on the demo shipment.
    try {
        const shipmentId = 'SH-4429';
        const oldState = getSystemState();

        await processShipmentState(shipmentId);

        const newState = getSystemState();

        // Simple diff check to avoid spamming events if nothing changed
        // In reality, processShipmentState should probably return "mutated: true"
        // But for now, JSON stringify compare is fine for this scale
        if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
            sendEventToAll({ type: 'state_update', state: newState });
        } else {
            // Optional: Keep alive or heartbeat if needed, but not strictly required for SSE
        }

    } catch (err) {
        console.error('[CRITICAL] Tick Loop Error:', err);
    }
}, 2000); // 2 second tick
// ---------------------

app.post('/update-signal', async (req, res) => {
    const { signal_type, value } = req.body;
    let signals = {};
    try {
        signals = JSON.parse(fs.readFileSync(getDataPath('monitored_signals.json'), 'utf8'));
    } catch (e) { /* ignore */ }

    if (signal_type === 'port_congestion') {
        signals.port_congestion_level = value;
    } else if (signal_type === 'supplier_reliability') {
        signals.supplier_reliability_index = value;
    } else if (signal_type === 'weather_risk') {
        signals.weather_risk_score = value;
    }

    signals.last_updated = new Date().toISOString();
    fs.writeFileSync(getDataPath('monitored_signals.json'), JSON.stringify(signals, null, 2));

    // Emit signal update
    sendEventToAll({ type: 'signals_update', signals });

    res.json({ status: 'signal_updated', signals });
});

app.post('/trigger-eta-drift', async (req, res) => {
    const shipmentId = req.body.shipment_id || 'SH-4429';
    const delayHours = req.body.delay_hours || 48;

    // 1. Mutate the Signal (Shipment Data)
    const shipments = JSON.parse(fs.readFileSync(getDataPath('shipments.json'), 'utf8'));
    const shipment = shipments[shipmentId];

    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }

    const originalEta = new Date(shipment.original_eta);
    const newEta = new Date(originalEta.getTime() + (delayHours * 60 * 60 * 1000));
    shipment.current_eta = newEta.toISOString();

    fs.writeFileSync(getDataPath('shipments.json'), JSON.stringify(shipments, null, 2));

    // 2. Set Phase -> AT_RISK via Persistent State Manager
    // This puts it in the queue for the Tick Loop to pick up.
    initShipmentIfMissing(shipmentId);
    updateState(shipmentId, {
        phase: PHASES.AT_RISK,
        activeAgent: null,
        resetRetry: true // Clear any previous errors
    });

    // Immediate Emit
    const systemState = getSystemState();
    sendEventToAll({ type: 'state_update', state: systemState });

    res.json({ status: 'drift_triggered_and_queued', shipment_id: shipmentId });
});

app.get('/sentinel-check', async (req, res) => {
    const shipmentId = req.query.shipment_id || 'SH-4429';

    try {
        const result = await executeSentinelCheck({ shipment_id: shipmentId });

        if (result.trigger_decision) {
            // Autonomous Trigger
            // We just update state. The Tick Loop handles the execution.
            initShipmentIfMissing(shipmentId);
            updateState(shipmentId, {
                phase: PHASES.AT_RISK,
                activeAgent: null,
                resetRetry: true
            });
            // Immediate Emit
            const systemState = getSystemState();
            sendEventToAll({ type: 'state_update', state: systemState });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    const shipments = JSON.parse(fs.readFileSync(getDataPath('shipments.json'), 'utf8'));
    const budget = JSON.parse(fs.readFileSync(getDataPath('budget.json'), 'utf8'));

    // Safety check for logs
    let logs = [];
    try {
        logs = JSON.parse(fs.readFileSync(getLogPath('decisions.log.json'), 'utf8'));
    } catch (e) { logs = []; }

    const signals = JSON.parse(fs.readFileSync(getDataPath('monitored_signals.json'), 'utf8'));
    const sentinelConfig = JSON.parse(fs.readFileSync(getDataPath('sentinel_config.json'), 'utf8'));

    // Read Persistent State
    const systemState = getSystemState();

    res.json({
        shipments,
        budget,
        logs,
        system_state: systemState,
        monitored_signals: signals,
        sentinel_config: sentinelConfig
    });
});

app.get('/logs', (req, res) => {
    try {
        const logs = JSON.parse(fs.readFileSync(getLogPath('decisions.log.json'), 'utf8'));
        res.json(logs);
    } catch (e) {
        res.json([]);
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`VANGUARD Persistent Server running on http://localhost:${PORT}`);
    console.log(`[SYSTEM] Background Worker started (Tick: 2000ms) with SSE enabled.`);
});
