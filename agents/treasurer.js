import fs from 'fs';

export function run(input) {
    if (input.decision_type === 'NO_ACTION') {
        return {
            timestamp: new Date().toISOString(),
            agent: 'Treasurer',
            shipment_id: input.shipment_id,
            execution_status: 'no_action_taken',
            decision_type: 'NO_ACTION',
            rationale: input.rationale,
            budget_movement: null,
            previous_data: input
        };
    }

    if (!input.selected_option) {
        return {
            timestamp: new Date().toISOString(),
            agent: 'Treasurer',
            shipment_id: input.shipment_id,
            execution_status: 'no_viable_execution',
            decision_type: 'FAILED',
            previous_data: input
        };
    }

    const budget = JSON.parse(fs.readFileSync(getDataPath('budget.json'), 'utf8'));
    const shipments = JSON.parse(fs.readFileSync(getDataPath('shipments.json'), 'utf8'));

    // --- FIX 2: IDEMPOTENCY CHECK ---
    const existingTransaction = budget.transactions.find(t => t.shipment_id === input.shipment_id);
    if (existingTransaction) {
        return {
            timestamp: new Date().toISOString(),
            agent: 'Treasurer',
            shipment_id: input.shipment_id,
            execution_status: 'skipped_already_executed',
            decision_type: 'ALREADY_HANDLED',
            transaction: existingTransaction,
            previous_data: input
        };
    }

    const selectedOption = input.selected_option;
    const cost = selectedOption.negotiated_cost;
    const budgetBefore = budget.available;

    if (budget.available < cost) {
        return {
            timestamp: new Date().toISOString(),
            agent: 'Treasurer',
            shipment_id: input.shipment_id,
            execution_status: 'insufficient_funds',
            decision_type: 'FAILED',
            budget_movement: {
                before: budgetBefore,
                requested: cost,
                after: budgetBefore
            },
            previous_data: input
        };
    }

    budget.available -= cost;
    budget.allocated += cost;

    const budgetAfter = budget.available;

    const transaction = {
        transaction_id: `TX-${Date.now()}`,
        timestamp: new Date().toISOString(),
        amount: cost,
        source: 'emergency_reserve',
        destination: selectedOption.supplier ? selectedOption.supplier.name : selectedOption.type,
        shipment_id: input.shipment_id,
        approved_by: 'LossRecoveryAuditor',
        executed_by: 'Treasurer',
        recovery_budget_ceiling: input.previous_data.budget_approved
    };

    budget.transactions.push(transaction);

    const shipment = shipments[input.shipment_id];
    const now = new Date();
    const newEta = new Date(now.getTime() + (selectedOption.delivery_hours * 60 * 60 * 1000));

    shipment.current_eta = newEta.toISOString();
    shipment.status = 'rerouted';

    if (selectedOption.supplier) {
        shipment.supplier_id = selectedOption.supplier.id;
        shipment.carrier = `Expedited via ${selectedOption.supplier.name}`;
    } else {
        shipment.carrier = selectedOption.type;
    }

    // Write updates
    fs.writeFileSync(getDataPath('budget.json'), JSON.stringify(budget, null, 2));
    fs.writeFileSync(getDataPath('shipments.json'), JSON.stringify(shipments, null, 2));

    return {
        timestamp: new Date().toISOString(),
        agent: 'Treasurer',
        shipment_id: input.shipment_id,
        execution_status: 'completed',
        decision_type: 'INTERVENTION',
        transaction: transaction,
        budget_movement: {
            recovery_budget_ceiling: input.previous_data.budget_approved,
            emergency_reserve_before: budgetBefore,
            spent: cost,
            emergency_reserve_after: budgetAfter,
            remaining_authority: input.previous_data.budget_approved - cost
        },
        shipment_updated: {
            new_eta: shipment.current_eta,
            new_status: shipment.status,
            new_supplier: shipment.supplier_id,
            new_carrier: shipment.carrier
        },
        previous_data: input
    };
}
