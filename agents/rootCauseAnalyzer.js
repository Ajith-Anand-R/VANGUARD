import fs from 'fs';

export function run(input) {
    const suppliers = JSON.parse(fs.readFileSync('./data/suppliers.json', 'utf8'));
    const shipment = input.shipment;
    const supplier = suppliers[shipment.supplier_id];

    let rootCause = 'unknown';
    let causeDetails = '';

    if (input.delay_hours > 24) {
        if (supplier.reliability_score < 0.8) {
            rootCause = 'SUPPLIER_DELAY';
            causeDetails = `${supplier.name} has reliability score of ${supplier.reliability_score}, delayed production by ${Math.round(input.delay_hours)} hours`;
        } else if (input.delay_hours > 36) {
            rootCause = 'CARRIER_FAILURE';
            causeDetails = `Carrier ${shipment.carrier} experienced significant delays`;
        } else {
            rootCause = 'ROUTE_CONGESTION';
            causeDetails = `Route from ${shipment.origin} to ${shipment.destination} is congested.`;
        }
    } else if (input.delay_hours > 0) {
        rootCause = 'MINOR_DELAY';
        causeDetails = 'Disruption detected but below critical threshold.';
    } else {
        rootCause = 'UNKNOWN_DISRUPTION';
        causeDetails = 'Anomaly detected but cause correlation failed.';
    }

    // MANDATORY SELECTION: Never let root_cause be undefined.
    const finalCause = rootCause !== 'unknown' ? rootCause : 'UNKNOWN_DISRUPTION';
    const confidence = finalCause === 'UNKNOWN_DISRUPTION' ? 0.3 : 0.9;

    return {
        timestamp: new Date().toISOString(),
        agent: 'RootCauseAnalyzer',
        shipment_id: input.shipment_id,
        root_cause: finalCause,
        cause_details: causeDetails,
        confidence: confidence,
        fallback_used: finalCause === 'UNKNOWN_DISRUPTION',
        affected_supplier: supplier,
        original_carrier: shipment.carrier,
        previous_data: input
    };
}
