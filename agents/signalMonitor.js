import fs from 'fs';

export function run(input) {
  const shipments = JSON.parse(fs.readFileSync('./data/shipments.json', 'utf8'));
  const shipment = shipments[input.shipment_id];

  // 1. Calculate ETA Drift Score (0-60)
  const originalEta = new Date(shipment.original_eta);
  const currentEta = new Date(shipment.current_eta);
  const delayHours = (currentEta - originalEta) / (1000 * 60 * 60);

  // Only penalize significant drift (> 4 hours) to avoid noise
  let etaDriftScore = 0;
  if (delayHours > 4) {
    etaDriftScore = Math.min(60, (delayHours / 48) * 60); // Max score at 48h delay
  }

  // 2. Calculate Environmental & Supplier Risk (0-40)
  const suppliers = JSON.parse(fs.readFileSync('./data/suppliers.json', 'utf8'));
  const monitoredSignals = JSON.parse(fs.readFileSync('./data/monitored_signals.json', 'utf8')); // Read live signals
  const supplier = suppliers[shipment.supplier_id];

  // Use live signals if possible, else fallback
  const portCongestion = monitoredSignals.port_congestion_level || 0;
  const weatherRisk = monitoredSignals.weather_risk_score || 0;
  const supplierReliability = supplier.reliability_score || 1;

  // Weighted Composition to match Sentinel
  // Sentinel Weights: Port 0.4, Weather 0.2, Supplier 0.4
  // We scale this to a 0-100 severity score.

  const supplierRisk = (1 - supplierReliability) * 100;

  const aggregateRisk = (portCongestion * 0.4) + (weatherRisk * 0.2) + (supplierRisk * 0.4);
  const riskContribution = Math.min(40, aggregateRisk * 0.4); // Scale to contribution

  const totalSeverity = Math.round(etaDriftScore + riskContribution);

  // 3. Strict Threshold
  const DISRUPTION_THRESHOLD = 50;
  const isDisrupted = totalSeverity >= DISRUPTION_THRESHOLD;

  return {
    timestamp: new Date().toISOString(),
    agent: 'SignalMonitor',
    shipment_id: input.shipment_id,
    shipment: shipment,
    disruption_detected: isDisrupted,
    delay_hours: Number.isFinite(delayHours) ? Math.max(0, delayHours) : 0,
    severity: Math.min(100, totalSeverity),
    severity_breakdown: {
      eta_drift: Math.round(etaDriftScore),
      risk_factors: Math.round(riskContribution)
    },
    sla_breach_probability: delayHours > 24 ? 90 : (delayHours > 12 ? 50 : 10)
  };
}
