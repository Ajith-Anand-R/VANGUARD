import fs from 'fs';

export function run(input) {
    if (input.decision_type === 'NO_ACTION') {
        return {
            timestamp: new Date().toISOString(),
            agent: 'PostExecutionMonitor',
            shipment_id: input.shipment_id,
            monitoring_status: 'skipped',
            reason: 'no_action_taken',
            previous_data: input
        };
    }

    if (input.execution_status !== 'completed') {
        return {
            timestamp: new Date().toISOString(),
            agent: 'PostExecutionMonitor',
            shipment_id: input.shipment_id,
            monitoring_status: 'skipped',
            reason: 'execution_failed',
            previous_data: input
        };
    }

    const selectedOption = input.previous_data.selected_option;
    const expectedSlaRecovery = selectedOption.sla_recovery_percent;
    const residualRisk = input.previous_data.residual_sla_breach_risk;

    const actualSlaRecovery = expectedSlaRecovery + Math.round((Math.random() - 0.5) * 10);
    const recoveryMet = actualSlaRecovery >= (expectedSlaRecovery - 5);

    return {
        timestamp: new Date().toISOString(),
        agent: 'PostExecutionMonitor',
        shipment_id: input.shipment_id,
        monitoring_status: 'completed',
        expected_sla_recovery: expectedSlaRecovery,
        actual_sla_recovery: actualSlaRecovery,
        recovery_met: recoveryMet,
        deviation: actualSlaRecovery - expectedSlaRecovery,
        assessment: recoveryMet ? 'WITHIN_TOLERANCE' : 'REPLANNING_REQUIRED',
        previous_data: input
    };
}
