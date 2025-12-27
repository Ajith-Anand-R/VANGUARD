import fs from 'fs';
import path from 'path';

const STATE_FILE = './data/system_state.json';

// Ensure data directory exists
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

// Canonical Phases - The Single Source of Truth for Valid Transitions
export const PHASES = {
    IDLE: 'IDLE',
    AT_RISK: 'AT_RISK',
    ANALYZING: 'ANALYZING',
    GUARDRAILS_PRECHECK: 'GUARDRAILS_PRECHECK',
    GENERATING_OPTIONS: 'GENERATING_OPTIONS',
    GUARDRAILS_POSTCHECK: 'GUARDRAILS_POSTCHECK',
    DECISION_PENDING: 'DECISION_PENDING',
    NEGOTIATING: 'NEGOTIATING',
    EXECUTING: 'EXECUTING',
    POST_EXECUTION_MONITORING: 'POST_EXECUTION_MONITORING',
    LOGGING: 'LOGGING',
    STABILIZED: 'STABILIZED',
    NO_VIABLE_SOLUTION: 'NO_VIABLE_SOLUTION',

    // Error / Manual States
    MANUAL_INTERVENTION: 'MANUAL_INTERVENTION',
    FAILED: 'FAILED'
};

// Initial State Template
const INITIAL_STATE = {
    activeShipmentId: 'SH-4429',
    shipments: {}
};

// Load state synchronously (Simplicity > Perf for this stage)
function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            fs.writeFileSync(STATE_FILE, JSON.stringify(INITIAL_STATE, null, 2));
            return INITIAL_STATE;
        }
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('CRITICAL: Failed to load state:', err);
        return INITIAL_STATE;
    }
}

// Save state synchronously
function saveState(state) {
    try {
        // Atomic write via temp file would be better, but direct write is OK for this constraint level
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.error('CRITICAL: Failed to save state:', err);
    }
}

export function getSystemState() {
    const state = loadState();
    return state.shipments;
}

export function getShipmentState(shipmentId) {
    const state = loadState();
    return state.shipments[shipmentId];
}

export function initShipmentIfMissing(shipmentId) {
    const state = loadState();
    if (!state.shipments[shipmentId]) {
        state.shipments[shipmentId] = {
            state: PHASES.IDLE,
            agent: null,
            context: {}, // Shared memory for agents
            lastUpdated: new Date().toISOString(),
            retryCount: 0
        };
        saveState(state);
    }
}

export function updateState(shipmentId, updates) {
    const state = loadState();

    if (!state.shipments[shipmentId]) {
        initShipmentIfMissing(shipmentId);
        // Reload to get the object reference (lazy way, but safe)
        // actually initShipmentIfMissing saves, so we need to reload or just modify our local copy
        // Let's just create it here if missing to be atomic-ish
        state.shipments[shipmentId] = {
            state: PHASES.IDLE,
            agent: null,
            context: {},
            lastUpdated: new Date().toISOString(),
            retryCount: 0
        };
    }

    const current = state.shipments[shipmentId];

    // Apply updates
    if (updates.phase) current.state = updates.phase;
    if (updates.activeAgent !== undefined) current.agent = updates.activeAgent; // Allow null to clear

    if (updates.context) {
        current.context = { ...current.context, ...updates.context };
    }

    // Reset or Increment Retry Count logic could go here, but Orchestrator handles that usually
    if (updates.resetRetry) {
        current.retryCount = 0;
    } else if (updates.incrementRetry) {
        current.retryCount = (current.retryCount || 0) + 1;
    }

    current.lastUpdated = new Date().toISOString();

    saveState(state);

    // Log intent for traceability (stdout is our "audit log" for now)
    // console.log(`[STATE] ${shipmentId} -> ${current.state}`);
}

// Brutal Reset
export function resetState(shipmentId) {
    const state = loadState();
    if (state.shipments[shipmentId]) {
        state.shipments[shipmentId] = {
            state: PHASES.IDLE,
            agent: null,
            context: {},
            lastUpdated: new Date().toISOString(),
            retryCount: 0
        };
        saveState(state);
    }
}
