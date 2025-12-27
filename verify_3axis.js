import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function triggerDrift(shipmentId, delayHours) {
    console.log(`\n--- TRIGGERING ${shipmentId} (Delay: ${delayHours}h) ---`);
    try {
        const res = await fetch(`${BASE_URL}/trigger-eta-drift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipment_id: shipmentId, delay_hours: delayHours })
        });
        const data = await res.json();
        console.log(`Trigger Response: ${JSON.stringify(data)}`);
    } catch (e) {
        console.error("Trigger Failed:", e.message);
    }
}

async function checkLogs(shipmentId) {
    console.log(`Checking logs for ${shipmentId}...`);
    try {
        const res = await fetch(`${BASE_URL}/status`);
        const status = await res.json();
        const logs = status.logs.filter(l => l.full_trace?.signal?.shipment_id === shipmentId || l.incident_id?.includes(shipmentId));

        if (logs.length === 0) {
            console.log("No logs found yet.");
            return;
        }

        const latest = logs[logs.length - 1]; // Get latest
        console.log(`\n[LATEST LOG FOR ${shipmentId}]`);
        console.log(`Timestamp: ${latest.timestamp}`);
        console.log(`Reality: ${latest.incident_reality}`);
        console.log(`Guardrail: ${latest.guardrail_result}`);
        console.log(`Outcome: ${latest.decision_outcome}`);
        console.log(`Action: ${latest.system_action}`);
        console.log(`Confidence: ${latest.confidence}`);
        console.log('--------------------------------------------------');
    } catch (e) {
        console.error("Log Check Failed:", e.message);
    }
}

async function updateBudget(amount) {
    // Mocking budget update if endpoint existed, or assume we rely on hardcoded mock in Orchestrator for now.
    // Since Orchestrator has "mock approved budget", we test logic by constraints.
    // Actually, we can't easily change the hardcoded mock in Orchestrator dynamically without an endpoint.
    // We will test logic assumptions.
}

async function runTests() {
    console.log("=== STARTING 3-AXIS VERIFICATION ===");

    // Test A: Fresh Incident (Expect INTERVENTION_EXECUTED or FAILURE depending on budget)
    // Note: SH-4429 has 45k value. 48h drift causes severe issues.
    // If budget is low, it might fail. But that's a valid 3-Axis result (FAILURE_INTERNAL or NO_ACTION_NO_OPTIONS).
    const idA = "SH-4429";
    await triggerDrift(idA, 48);
    await wait(6000); // 6s wait
    await checkLogs(idA);

    // Test B: Re-trigger Same Incident (Expect NO_ACTION_REDUNDANT)
    console.log(">>> Re-triggering same incident immediately (Idempotency Check)...");
    await triggerDrift(idA, 48);
    await wait(4000);
    await checkLogs(idA);

    console.log("=== VERIFICATION COMPLETE ===");
}

runTests();
