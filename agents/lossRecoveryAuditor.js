export function run(input) {
    const shipment = input.previous_data.previous_data.shipment;
    const severity = input.previous_data.previous_data.severity;
    const slaBreachProbability = input.previous_data.previous_data.sla_breach_probability;

    const slaBasePenalty = shipment.value * 0.15;
    const slaPenalty = (slaBreachProbability / 100) * slaBasePenalty;

    const inventoryHoldingCost = shipment.value * 0.02 * (input.previous_data.previous_data.delay_hours / 24);

    const customerChurnRisk = severity > 70 ? shipment.value * 0.15 : 0;

    const projectedLoss = Math.round(slaPenalty + inventoryHoldingCost + customerChurnRisk);

    const safetyMargin = 0.45;
    const maxRecoveryBudget = Math.round(projectedLoss * safetyMargin); // Reverted for production
    // const maxRecoveryBudget = 2000; // VERIFICATION REMOVED

    const minViableIntervention = shipment.value * 0.03;
    const actionRecommendation = maxRecoveryBudget >= minViableIntervention ? 'INTERVENTION_JUSTIFIED' : 'NO_ACTION_RECOMMENDED';

    return {
        timestamp: new Date().toISOString(),
        agent: 'LossRecoveryAuditor',
        shipment_id: input.shipment_id,
        financial_analysis: {
            sla_penalty: Math.round(slaPenalty),
            inventory_holding_cost: Math.round(inventoryHoldingCost),
            customer_churn_risk: Math.round(customerChurnRisk),
            projected_loss: projectedLoss,
            max_recovery_budget: maxRecoveryBudget,
            safety_margin: safetyMargin,
            min_viable_intervention: Math.round(minViableIntervention)
        },
        budget_approved: maxRecoveryBudget,
        action_recommendation: actionRecommendation,
        previous_data: input
    };
}
