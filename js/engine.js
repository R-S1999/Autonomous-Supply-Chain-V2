// Discrete-event simulation engine (daily tick).
//
// What is modeled per day:
//  - RM inventory nodes run a continuous-review (s,S) reorder policy on
//    inventory POSITION = on-hand + pipeline. Orders split across suppliers
//    by their YAML allocation share; suppliers ship up to their weekly
//    capacity cap (no accumulation, no backorders).
//  - Only compliance% of an order actually ships, so the up-to level is
//    rarely reached. On arrival a quality/spoilage haircut removes a
//    percentage of receipts; only the remainder becomes usable stock.
//  - Every lane has a transit lead time: shipped goods sit in the pipeline
//    (they count for ordering, not for consumption) until they arrive.
//  - Plants hold small line-side ingredient stores replenished from RM
//    buffers / processing; daily production = min(capacity, FG replenishment
//    need, every BOM ingredient on hand). Processing likewise.
//  - Demand originates at retailer DCs; unmet demand is a LOST SALE
//    (lost margin + OTIF chargeback) — costed in BAU too.
//  - All 15 decision-layer cost buckets accumulate from the flows
//    (a few non-flow buckets ride as fixed weekly rates from the BAU KPIs).
import { eventsById } from './model.js';

const CASE = 48; // sandwiches per case

/* ================================================================== */
/* Network configuration (values lifted from the YAML model)           */
/* ================================================================== */
function baseConfig() {
  return {
    materials: {
      flour: {
        buffer: 'inventory_flour_receiving', cover: 7, weeklyCons: 1050000,
        spoil: 0.025, storage: 0.00018, carryPct: 0.115, unit: 'lb',
        suppliers: [
          { node: 'supplier_flour_great_plains_bulk', capWk: 620000, cost: 0.31, lead: 5, leadP90: 8, comp: 0.97, share: 0.58 },
          { node: 'supplier_flour_regional_fast_response', capWk: 462000, cost: 0.38, lead: 2, leadP90: 3, comp: 0.94, share: 0.42 },
        ],
      },
      peanut: {
        buffer: 'inventory_peanut_receiving', cover: 12, weeklyCons: 970000,
        spoil: 0.014, storage: 0.00024, carryPct: 0.115, unit: 'lb',
        suppliers: [
          { node: 'supplier_peanuts_southeast_contract', capWk: 760000, cost: 0.82, lead: 8, leadP90: 12, comp: 0.97, share: 0.742 },
          { node: 'supplier_peanuts_regional_fast_response', capWk: 262500, cost: 0.96, lead: 3, leadP90: 5, comp: 0.96, share: 0.258 },
        ],
      },
      fruit: {
        buffer: 'inventory_fruit_base_receiving', cover: 18, weeklyCons: 250000,
        spoil: 0.032, storage: 0.00042, carryPct: 0.115, unit: 'lb',
        suppliers: [
          { node: 'supplier_fruit_west_bulk', capWk: 390000, cost: 0.64, lead: 9, leadP90: 14, comp: 0.96, share: 0.64 },
          { node: 'supplier_fruit_midwest_fast_response', capWk: 180000, cost: 0.78, lead: 3, leadP90: 5, comp: 0.91, share: 0.36 },
        ],
      },
      sugar_oils: {
        buffer: 'inventory_sugar_oils_receiving', cover: 10, weeklyCons: 210000,
        spoil: 0.012, storage: 0.0002, carryPct: 0.115, unit: 'lb',
        suppliers: [
          { node: 'supplier_sugar_bulk_refiner', capWk: 520000, cost: 0.30, lead: 4, leadP90: 6, comp: 0.95, share: 0.66 },
          { node: 'supplier_oils_fats_regional', capWk: 170000, cost: 0.72, lead: 5, leadP90: 8, comp: 0.96, share: 0.34 },
        ],
      },
      wrappers: {
        buffer: 'inventory_packaging_receiving', cover: 9, weeklyCons: 28850000,
        spoil: 0.005, storage: 0.0000029, carryPct: 0.115, unit: 'unit',
        suppliers: [
          { node: 'supplier_film_wrap_converter', capWk: 35000000, cost: 6.5 / 1000, lead: 7, leadP90: 11, comp: 0.96, share: 1 },
        ],
      },
    },
    processing: {
      pb: { node: 'processing_peanut_butter_network', capWk: 1080000, conv: 0.11, outCover: 5, inputs: { peanut: 970000 / 1080000 } },
      fs: { node: 'processing_fruit_spread_network', capWk: 720000, conv: 0.09, outCover: 3, inputs: { fruit: 250000 / 720000, sugar_oils: 210000 / 720000 } },
    },
    /* per-sandwich bill of materials */
    bom: { flour: 1050000 / 28850000, pb: 1080000 / 28850000, fs: 720000 / 28850000, wrappers: 1 },
    plants: {
      scottsville: { node: 'plant_scottsville_frozen_sandwich', capWk: 10100000, conv: 0.043, share: 10.1 / 28.85 },
      longmont:    { node: 'plant_longmont_frozen_sandwich',    capWk: 11500000, conv: 0.041, share: 11.5 / 28.85 },
      mccalla:     { node: 'plant_mccalla_frozen_sandwich',     capWk: 7250000,  conv: 0.047, share: 7.25 / 28.85 },
    },
    /* line-side ingredient lanes: transit days + transfer $ per unit */
    plantLanes: {
      scottsville: { flour: [1, 0.015], pb: [2, 0.05], fs: [3, 0.06], wrappers: [0.5, 0.00045] },
      longmont:    { flour: [1, 0.015], pb: [3, 0.05], fs: [4, 0.06], wrappers: [0.5, 0.00045] },
      mccalla:     { flour: [1.5, 0.017], pb: [4, 0.055], fs: [5, 0.065], wrappers: [1, 0.0005] },
    },
    fg: {
      scottsville: { node: 'frozen_inventory_scottsville', cover: 10, storage: 0.021, caseValue: 14, carryPct: 0.135, putaway: 0.09 },
      longmont:    { node: 'frozen_inventory_longmont',    cover: 12, storage: 0.021, caseValue: 14, carryPct: 0.135, putaway: 0.085 },
      mccalla:     { node: 'frozen_inventory_mccalla',     cover: 8,  storage: 0.021, caseValue: 14, carryPct: 0.135, putaway: 0.1 },
    },
    /* FG -> DC deployment lanes (cases) */
    dcLanes: {
      west:      { fromPlant: 'longmont',    node: 'cold_dc_west',      lead: 2,   freight: 0.38, handling: 0.093 },
      central:   { fromPlant: 'scottsville', node: 'cold_dc_central',   lead: 1.5, freight: 0.29, handling: 0.088 },
      southeast: { fromPlant: 'mccalla',     node: 'cold_dc_southeast', lead: 1,   freight: 0.22, handling: 0.09 },
    },
    dcCover: 5,
    /* DC -> retailer lanes (cases/wk shares of each retailer's demand) */
    retailLanes: [
      { dc: 'west',      retailer: 'grocery',     share: 1,     lead: 2,   freight: 0.44 },
      { dc: 'central',   retailer: 'walmart',     share: 0.576, lead: 1.5, freight: 0.34 },
      { dc: 'southeast', retailer: 'walmart',     share: 0.424, lead: 1.5, freight: 0.31 },
      { dc: 'central',   retailer: 'foodservice', share: 1,     lead: 2.5, freight: 0.52 },
    ],
    retailers: {
      grocery:     { node: 'retailer_dc_grocery_mass', demandWk: 210000, cover: 3, penalty: 2.4,  margin: 4.4 },
      walmart:     { node: 'retailer_dc_walmart_sams', demandWk: 165000, cover: 1.5, penalty: 3.25, margin: 5.1 },
      foodservice: { node: 'retailer_dc_foodservice',  demandWk: 90000,  cover: 3, penalty: 1.85, margin: 3.6 },
    },
    /* buckets not driven by modeled flows, as weekly rates from BAU KPIs */
    fixedWeekly: {
      packaging_cost: 605850,             // cartons + master cases converter spend
      production_downtime_cost: 368467,   // BAU starvation/learning-loss downtime
      quality_hold_or_rework_cost: 12960, // fruit-spread rework + holds
      cold_storage_cost: 231000,          // DC pallet-position storage
      ambient_storage_cost: 6000,         // packaging pallet storage
    },
    /* scenario knobs (mutated by event/intervention effects) */
    effects: [],       // {from,to, apply(cfgState) ...} — see EVENT_EFFECTS
    horizon: 182,
  };
}

/* ================================================================== */
/* Event effects: overlay patches -> engine parameters (by event id)   */
/* window = [startDay, endDay) on the aligned comparison horizon:      */
/* tactical events run on 30d, long-term on 182d starting ~day 28.     */
/* ================================================================== */
function eventWindow(event) {
  const tactical = event.event_horizon === 'tactical';
  const horizon = tactical ? 30 : 182;
  const start = tactical ? (event.trigger_window?.expected_start_in_days ?? 2) : 28;
  const dur = event.trigger_window?.expected_duration_days ?? 7;
  return { horizon, start, end: Math.min(horizon, start + dur), tactical };
}

const EVENT_EFFECTS = {
  LT_001_peanut_price_weather_supply_risk: (fx) => {
    fx.supplierMult('supplier_peanuts_southeast_contract', { cost: 1.02 / 0.82, cap: 610000 / 720000, leadAdd: 4 });
    fx.supplierMult('supplier_peanuts_regional_fast_response', { cost: 1.22 / 0.96, cap: 185000 / 250000 });
  },
  LT_002_fruit_base_crop_yield_pressure: (fx) => {
    fx.supplierMult('supplier_fruit_west_bulk', { cost: 0.82 / 0.64, cap: 300000 / 390000, leadAdd: 5 });
    fx.supplierMult('supplier_fruit_midwest_fast_response', { cost: 0.93 / 0.78 });
  },
  LT_003_packaging_resin_and_paperboard_inflation: (fx) => {
    fx.supplierMult('supplier_film_wrap_converter', { cost: 7.9 / 6.5, leadAdd: 4 });
    fx.fixedMult('packaging_cost', 242 / 210); // carton inflation
  },
  TAC_001_late_reefer_to_walmart_sams_dc: (fx) => {
    fx.retailLaneLeadAdd('central', 'walmart', 2.5);
  },
  TAC_002_mccalla_line_downtime_capacity_loss: (fx) => {
    fx.plantMult('mccalla', { cap: 5945000 / 7250000 });
    fx.dailyCost('production_downtime_cost', (42 * 17600) / 5); // 42h over the 5d window
  },
  TAC_003_west_cold_dc_capacity_constraint: (fx) => {
    fx.dcReceiveMult('west', 9000 / 28000);
    fx.overflowPremium('west', 3.6 / 64); // full overflow rate, $/case-day stuck outside
  },
};

/* ================================================================== */
/* Intervention effects (applied on top of the event's effects)        */
/* ================================================================== */
const INTERVENTION_EFFECTS = {
  /* --- TAC-001 late reefer --- */
  expedite_current_reefer: (fx, w) => {
    fx.retailLaneLeadAdd('central', 'walmart', -1.5);
    fx.retailLaneFreightMult('central', 'walmart', 2.2);
  },
  ship_replacement_from_southeast_dc: (fx) => {
    fx.recovery('walmart', { share: 0.9, freightMult: 1.8 });
  },
  split_replacement_central_and_southeast_dc: (fx) => {
    fx.recovery('walmart', { share: 0.96, freightMult: 1.9 });
  },
  /* --- TAC-002 mccalla downtime --- */
  overtime_longmont_and_scottsville: (fx) => {
    fx.plantMult('scottsville', { cap: 1.12, overtime: 0.014 });
    fx.plantMult('longmont', { cap: 1.12, overtime: 0.014 });
  },
  drawdown_mccalla_fg_and_replenish_later: (fx) => {
    fx.fgCoverAdd('mccalla', -3); // run the buffer hotter, recover after
    fx.fee(42000);
  },
  shift_southeast_orders_to_central_dc: (fx) => {
    fx.recovery('walmart', { share: 0.82, freightMult: 1.6 });
    fx.recovery('foodservice', { share: 0.82, freightMult: 1.6 });
    fx.fee(24000);
  },
  /* --- TAC-003 west DC constraint --- */
  temporary_3PL_overflow_west: (fx) => {
    fx.dcReceiveMult('west', 0.92); // overflow restores most inbound
    fx.overflowPremium('west', 3.6 / 64);
  },
  reroute_longmont_output_to_central_dc: (fx) => {
    fx.dcReceiveMult('west', 0.72);
    fx.recovery('grocery', { share: 0.85, freightMult: 1.5 });
    fx.fee(30000);
  },
  slow_production_release_from_longmont: (fx) => {
    fx.plantMult('longmont', { cap: 0.9 });
    fx.dcReceiveMult('west', 0.55);
    fx.fee(20000);
  },
  /* --- LT-001 peanuts --- */
  forward_buy_8_weeks_peanuts: (fx) => {
    fx.forwardBuy('peanut', { weeks: 8 });
  },
  shift_20_pct_to_regional_fast_supplier: (fx) => {
    fx.shareShift('peanut', 0.2);
  },
  hedge_or_contract_extension: (fx) => {
    fx.softenPrice('supplier_peanuts_southeast_contract', 0.5);
    fx.softenPrice('supplier_peanuts_regional_fast_response', 0.5);
    fx.fee(140000);
  },
  /* --- LT-002 fruit --- */
  forward_buy_6_weeks_fruit_base: (fx) => {
    fx.forwardBuy('fruit', { weeks: 6 });
  },
  prequalify_secondary_midwest_capacity: (fx) => {
    fx.supplierMult('supplier_fruit_midwest_fast_response', { cap: 1.5 });
    fx.shareShift('fruit', 0.2);
    fx.fee(220000);
  },
  reformulate_supplier_mix_with_approved_equivalent: (fx) => {
    fx.softenPrice('supplier_fruit_west_bulk', 0.45);
    fx.supplierMult('supplier_fruit_west_bulk', { capFloor: 0.9 });
    fx.fee(160000);
  },
  /* --- LT-003 packaging --- */
  forward_buy_10_weeks_packaging: (fx) => {
    fx.forwardBuy('wrappers', { weeks: 10 });
  },
  dual_source_carton_converter: (fx) => {
    fx.fixedSoften('packaging_cost', 0.55);
    fx.fee(310000);
  },
  reserve_converter_capacity: (fx) => {
    fx.softenPrice('supplier_film_wrap_converter', 0.5);
    fx.fixedSoften('packaging_cost', 0.35);
    fx.fee(180000);
  },
};

/* ================================================================== */
/* Simulation core                                                     */
/* ================================================================== */
const BUCKETS = [
  'raw_material_cost', 'packaging_cost', 'conversion_cost', 'standard_transport_cost',
  'expedite_transport_premium', 'ambient_storage_cost', 'cold_storage_cost',
  'inventory_carrying_cost', 'spoilage_or_ageing_writeoff_cost', 'quality_hold_or_rework_cost',
  'production_downtime_cost', 'overtime_cost', 'overflow_storage_cost',
  'OTIF_penalty_cost', 'lost_margin_cost',
];

class Effects {
  constructor() {
    this.supplier = {};   // node -> {costMult, capMult, leadAdd, capFloor}
    this.plant = {};      // key -> {capMult, overtime}
    this.retailLane = {}; // dc::retailer -> {leadAdd, freightMult}
    this.recoveries = {}; // retailer -> {share, freightMult}
    this.dcReceive = {};  // dc -> mult
    this.overflow = {};   // dc -> $/case-day
    this.fixedMults = {}; // bucket -> mult
    this.fixedSoftens = {};
    this.dailyCosts = {}; // bucket -> $/day (inside window)
    this.forwardBuys = {};// material -> weeks
    this.shareShifts = {};// material -> pct to fast supplier
    this.priceSoften = {};// node -> fraction of increase removed
    this.fgCover = {};    // plantKey -> delta days
    this.fees = 0;        // one-off execution fee
  }
  supplierMult(n, o) { this.supplier[n] = { ...(this.supplier[n] || {}), ...o }; }
  plantMult(k, o) { this.plant[k] = { ...(this.plant[k] || {}), ...o }; }
  retailLaneLeadAdd(dc, r, d) { const k = `${dc}::${r}`; (this.retailLane[k] ||= {}).leadAdd = (this.retailLane[k].leadAdd || 0) + d; }
  retailLaneFreightMult(dc, r, m) { const k = `${dc}::${r}`; (this.retailLane[k] ||= {}).freightMult = m; }
  recovery(r, o) { this.recoveries[r] = o; }
  dcReceiveMult(dc, m) { this.dcReceive[dc] = m; }
  overflowPremium(dc, v) { this.overflow[dc] = v; }
  fixedMult(b, m) { this.fixedMults[b] = m; }
  fixedSoften(b, f) { this.fixedSoftens[b] = f; }
  dailyCost(b, v) { this.dailyCosts[b] = (this.dailyCosts[b] || 0) + v; }
  forwardBuy(mat, o) { this.forwardBuys[mat] = o.weeks; }
  shareShift(mat, pct) { this.shareShifts[mat] = pct; }
  softenPrice(node, f) { this.priceSoften[node] = f; }
  fgCoverAdd(k, d) { this.fgCover[k] = d; }
  fee(v) { this.fees += v; }
}

export function simulate({ eventId = null, interventionId = null } = {}) {
  const cfg = baseConfig();
  const event = eventId ? eventsById[eventId] : null;
  const win = event ? eventWindow(event) : { horizon: 182, start: Infinity, end: Infinity, tactical: false };
  const horizon = win.horizon;

  const evFx = new Effects();
  if (event && EVENT_EFFECTS[eventId]) EVENT_EFFECTS[eventId](evFx);
  const ivFx = new Effects();
  if (interventionId && INTERVENTION_EFFECTS[interventionId]) INTERVENTION_EFFECTS[interventionId](ivFx, win);

  const active = (d) => d >= win.start && d < win.end;
  const sup = (n, d) => {
    const e = active(d) ? (evFx.supplier[n] || {}) : {};
    const i = active(d) || d >= win.start ? (ivFx.supplier[n] || {}) : {};
    let costMult = e.cost ?? 1;
    if (ivFx.priceSoften[n] != null && costMult > 1) costMult = 1 + (costMult - 1) * (1 - ivFx.priceSoften[n]);
    let capMult = (e.cap ?? 1) * (i.cap ?? 1);
    if (i.capFloor != null) capMult = Math.max(capMult, i.capFloor);
    return { costMult, capMult, leadAdd: (e.leadAdd ?? 0) };
  };

  /* ---------- state ---------- */
  const totalDemandDay = Object.values(cfg.retailers).reduce((a, r) => a + r.demandWk, 0) / 7; // cases
  const state = {
    mats: {}, procs: {}, plants: {}, fgs: {}, dcs: {}, retail: {},
    cum: Object.fromEntries(BUCKETS.map(b => [b, 0])),
  };
  for (const [key, m] of Object.entries(cfg.materials)) {
    const daily = m.weeklyCons / 7;
    state.mats[key] = {
      onhand: m.cover * daily, pipeline: [], daily,
      sDays: Math.max(...m.suppliers.map(s => s.leadP90)) + 2,
      SDays: Math.max(...m.suppliers.map(s => s.leadP90)) + 2 + m.cover,
      shippedWk: m.suppliers.map(() => 0), orderedWk: m.suppliers.map(() => 0),
      recent: [],
    };
  }
  for (const [key, p] of Object.entries(cfg.processing)) {
    state.procs[key] = { out: p.outCover * p.capWk / 7 * 0.8, pipelineByPlant: {}, prod7: [], target7: [] };
  }
  for (const [key] of Object.entries(cfg.plants)) {
    const stores = {};
    for (const ing of Object.keys(cfg.bom)) {
      const [lead] = cfg.plantLanes[key][ing];
      const dailyNeed = cfg.bom[ing] * cfg.plants[key].share * totalDemandDay * CASE;
      stores[ing] = { onhand: (lead + 3) * dailyNeed, pipeline: [], dailyNeed, lead };
    }
    state.plants[key] = { stores, prod7: [], target7: [] };
    state.fgs[key] = { onhand: cfg.fg[key].cover * cfg.plants[key].share * totalDemandDay, pipelineOut: [] };
  }
  for (const [key] of Object.entries(cfg.dcLanes)) {
    state.dcs[key] = { onhand: cfg.dcCover * dcDemandDay(key), pipeline: [], served7: [], asked7: [], yard: 0 };
  }
  for (const [key, r] of Object.entries(cfg.retailers)) {
    state.retail[key] = { onhand: r.cover * r.demandWk / 7, pipeline: [], served7: [], demand7: [] };
  }
  function dcDemandDay(dc) {
    return cfg.retailLanes.filter(l => l.dc === dc)
      .reduce((a, l) => a + cfg.retailers[l.retailer].demandWk / 7 * l.share, 0);
  }

  /* ---------- helpers ---------- */
  const arrive = (pipeline, day) => {
    let got = 0;
    for (let i = pipeline.length - 1; i >= 0; i--) {
      if (pipeline[i].at <= day) { got += pipeline[i].qty; pipeline.splice(i, 1); }
    }
    return got;
  };
  const pipeQty = (pipeline) => pipeline.reduce((a, s) => a + s.qty, 0);
  const roll = (arr, v, n = 7) => { arr.push(v); if (arr.length > n) arr.shift(); };
  const rsum = (arr) => arr.reduce((a, b) => a + b, 0);
  const add = (b, v) => { state.cum[b] += v; };

  const frames = [];

  /* ---------- daily loop ---------- */
  for (let day = 0; day < horizon; day++) {
    if (day % 7 === 0) {
      for (const ms of Object.values(state.mats)) { ms.shippedWk.fill(0); ms.orderedWk.fill(0); }
    }
    /* the disruption hits goods already on the road: shift in-transit ETAs */
    if (day === win.start) {
      for (const [rk] of Object.entries(cfg.retailers)) {
        for (const ship of state.retail[rk].pipeline) {
          if (!ship.lane) continue;
          const dl = (evFx.retailLane[ship.lane]?.leadAdd ?? 0) + (ivFx.retailLane[ship.lane]?.leadAdd ?? 0);
          if (dl) ship.at += dl;
        }
      }
    }
    const health = {}, overrides = {};

    /* 1 · RM arrivals + (s,S) ordering + supplier shipping */
    for (const [key, m] of Object.entries(cfg.materials)) {
      const ms = state.mats[key];
      const gross = arrive(ms.pipeline, day);
      const spoiled = gross * m.spoil;
      ms.onhand += gross - spoiled;
      // purchase value was booked at ship; classify the spoiled share now
      add('spoilage_or_ageing_writeoff_cost', spoiled * avgCost(m, day));
      add('raw_material_cost', -spoiled * avgCost(m, day));

      // forward buy: pre-event, order up to an inflated level every day
      // (base-stock trigger) and let suppliers flex to spot capacity ×1.6
      let SDays = ms.SDays, sDays = ms.sDays;
      const fwdWeeks = ivFx.forwardBuys[key];
      const fwdActive = fwdWeeks && day >= Math.max(0, win.start - 25) && day < win.start;
      if (fwdActive) { SDays += fwdWeeks * 7; sDays = SDays; }

      const position = ms.onhand + pipeQty(ms.pipeline);
      if (position < sDays * ms.daily) {
        let need = SDays * ms.daily - position;
        const shares = supplierShares(key, m);
        m.suppliers.forEach((s, i) => {
          if (need <= 0) return;
          const fx = sup(s.node, day);
          const flex = fwdActive ? 1.6 : 1;
          const capDayLeft = Math.max(0, s.capWk * fx.capMult * flex - ms.shippedWk[i]);
          const want = need * shares[i];
          const shipped = Math.min(want, capDayLeft) * s.comp;
          if (shipped > 0) {
            ms.shippedWk[i] += shipped;
            ms.orderedWk[i] += want;
            const unit = s.cost * fx.costMult * (isPacking(key) ? 1 : 1);
            ms.pipeline.push({ qty: shipped, at: day + s.lead + fx.leadAdd });
            add(isPacking(key) ? 'packaging_cost' : 'raw_material_cost', shipped * unit);
          } else if (want > 0) ms.orderedWk[i] += want;
        });
      }
      add('ambient_storage_cost', ms.onhand * m.storage);
      add('inventory_carrying_cost', ms.onhand * avgCost(m, day) * m.carryPct / 365);
    }
    function supplierShares(key, m) {
      const shift = ivFx.shareShifts[key] ?? 0;
      if (!shift || m.suppliers.length < 2) return m.suppliers.map(s => s.share);
      return [m.suppliers[0].share - shift, m.suppliers[1].share + shift];
    }
    function avgCost(m, d) {
      return m.suppliers.reduce((a, s) => a + s.cost * sup(s.node, d).costMult * s.share, 0);
    }
    function isPacking(key) { return key === 'wrappers'; }

    /* 2 · processing: produce toward output cover, constrained by RM on hand */
    for (const [key, p] of Object.entries(cfg.processing)) {
      const ps = state.procs[key];
      const dailyOut = p.capWk / 7;
      const target = Math.max(0, p.outCover * dailyOut - ps.out);
      let make = Math.min(dailyOut, target + dailyOut * 0.5);
      for (const [mat, ratio] of Object.entries(p.inputs)) {
        make = Math.min(make, state.mats[mat].onhand / ratio);
      }
      make = Math.max(0, make);
      for (const [mat, ratio] of Object.entries(p.inputs)) state.mats[mat].onhand -= make * ratio;
      ps.out += make;
      add('conversion_cost', make * p.conv);
      roll(ps.prod7, make); roll(ps.target7, Math.min(dailyOut, target + dailyOut * 0.5));
    }

    /* 3 · plants: receive ingredient shipments, order more, produce to FG need */
    for (const [key, plant] of Object.entries(cfg.plants)) {
      const st = state.plants[key];
      const fgS = state.fgs[key];
      for (const [ing, store] of Object.entries(st.stores)) {
        store.onhand += arrive(store.pipeline, day);
        const position = store.onhand + pipeQty(store.pipeline);
        const S = (store.lead + 3) * store.dailyNeed;
        if (position < S - store.dailyNeed) {
          const want = S - position;
          let shippedQ = 0;
          const [lead, xfer] = cfg.plantLanes[key][ing];
          if (ing === 'pb' || ing === 'fs') {
            const proc = state.procs[ing];
            shippedQ = Math.min(want, Math.max(0, proc.out));
            proc.out -= shippedQ;
          } else {
            const ms = state.mats[ing === 'wrappers' ? 'wrappers' : 'flour'];
            shippedQ = Math.min(want, Math.max(0, ms.onhand));
            ms.onhand -= shippedQ;
          }
          if (shippedQ > 0) {
            store.pipeline.push({ qty: shippedQ, at: day + lead });
            add('standard_transport_cost', shippedQ * xfer);
          }
        }
      }
      /* production */
      const pf = active(day) ? (evFx.plant[key]?.cap ?? 1) : 1;
      const ivp = day >= win.start ? (ivFx.plant[key] || {}) : {};
      const capDay = plant.capWk / 7 * pf * (ivp.cap ?? 1);
      const dailyShipCases = plant.share * totalDemandDay;
      const coverTarget = cfg.fg[key].cover + (day >= win.start ? (ivFx.fgCover[key] ?? 0) : 0);
      const fgDeficit = Math.max(0, coverTarget * dailyShipCases - (fgS.onhand));
      let target = Math.min(capDay, (fgDeficit + dailyShipCases) * CASE);
      let make = target;
      for (const [ing, ratio] of Object.entries(cfg.bom)) {
        make = Math.min(make, st.stores[ing].onhand / ratio);
      }
      make = Math.max(0, make);
      for (const [ing, ratio] of Object.entries(cfg.bom)) st.stores[ing].onhand -= make * ratio;
      add('conversion_cost', make * plant.conv);
      if (ivp.overtime && make > plant.capWk / 7) add('overtime_cost', (make - plant.capWk / 7) * ivp.overtime);
      const cases = make / CASE;
      fgS.onhand += cases;
      add('standard_transport_cost', cases * cfg.fg[key].putaway);
      roll(st.prod7, make); roll(st.target7, target);
      add('cold_storage_cost', fgS.onhand * cfg.fg[key].storage);
      add('inventory_carrying_cost', fgS.onhand * cfg.fg[key].caseValue * cfg.fg[key].carryPct / 365);
    }

    /* 4 · DCs: receive from FG (with optional receiving throttle), reorder */
    for (const [dc, lane] of Object.entries(cfg.dcLanes)) {
      const ds = state.dcs[dc];
      let arriving = arrive(ds.pipeline, day) + ds.yard;
      ds.yard = 0;
      let rMult = 1;
      if (active(day)) rMult = ivFx.dcReceive[dc] ?? evFx.dcReceive[dc] ?? 1;
      const recvCap = dcDemandDay(dc) * 1.25 * rMult;
      if (arriving > recvCap) {
        const newYard = arriving - recvCap;
        add('standard_transport_cost', newYard * 0.08); // double handling into overflow
        ds.yard = newYard;
        arriving = recvCap;
        const prem = (active(day) ? (ivFx.overflow[dc] ?? evFx.overflow[dc] ?? 0) : 0);
        add('overflow_storage_cost', ds.yard * prem);
      }
      ds.onhand += arriving;
      const position = ds.onhand + pipeQty(ds.pipeline) + ds.yard;
      const S = (cfg.dcCover + lane.lead) * dcDemandDay(dc);
      if (position < S) {
        const want = S - position;
        const fgS = state.fgs[lane.fromPlant];
        const q = Math.min(want, Math.max(0, fgS.onhand));
        fgS.onhand -= q;
        if (q > 0) {
          ds.pipeline.push({ qty: q, at: day + lane.lead });
          add('standard_transport_cost', q * (lane.freight + lane.handling));
        }
      }
      add('cold_storage_cost', ds.onhand * 0.021);
    }

    /* 5 · retailers: consume demand (lost sale if short), reorder from DCs */
    for (const [rk, r] of Object.entries(cfg.retailers)) {
      const rs = state.retail[rk];
      rs.onhand += arrive(rs.pipeline, day);
      const demand = r.demandWk / 7;
      const served = Math.min(demand, rs.onhand);
      rs.onhand -= served;
      let short = demand - served;
      /* intervention recovery: alternate DC covers part of the shortfall at premium freight */
      if (short > 0.5 && day >= win.start && ivFx.recoveries[rk]) {
        const rec = ivFx.recoveries[rk];
        const altDc = cfg.retailLanes.find(l => l.retailer === rk && state.dcs[l.dc].onhand > short) ||
          cfg.retailLanes.find(l => l.retailer === rk);
        if (altDc) {
          const q = Math.min(short * rec.share, Math.max(0, state.dcs[altDc.dc].onhand));
          state.dcs[altDc.dc].onhand -= q;
          short -= q;
          add('standard_transport_cost', q * altDc.freight);
          add('expedite_transport_premium', q * altDc.freight * (rec.freightMult - 1));
        }
      }
      if (short > 0) {
        add('lost_margin_cost', short * r.margin);
        add('OTIF_penalty_cost', short * r.penalty);
      }
      roll(rs.served7, demand - short); roll(rs.demand7, demand);
      /* replenishment — S is planned on BASELINE lead times: an unplanned
         lead-time slip stretches the pipeline and drains the shelf */
      const position = rs.onhand + pipeQty(rs.pipeline);
      const lanes = cfg.retailLanes.filter(l => l.retailer === rk);
      const lead = Math.max(...lanes.map(l => l.lead));
      const S = (r.cover + lead) * demand;
      if (position < S) {
        let want = S - position;
        for (const l of lanes) {
          const ds = state.dcs[l.dc];
          const q = Math.min(want * l.share, Math.max(0, ds.onhand));
          ds.onhand -= q;
          roll(ds.served7, q); roll(ds.asked7, want * l.share);
          if (q > 0) {
            const fxL = active(day) ? (evFx.retailLane[`${l.dc}::${rk}`] || {}) : {};
            const ivL = day >= win.start ? (ivFx.retailLane[`${l.dc}::${rk}`] || {}) : {};
            const leadEff = Math.max(0.5, l.lead + (fxL.leadAdd ?? 0) + (ivL.leadAdd ?? 0));
            rs.pipeline.push({ qty: q, at: day + leadEff, lane: `${l.dc}::${rk}` });
            const fm = ivL.freightMult ?? 1;
            add('standard_transport_cost', q * l.freight);
            if (fm > 1) add('expedite_transport_premium', q * l.freight * (fm - 1));
          }
        }
      }
    }

    /* 6 · fixed weekly buckets (+ event daily costs + intervention fee on day 0 of window) */
    for (const [b, v] of Object.entries(cfg.fixedWeekly)) {
      let vv = v / 7;
      if (active(day) && evFx.fixedMults[b]) vv *= evFx.fixedMults[b];
      if (active(day) && ivFx.fixedSoftens[b] && evFx.fixedMults[b] > 1) {
        vv = v / 7 * (1 + (evFx.fixedMults[b] - 1) * (1 - ivFx.fixedSoftens[b]));
      }
      add(b, vv);
    }
    if (active(day)) for (const [b, v] of Object.entries(evFx.dailyCosts)) add(b, v);
    // one-off intervention execution fee, booked when the event window opens
    if (ivFx.fees && day === Math.min(win.start, horizon - 1)) add('quality_hold_or_rework_cost', ivFx.fees);

    /* 7 · health + KPI overrides ------------------------------------ */
    for (const [key, m] of Object.entries(cfg.materials)) {
      const ms = state.mats[key];
      const coverNow = ms.onhand / ms.daily;
      const ratio = coverNow / m.cover;
      health[m.buffer] = ratio < 0.35 ? 'red' : ratio < 0.72 ? 'amber' : 'good';
      (overrides[m.buffer] ||= {})[coverKpiName(m.buffer)] = Math.round(coverNow * 10) / 10;
      m.suppliers.forEach((s, i) => {
        const fx = sup(s.node, day);
        const util = ms.shippedWk[i] / Math.max(1, s.capWk * fx.capMult);
        const fillOrd = ms.orderedWk[i] > 1 ? ms.shippedWk[i] / ms.orderedWk[i] : 1;
        health[s.node] = fx.capMult < 0.999 && fillOrd < 0.7 ? 'red'
          : (fx.capMult < 0.95 || util > 0.985 || fillOrd < 0.9) ? 'amber' : 'good';
      });
    }
    for (const [key, p] of Object.entries(cfg.processing)) {
      const ps = state.procs[key];
      const r = rsum(ps.prod7) / Math.max(1, rsum(ps.target7));
      health[p.node] = r < 0.72 ? 'red' : r < 0.93 ? 'amber' : 'good';
    }
    for (const [key, plant] of Object.entries(cfg.plants)) {
      const st = state.plants[key];
      const r = rsum(st.prod7) / Math.max(1, rsum(st.target7));
      health[plant.node] = r < 0.72 ? 'red' : r < 0.93 ? 'amber' : 'good';
      (overrides[plant.node] ||= {})[`${key}_sandwiches_per_week`] = Math.round(rsum(st.prod7));
      const fgS = state.fgs[key];
      const dailyShip = plant.share * totalDemandDay;
      const cRatio = (fgS.onhand / dailyShip) / cfg.fg[key].cover;
      health[cfg.fg[key].node] = cRatio < 0.35 ? 'red' : cRatio < 0.72 ? 'amber' : 'good';
      (overrides[cfg.fg[key].node] ||= {})[coverKpiName(cfg.fg[key].node)] = Math.round(fgS.onhand / dailyShip * 10) / 10;
    }
    for (const [dc, lane] of Object.entries(cfg.dcLanes)) {
      const ds = state.dcs[dc];
      const r = rsum(ds.served7) / Math.max(1, rsum(ds.asked7));
      health[lane.node] = (ds.yard > 0 && r < 0.8) ? 'red' : (r < 0.9 || ds.yard > 0) ? 'amber' : 'good';
    }
    for (const [rk, r] of Object.entries(cfg.retailers)) {
      const rs = state.retail[rk];
      const fill = rsum(rs.served7) / Math.max(1, rsum(rs.demand7));
      health[r.node] = fill < 0.9 ? 'red' : fill < 0.975 ? 'amber' : 'good';
      (overrides[r.node] ||= {})[fillKpiName(r.node)] = Math.round(fill * 1000) / 10;
    }

    frames.push({
      t: day,
      label: `DAY ${day + 1}`,
      totalTicks: horizon,
      grain: 'day',
      phase: !event ? 'bau' : day < win.start ? 'pre' : day < win.end ? 'active' : 'aftermath',
      nodeHealth: health,
      valueOverrides: overrides,
      edgeStates: {},
      cum: { ...state.cum },
      cumTotal: Object.values(state.cum).reduce((a, b) => a + b, 0),
    });
  }

  return { frames, horizon, window: win, total: frames[frames.length - 1].cumTotal, cum: frames[frames.length - 1].cum };
}

function coverKpiName(bufferNode) {
  return {
    inventory_flour_receiving: 'flour_days_of_cover',
    inventory_peanut_receiving: 'peanut_days_of_cover',
    inventory_fruit_base_receiving: 'fruit_base_days_of_cover',
    inventory_sugar_oils_receiving: 'sweetener_fat_composite_days_of_cover',
    inventory_packaging_receiving: 'wrapper_days_of_cover',
    frozen_inventory_scottsville: 'scottsville_finished_goods_days_of_cover',
    frozen_inventory_longmont: 'longmont_finished_goods_days_of_cover',
    frozen_inventory_mccalla: 'mccalla_finished_goods_days_of_cover',
  }[bufferNode];
}
function fillKpiName(node) {
  return {
    retailer_dc_walmart_sams: 'walmart_sams_retailer_fill_rate_pct',
    retailer_dc_grocery_mass: 'grocery_mass_fill_rate_pct',
    retailer_dc_foodservice: 'foodservice_fill_rate_pct',
  }[node];
}

/* ================================================================== */
/* Cached top-level runs                                               */
/* ================================================================== */
const cache = {};
export function runBau() {
  return (cache.bau ||= simulate({}));
}
export function runScenario(eventId, interventionId = null) {
  const k = `${eventId}::${interventionId || ''}`;
  return (cache[k] ||= simulate({ eventId, interventionId }));
}
/* BAU cost aligned to an event's comparison horizon */
export function bauTotalsFor(horizonDays) {
  const bau = runBau();
  const f = bau.frames[Math.min(horizonDays, bau.frames.length) - 1];
  return { total: f.cumTotal, cum: f.cum };
}
export function bauCumAtDay(day) {
  const bau = runBau();
  return bau.frames[Math.min(day, bau.frames.length - 1)].cumTotal;
}
