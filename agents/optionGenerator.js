import fs from 'fs';

export function run(input) {
    const suppliers = JSON.parse(fs.readFileSync('./data/suppliers.json', 'utf8'));
    const shipment = input.previous_data.shipment;
    const baseValue = shipment.value * 0.1;

    const options = [];

    Object.values(suppliers).forEach(supplier => {
        if (supplier.id !== shipment.supplier_id && supplier.available) {
            const costMultiplier = supplier.base_cost;
            const estimatedCost = Math.round(baseValue * costMultiplier);
            const deliveryHours = supplier.avg_lead_time_hours;

            options.push({
                option_id: `OPT-${supplier.id}`,
                type: 'alternate_supplier',
                supplier: supplier,
                estimated_cost: estimatedCost,
                delivery_hours: deliveryHours,
                reliability: supplier.reliability_score
            });
        }
    });

    if (input.root_cause === 'carrier_failure') {
        options.push({
            option_id: 'OPT-AIR-001',
            type: 'air_freight_upgrade',
            estimated_cost: Math.round(baseValue * 1.5),
            delivery_hours: 18,
            reliability: 0.92
        });
    }

    options.push({
        option_id: 'OPT-SPLIT-001',
        type: 'split_shipment',
        estimated_cost: Math.round(baseValue * 0.5),
        delivery_hours: 36,
        reliability: 0.85,
        details: 'Partial fulfillment strategy'
    });

    return {
        timestamp: new Date().toISOString(),
        agent: 'OptionGenerator',
        shipment_id: input.shipment_id,
        options: options,
        options_count: options.length,
        previous_data: input
    };
}
