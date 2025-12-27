
const BASE_URL = 'http://localhost:3000';

async function post(data) {
    try {
        const response = await fetch(`${BASE_URL}/trigger-eta-drift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data
        });
        const text = await response.text();
        console.log(`STATUS: ${response.status} BODY: ${text}`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function runTests() {
    console.log("Triggering Case A: 48h Delay (Action Taken)...");
    await post(JSON.stringify({ shipment_id: "SH-4429", delay_hours: 48 }));

    await new Promise(r => setTimeout(r, 8000)); // Wait for execution

    console.log("Triggering Case B: 2h Delay (No Action)...");
    await post(JSON.stringify({ shipment_id: "SH-4429", delay_hours: 2 }));

    await new Promise(r => setTimeout(r, 8000));

    console.log("Triggering Case C: 500h Delay (Failure)...");
    await post(JSON.stringify({ shipment_id: "SH-4429", delay_hours: 500 }));
}

runTests();
