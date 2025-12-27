import fs from 'fs';

export function run(input) {
    const suppliers = JSON.parse(fs.readFileSync('./data/suppliers.json', 'utf8'));
    const shipment = input.shipment;
    const supplier = suppliers[shipment.supplier_id];

    let rootCause = 'unknown';
    let causeDetails = '';

    if (input.delay_hours > 24) {
        if (supplier.reliability_score < 0.8) {
            rootCause = 'supplier_delay';
            causeDetails = `${supplier.name} has reliability score of ${supplier.reliability_score}, delayed production by ${Math.round(input.delay_hours)} hours`;
        } else if (input.delay_hours > 36) {
            rootCause = 'carrier_failure';
            causeDetails = `Carrier ${shipment.carrier} experienced significant delays`;
        } else {
            rootCause = 'route_congestion';
            causeDetails = `Route from ${shipment.origin} to ${shipment.destination} congested`;
        }
    } else {
        rootCause = 'minor_delay';
        causeDetails = 'Minimal disruption detected';
    }

    const detectedCause = rootCause !== 'unknown' ? rootCause : null;

    return {
        timestamp: new Date().toISOString(),
        agent: 'RootCauseAnalyzer',
        shipment_id: input.shipment_id,
        root_cause: detectedCause || "SUPPLIER_DELAY",
        cause_details: causeDetails,
        confidence: detectedCause ? 0.9 : 0.4,
        fallback_used: !detectedCause,
        affected_supplier: supplier,
        original_carrier: shipment.carrier,
        previous_data: input
    };
}
