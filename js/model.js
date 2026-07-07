// Domain model helpers: display config, formatting, health scoring, BAU cost rollup.
import { BAU_GRAPH, ALERT_OVERLAY, DECISION_LAYER } from './data.generated.js';

/* ------------------------------------------------------------------ */
/* Column layout (tiers)                                               */
/* ------------------------------------------------------------------ */
export const COLUMNS = [
  { key: 'suppliers',    title: 'SUPPLIERS',     layers: ['raw_material_supplier', 'packaging_supplier'] },
  { key: 'rm_inventory', title: 'RM INVENTORY',  layers: ['raw_material_inventory', 'packaging_inventory'] },
  { key: 'processing',   title: 'PROCESSING',    layers: ['ingredient_processing'] },
  { key: 'plants',       title: 'PLANTS',        layers: ['finished_goods_manufacturing'] },
  { key: 'fg_inventory', title: 'FG INVENTORY',  layers: ['finished_goods_inventory'] },
  { key: 'cold_dc',      title: 'COLD CHAIN DC', layers: ['distribution'] },
  { key: 'retailer_dc',  title: 'RETAILER DC',   layers: ['retailer_replenishment', 'foodservice_replenishment'] },
];

/* Display names + primary KPI (drives the node sub-label, node health
   and the "most relevant source system" shown in the hover popover).  */
export const NODE_META = {
  supplier_flour_great_plains_bulk:      { name: 'Flour · GP Bulk',      primaryKpi: 'contracted_flour_capacity_lb_per_week', order: 0 },
  supplier_flour_regional_fast_response: { name: 'Flour · Fast Resp',    primaryKpi: 'surge_flour_capacity_lb_per_week', order: 1 },
  supplier_peanuts_southeast_contract:   { name: 'Peanuts · SE Contract',primaryKpi: 'contract_peanut_volume_lb_per_week', order: 2 },
  supplier_peanuts_regional_fast_response:{ name: 'Peanuts · Fast Resp', primaryKpi: 'emergency_peanut_capacity_lb_per_week', order: 3 },
  supplier_fruit_west_bulk:              { name: 'Fruit · West Bulk',    primaryKpi: 'frozen_fruit_base_capacity_lb_per_week', order: 4 },
  supplier_fruit_midwest_fast_response:  { name: 'Fruit · MW Fast',      primaryKpi: 'short_cycle_fruit_base_capacity_lb_per_week', order: 5 },
  supplier_sugar_bulk_refiner:           { name: 'Sugar Refiner',        primaryKpi: 'refined_sugar_capacity_lb_per_week', order: 6 },
  supplier_oils_fats_regional:           { name: 'Oils & Fats',          primaryKpi: 'oil_fat_capacity_lb_per_week', order: 7 },
  supplier_film_wrap_converter:          { name: 'Film Wrap',            primaryKpi: 'wrapper_capacity_units_per_week', order: 8 },
  supplier_carton_corrugate_converter:   { name: 'Carton & Corrugate',   primaryKpi: 'carton_capacity_units_per_week', order: 9 },

  inventory_flour_receiving:     { name: 'Flour RM',       primaryKpi: 'flour_days_of_cover', order: 0 },
  inventory_peanut_receiving:    { name: 'Peanut RM',      primaryKpi: 'peanut_days_of_cover', order: 1 },
  inventory_fruit_base_receiving:{ name: 'Fruit Base RM',  primaryKpi: 'fruit_base_days_of_cover', order: 2 },
  inventory_sugar_oils_receiving:{ name: 'Sugar & Oils RM',primaryKpi: 'sweetener_fat_composite_days_of_cover', order: 3 },
  inventory_packaging_receiving: { name: 'Packaging RM',   primaryKpi: 'wrapper_days_of_cover', order: 4 },

  processing_peanut_butter_network: { name: 'Peanut Butter', primaryKpi: 'peanut_butter_output_lb_per_week', order: 0 },
  processing_fruit_spread_network:  { name: 'Fruit Spread',  primaryKpi: 'fruit_spread_output_lb_per_week', order: 1 },

  plant_scottsville_frozen_sandwich: { name: 'Scottsville', primaryKpi: 'scottsville_sandwiches_per_week', order: 0 },
  plant_longmont_frozen_sandwich:    { name: 'Longmont',    primaryKpi: 'longmont_sandwiches_per_week', order: 1 },
  plant_mccalla_frozen_sandwich:     { name: 'McCalla',     primaryKpi: 'mccalla_sandwiches_per_week', order: 2 },

  frozen_inventory_scottsville: { name: 'Scottsville FG', primaryKpi: 'scottsville_finished_goods_days_of_cover', order: 0 },
  frozen_inventory_longmont:    { name: 'Longmont FG',    primaryKpi: 'longmont_finished_goods_days_of_cover', order: 1 },
  frozen_inventory_mccalla:     { name: 'McCalla FG',     primaryKpi: 'mccalla_finished_goods_days_of_cover', order: 2 },

  cold_dc_west:      { name: 'West Cold DC',    primaryKpi: 'west_dc_frozen_pallet_capacity', order: 0 },
  cold_dc_central:   { name: 'Central Cold DC', primaryKpi: 'central_dc_network_rebalance_cases_per_week', order: 1 },
  cold_dc_southeast: { name: 'SE Cold DC',      primaryKpi: 'southeast_dc_customer_case_fill_rate_pct', order: 2 },

  retailer_dc_grocery_mass: { name: 'Grocery & Mass', primaryKpi: 'grocery_mass_weekly_receipts_cases', order: 0 },
  retailer_dc_foodservice:  { name: 'Foodservice',    primaryKpi: 'foodservice_weekly_receipts_cases', order: 1 },
  retailer_dc_walmart_sams: { name: "Walmart / Sam's",primaryKpi: 'walmart_sams_weekly_receipts_cases', order: 2 },
};

/* origins = the node(s) the alert signal ORIGINATES from (not impact — impact
   is unknown until the simulation engine runs the overlay).                  */
export const ALERT_META = {
  LT_001_peanut_price_weather_supply_risk:   { code: 'LT-001',  title: 'Peanut price & weather supply risk',
    origins: ['supplier_peanuts_southeast_contract'] },
  LT_002_fruit_base_crop_yield_pressure:     { code: 'LT-002',  title: 'Fruit base crop yield pressure',
    origins: ['supplier_fruit_west_bulk'] },
  LT_003_packaging_resin_and_paperboard_inflation: { code: 'LT-003', title: 'Packaging resin & paperboard inflation',
    origins: ['supplier_film_wrap_converter', 'supplier_carton_corrugate_converter'] },
  TAC_001_late_reefer_to_walmart_sams_dc:    { code: 'TAC-001', title: "Late reefer → Walmart/Sam's DC",
    origins: ['cold_dc_central'] },
  TAC_002_mccalla_line_downtime_capacity_loss:{ code: 'TAC-002', title: 'McCalla line downtime · capacity loss',
    origins: ['plant_mccalla_frozen_sandwich'] },
  TAC_003_west_cold_dc_capacity_constraint:  { code: 'TAC-003', title: 'West Cold DC freezer capacity constraint',
    origins: ['cold_dc_west'] },
};

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */
export const nodesById = Object.fromEntries(BAU_GRAPH.nodes.map(n => [n.id, n]));
export const relsById  = Object.fromEntries(BAU_GRAPH.relationships.map(r => [r.id, r]));
export const EVENTS = ALERT_OVERLAY.events;
export const eventsById = Object.fromEntries(EVENTS.map(e => [e.id, e]));

export function columnOf(node) {
  return COLUMNS.findIndex(c => c.layers.includes(node.supply_chain_layer));
}
export function kpiOf(node, name) {
  return (node.kpis || []).find(k => k.name === name);
}
export function primaryKpiOf(node) {
  const meta = NODE_META[node.id];
  return kpiOf(node, meta?.primaryKpi) || (node.kpis || [])[0];
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */
export function kNum(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return trim(v / 1e6) + 'M';
  if (abs >= 1e3) return trim(v / 1e3) + 'k';
  return trim(v);
  function trim(x) { return (Math.round(x * 100) / 100).toString().replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1'); }
}
export function money(v, opts = {}) {
  if (v == null || isNaN(v)) return '—';
  const sign = v < 0 ? '-' : (opts.plus && v > 0 ? '+' : '');
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
export function pretty(s) {
  if (s == null) return '';
  return String(s).replace(/_/g, ' ').replace(/\b(usd|otif|oee|edi|erp|wms|tms|mes|aps|srm|qms|lims|plm|eam|cmms|3pl|dc|fg|rm|sla|rdd|sku|hr|pct|p90)\b/gi,
    m => m.toUpperCase());
}
export function fmtKpiValue(kpi) {
  const u = kpi.unit || '';
  const v = kpi.modeled_value;
  if (u === 'lb_per_week') return `${kNum(v)} lb/wk`;
  if (u === 'wrappers_per_week') return `${kNum(v)} wr/wk`;
  if (u === 'cartons_per_week') return `${kNum(v)} ct/wk`;
  if (u === 'cases_per_week') return `${kNum(v)} cs/wk`;
  if (u === 'sandwiches_per_week') return `${kNum(v)} sw/wk`;
  if (u === 'pallet_positions') return `${kNum(v)} pallets`;
  if (u === 'days') return `${trimN(v)}d`;
  if (u === 'hours' || u === 'hours_per_week') return `${trimN(v)}h${u.endsWith('week') ? '/wk' : ''}`;
  if (u === 'percent' || u === 'percent_per_year' || u === 'percent_coefficient_of_variation') return `${trimN(v)}%`;
  if (u.startsWith('USD_per_1000')) return `$${trimN(v)}/1k`;
  if (u.startsWith('USD_per_lb')) return `$${trimN(v)}/lb`;
  if (u.startsWith('USD_per_case')) return `$${trimN(v)}/cs`;
  if (u.startsWith('USD_per_pallet')) return `$${trimN(v)}/plt·d`;
  if (u.startsWith('USD_per_hour')) return `$${kNum(v)}/hr`;
  if (u.startsWith('USD')) return `$${kNum(v)}`;
  if (u === 'parts_per_million') return `${kNum(v)} ppm`;
  if (u.startsWith('index')) return trimN(v);
  if (u === 'months') return `${trimN(v)} mo`;
  if (u === 'minutes_per_week') return `${trimN(v)} min/wk`;
  if (u === 'excursions_per_week') return `${trimN(v)}/wk`;
  if (u === 'changeovers_per_week') return `${trimN(v)}/wk`;
  if (u === 'sandwiches' || u === 'cases' || u === 'units_at_risk') return kNum(v);
  if (u === 'multiplier') return `${trimN(v)}×`;
  return `${kNum(v)} ${pretty(u)}`;
  function trimN(x) {
    if (x !== 0 && Math.abs(x) < 0.05) return Number(x.toPrecision(2)).toString();
    return (Math.round(x * 100) / 100).toString();
  }
}
/* Node sub-label, e.g. "620k lb/wk" or "7d cover" */
export function nodeSubLabel(node) {
  const kpi = primaryKpiOf(node);
  if (!kpi) return '';
  if (kpi.unit === 'days') return `${kpi.modeled_value}d cover`;
  if (kpi.name.includes('fill_rate')) return `${kpi.modeled_value}% fill`;
  return fmtKpiValue(kpi);
}
/* Most relevant source system = source of the node's primary KPI */
export function nodeSource(node) {
  const kpi = primaryKpiOf(node);
  return kpi ? kpi.source_system : null;
}

/* ------------------------------------------------------------------ */
/* Health scoring                                                      */
/* A node's health has nothing to do with alerts: it reflects the      */
/* node's own critical metrics. In BAU all modeled values are on plan  */
/* => good. Under a simulated overlay, patched metrics are re-scored.  */
/* ------------------------------------------------------------------ */
const HIGHER_IS_WORSE = /(cost|risk|lead_time|downtime|hold|excursion|reject|defect|dwell|queue|writeoff|overflow|penalty|ppm)/;
const LOWER_IS_WORSE  = /(capacity|cover|fill|output|available|volume|acceptance|yield|conformance|clearance|accuracy|reliability|utilization|realization|adherence|completion|rate)/;

export function severityOf(metric, baseline, scenario) {
  if (baseline == null || scenario == null || baseline === 0) return 0;
  const rel = (scenario - baseline) / Math.abs(baseline);
  let sev = 0;
  if (HIGHER_IS_WORSE.test(metric)) sev = Math.max(sev, rel);
  if (LOWER_IS_WORSE.test(metric) && !/cost|risk/.test(metric)) sev = Math.max(sev, -rel);
  // storage utilization pushing past ~95% is a constraint even though "utilization" reads as good
  if (/storage_utilization/.test(metric) && scenario > 95) sev = Math.max(sev, (scenario - 95) / 10);
  return Math.max(0, sev);
}
export function healthFromSeverity(sev) {
  if (sev >= 0.30) return 'red';
  if (sev >= 0.08) return 'amber';
  return 'good';
}
/* severity per node for a fully-applied event overlay */
export function eventNodeSeverity(event) {
  const out = {};
  for (const p of event.overlay_patches || []) {
    if (p.target_type !== 'node' || p.operation === 'use_for_costing') continue;
    const sev = severityOf(p.metric || '', p.baseline_value, p.scenario_value);
    out[p.target_id] = Math.max(out[p.target_id] || 0, sev);
  }
  return out;
}
export function eventEdgeIds(event) {
  return (event.overlay_patches || [])
    .filter(p => p.target_type === 'relationship')
    .map(p => p.target_id)
    .concat(event.affected_model_objects?.relationships || []);
}

/* ------------------------------------------------------------------ */
/* BAU weekly fulfillment cost — rolled up into the 15 components of   */
/* the intervention decision layer's cost model.                       */
/* ------------------------------------------------------------------ */
const CASES_PER_PALLET = 64;
const SANDWICHES_PER_CASE = 48;

function relWeeklyCost(rel) {
  const c = rel.cost || {};
  if (rel.modeled_weekly_flow_lb != null) {
    const per = c.modeled_delivered_cost_usd_per_lb ?? c.modeled_internal_handling_cost_usd_per_lb
      ?? c.modeled_transfer_cost_usd_per_lb ?? c.modeled_internal_transfer_cost_usd_per_lb ?? 0;
    return rel.modeled_weekly_flow_lb * per;
  }
  if (rel.modeled_weekly_flow_units != null) return rel.modeled_weekly_flow_units * (c.modeled_cost_usd_per_1000_units ?? 0) / 1000;
  if (rel.modeled_weekly_flow_cartons != null) return rel.modeled_weekly_flow_cartons * (c.modeled_cost_usd_per_1000_cartons ?? 0) / 1000;
  if (rel.modeled_weekly_flow_wrappers != null) return rel.modeled_weekly_flow_wrappers * (c.modeled_handling_cost_usd_per_1000_wrappers ?? 0) / 1000;
  if (rel.modeled_weekly_flow_sandwiches != null) return (rel.modeled_weekly_flow_sandwiches / SANDWICHES_PER_CASE) * (c.modeled_freezing_and_putaway_cost_usd_per_case ?? 0);
  if (rel.modeled_weekly_flow_cases != null) return rel.modeled_weekly_flow_cases * (c.modeled_freight_cost_usd_per_case ?? 0);
  return 0;
}

export function bauWeeklyCost() {
  const comp = {
    raw_material_cost: 0, packaging_cost: 0, conversion_cost: 0,
    standard_transport_cost: 0, expedite_transport_premium: 0,
    ambient_storage_cost: 0, cold_storage_cost: 0, inventory_carrying_cost: 0,
    spoilage_or_ageing_writeoff_cost: 0, quality_hold_or_rework_cost: 0,
    production_downtime_cost: 0, overtime_cost: 0, overflow_storage_cost: 0,
    OTIF_penalty_cost: 0, lost_margin_cost: 0,
  };
  const val = (id, k) => kpiOf(nodesById[id], k)?.modeled_value ?? 0;

  for (const rel of BAU_GRAPH.relationships) {
    const cost = relWeeklyCost(rel);
    if (rel.relationship_type === 'inbound_raw_material_supply' || rel.relationship_type === 'contingency_raw_material_supply') comp.raw_material_cost += cost;
    else if (rel.relationship_type === 'inbound_packaging_supply') comp.packaging_cost += cost;
    else comp.standard_transport_cost += cost;
  }

  // conversion (processing + plants)
  comp.conversion_cost +=
    val('processing_peanut_butter_network', 'peanut_butter_output_lb_per_week') * val('processing_peanut_butter_network', 'peanut_butter_conversion_cost_usd_per_lb') +
    val('processing_fruit_spread_network', 'fruit_spread_output_lb_per_week') * val('processing_fruit_spread_network', 'fruit_spread_conversion_cost_usd_per_lb');
  for (const p of ['scottsville', 'longmont', 'mccalla']) {
    const id = `plant_${p}_frozen_sandwich`;
    comp.conversion_cost += val(id, `${p}_sandwiches_per_week`) * val(id, 'sandwich_conversion_cost_usd_per_sandwich');
  }

  // RM inventory: ambient storage + carrying + ageing allowance
  const rmBuffers = [
    ['inventory_flour_receiving', 'flour_days_of_cover', 'flour_weekly_consumption_lb', 0.31],
    ['inventory_peanut_receiving', 'peanut_days_of_cover', 'peanut_weekly_consumption_lb', 0.82],
    ['inventory_fruit_base_receiving', 'fruit_base_days_of_cover', 'fruit_base_weekly_consumption_lb', 0.64],
    ['inventory_sugar_oils_receiving', 'sweetener_fat_composite_days_of_cover', 'sugar_weekly_consumption_lb', 0.30],
  ];
  for (const [id, coverK, consK, unitVal] of rmBuffers) {
    const stockLb = val(id, coverK) * val(id, consK) / 7;
    comp.ambient_storage_cost += stockLb * val(id, 'raw_material_storage_cost_usd_per_lb_day') * 7;
    comp.inventory_carrying_cost += stockLb * unitVal * (val(id, 'inventory_carrying_cost_pct_annual') / 100) / 52;
    comp.spoilage_or_ageing_writeoff_cost += stockLb * 0.02 * val(id, 'age_related_writeoff_cost_usd_per_lb');
  }
  // packaging inventory storage (pallet-days) + obsolescence allowance
  {
    const id = 'inventory_packaging_receiving';
    const wrapPallets = val(id, 'wrapper_days_of_cover') * (val(id, 'packaging_weekly_consumption_wrappers') / 7) / 250000; // ~250k wrappers/pallet
    const cartonPallets = 60;
    comp.ambient_storage_cost += (wrapPallets + cartonPallets) * val(id, 'packaging_storage_cost_usd_per_pallet_day') * 7;
    comp.spoilage_or_ageing_writeoff_cost += (val(id, 'packaging_artwork_obsolescence_risk_units') / 1000) * val(id, 'packaging_obsolescence_cost_usd_per_1000_units') / 12;
  }
  // FG frozen buffers: cold storage + carrying
  const fgBuffers = [
    ['frozen_inventory_scottsville', 'scottsville_finished_goods_days_of_cover', 'plant_scottsville_frozen_sandwich', 'scottsville_sandwiches_per_week'],
    ['frozen_inventory_longmont', 'longmont_finished_goods_days_of_cover', 'plant_longmont_frozen_sandwich', 'longmont_sandwiches_per_week'],
    ['frozen_inventory_mccalla', 'mccalla_finished_goods_days_of_cover', 'plant_mccalla_frozen_sandwich', 'mccalla_sandwiches_per_week'],
  ];
  const FG_CASE_VALUE = 14; // conservative standard cost per frozen case
  for (const [id, coverK, plantId, outK] of fgBuffers) {
    const casesOnHand = val(id, coverK) * (val(plantId, outK) / SANDWICHES_PER_CASE / 7);
    comp.cold_storage_cost += casesOnHand * val(id, 'frozen_fg_storage_cost_usd_per_case_day') * 7;
    comp.inventory_carrying_cost += casesOnHand * FG_CASE_VALUE * (val(id, 'frozen_inventory_carrying_cost_pct_annual') / 100) / 52;
  }
  // Cold-chain DCs: handling + reefer surcharge + pallet storage
  const dcThroughput = { cold_dc_west: 145000, cold_dc_central: 130000 + 55000 + 95000, cold_dc_southeast: 110000 };
  const dcPallets = { cold_dc_west: 28000 * 0.92, cold_dc_central: 16000, cold_dc_southeast: 12000 };
  for (const id of ['cold_dc_west', 'cold_dc_central', 'cold_dc_southeast']) {
    const cases = dcThroughput[id];
    comp.standard_transport_cost += cases * (val(id, 'dc_handling_cost_usd_per_case') + val(id, 'reefer_energy_surcharge_usd_per_case'));
    const palletRate = val(id, 'west_dc_frozen_storage_cost_usd_per_pallet_day') || 1.45;
    comp.cold_storage_cost += dcPallets[id] * palletRate * 7 * 0.35; // blended paid share of positions
  }
  // BAU quality / downtime / service friction (from plant + retailer KPIs)
  comp.quality_hold_or_rework_cost += 720000 * 0.03 * 0.06; // fruit spread rework share
  comp.production_downtime_cost +=
    (val('plant_scottsville_frozen_sandwich', 'scottsville_ingredient_starvation_minutes_per_week') / 60) * val('plant_scottsville_frozen_sandwich', 'unplanned_downtime_cost_usd_per_hour') +
    (val('plant_longmont_frozen_sandwich', 'longmont_packaging_material_downtime_minutes_per_week') / 60) * val('plant_longmont_frozen_sandwich', 'unplanned_downtime_cost_usd_per_hour') +
    val('plant_mccalla_frozen_sandwich', 'mccalla_new_line_learning_loss_hours_per_week') * val('plant_mccalla_frozen_sandwich', 'unplanned_downtime_cost_usd_per_hour');
  // BAU OTIF + lost margin friction at retailer DCs
  const retail = [
    ['retailer_dc_walmart_sams', 'walmart_sams_weekly_receipts_cases', 'walmart_sams_retailer_fill_rate_pct'],
    ['retailer_dc_grocery_mass', 'grocery_mass_weekly_receipts_cases', null],
    ['retailer_dc_foodservice', 'foodservice_weekly_receipts_cases', null],
  ];
  for (const [id, recK, fillK] of retail) {
    const cases = val(id, recK);
    const fill = fillK ? val(id, fillK) : 98.4;
    const shortLate = cases * (100 - fill) / 100;
    comp.OTIF_penalty_cost += shortLate * 0.5 * val(id, 'customer_OTIF_penalty_usd_per_late_case');
    comp.lost_margin_cost += shortLate * 0.5 * val(id, 'lost_service_margin_usd_per_unfulfilled_case');
  }

  const total = Object.values(comp).reduce((a, b) => a + b, 0);
  return { components: comp, total };
}

export const COST_COMPONENT_COUNT = DECISION_LAYER.cost_rollup_model.cost_components.length;
export const DAYS_PER_MONTH = 30.4;
