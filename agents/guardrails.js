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

        // 1. Reality Check
        if (!analysis_result || !analysis_result.disruption_detected) {
            // If analysis says no disruption, but we are here, something is odd.
            // But technically, if no disruption, orchestrator shouldn't have called us.
            // Assuming Orchestrator calls us regardless:
            return {
                allowed: false,
                result: "BLOCKED_FALSE_POSITIVE",
                reason: "Analysis confirmed no active disruption requiring intervention.",
                rule_id: "REALITY_CHECK"
            };
        }

        // 2. Idempotency Check (Prevent Double Spend)
        try {
            if (fs.existsSync('./logs/decisions.log.json')) {
                const logs = JSON.parse(fs.readFileSync('./logs/decisions.log.json', 'utf8'));

                // Look for RECENT interventions on same shipment (last 60 mins)
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
            // Default to safe open if log read fails? Or Block? 
            // For safety, we might log warning but allow, or block. 
            // Let's allow but warn, assuming transient FS issue.
        }

        return {
            allowed: true,
            result: "ALLOWED",
            reason: null
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

        // 1. No Options Check (Should be handled by Orchestrator, but good to double check)
        if (!options || options.length === 0) {
            // This isn't really a guardrail block, it's a "No Options" outcome.
            // However, if we must return a GUARDRAIL_RESULT:
            return {
                allowed: false,
                result: "BLOCKED_SAFETY", // Or specific enum if we had one for "No Options"
                reason: "No options provided to safety check.",
                rule_id: "EMPTY_OPTIONS"
            };
        }

        // 2. Policy: Don't spend more than budget even if negotiator says yes (Defense in depth)
        const budgetLimit = approved_budget || 0;

        // We are checking the *Set* of options. 
        // If *any* option is valid, we usually ALLOW, and rely on Negotiator to pick the best.
        // BUT, if ALL options violate critical safety rules, we BLOCK.

        const strictSafetyCheck = options.every(opt => opt.estimated_cost > budgetLimit * 1.5); // Example: 50% over budget is HARD STOP

        if (strictSafetyCheck) {
            return {
                allowed: false,
                result: "BLOCKED_POLICY",
                reason: "All generated options exceed emergency budget cap (150%).",
                rule_id: "BUDGET_HARD_CAP"
            };
        }

        // 3. ROI / Value Check (Example: Don't spend $5k to save a $100 shipment)
        // input.shipment_value would be needed here. 
        // Assuming we always allow for now unless hard cap hit.

        return {
            allowed: true,
            result: "ALLOWED",
            reason: null
        };
    }
};
