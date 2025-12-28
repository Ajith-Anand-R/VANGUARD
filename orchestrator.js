import { PHASES, updateState, getShipmentState } from './stateManager.js';

// Agents (Importing pure functions)
import { run as sentinel } from './agents/sentinel.js';
import { run as signalMonitor } from './agents/signalMonitor.js';
import { run as rootCauseAnalyzer } from './agents/rootCauseAnalyzer.js';
import { run as optionGenerator } from './agents/optionGenerator.js';
import { run as lossRecoveryAuditor } from './agents/lossRecoveryAuditor.js';
import { run as negotiator } from './agents/negotiator.js';
import { run as treasurer } from './agents/treasurer.js';
import { run as postExecutionMonitor } from './agents/postExecutionMonitor.js';
import { run as decisionLogger } from './agents/decisionLogger.js';
import { guardrails } from './agents/guardrails.js';

// Configuration
const TICK_RATE_MS = 2000; // System ticks every 2s
const MAX_RETRIES = 3;

// Helper: Simulate "thinking" or processing time implicitly by just checking timestamps?
// For now, allow one transition per tick per shipment.

const activeExecutions = new Set();

let eventEmitter = null;

export function setEventEmitter(fn) {
    eventEmitter = fn;
}

function emit(type, payload) {
    if (eventEmitter) {
        eventEmitter({ type, ...payload });
    }
}

// SKIP REASON ENUM
// Axis 1: Incident Reality (World State)
export const INCIDENT_REALITY = {
    ACTIVE: "ACTIVE",                     // Disruption exists
    RESOLVED_EXTERNALLY: "RESOLVED_EXTERNALLY", // Resolved outside system
    NO_REAL_INCIDENT: "NO_REAL_INCIDENT"  // Signal noise / false trigger
};

// Axis 2: Guardrail Result (Eligibility)
export const GUARDRAIL_RESULT = {
    ALLOWED: "ALLOWED",
    BLOCKED_REDUNDANT: "BLOCKED_REDUNDANT",
    BLOCKED_FALSE_POSITIVE: "BLOCKED_FALSE_POSITIVE",
    BLOCKED_POLICY: "BLOCKED_POLICY",
    BLOCKED_SAFETY: "BLOCKED_SAFETY"
};

// Axis 3: Decision Outcome (Action)
// Rule: decision_outcome describes what the system ultimately did,
// guardrail_result explains why certain paths were not allowed.
export const DECISION_OUTCOME = {
    INTERVENTION_EXECUTED: "INTERVENTION_EXECUTED",
    NO_ACTION_REDUNDANT: "NO_ACTION_REDUNDANT",
    NO_ACTION_NO_OPTIONS: "NO_ACTION_NO_OPTIONS",
    NO_ACTION_GUARDRAIL_BLOCKED: "NO_ACTION_GUARDRAIL_BLOCKED",
    OBSERVED_ONLY: "OBSERVED_ONLY",
    FAILURE_INTERNAL: "FAILURE_INTERNAL"
};

export async function processShipmentState(shipmentId) {
    const currentState = getShipmentState(shipmentId);

    if (!currentState) return; // Nothing to do

    const { state, context, retryCount } = currentState;

    // --- FIX 1: INCIDENT LOCK ---
    // Prevent parallel executions for the same incident
    if (activeExecutions.has(shipmentId)) {
        console.log(`[ORCHESTRATOR] Skipping ${shipmentId} - Already executing.`);
        return;
    }

    // --- FIX: GLOBAL INVARIANT CHECK ---
    // If we are "At Risk" but the aggregated risk is actually low (re-calculated or stale),
    // force stabilization.
    if (state === PHASES.AT_RISK && context.aggregate_risk && context.aggregate_risk < 50) { // 50 is safe floor
        console.log(`[ORCHESTRATOR] Invariant Enforced: Risk ${context.aggregate_risk}% < Threshold. Stabilizing.`);
        updateState(shipmentId, {
            phase: PHASES.STABILIZED,
            activeAgent: null,
            context: { final_decision: 'STABILIZED_LOW_RISK' }
        });
        return;
    }

    // Only lock validation states that trigger autonomous chains
    // Passive monitoring states like STABILIZED do not need locks usually, 
    // but if we are "Thinking", we lock.
    const lockingStates = [
        PHASES.AT_RISK,
        PHASES.ANALYZING,
        PHASES.GUARDRAILS_PRECHECK,
        PHASES.GENERATING_OPTIONS,
        PHASES.GUARDRAILS_POSTCHECK,
        PHASES.DECISION_PENDING,
        PHASES.NEGOTIATING,
        PHASES.EXECUTING,
        PHASES.POST_EXECUTION_MONITORING,
        PHASES.LOGGING
    ];

    if (lockingStates.includes(state)) {
        activeExecutions.add(shipmentId);
    }

    try {
        switch (state) {
            case PHASES.AT_RISK:
                emit('agent_start', { agent: 'SignalMonitor', shipmentId, phase: PHASES.ANALYZING });
                // Transition to ANALYZING
                updateState(shipmentId, {
                    phase: PHASES.ANALYZING,
                    activeAgent: 'SignalMonitor'
                });
                break;

            case PHASES.ANALYZING:
                emit('agent_start', { agent: 'SignalMonitor', shipmentId, phase: PHASES.ANALYZING });
                const monResult = signalMonitor({ shipment_id: shipmentId, ...context });
                emit('agent_log', { agent: 'SignalMonitor', log: `Analysis complete. Severity: ${monResult.severity}. Disruption detected: ${monResult.disruption_detected}` });

                // INVARIANT CHECK 1: If no disruption OR severity too low, ABORT.
                if (!monResult.disruption_detected) {
                    emit('agent_end', { agent: 'SignalMonitor', status: 'success', shipmentId }); // Success means "Successfully determined no issue"
                    emit('agent_log', { agent: 'System', log: `Invariant Check: Severity ${monResult.severity} below threshold. Stabilizing.` });

                    updateState(shipmentId, {
                        phase: PHASES.STABILIZED,
                        activeAgent: null,
                        context: {
                            analysis: monResult,
                            final_decision: 'OBSERVED_ONLY',
                            final_log: { // Mock log for UI consistency
                                decision_outcome: 'OBSERVED_ONLY',
                                decision_type: 'OBSERVED_ONLY',
                                timestamp: new Date().toISOString(),
                                incident_id: `INC-${Date.now()}`
                            }
                        }
                    });
                    return;
                }

                const rcResult = rootCauseAnalyzer(monResult);
                emit('agent_log', { agent: 'RootCauseAnalyzer', log: `Root Cause identified: ${rcResult.root_cause} (Conf: ${rcResult.confidence})` });
                emit('agent_end', { agent: 'SignalMonitor', status: 'issue_detected', shipmentId });

                // INVARIANT CHECK 2: Mandatory Root Cause
                if (rcResult.root_cause === 'UNKNOWN_DISRUPTION' && rcResult.confidence < 0.4) {
                    emit('agent_log', { agent: 'System', log: `Invariant Check: Root Cause ambiguous (Confidence ${rcResult.confidence}). Escalation aborted.` });

                    // Log as Observed/Monitor Only
                    updateState(shipmentId, {
                        phase: PHASES.STABILIZED,
                        activeAgent: null,
                        context: {
                            analysis: monResult,
                            root_cause: rcResult,
                            final_decision: 'OBSERVED_ONLY'
                        }
                    });
                    return;
                }

                // NEXT: GUARDRAILS PRE-CHECK
                updateState(shipmentId, {
                    phase: PHASES.GUARDRAILS_PRECHECK,
                    activeAgent: 'Guardrails',
                    context: {
                        signal_analysis: monResult,
                        root_cause: rcResult
                    }
                });
                break;

            case PHASES.GUARDRAILS_PRECHECK:
                emit('agent_start', { agent: 'Guardrails', shipmentId, phase: PHASES.GUARDRAILS_PRECHECK });

                const preCheckInput = {
                    shipment_id: shipmentId,
                    analysis_result: context.signal_analysis,
                    incident_id: context.signal_analysis.incident_id // implied existence
                };

                const preCheck = await guardrails.checkEligibility(preCheckInput);

                if (preCheck.allowed) {
                    emit('agent_log', { agent: 'Guardrails', log: `Eligibility check passed. Rule: ${preCheck.rule_id || 'DEFAULT'}` });
                    emit('agent_end', { agent: 'Guardrails', status: 'success', shipmentId });

                    updateState(shipmentId, {
                        phase: PHASES.GENERATING_OPTIONS,
                        activeAgent: 'OptionGenerator',
                        context: { ...context, guardrails_pre: preCheck }
                    });
                } else {
                    emit('agent_log', { agent: 'Guardrails', log: `Eligibility check BLOCKED. Reason: ${preCheck.reason}` });
                    emit('phase_skip', { phase: PHASES.EXECUTING, status: 'SKIPPED', reason: preCheck.reason, shipmentId });

                    // Direct to LOGGING
                    emit('agent_end', { agent: 'Guardrails', status: 'blocked', shipmentId });

                    // Construct NO_ACTION outcome
                    const decisionOutcome = {
                        incident_reality: preCheck.result === "BLOCKED_FALSE_POSITIVE" ? INCIDENT_REALITY.NO_REAL_INCIDENT : INCIDENT_REALITY.ACTIVE, // Or RESOLVED if that was the check
                        guardrail_result: preCheck.result,
                        decision_outcome: preCheck.result === "BLOCKED_FALSE_POSITIVE" ? DECISION_OUTCOME.OBSERVED_ONLY : DECISION_OUTCOME.NO_ACTION_REDUNDANT, // or GUARDRAIL_BLOCKED based on reason
                        system_action: preCheck.result === "BLOCKED_FALSE_POSITIVE" ? "Monitoring only" : "Skipped (Redundant)",
                        confidence: 1.0,
                        timestamp: new Date().toISOString()
                    };

                    // Execute atomic logging here (mini-routine since we skip others)
                    await executeAtomicLogging(shipmentId, { ...context, ...decisionOutcome });
                }
                break;

            case PHASES.GENERATING_OPTIONS:
                emit('agent_start', { agent: 'OptionGenerator', shipmentId, phase: PHASES.GENERATING_OPTIONS });
                const optResult = optionGenerator(context.root_cause);
                emit('agent_log', { agent: 'OptionGenerator', log: `Generated ${optResult.options.length} options.` });
                emit('agent_end', { agent: 'OptionGenerator', status: 'success', shipmentId });

                if (optResult.options.length === 0) {
                    // NO OPTIONS CASE
                    const decisionOutcome = {
                        incident_reality: INCIDENT_REALITY.ACTIVE,
                        guardrail_result: GUARDRAIL_RESULT.ALLOWED,
                        decision_outcome: DECISION_OUTCOME.NO_ACTION_NO_OPTIONS,
                        system_action: "No viable options generated",
                        confidence: 1.0,
                        timestamp: new Date().toISOString()
                    };
                    await executeAtomicLogging(shipmentId, { ...context, options_data: optResult, ...decisionOutcome });
                } else {
                    updateState(shipmentId, {
                        phase: PHASES.GUARDRAILS_POSTCHECK,
                        activeAgent: 'Guardrails',
                        context: { ...context, options_data: optResult }
                    });
                }
                break;

            case PHASES.GUARDRAILS_POSTCHECK:
                // --- AUDITOR STEP (Budget Authorization) ---
                emit('agent_start', { agent: 'LossRecoveryAuditor', shipmentId, phase: PHASES.GUARDRAILS_POSTCHECK });
                const auditorResult = lossRecoveryAuditor(context.options_data);
                const approvedBudget = auditorResult.budget_approved; // REAL BUDGET
                emit('agent_log', { agent: 'LossRecoveryAuditor', log: `Budget authorized: $${approvedBudget}` });
                emit('agent_end', { agent: 'LossRecoveryAuditor', status: 'success', shipmentId });

                // --- GUARDRAILS POST-CHECK (Safety/Policy) ---
                emit('agent_start', { agent: 'Guardrails', shipmentId, phase: PHASES.GUARDRAILS_POSTCHECK });

                const postCheckInput = {
                    options: context.options_data.options,
                    approved_budget: approvedBudget
                };

                const postCheck = await guardrails.checkSafety(postCheckInput);

                if (postCheck.allowed) {
                    emit('agent_log', { agent: 'Guardrails', log: `Safety check passed.` });
                    emit('agent_end', { agent: 'Guardrails', status: 'success', shipmentId });

                    updateState(shipmentId, {
                        phase: PHASES.NEGOTIATING,
                        activeAgent: 'Negotiator',
                        context: {
                            ...context,
                            auditor_data: auditorResult, // Keep audit trail
                            guardrails_post: postCheck,
                            approved_budget: approvedBudget
                        }
                    });
                } else {
                    emit('agent_log', { agent: 'Guardrails', log: `Safety check BLOCKED. Reason: ${postCheck.reason}` });
                    emit('phase_skip', { phase: PHASES.EXECUTING, status: 'SKIPPED', reason: postCheck.reason, shipmentId });
                    emit('agent_end', { agent: 'Guardrails', status: 'blocked', shipmentId });

                    const decisionOutcome = {
                        incident_reality: INCIDENT_REALITY.ACTIVE,
                        guardrail_result: postCheck.result,
                        decision_outcome: DECISION_OUTCOME.NO_ACTION_GUARDRAIL_BLOCKED,
                        system_action: "Blocked by Safety Guardrails",
                        confidence: 1.0,
                        timestamp: new Date().toISOString()
                    };
                    await executeAtomicLogging(shipmentId, { ...context, ...decisionOutcome });
                }
                break;

            case PHASES.NEGOTIATING:
                // FIX #2: DO NOT RUN NEGOTIATOR IF ZERO OPTIONS SURVIVE (User Requirement)
                // Filter for viable options. 
                // Note: If OptionGenerator does not set 'viable', this correctly treats them as non-viable until fixed.
                const viableOptions = context.options_data.options.filter(o => o.viable === true);
                if (viableOptions.length === 0 && context.options_data.options.length > 0) {
                    const noOptionOutcome = {
                        incident_reality: INCIDENT_REALITY.ACTIVE,
                        guardrail_result: GUARDRAIL_RESULT.ALLOWED,
                        decision_outcome: DECISION_OUTCOME.NO_ACTION_NO_OPTIONS,
                        system_action: "No viable options generated (Optimization space exhausted)",
                        confidence: 1.0,
                        timestamp: new Date().toISOString()
                    };
                    await executeAtomicLogging(shipmentId, { ...context, ...noOptionOutcome });
                    break; // Short-circuit
                }

                emit('agent_start', { agent: 'Negotiator', shipmentId, phase: PHASES.NEGOTIATING });

                let decisionOutcome = {
                    incident_reality: INCIDENT_REALITY.ACTIVE,
                    guardrail_result: GUARDRAIL_RESULT.ALLOWED,
                    decision_outcome: DECISION_OUTCOME.FAILURE_INTERNAL,
                    system_action: "System Error — Execution Aborted",
                    timestamp: new Date().toISOString()
                };

                try {
                    // 1. Negotiation (Optimization Only now)
                    // We need to shape the input as Negotiator expects.
                    const negContext = {
                        ...context,
                        previous_data: { // Emulating chain
                            options: context.options_data.options,
                            shipment: context.signal_analysis.shipment
                        },
                        budget_approved: context.approved_budget
                    };

                    const negResult = negotiator(negContext);
                    emit('agent_log', { agent: 'Negotiator', log: `Negotiation status: ${negResult.status}` });

                    // Negotiator might still fail to find a viable option even if guardrails passed (e.g. constraints)
                    if (negResult.status === 'no_viable_options' || !negResult.selected_option) {
                        decisionOutcome = {
                            incident_reality: INCIDENT_REALITY.ACTIVE,
                            guardrail_result: GUARDRAIL_RESULT.ALLOWED,
                            decision_outcome: DECISION_OUTCOME.NO_ACTION_NO_OPTIONS, // Or Internal Failure if unexpected
                            system_action: "Negotiator failed to optimize",
                            negotiation: negResult,
                            timestamp: new Date().toISOString()
                        };
                        emit('phase_skip', { phase: PHASES.EXECUTING, status: 'SKIPPED', reason: "No viable option found in negotiation", shipmentId });
                        emit('agent_end', { agent: 'Negotiator', status: 'failure', shipmentId });
                    } else {
                        emit('agent_end', { agent: 'Negotiator', status: 'success', shipmentId });

                        // 2. Execution
                        emit('agent_start', { agent: 'Treasurer', shipmentId, phase: PHASES.EXECUTING });
                        const treasResult = treasurer(negResult);
                        emit('agent_log', { agent: 'Treasurer', log: `Execution processed. Cost: ${treasResult.total_cost}` });
                        emit('agent_end', { agent: 'Treasurer', status: 'success', shipmentId });

                        // 3. Monitoring
                        emit('agent_start', { agent: 'PostExecutionMonitor', shipmentId, phase: PHASES.POST_EXECUTION_MONITORING });
                        const peResult = postExecutionMonitor(treasResult);
                        emit('agent_log', { agent: 'PostExecutionMonitor', log: `Verification complete.` });
                        emit('agent_end', { agent: 'PostExecutionMonitor', status: 'success', shipmentId });

                        decisionOutcome = {
                            incident_reality: INCIDENT_REALITY.ACTIVE,
                            guardrail_result: GUARDRAIL_RESULT.ALLOWED,
                            decision_outcome: DECISION_OUTCOME.INTERVENTION_EXECUTED,
                            system_action: "Intervention Executed",
                            negotiation: negResult,
                            execution: treasResult,
                            post_execution: peResult,
                            timestamp: new Date().toISOString()
                        };
                    }

                } catch (error) {
                    console.error("Negotiator/Execution Error:", error);
                    decisionOutcome.error = error.message;
                    decisionOutcome.decision_outcome = DECISION_OUTCOME.FAILURE_INTERNAL;
                    decisionOutcome.system_action = "System Error — Execution Aborted";

                    await executeAtomicLogging(shipmentId, { ...context, ...decisionOutcome });
                    break; // FIX #3: FAILURE_INTERNAL MUST SHORT-CIRCUIT
                }

                // If we get here, success logic flows to updateState or finalize
                await executeAtomicLogging(shipmentId, { ...context, ...decisionOutcome });
                break;

            case PHASES.DECISION_PENDING:
                // Legacy phase, now absorbed into flow logic or unused. 
                // Safely ignore or clean up state.
                break;

            // REMOVING REDUNDANT PHASES
            // EXECUTING, POST_EXECUTION, LOGGING are now atomic parts of NEGOTIATING block to ensure safety.


            case PHASES.STABILIZED:
                // Resting state. Do nothing.
                break;

            case PHASES.IDLE:
                // Waiting for trigger. Do nothing.
                break;

            case PHASES.NO_VIABLE_SOLUTION:
                // Terminal state. Do nothing.
                break;

            default:
                console.warn(`[ORCHESTRATOR] Unknown state: ${state}`);
        }

    } catch (error) {
        console.error(`[ORCHESTRATOR] Error processing ${shipmentId} in state ${state}:`, error);

        if ((retryCount || 0) < MAX_RETRIES) {
            console.log(`[ORCHESTRATOR] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            updateState(shipmentId, { incrementRetry: true });
        } else {
            console.error(`[ORCHESTRATOR] Max retries exceeded. Moving to MANUAL_INTERVENTION.`);
            emit('agent_end', { agent: 'System', status: 'error', error: error.message, shipmentId });
            updateState(shipmentId, {
                phase: PHASES.MANUAL_INTERVENTION,
                activeAgent: null,
                context: { error: error.message }
            });
        }
    } finally {
        // --- FIX 1: RELEASE LOCK ---
        activeExecutions.delete(shipmentId);
    }
}

// Helper for guaranteed logging in new flow
async function executeAtomicLogging(shipmentId, decisionContext) {
    emit('agent_start', { agent: 'DecisionLogger', shipmentId, phase: PHASES.LOGGING });

    try {
        const logResult = decisionLogger(decisionContext);

        emit('agent_log', { agent: 'DecisionLogger', log: `Decision logged: ${decisionContext.decision_outcome}` });
        emit('agent_end', { agent: 'DecisionLogger', status: 'success', shipmentId });

        updateState(shipmentId, {
            phase: PHASES.STABILIZED,
            activeAgent: null,
            context: { final_log: logResult }
        });
    } catch (err) {
        console.error("Logging Error", err);
        emit('agent_log', { agent: 'DecisionLogger', log: `Logging Failed: ${err.message}` });
        // Force stabilize
        updateState(shipmentId, { phase: PHASES.STABILIZED });
    }
}

// Sentinel check remains similar but stateless-ish
export async function executeSentinelCheck(input) {
    const sentinelResult = sentinel(input);
    return sentinelResult;
}
