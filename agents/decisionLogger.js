import fs from 'fs';
import { getLogPath } from '../storage.js';

export function run(input) {
    let logs = [];
    try {
        logs = JSON.parse(fs.readFileSync(getLogPath('decisions.log.json'), 'utf8'));
    } catch (e) {
        logs = [];
    }

    // --- 3-AXIS CORE DATA ---
    // These specific keys are injected by the Orchestartor/Guardrails in the new flow.
    // Fallbacks are ONLY for legacy/testing safety, but strongly prefer explicit inputs.

    const trace = input; // Input IS the full context + outcome in new architecture

    const incidentReality = trace.incident_reality || "ACTIVE";
    const guardrailResult = trace.guardrail_result || "ALLOWED";
    const decisionOutcome = trace.decision_outcome || (trace.decision_type === 'FAILURE' ? 'FAILURE_INTERNAL' : 'INTERVENTION_EXECUTED');
    const systemAction = trace.system_action || "Unknown Action";

    // Extract Context Data
    const signalData = trace.signal_analysis || {};
    const rootCauseData = trace.root_cause || {};
    const optionsData = trace.options_data || {};
    const guardrailsPre = trace.guardrails_pre || {};
    const guardrailsPost = trace.guardrails_post || {};
    const auditorData = trace.audit_result || trace.audit_decision || {};
    const negotiationData = trace.negotiation || {};
    const treasurerData = trace.execution || {};
    const monitorData = trace.post_execution || {};

    const detectionTime = new Date(signalData.timestamp || new Date());
    const resolutionTime = new Date();
    const elapsedMs = resolutionTime - detectionTime;
    const elapsedSec = Math.round(elapsedMs / 1000);

    // --- AUDIT TRAIL TEXT GENERATION ---
    const decisionChain = [];

    // 1. Reality
    if (signalData.severity !== undefined) {
        decisionChain.push(`Signal: Severity ${signalData.severity}/100, Disruption Detected: ${signalData.disruption_detected}`);
    }
    if (rootCauseData.root_cause) {
        decisionChain.push(`Root Cause: ${rootCauseData.root_cause}`);
    }

    // 2. Guardrails (Pre)
    if (guardrailsPre.result) {
        decisionChain.push(`Guardrails (Pre): ${guardrailsPre.result} - ${guardrailsPre.reason || 'Passed'}`);
    }

    // 3. Evaluation
    if (optionsData.options) {
        decisionChain.push(`Options Generated: ${optionsData.options.length}`);
    }

    // 4. Guardrails (Post)
    if (guardrailsPost.result) {
        decisionChain.push(`Guardrails (Post): ${guardrailsPost.result} - ${guardrailsPost.reason || 'Passed'}`);
    }

    // 5. Negotiation / Action
    if (decisionOutcome === 'INTERVENTION_EXECUTED' && negotiationData.selected_option) {
        decisionChain.push(`Negotiator: Selected ${negotiationData.selected_option.option_id} ($${negotiationData.selected_option.negotiated_cost})`);
        if (treasurerData.total_cost) {
            decisionChain.push(`Treasurer: Executed transaction. Cost: ${treasurerData.total_cost}`);
        }
        if (monitorData.variance_detected !== undefined) {
            decisionChain.push(`Monitor: Variance Detected? ${monitorData.variance_detected}`);
        }
    } else if (decisionOutcome.startsWith('NO_ACTION')) {
        // Explicit logging for non-action
        decisionChain.push(`Outcome: ${decisionOutcome.replace('NO_ACTION_', 'Blocked: ')}`);
        decisionChain.push(`Reason: ${negotiationData.rationale || trace.rationale || 'Constraints exceeded.'}`);
    } else {
        decisionChain.push(`Outcome: ${systemAction} (${decisionOutcome})`);
        if (trace.rationale) decisionChain.push(`Rationale: ${trace.rationale}`);
    }

    // --- FINAL LOG ENTRY (ONE TRUTH) ---
    const logEntry = {
        incident_id: `INC-${input.shipment_id || negotiationData.shipment_id}-${detectionTime.getTime()}`,
        timestamp: new Date().toISOString(),

        // The 3 Axes
        incident_reality: incidentReality,
        guardrail_result: guardrailResult,
        decision_outcome: decisionOutcome,

        // Human Readable
        system_action: systemAction,

        // Metrics & Impact
        confidence: trace.confidence || negotiationData.decision_confidence || 1.0,
        counterfactual_impact: trace.counterfactual_impact || "N/A", // logic for this could be added if needed

        // Time & Details
        detection_time: signalData.timestamp,
        elapsed_seconds: elapsedSec,

        // Full Context (Trace)
        full_trace: {
            signal: signalData,
            root_cause: rootCauseData,
            guardrails_pre: guardrailsPre,
            options: optionsData,
            guardrails_post: guardrailsPost,
            negotiator: negotiationData,
            treasurer: treasurerData,
            monitor: monitorData
        },

        // Legacy fields for UI compatibility (until UI is fully migrated)
        decision_chain: decisionChain,
        decision_type: decisionOutcome, // backward compat
        disruption_type: rootCauseData.root_cause || 'unknown'
    };

    logs.push(logEntry);
    fs.writeFileSync(getLogPath('decisions.log.json'), JSON.stringify(logs, null, 2));

    return logEntry;
}
