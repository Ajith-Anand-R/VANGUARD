import fs from 'fs';

// Role: Eligibility Gatekeeper
// Guardrails do not decide actions. They only determine whether the system is allowed to proceed to the next phase.

export const guardrails = {
    /**
     * PRE-COMPUTATION CHECK
     * Determines if the incident itself is valid for processing.
     * Checks: Idempotency, Signal Noise, Previous Resolutions.
     * @param {Object} input - { shipment_id, analysis_result, incident_id }
     * @returns {Object} - { allowed: boolean, result: GUARDRAIL_RESULT, reason: string | null }
     */
    checkEligibility: async (input) => {
        const { shipment_id, analysis_result, incident_id } = input;

        // 1. Reality Check: Is there actually a disruption?
        if (!analysis_result || !analysis_result.disruption_detected) {
            return {
                allowed: false,
                result: "BLOCKED_FALSE_POSITIVE",
                reason: "Analysis confirmed no active disruption requiring intervention.",
                rule_id: "REALITY_CHECK"
            };
        }

        // 2. Meaningful Risk Check (New)
        if (input.analysis_result && input.analysis_result.severity < 15) {
            return {
                allowed: false,
                result: "BLOCKED_LOW_SEVERITY",
                reason: `Severity ${input.analysis_result.severity} is below autonomous threshold (15).`,
                rule_id: "MIN_SEVERITY_THRESHOLD"
            };
        }

        // 3. Idempotency Check (Prevent Double Spend)
        try {
            if (fs.existsSync('./logs/decisions.log.json')) {
                const logs = JSON.parse(fs.readFileSync('./logs/decisions.log.json', 'utf8'));

                const recentIntervention = logs.reverse().find(l =>
                    (l.full_trace?.signal?.shipment_id === shipment_id || l.incident_id?.includes(shipment_id)) &&
                    l.decision_outcome === "INTERVENTION_EXECUTED" &&
                    (new Date() - new Date(l.timestamp)) < 1000 * 60 * 60 // 1 Hour Window
                );

                if (recentIntervention) {
                    return {
                        allowed: false,
                        result: "BLOCKED_REDUNDANT",
                        reason: `Incident already resolved recently (Incident ID: ${recentIntervention.incident_id}).`,
                        rule_id: "IDEMPOTENCY_WINDOW"
                    };
                }
            }
        } catch (e) {
            console.warn("Guardrails Idempotency Check Failed (File Access):", e);
        }

        return {
            allowed: true,
            result: "ALLOWED",
            reason: "Disruption verified, severity above threshold.",
            rule_id: "VALID_INCIDENT"
        };
    },

    /**
     * POST-COMPUTATION CHECK
     * Determines if the generated options are safe and worth executing.
     * Checks: Budget limits, ROI, Policy constraints.
     * @param {Object} input - { options, approved_budget, shipment_value }
     * @returns {Object} - { allowed: boolean, result: GUARDRAIL_RESULT, reason: string | null }
     */
    checkSafety: async (input) => {
        const { options, approved_budget } = input;

        // 1. No Options Check 
        if (!options || options.length === 0) {
            return {
                allowed: false,
                result: "BLOCKED_SAFETY",
                reason: "No feasible options generated.",
                rule_id: "EMPTY_OPTIONS"
            };
        }

        const budgetLimit = approved_budget || 0;

        // 2. STRICT BUDGET CHECK
        // If the *cheapest* option matches budget but others don't, we can pass,
        // but if *ALL* options are way over budget, we must BLOCK.

        const cheapestOption = options.reduce((min, o) => o.estimated_cost < min.estimated_cost ? o : min, options[0]);

        if (cheapestOption.estimated_cost > budgetLimit) {
            return {
                allowed: false,
                result: "BLOCKED_BUDGET",
                reason: `Even cheapest option ($${cheapestOption.estimated_cost}) exceeds budget ($${budgetLimit}).`,
                rule_id: "BUDGET_HARD_CAP"
            };
        }

        // 3. ROI Check
        // If risk is high and budget is high, blocking might be wise if shipment value is low.
        // For now, simpler rule:
        if (options.length === 1 && options[0].confidence < 0.5) {
            return {
                allowed: false,
                result: "BLOCKED_LOW_CONFIDENCE",
                reason: "Only one option available and confidence is too low (< 0.5).",
                rule_id: "MIN_CONFIDENCE"
            };
        }

        return {
            allowed: true,
            result: "ALLOWED",
            reason: "Options verified against budget and safety rules.",
            rule_id: "SAFETY_PASSED"
        };
    }
};
