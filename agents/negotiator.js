import fs from 'fs';
import { assertExecutionContext } from './contextSchema.js';

export function run(input) {
    try {
        // --- CONTRACT ENFORCEMENT ---
        const safeContext = assertExecutionContext(input);
        const approvedBudget = safeContext.budget;
        const options = safeContext.options;

        // Deep safe access for shipment
        const shipment = input.previous_data?.previous_data?.previous_data?.shipment ||
            input.previous_data?.previous_data?.shipment || // Fallback
            input.context?.signal_analysis?.shipment || // New Fallback
            {};
        const shipmentId = shipment.shipment_id || input.shipment_id || 'UNKNOWN';

        // Idempotency Check Removed - Handled by Guardrails Agent


        // SLA Logic: ABSOLUTE TIME COMPARISON
        // Simulation Fixed Time: Jan 1, 2025 00:00:00 UTC
        const simulationNow = new Date('2025-01-01T00:00:00Z');
        const slaDeadline = shipment.sla_deadline ? new Date(shipment.sla_deadline) : new Date(simulationNow.getTime() + 86400000 * 5); // Default 5 days

        // Configuration for scoring
        const MAX_ACCEPTABLE_RISK = 0.6;

        const scoredOptions = options.map(opt => {
            const estimatedCost = Number(opt.estimated_cost);
            const deliveryHours = Number(opt.delivery_hours);
            const reliability = Number(opt.reliability || 0.8);
            const riskScore = 1 - reliability; // Risk is inverse of reliability

            const withinBudget = estimatedCost <= approvedBudget;

            // SLA Absolute Check
            const estimatedArrival = new Date(simulationNow.getTime() + (deliveryHours * 60 * 60 * 1000));
            const meetsSla = estimatedArrival <= slaDeadline;

            // --- CONFIDENCE CALCULATION ---
            // Normalize scores (0 to 1)
            const budgetUtilization = Math.min(estimatedCost / (approvedBudget || 1), 1);
            const costScore = 1 - budgetUtilization; // Lower cost = Higher score matches

            // SLA Slack Score: How much ahead of deadline? 
            // If strictly met, score is good. If barely met, score is lower.
            const msUntilDeadline = slaDeadline.getTime() - estimatedArrival.getTime();
            const slaScore = meetsSla ? Math.min(msUntilDeadline / (24 * 60 * 60 * 1000), 1) : 0; // Cap at 1 day slack contribution

            // Weighted Confidence
            // 35% Cost, 30% SLA, 25% Risk, 10% Reliability
            let rawConfidence = (0.35 * costScore) + (0.30 * (meetsSla ? 0.8 + (slaScore * 0.2) : 0)) + (0.25 * (1 - riskScore)) + (0.10 * reliability);

            // Cap Confidence
            const confidence = Math.min(Math.round(rawConfidence * 100) / 100, 0.90);

            // Rejection Reasons
            let rejectionReason = null;
            if (!withinBudget) rejectionReason = "BUDGET_EXCEEDED (Negotiator Constraint)";
            else if (!meetsSla) rejectionReason = "SLA_CONSTRAINT (Negotiator Constraint)";
            else if (riskScore > MAX_ACCEPTABLE_RISK) rejectionReason = "RISK_THRESHOLD_EXCEEDED (Negotiator Constraint)";

            // Residual Risk Calculation
            const mitigationEff = reliability; // Use reliability as proxy for mitigation power
            const residualRiskVal = riskScore * 100 * (1 - mitigationEff);

            return {
                ...opt,
                withinBudget,
                meetsSla,
                confidence,
                residualRisk: residualRiskVal.toFixed(2),
                riskScore,
                rejectionReason
            };
        });

        // Filter valid options
        const viableOptions = scoredOptions.filter(o => !o.rejectionReason);

        // Sort by Confidence Descending
        viableOptions.sort((a, b) => b.confidence - a.confidence);

        // FAILURE MODE: If no viable options
        if (viableOptions.length === 0) {
            // Collect failure reasons for summary
            const reasons = [...new Set(scoredOptions.map(o => o.rejectionReason))].join(', ');

            return {
                timestamp: new Date().toISOString(),
                agent: 'Negotiator',
                shipment_id: shipmentId,
                status: 'failure',
                decision_type: 'FAILURE',
                rationale: `All options rejected. Reasons: ${reasons}`,
                all_options: scoredOptions,
                selected_option: null
            };
        }

        const bestOption = viableOptions[0];

        return {
            timestamp: new Date().toISOString(),
            agent: 'Negotiator',
            shipment_id: shipmentId,
            decision_type: 'AUTONOMOUS_INTERVENTION', // RENAMED
            selected_option: {
                ...bestOption,
                negotiated_cost: bestOption.estimated_cost
            },
            decision_confidence: bestOption.confidence,
            residual_sla_breach_risk: Number(bestOption.residualRisk),
            rationale: `Selected ${bestOption.type} (Conf: ${bestOption.confidence}) - Meets Budget & SLA.`,
            all_options: scoredOptions
        };
    } catch (error) {
        console.error("Negotiator Logic Error:", error);
        throw error;
    }
}
