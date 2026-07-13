// Deterministic daily stock-and-flow simulation for the Longmont network.
// Costs are generated from simulated inventory, production, shipments, shorts,
// retailer penalties and intervention execution—not from a shaped impact curve.

const EVENT_ID = 'TAC_001_oils_fats_inbound_delay';
const CASE = 48;
const OIL_WEEKLY_LB = 145000;
const OIL_DAY = OIL_WEEKLY_LB / 7;
const OIL_LB_PER_CASE = OIL_WEEKLY_LB / 120000;
const FG_TO_DC_LEAD = 2;
const DC_TO_RETAIL_LEAD = 2;

const RETAILERS = {
  costco: { node: 'retailer_costco', demandWk: 52000, penalty: 3.10, margin: 5.40, freight: 0.44, fillKpi: 'costco_fill_rate_pct' },
  sams: { node: 'retailer_sams_club', demandWk: 42000, penalty: 3.40, margin: 5.20, freight: 0.46, fillKpi: 'sams_fill_rate_pct' },
  other: { node: 'retailer_other', demandWk: 26000, penalty: 2.20, margin: 4.60, freight: 0.52, fillKpi: 'other_retailer_fill_rate_pct' },
};
const NAMES = { costco: 'Costco', sams: "Sam's Club", other: 'Other Retailers' };
const TOTAL_DEMAND_DAY = Object.values(RETAILERS).reduce((s, r) => s + r.demandWk / 7, 0);

const BUCKETS = [
  'raw_material_cost', 'packaging_cost', 'conversion_cost', 'standard_transport_cost',
  'expedite_transport_premium', 'ambient_storage_cost', 'cold_storage_cost',
  'inventory_carrying_cost', 'spoilage_or_ageing_writeoff_cost', 'quality_hold_or_rework_cost',
  'production_downtime_cost', 'overtime_cost', 'overflow_storage_cost',
  'OTIF_penalty_cost', 'lost_margin_cost',
];

const INTERVENTIONS = {
  expedite_delayed_oil_tanker: { firstArrival: 5, feeBucket: 'expedite_transport_premium', fee: 85000, oilEfficiency: 1, allocation: 'proportional' },
  source_emergency_oil_supply: { firstArrival: 8, emergencyArrival: 3, emergencyQty: OIL_DAY * 5, feeBucket: 'raw_material_cost', fee: 135000, oilEfficiency: 1, allocation: 'proportional' },
  prioritize_longmont_oil_allocation: { firstArrival: 8, feeBucket: 'overtime_cost', fee: 45000, oilEfficiency: 0.72, allocation: 'priority' },
};

function emptyCosts() { return Object.fromEntries(BUCKETS.map(k => [k, 0])); }
function pipelineArrival(pipe, day) {
  let qty = 0;
  for (let i = pipe.length - 1; i >= 0; i--) if (pipe[i].day <= day) { qty += pipe[i].qty; pipe.splice(i, 1); }
  return qty;
}
function rollingAverage(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1; }
function health(ratio) { return ratio < 0.35 ? 'red' : ratio < 0.75 ? 'amber' : 'good'; }

export function simulate({ eventId = null, interventionId = null } = {}) {
  const scenario = eventId === EVENT_ID;
  const horizon = scenario ? 30 : 182;
  const intervention = interventionId ? INTERVENTIONS[interventionId] : null;
  const firstArrival = scenario ? (intervention?.firstArrival ?? 8) : 3;
  const oilEfficiency = intervention?.oilEfficiency ?? 1;
  const costs = emptyCosts();
  const frames = [];

  const retail = Object.fromEntries(Object.entries(RETAILERS).map(([key, r]) => [key, {
    onhand: (r.demandWk / 7) * DC_TO_RETAIL_LEAD,
    pipeline: [], fillHistory: [], cumulativeDemand: 0, cumulativeServed: 0,
  }]));
  const state = {
    oil: OIL_DAY * 3,
    fg: TOTAL_DEMAND_DAY * FG_TO_DC_LEAD,
    dc: TOTAL_DEMAND_DAY * DC_TO_RETAIL_LEAD,
    fgToDc: [], retail,
  };

  const oilArrivals = new Map([[firstArrival, OIL_WEEKLY_LB], [10, OIL_WEEKLY_LB], [17, OIL_WEEKLY_LB], [24, OIL_WEEKLY_LB]]);
  if (intervention?.emergencyArrival != null) oilArrivals.set(intervention.emergencyArrival, (oilArrivals.get(intervention.emergencyArrival) || 0) + intervention.emergencyQty);

  for (let day = 0; day < horizon; day++) {
    const add = (bucket, value) => { costs[bucket] += value; };
    // Fixed operating costs still accrue in BAU and scenario runs.
    add('raw_material_cost', 69000); add('packaging_cost', 23000);
    add('ambient_storage_cost', 900); add('quality_hold_or_rework_cost', 600);
    add('spoilage_or_ageing_writeoff_cost', 250);

    if (intervention && day === 3) add(intervention.feeBucket, intervention.fee);
    state.oil += oilArrivals.get(day) || 0;

    // Longmont produces against actual oil availability. Priority scheduling
    // reduces oil required per protected case, rather than inventing supply.
    const desiredCases = TOTAL_DEMAND_DAY;
    const oilRequired = desiredCases * OIL_LB_PER_CASE * oilEfficiency;
    const oilUsed = Math.min(state.oil, oilRequired);
    const producedCases = desiredCases * (oilRequired > 0 ? oilUsed / oilRequired : 1);
    state.oil -= oilUsed;
    state.fg += producedCases;
    add('conversion_cost', producedCases * CASE * 0.041);
    add('production_downtime_cost', (desiredCases - producedCases) * 3.20);

    // Longmont FG -> West DC pipeline.
    const fgShip = Math.min(TOTAL_DEMAND_DAY, state.fg);
    state.fg -= fgShip; state.fgToDc.push({ day: day + FG_TO_DC_LEAD, qty: fgShip });
    add('standard_transport_cost', fgShip * (0.38 + 0.093));
    state.dc += pipelineArrival(state.fgToDc, day);

    // West DC -> retailers. Normal scenarios allocate proportionally; the
    // prioritization intervention explicitly protects Sam's and Costco first.
    const requested = Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.demandWk / 7]));
    const shipped = { costco: 0, sams: 0, other: 0 };
    if (intervention?.allocation === 'priority') {
      for (const key of ['sams', 'costco', 'other']) {
        shipped[key] = Math.min(requested[key], state.dc); state.dc -= shipped[key];
      }
    } else {
      const totalRequest = Object.values(requested).reduce((a, b) => a + b, 0);
      const factor = Math.min(1, state.dc / totalRequest);
      for (const key of Object.keys(RETAILERS)) { shipped[key] = requested[key] * factor; state.dc -= shipped[key]; }
    }
    for (const [key, qty] of Object.entries(shipped)) {
      state.retail[key].pipeline.push({ day: day + DC_TO_RETAIL_LEAD, qty });
      add('standard_transport_cost', qty * RETAILERS[key].freight);
    }

    // Retail receipt, demand fulfillment, OTIF penalty and lost margin.
    const dailyFill = {};
    for (const [key, r] of Object.entries(RETAILERS)) {
      const rs = state.retail[key]; rs.onhand += pipelineArrival(rs.pipeline, day);
      const demand = r.demandWk / 7; const served = Math.min(demand, rs.onhand); const short = demand - served;
      rs.onhand -= served; rs.cumulativeDemand += demand; rs.cumulativeServed += served;
      const fill = demand ? served / demand : 1; rs.fillHistory.push(fill); if (rs.fillHistory.length > 7) rs.fillHistory.shift();
      dailyFill[key] = rollingAverage(rs.fillHistory);
      add('OTIF_penalty_cost', short * r.penalty); add('lost_margin_cost', short * r.margin);
    }

    add('cold_storage_cost', (state.fg + state.dc) * 0.021);
    add('inventory_carrying_cost', (state.fg + state.dc) * 14 * 0.135 / 365 + state.oil * 0.72 * 0.115 / 365);

    const oilCover = state.oil / OIL_DAY;
    const fgCover = state.fg / TOTAL_DEMAND_DAY;
    const dcCover = state.dc / TOTAL_DEMAND_DAY;
    const productionRatio = producedCases / desiredCases;
    const lowestKey = Object.keys(dailyFill).sort((a, b) => dailyFill[a] - dailyFill[b])[0];
    const disruptedOil = scenario && day >= 3 && day < firstArrival;
    const downstreamDisrupted = productionRatio < 0.98 || Object.values(dailyFill).some(v => v < 0.98);
    const nodeHealth = {
      supplier_oils_fats_regional: disruptedOil ? 'red' : 'good',
      inventory_sugar_oils_receiving: health(oilCover / 3),
      processing_fruit_spread_network: health(productionRatio),
      plant_longmont_frozen_sandwich: health(productionRatio),
      frozen_inventory_longmont: health(fgCover / 2), cold_dc_west: health(dcCover / 2),
      retailer_costco: health(dailyFill.costco), retailer_sams_club: health(dailyFill.sams), retailer_other: health(dailyFill.other),
    };
    const edgeStates = {
      rel_oils_to_sugar_oils_inventory: disruptedOil ? 'disrupted' : 'flow',
      rel_sugar_oils_to_secondary_processing: productionRatio < 0.98 ? 'disrupted' : 'flow',
      rel_fruit_spread_to_sandwich_plants: productionRatio < 0.98 ? 'disrupted' : 'flow',
      rel_longmont_to_fg_inventory: productionRatio < 0.98 ? 'disrupted' : 'flow',
      rel_longmont_fg_to_west_dc: downstreamDisrupted ? 'disrupted' : 'flow',
      rel_west_dc_to_costco: dailyFill.costco < 0.98 ? 'disrupted' : 'flow',
      rel_west_dc_to_sams_club: dailyFill.sams < 0.98 ? 'disrupted' : 'flow',
      rel_west_dc_to_other_retailers: dailyFill.other < 0.98 ? 'disrupted' : 'flow',
    };
    const valueOverrides = {
      inventory_sugar_oils_receiving: { oil_fat_days_of_cover: Math.round(oilCover * 10) / 10 },
      processing_fruit_spread_network: { fruit_spread_output_lb_per_week: Math.round(720000 * productionRatio) },
      plant_longmont_frozen_sandwich: { longmont_sandwiches_per_week: Math.round(producedCases * 7 * CASE) },
      frozen_inventory_longmont: { longmont_finished_goods_days_of_cover: Math.round(fgCover * 10) / 10 },
      retailer_costco: { costco_fill_rate_pct: Math.round(dailyFill.costco * 1000) / 10 },
      retailer_sams_club: { sams_fill_rate_pct: Math.round(dailyFill.sams * 1000) / 10 },
      retailer_other: { other_retailer_fill_rate_pct: Math.round(dailyFill.other * 1000) / 10 },
    };
    frames.push({
      t: day, label: `DAY ${day + 1}`, totalTicks: horizon, grain: 'day',
      phase: !scenario ? 'bau' : day < 3 ? 'pre' : day < firstArrival ? 'active' : downstreamDisrupted ? 'aftermath' : 'recovered',
      nodeHealth, edgeStates, valueOverrides, retailerFill: Object.fromEntries(Object.entries(dailyFill).map(([k, v]) => [k, v * 100])),
      lowestRetailer: { key: lowestKey, name: NAMES[lowestKey], fill: dailyFill[lowestKey] * 100 },
      inventory: { oilCover, fgCover, dcCover }, production: { cases: producedCases, ratio: productionRatio },
      cum: { ...costs }, cumTotal: Object.values(costs).reduce((a, b) => a + b, 0),
    });
  }
  const last = frames.at(-1);
  const worst = frames.reduce((w, f) => f.lowestRetailer.fill < w.fill ? { ...f.lowestRetailer, day: f.t + 1 } : w, { name: '', fill: 101, day: 0 });
  return { frames, horizon, total: last.cumTotal, cum: last.cum, worstRetailer: worst };
}

const cache = {};
export function runBau() { return (cache.bau ||= simulate()); }
export function runScenario(eventId, interventionId = null) { const key = `${eventId}::${interventionId || ''}`; return (cache[key] ||= simulate({ eventId, interventionId })); }
export function bauTotalsFor(days) { const f = runBau().frames[Math.min(days, 182) - 1]; return { total: f.cumTotal, cum: f.cum }; }
export function bauCumAtDay(day) { return runBau().frames[Math.min(day, 181)].cumTotal; }
