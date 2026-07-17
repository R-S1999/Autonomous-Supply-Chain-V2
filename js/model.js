// Domain model helpers: display config, formatting, health scoring, BAU cost rollup.
import { BAU_GRAPH, ALERT_OVERLAY, DECISION_LAYER } from './data.generated.js';

/* ------------------------------------------------------------------ */
/* Column layout (tiers)                                               */
/* ------------------------------------------------------------------ */
export const COLUMNS = [
  { key: 'suppliers',    title: 'SUPPLIERS',                layers: ['raw_material_supplier', 'packaging_supplier'] },
  { key: 'rm_inventory', title: 'RAW MATERIAL\nINVENTORY',  layers: ['raw_material_inventory', 'packaging_inventory'] },
  { key: 'processing',   title: 'RAW MATERIAL\nPLANTS',     layers: ['ingredient_processing'] },
  { key: 'plants',       title: 'SANDWICH PLANT',           layers: ['finished_goods_manufacturing'] },
  { key: 'fg_inventory', title: 'FINISHED GOODS\nINVENTORY', layers: ['finished_goods_inventory'] },
  { key: 'cold_dc',      title: 'COLD CHAIN\nDISTRIBUTION', layers: ['distribution'] },
  { key: 'retailer_dc',  title: 'RETAILER\nFULFILLMENT',   layers: ['retailer_replenishment', 'foodservice_replenishment'] },
];

/* Display names + primary KPI (drives the node sub-label, node health
   and the "most relevant source system" shown in the hover popover).  */
export const NODE_META = {
  supplier_flour_great_plains_bulk:      { name: 'Flour Supplier 01',       primaryKpi: 'contracted_flour_capacity_lb_per_week', order: 0 },
  supplier_flour_regional_fast_response: { name: 'Flour Supplier 02',       primaryKpi: 'surge_flour_capacity_lb_per_week', order: 1 },
  supplier_peanuts_southeast_contract:   { name: 'Peanut Supplier 03',      primaryKpi: 'contract_peanut_volume_lb_per_week', order: 2 },
  supplier_peanuts_regional_fast_response:{ name: 'Peanut Supplier 04',     primaryKpi: 'emergency_peanut_capacity_lb_per_week', order: 3 },
  supplier_fruit_west_bulk:              { name: 'Fruit Supplier 05',       primaryKpi: 'frozen_fruit_base_capacity_lb_per_week', order: 4 },
  supplier_fruit_midwest_fast_response:  { name: 'Fruit Supplier 06',       primaryKpi: 'short_cycle_fruit_base_capacity_lb_per_week', order: 5 },
  supplier_sugar_bulk_refiner:           { name: 'Sugar Supplier 07',       primaryKpi: 'refined_sugar_capacity_lb_per_week', order: 6 },
  supplier_oils_fats_regional:           { name: 'Oils & Fats Supplier 08', primaryKpi: 'oil_fat_capacity_lb_per_week', order: 7 },
  supplier_film_wrap_converter:          { name: 'Film Supplier 09',        primaryKpi: 'wrapper_capacity_units_per_week', order: 8 },
  supplier_carton_corrugate_converter:   { name: 'Carton Supplier 10',      primaryKpi: 'carton_capacity_units_per_week', order: 9 },

  inventory_flour_receiving:     { name: 'Flour Raw Material',       primaryKpi: 'flour_days_of_cover', order: 0 },
  inventory_peanut_receiving:    { name: 'Peanut Raw Material',      primaryKpi: 'peanut_days_of_cover', order: 1 },
  inventory_fruit_base_receiving:{ name: 'Fruit Base Raw Material',  primaryKpi: 'fruit_base_days_of_cover', order: 2 },
  inventory_sugar_oils_receiving:{ name: 'Oils & Fats Raw Material', primaryKpi: 'oil_fat_days_of_cover', order: 3 },
  inventory_packaging_receiving: { name: 'Packaging Raw Material',   primaryKpi: 'wrapper_days_of_cover', order: 4 },

  processing_peanut_butter_network: { name: 'Peanut Butter Plant', primaryKpi: 'peanut_butter_output_lb_per_week', order: 0 },
  processing_fruit_spread_network:  { name: 'Fruit Spread Plant',  primaryKpi: 'fruit_spread_output_lb_per_week', order: 1 },

  plant_scottsville_frozen_sandwich: { name: 'Scottsville', primaryKpi: 'scottsville_sandwiches_per_week', order: 0 },
  plant_longmont_frozen_sandwich:    { name: 'Longmont Uncrustables Plant', primaryKpi: 'longmont_sandwiches_per_week', order: 1 },
  plant_mccalla_frozen_sandwich:     { name: 'McCalla',     primaryKpi: 'mccalla_sandwiches_per_week', order: 2 },

  frozen_inventory_scottsville: { name: 'Scottsville Finished Goods', primaryKpi: 'scottsville_finished_goods_days_of_cover', order: 0 },
  frozen_inventory_longmont:    { name: 'Longmont Finished Goods', primaryKpi: 'longmont_finished_goods_days_of_cover', order: 1 },
  frozen_inventory_mccalla:     { name: 'McCalla Finished Goods', primaryKpi: 'mccalla_finished_goods_days_of_cover', order: 2 },

  cold_dc_west:      { name: 'West Cold DC',    primaryKpi: 'west_dc_frozen_pallet_capacity', order: 0 },
  cold_dc_central:   { name: 'Central Cold DC', primaryKpi: 'central_dc_network_rebalance_cases_per_week', order: 1 },
  cold_dc_southeast: { name: 'SE Cold DC',      primaryKpi: 'southeast_dc_customer_case_fill_rate_pct', order: 2 },

  retailer_dc_grocery_mass: { name: 'Grocery & Mass', primaryKpi: 'grocery_mass_weekly_receipts_cases', order: 0 },
  retailer_dc_foodservice:  { name: 'Foodservice',    primaryKpi: 'foodservice_weekly_receipts_cases', order: 1 },
  retailer_dc_walmart_sams: { name: "Walmart / Sam's",primaryKpi: 'walmart_sams_weekly_receipts_cases', order: 2 },
  retailer_costco: { name: 'Costco', primaryKpi: 'costco_fill_rate_pct', order: 0 },
  retailer_sams_club: { name: "Sam's Club", primaryKpi: 'sams_fill_rate_pct', order: 1 },
  retailer_other: { name: 'Other Retailers', primaryKpi: 'other_retailer_fill_rate_pct', order: 2 },
};

/* origins = the node(s) the alert signal ORIGINATES from (not impact — impact
   is unknown until the simulation engine runs the overlay).
   sensed = what the signals tell us is coming (Sense describes, it never prescribes). */
/* alerts are named after the sensing agent that raised them:
   "{Alert Source} Agent", from the alert's primary signal system */
export const ALERT_META = {
  TAC_001_oils_fats_inbound_delay: {
    code: 'OUTBOUND DELAY',
    title: 'Oils & fats delivery delayed',
    origins: ['supplier_oils_fats_regional'],
    sensed: "The supplier's oils and fats tanker is leaving five days late.",
  },
};

/* factual "expected shift" lines derived from the overlay patches */
export function expectedShifts(event, max = 4) {
  return (event.overlay_patches || [])
    .filter(p => p.operation === 'replace' && p.baseline_value !== p.scenario_value)
    .slice(0, max)
    .map(p => ({
      label: pretty(p.metric || (p.path || '').replace(/^lead_time\./, 'lead time ').replace('modeled_', '')),
      from: p.baseline_value,
      to: p.scenario_value,
    }));
}

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
  return (node?.kpis || []).find(k => k.name === name);
}
export function primaryKpiOf(node) {
  if (!node) return undefined;
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
  return String(s).replace(/_/g, ' ')
    .replace(/\bfg\b/gi, 'finished goods')
    .replace(/\brm\b/gi, 'raw material')
    .replace(/\b(usd|otif|oee|edi|erp|wms|tms|mes|aps|srm|qms|lims|plm|eam|cmms|3pl|dc|sla|rdd|sku|hr|pct|p90)\b/gi,
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

/* what each intervention concretely does (engine-true) + the nodes it acts on */
export const INTERVENTION_NODES = {
  expedite_delayed_oil_tanker: ['supplier_oils_fats_regional', 'inventory_sugar_oils_receiving'],
  source_emergency_oil_supply: ['supplier_oils_fats_regional', 'inventory_sugar_oils_receiving', 'processing_fruit_spread_network'],
  prioritize_longmont_oil_allocation: ['inventory_sugar_oils_receiving', 'processing_fruit_spread_network', 'plant_longmont_frozen_sandwich'],
  expedite_current_reefer: ['cold_dc_central', 'retailer_dc_walmart_sams'],
  ship_replacement_from_southeast_dc: ['cold_dc_southeast', 'retailer_dc_walmart_sams'],
  split_replacement_central_and_southeast_dc: ['cold_dc_central', 'cold_dc_southeast', 'retailer_dc_walmart_sams'],
  overtime_longmont_and_scottsville: ['plant_longmont_frozen_sandwich', 'plant_scottsville_frozen_sandwich', 'frozen_inventory_mccalla'],
  drawdown_mccalla_fg_and_replenish_later: ['frozen_inventory_mccalla', 'cold_dc_southeast'],
  shift_southeast_orders_to_central_dc: ['cold_dc_central', 'cold_dc_southeast', 'retailer_dc_walmart_sams'],
  temporary_3PL_overflow_west: ['cold_dc_west', 'frozen_inventory_longmont'],
  reroute_longmont_output_to_central_dc: ['frozen_inventory_longmont', 'cold_dc_west', 'cold_dc_central'],
  slow_production_release_from_longmont: ['plant_longmont_frozen_sandwich', 'frozen_inventory_longmont', 'cold_dc_west'],
  forward_buy_8_weeks_peanuts: ['supplier_peanuts_southeast_contract', 'supplier_peanuts_regional_fast_response', 'inventory_peanut_receiving'],
  shift_20_pct_to_regional_fast_supplier: ['supplier_peanuts_southeast_contract', 'supplier_peanuts_regional_fast_response', 'inventory_peanut_receiving'],
  hedge_or_contract_extension: ['supplier_peanuts_southeast_contract', 'inventory_peanut_receiving'],
  forward_buy_6_weeks_fruit_base: ['supplier_fruit_west_bulk', 'supplier_fruit_midwest_fast_response', 'inventory_fruit_base_receiving'],
  prequalify_secondary_midwest_capacity: ['supplier_fruit_midwest_fast_response', 'inventory_fruit_base_receiving'],
  reformulate_supplier_mix_with_approved_equivalent: ['supplier_fruit_west_bulk', 'supplier_fruit_midwest_fast_response', 'processing_fruit_spread_network'],
  forward_buy_10_weeks_packaging: ['supplier_film_wrap_converter', 'supplier_carton_corrugate_converter', 'inventory_packaging_receiving'],
  dual_source_carton_converter: ['supplier_carton_corrugate_converter', 'inventory_packaging_receiving'],
  reserve_converter_capacity: ['supplier_film_wrap_converter', 'supplier_carton_corrugate_converter', 'inventory_packaging_receiving'],
};

export const INTERVENTION_PROPOSALS = {
  expedite_delayed_oil_tanker: 'Schedule an expedited tanker pickup today, reserve a Longmont receiving slot, and recover the load three days earlier.',
  source_emergency_oil_supply: 'Schedule five days of qualified emergency oil for tomorrow and protect Longmont before the tank reaches minimum.',
  prioritize_longmont_oil_allocation: "Schedule priority production within two hours, use less oil per case, and protect Costco and Sam's Club orders.",
  expedite_current_reefer: 'Upgrade the delayed Central→Walmart reefer to a team-driver expedite: recover ~1.5 days of transit at 2.2× lane freight on the affected load.',
  ship_replacement_from_southeast_dc: "Cut replacement orders at SE Cold DC covering ~90% of Walmart's shortfall, shipped on the 1.5-day lane at 1.8× freight while the late load continues inbound.",
  split_replacement_central_and_southeast_dc: "Split replacement shipments across Central + SE Cold DC to cover ~96% of Walmart's at-risk cases before the requested delivery date, at ~1.9× freight.",
  overtime_longmont_and_scottsville: 'Schedule 16h/week overtime at Longmont and Scottsville (+12% capacity each) to rebuild McCalla FG cover; overtime premium $0.014 per extra sandwich.',
  drawdown_mccalla_fg_and_replenish_later: 'Keep serving Southeast from McCalla FG, deliberately running the buffer ~3 days below target, then replenish once the line restarts.',
  shift_southeast_orders_to_central_dc: 'Re-allocate Southeast retailer orders to Central Cold DC (~82% coverage) at 1.6× freight while McCalla output recovers.',
  temporary_3PL_overflow_west: 'Book temporary 3PL overflow freezer positions at West ($3.60/pallet-day), restoring ~92% of inbound receiving through the maintenance window.',
  reroute_longmont_output_to_central_dc: 'Re-tender Longmont FG deployment loads to Central Cold DC and serve Grocery & Mass from Central at 1.5× freight while West works down its backlog.',
  slow_production_release_from_longmont: 'Pace Longmont production to 90% and hold finished goods at the plant until West Cold DC reopens receiving slots.',
  forward_buy_8_weeks_peanuts: 'Raise the peanut buffer order-up-to level by 8 weeks of demand before the price lands; suppliers flex to ~1.6× weekly shipments at the pre-increase contract price.',
  shift_20_pct_to_regional_fast_supplier: "Move 20% of the peanut allocation from the SE contract supplier to the fast-response supplier's 3-day lane for the event window.",
  hedge_or_contract_extension: 'Extend contract terms / hedge the commodity position to cap roughly half of the peanut price increase, for a $140K commercial fee.',
  forward_buy_6_weeks_fruit_base: 'Build 6 weeks of fruit base ahead of the crop squeeze at current contract pricing, accepting the added frozen storage and carrying cost.',
  prequalify_secondary_midwest_capacity: 'Reserve +50% committed capacity at the Midwest fast-response supplier and shift 20% of allocation onto it ($220K reservation fee).',
  reformulate_supplier_mix_with_approved_equivalent: 'Approve the equivalent-spec fruit base so West bulk supply holds ≥90% and about 45% of its price increase is avoided ($160K R&D/QMS work).',
  forward_buy_10_weeks_packaging: 'Pull 10 weeks of wrapper volume forward at the pre-increase converter price, accepting storage and artwork-obsolescence exposure.',
  dual_source_carton_converter: 'Qualify a second carton converter and split volume, capping ~55% of the carton inflation ($310K qualification program).',
  reserve_converter_capacity: 'Reserve print slots and film capacity ahead of the increase, capping ~50% of wrapper and ~35% of carton inflation ($180K reservation).',
};

export const INTERVENTION_TITLES = {
  expedite_delayed_oil_tanker: 'Schedule expedited tanker recovery',
  source_emergency_oil_supply: 'Schedule emergency oil delivery',
  prioritize_longmont_oil_allocation: 'Schedule priority Longmont production',
};

/* Enterprise-system execution sequence shared by Decide and Act. */
export const INTERVENTION_AGENT_STEPS = {
  expedite_delayed_oil_tanker: [
    ['supplier_oils_fats_regional', 'TMS', 'Confirm the tanker location and schedule team-driver pickup today.'],
    ['inventory_sugar_oils_receiving', 'SAP', 'Commit the recovered arrival time to the oil purchase order.'],
    ['inventory_sugar_oils_receiving', 'WMS', 'Schedule a priority unloading slot at Longmont receiving.'],
    ['processing_fruit_spread_network', 'APS', 'Reschedule Fruit Spread Plant batches against the recovered oil arrival.'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Schedule the recovered Uncrustables production sequence.'],
    ['frozen_inventory_longmont', 'WMS', 'Rebuild the finished goods release schedule.'],
    ['cold_dc_west', 'TMS', 'Schedule West Cold DC deployment from recovered production.'],
    ['retailer_costco', 'OMS', "Publish the recovered Costco and Sam's Club commitment times."],
  ],
  source_emergency_oil_supply: [
    ['inventory_sugar_oils_receiving', 'SAP', 'Calculate the uncovered oil requirement and required delivery time.'],
    ['supplier_oils_fats_regional', 'SRM', 'Schedule qualified emergency supply for delivery tomorrow.'],
    ['supplier_oils_fats_regional', 'QMS', 'Schedule the alternate lot quality release before dispatch.'],
    ['inventory_sugar_oils_receiving', 'WMS', 'Schedule priority receiving and tank transfer at Longmont.'],
    ['processing_fruit_spread_network', 'APS', 'Reschedule Fruit Spread Plant batches with emergency oil.'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Schedule full Uncrustables production recovery.'],
    ['cold_dc_west', 'WMS', 'Protect recovered finished goods deployment quantities.'],
    ['retailer_sams_club', 'OMS', "Publish recovered Costco and Sam's Club fulfillment dates."],
  ],
  prioritize_longmont_oil_allocation: [
    ['inventory_sugar_oils_receiving', 'SAP', 'Calculate usable oil inventory and protected order requirements.'],
    ['processing_fruit_spread_network', 'APS', 'Schedule lower-oil recipes for the next production window.'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Schedule priority retailer items within two hours.'],
    ['frozen_inventory_longmont', 'WMS', 'Reserve recovered finished goods for protected orders.'],
    ['cold_dc_west', 'APS', 'Reschedule West Cold DC deployment by retailer priority.'],
    ['retailer_sams_club', 'OMS', "Lock Sam's Club orders into the protected schedule."],
    ['retailer_costco', 'OMS', 'Lock Costco orders into the protected schedule.'],
    ['retailer_other', 'OMS', 'Publish revised delivery times for remaining retailers.'],
  ],
};

export function actionNodes(event, intervention) {
  const set = new Set([
    ...(ALERT_META[event.id]?.origins || []),
    ...(intervention ? (INTERVENTION_NODES[intervention.id] || []) : []),
    ...(event.affected_model_objects?.nodes || []),
  ]);
  return [...set].filter(id => nodesById[id]);
}

/* alerts indexed by the node they ORIGINATE from */
export const ALERTS_BY_ORIGIN = (() => {
  const map = {};
  for (const e of EVENTS) {
    for (const origin of ALERT_META[e.id]?.origins || []) (map[origin] ||= []).push(e.id);
  }
  return map;
})();
