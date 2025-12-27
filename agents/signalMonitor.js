import fs from 'fs';

export function run(input) {
  const shipments = JSON.parse(fs.readFileSync('./data/shipments.json', 'utf8'));
  const shipment = shipments[input.shipment_id];

  const originalEta = new Date(shipment.original_eta);
  const currentEta = new Date(shipment.current_eta);
  const slaDeadline = new Date(shipment.sla_deadline);

  const delayHours = (currentEta - originalEta) / (1000 * 60 * 60);
  const hoursUntilSla = (slaDeadline - currentEta) / (1000 * 60 * 60);

  let etaDriftScore = 0;
  if (delayHours > 0) {
    etaDriftScore = Math.min(45, (delayHours / 48) * 45);
  }

  let inventoryRiskScore = 0;
  if (delayHours > 24) {
    inventoryRiskScore = Math.min(30, (delayHours / 72) * 30);
  }

  const suppliers = JSON.parse(fs.readFileSync('./data/suppliers.json', 'utf8'));
  const supplier = suppliers[shipment.supplier_id];
  const supplierReliabilityScore = Math.round((1 - supplier.reliability_score) * 25);

  const severity = Math.round(etaDriftScore + inventoryRiskScore + supplierReliabilityScore);

  let slaBreachProbability = 0;
  if (hoursUntilSla < 0) {
    slaBreachProbability = 100;
  } else if (hoursUntilSla < 24) {
    slaBreachProbability = 90;
  } else if (hoursUntilSla < 48) {
    slaBreachProbability = 60;
  } else {
    slaBreachProbability = 10;
  }

  return {
    timestamp: new Date().toISOString(),
    agent: 'SignalMonitor',
    shipment_id: input.shipment_id,
    shipment: shipment,
    disruption_detected: delayHours > 0 || slaBreachProbability > 50,
    delay_hours: Number.isFinite(delayHours) ? Math.max(0, delayHours) : 0,
    severity: Number.isFinite(severity) ? Math.min(100, Math.max(0, severity)) : 0,
    severity_breakdown: {
      eta_drift: Math.round(etaDriftScore),
      inventory_risk: Math.round(inventoryRiskScore),
      supplier_reliability: supplierReliabilityScore
    },
    sla_breach_probability: slaBreachProbability,
    hours_until_sla: hoursUntilSla
  };
}
