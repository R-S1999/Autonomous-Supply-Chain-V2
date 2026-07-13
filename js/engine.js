// Focused daily simulation for the Longmont sugar-and-oils supply chain.
import { eventsById } from './model.js';

const BUCKETS = [
  'raw_material_cost', 'packaging_cost', 'conversion_cost', 'standard_transport_cost',
  'expedite_transport_premium', 'ambient_storage_cost', 'cold_storage_cost',
  'inventory_carrying_cost', 'spoilage_or_ageing_writeoff_cost', 'quality_hold_or_rework_cost',
  'production_downtime_cost', 'overtime_cost', 'overflow_storage_cost',
  'OTIF_penalty_cost', 'lost_margin_cost',
];

const EVENT_ID = 'TAC_001_sugar_oils_inbound_delay';
const STORE_DEMAND_DAY = 120000 / 7;
const DAILY_BAU = {
  raw_material_cost: 91000, packaging_cost: 23000, conversion_cost: 67500,
  standard_transport_cost: 18200, expedite_transport_premium: 0,
  ambient_storage_cost: 1500, cold_storage_cost: 4400,
  inventory_carrying_cost: 1900, spoilage_or_ageing_writeoff_cost: 350,
  quality_hold_or_rework_cost: 700, production_downtime_cost: 1200,
  overtime_cost: 0, overflow_storage_cost: 0, OTIF_penalty_cost: 0, lost_margin_cost: 0,
};

const PROFILES = {
  expedite_sugar_oils_shipments: { scale: 0.22, fee: 85000, premium: 85000, recovery: 0.92 },
  source_emergency_regional_supply: { scale: 0.16, fee: 135000, premium: 38000, recovery: 0.95 },
  prioritize_longmont_and_adjust_schedule: { scale: 0.48, fee: 45000, premium: 12000, recovery: 0.72 },
};

function disruption(day) {
  if (day < 3 || day > 18) return 0;
  if (day <= 5) return 0.28;
  if (day <= 8) return 0.72;
  if (day <= 12) return 1;
  if (day <= 15) return 0.62;
  return 0.25;
}

function status(intensity, amber = 0.18, red = 0.62) {
  return intensity >= red ? 'red' : intensity >= amber ? 'amber' : 'good';
}

export function simulate({ eventId = null, interventionId = null } = {}) {
  const isScenario = eventId === EVENT_ID;
  const horizon = isScenario ? 30 : 182;
  const profile = interventionId ? PROFILES[interventionId] : null;
  const cum = Object.fromEntries(BUCKETS.map(k => [k, 0]));
  const frames = [];

  for (let day = 0; day < horizon; day++) {
    for (const [k, v] of Object.entries(DAILY_BAU)) cum[k] += v;
    const raw = isScenario ? disruption(day) : 0;
    const intensity = raw * (profile?.scale ?? 1);
    const storeLoss = STORE_DEMAND_DAY * intensity * 0.57;
    if (storeLoss > 0) {
      cum.OTIF_penalty_cost += storeLoss * 2.4;
      cum.lost_margin_cost += storeLoss * 5.1;
      cum.production_downtime_cost += intensity * 18500;
      cum.raw_material_cost += intensity * 5400;
    }
    if (profile && day === 3) {
      cum.quality_hold_or_rework_cost += profile.fee;
      cum.expedite_transport_premium += profile.premium;
    }

    const supplierI = raw;
    const inventoryI = isScenario ? disruption(day - 2) * (profile?.scale ?? 1) : 0;
    const processI = isScenario ? disruption(day - 4) * (profile?.scale ?? 1) : 0;
    const plantI = isScenario ? disruption(day - 5) * (profile?.scale ?? 1) : 0;
    const fgI = isScenario ? disruption(day - 6) * (profile?.scale ?? 1) : 0;
    const dcI = isScenario ? disruption(day - 7) * (profile?.scale ?? 1) : 0;
    const retailI = isScenario ? disruption(day - 8) * (profile?.scale ?? 1) : 0;
    const storeI = isScenario ? disruption(day - 9) * (profile?.scale ?? 1) : 0;
    const cover = Math.max(0.6, 3 - inventoryI * 2.4);
    const fill = Math.max(38, 98.5 - storeI * 55);

    const nodeHealth = {
      supplier_sugar_bulk_refiner: status(supplierI), supplier_oils_fats_regional: status(supplierI),
      inventory_sugar_oils_receiving: status(inventoryI), processing_fruit_spread_network: status(processI),
      plant_longmont_frozen_sandwich: status(plantI), frozen_inventory_longmont: status(fgI),
      cold_dc_west: status(dcI), retailer_dc_grocery_mass: status(retailI), grocery_mass_store: status(storeI),
    };
    const edgeState = intensity > 0.18 ? 'disrupted' : 'flow';
    const edgeStates = {};
    for (const id of (eventsById[EVENT_ID]?.affected_model_objects?.relationships || [])) edgeStates[id] = edgeState;
    const valueOverrides = {
      inventory_sugar_oils_receiving: { sweetener_fat_composite_days_of_cover: Math.round(cover * 10) / 10 },
      processing_fruit_spread_network: { fruit_spread_output_lb_per_week: Math.round(720000 * (1 - processI * 0.58)) },
      plant_longmont_frozen_sandwich: { longmont_sandwiches_per_week: Math.round(11500000 * (1 - plantI * 0.52)) },
      grocery_mass_store: { store_shelf_fill_rate_pct: Math.round(fill * 10) / 10 },
    };
    frames.push({
      t: day, label: `DAY ${day + 1}`, totalTicks: horizon, grain: 'day',
      phase: !isScenario ? 'bau' : day < 3 ? 'pre' : day <= 18 ? 'active' : 'aftermath',
      nodeHealth, valueOverrides, edgeStates, cum: { ...cum },
      cumTotal: Object.values(cum).reduce((a, b) => a + b, 0),
    });
  }
  return { frames, horizon, window: { horizon, start: 3, end: 19, tactical: true }, total: frames.at(-1).cumTotal, cum: frames.at(-1).cum };
}

const cache = {};
export function runBau() { return (cache.bau ||= simulate()); }
export function runScenario(eventId, interventionId = null) {
  const key = `${eventId}::${interventionId || ''}`;
  return (cache[key] ||= simulate({ eventId, interventionId }));
}
export function bauTotalsFor(horizonDays) {
  const f = runBau().frames[Math.min(horizonDays, 182) - 1];
  return { total: f.cumTotal, cum: f.cum };
}
export function bauCumAtDay(day) { return runBau().frames[Math.min(day, 181)].cumTotal; }
