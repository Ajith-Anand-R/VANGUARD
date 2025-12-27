import fs from 'fs';

// Pure function: Input (Signals, Config) -> Output (Trigger Decision)
export function run(input) {
    // Read current signals from disk (Single Source of Truth)
    // In a real microservice, this would be an API call to a Signal Service.
    let signals;
    try {
        signals = JSON.parse(fs.readFileSync('./data/monitored_signals.json', 'utf8'));
    } catch (e) {
        console.error('Sentinel failed to read signals:', e);
        return { error: 'signal_read_failed' };
    }

    // Config could also be passed in or read.
    const sentinelConfig = {
        weights: { port: 0.4, weather: 0.2, supplier: 0.4 },
        threshold: 65
    };

    // Calculate Risk
    // Port: 0-100 (Higher is worse)
    // Weather: 0-100 (Higher is worse)
    // Supplier: 0-1 (Lower is worse) -> Invert it: (1 - reliability) * 100

    const portRisk = signals.port_congestion_level;
    const weatherRisk = signals.weather_risk_score;
    const supplierRisk = (1 - signals.supplier_reliability_index) * 100;

    const aggregateRisk = (
        (portRisk * sentinelConfig.weights.port) +
        (weatherRisk * sentinelConfig.weights.weather) +
        (supplierRisk * sentinelConfig.weights.supplier)
    );

    const isBreach = aggregateRisk > sentinelConfig.threshold;

    return {
        timestamp: new Date().toISOString(),
        agent: 'Sentinel',
        active_monitoring: true,
        aggregate_risk: Math.round(aggregateRisk),
        trigger_threshold: sentinelConfig.threshold,
        trigger_decision: isBreach,
        assessment: isBreach ? 'RISK_THRESHOLD_EXCEEDED' : 'NORMAL_OPERATIONS'
    };
}
