// Discrete-event simulation engine (daily/weekly tick) for BAU and alert-overlay scenarios.
// Produces a timeline of frames the graph renderer animates through.
// Plant output is BOM-constrained: a plant can only build what its inbound
// ingredient lanes can feed it, with inventory buffers absorbing shortfalls
// for their days of cover before the constraint bites downstream.
import { BAU_GRAPH } from './data.generated.js';
import {
  bauWeeklyCost, eventNodeSeverity, eventEdgeIds, healthFromSeverity,
  nodesById, columnOf, primaryKpiOf,
} from './model.js';

const BAU = bauWeeklyCost();
export const BAU_WEEKLY_TOTAL = BAU.total;
export const BAU_COMPONENTS = BAU.components;

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/* ------------------------------------------------------------------ */
/* BOM / material-availability propagation                             */
/* ------------------------------------------------------------------ */
const NODES_LEFT_TO_RIGHT = [...BAU_GRAPH.nodes].sort((a, b) => columnOf(a) - columnOf(b));
const IN_EDGES = {};
for (const rel of BAU_GRAPH.relationships) (IN_EDGES[rel.to] ||= []).push(rel);

const POOLED_TYPES = new Set(['inventory_buffer', 'cold_chain_distribution_center', 'retailer_distribution_center']);
const CAPACITY_METRIC = /(capacity|available_capacity|output|production)/;
const CAPACITY_UNITY = /(lb_per_week|sandwiches|units_per_week|capacity)/;

function edgeFlow(rel) {
  return rel.modeled_weekly_flow_lb ?? rel.modeled_weekly_flow_sandwiches
    ?? rel.modeled_weekly_flow_units ?? rel.modeled_weekly_flow_wrappers
    ?? rel.modeled_weekly_flow_cases ?? rel.modeled_weekly_flow_cartons ?? 1;
}
function bufferCoverDays(node) {
  const k = primaryKpiOf(node);
  return k?.unit === 'days' ? k.modeled_value : 0;
}
/* capacity ratios (scenario/baseline) for nodes the overlay throttles */
function capacityRatios(event, p) {
  const r = {};
  for (const patch of event.overlay_patches || []) {
    if (patch.target_type !== 'node' || patch.operation === 'use_for_costing') continue;
    const m = patch.metric || '';
    if (!CAPACITY_METRIC.test(m) || !CAPACITY_UNITY.test(m) || /cost/.test(m)) continue;
    if (!(patch.baseline_value > 0)) continue;
    const v = patch.baseline_value + (patch.scenario_value - patch.baseline_value) * p;
    r[patch.target_id] = Math.min(r[patch.target_id] ?? 1, v / patch.baseline_value);
  }
  return r;
}
/* supply factor per node: min over BOM lanes for producers, flow-weighted
   pooling for buffers/DCs; buffers output 1.0 until their cover is consumed */
function propagateSupply(capRatio, activeDays) {
  const f = {};
  for (const node of NODES_LEFT_TO_RIGHT) {
    const inbound = IN_EDGES[node.id] || [];
    let fin = 1;
    if (inbound.length) {
      if (POOLED_TYPES.has(node.node_type)) {
        let num = 0, den = 0;
        for (const e of inbound) { const w = edgeFlow(e); num += w * (f[e.from] ?? 1); den += w; }
        fin = den ? num / den : 1;
      } else {
        fin = Math.min(...inbound.map(e => f[e.from] ?? 1));
      }
    }
    let out = Math.min(fin, capRatio[node.id] ?? 1);
    if (node.node_type === 'inventory_buffer' && activeDays <= bufferCoverDays(node)) {
      out = Math.min(1, capRatio[node.id] ?? 1); // buffer still covering the shortfall
    }
    f[node.id] = out;
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* BAU timeline: steady-state flow, all nodes healthy, cost accrues.   */
/* ------------------------------------------------------------------ */
export function buildBauTimeline(days = 182) {
  const frames = [];
  for (let d = 0; d <= days; d++) {
    frames.push({
      t: d,
      grain: 'day',
      label: `DAY ${d}`,
      phase: 'bau',
      nodeHealth: {},          // default good
      nodeSeverity: {},
      valueOverrides: {},      // no KPI drift in BAU
      edgeStates: {},          // default flowing
      cumBauCost: (BAU.total / 7) * d,
      cumIncrementalCost: 0,
    });
  }
  return frames;
}

/* ------------------------------------------------------------------ */
/* Scenario timeline for one alert overlay event.                      */
/* Tactical events tick daily; long-term events tick weekly.           */
/* ------------------------------------------------------------------ */
export function buildScenarioTimeline(event) {
  const tw = event.trigger_window || {};
  const tactical = event.event_horizon === 'tactical';
  const grain = tactical ? 'day' : 'week';
  const per = tactical ? 1 : 7; // days per tick
  const startTick = Math.max(1, Math.round((tw.expected_start_in_days ?? 2) / per));
  const durTicks = Math.max(1, Math.round((tw.expected_duration_days ?? 7) / per));
  const tailTicks = Math.max(2, Math.round(durTicks * 0.5));
  const totalTicks = startTick + durTicks + tailTicks;

  const sevByNode = eventNodeSeverity(event);
  const edgeIds = eventEdgeIds(event);
  const impactTotal = event.estimated_no_action_impact?.total_incremental_cost_usd ?? 0;
  const nodePatches = (event.overlay_patches || []).filter(p => p.target_type === 'node' && p.operation !== 'use_for_costing');
  const relPatches = (event.overlay_patches || []).filter(p => p.target_type === 'relationship');

  const frames = [];
  for (let t = 0; t <= totalTicks; t++) {
    const activeP = t <= startTick ? 0 : Math.min(1, (t - startTick) / durTicks); // disruption ramp
    const p = easeInOut(activeP);
    const phase = t < startTick ? 'pre' : (t < startTick + durTicks ? 'active' : 'aftermath');

    const nodeHealth = {}, nodeSeverity = {}, valueOverrides = {}, edgeStates = {};
    for (const patch of nodePatches) {
      const v = patch.baseline_value + (patch.scenario_value - patch.baseline_value) * p;
      (valueOverrides[patch.target_id] ||= {})[patch.metric] = v;
    }
    /* BOM propagation: throttled capacities ripple through ingredient lanes */
    const activeDays = Math.max(0, t - startTick) * per;
    const supply = propagateSupply(capacityRatios(event, p), activeDays);
    for (const [id, f] of Object.entries(supply)) {
      if (f >= 0.995) continue;
      nodeSeverity[id] = Math.max(nodeSeverity[id] || 0, 1 - f);
      const node = nodesById[id];
      if (node.node_type === 'manufacturing_plant' || node.node_type === 'secondary_processing') {
        const k = primaryKpiOf(node); // constrained output = capacity × supply factor
        if (k && (valueOverrides[id]?.[k.name] == null)) {
          (valueOverrides[id] ||= {})[k.name] = Math.round(k.modeled_value * f);
        }
      }
    }
    for (const [id, sev] of Object.entries(sevByNode)) {
      nodeSeverity[id] = Math.max(nodeSeverity[id] || 0, sev * p);
    }
    for (const [id, s] of Object.entries(nodeSeverity)) nodeHealth[id] = healthFromSeverity(s);
    for (const patch of relPatches) {
      const v = patch.baseline_value + (patch.scenario_value - patch.baseline_value) * p;
      (valueOverrides[patch.target_id] ||= {})[patch.path || patch.metric] = v;
    }
    if (phase !== 'pre') for (const id of edgeIds) edgeStates[id] = 'disrupted';
    else for (const id of edgeIds) edgeStates[id] = 'watch';

    // incremental "do nothing" cost accrues across the active window
    const accrueP = t <= startTick ? 0
      : Math.min(1, (t - startTick) / (durTicks + tailTicks * 0.5));
    frames.push({
      t,
      grain,
      label: grain === 'day' ? `DAY ${t}` : `WK ${t}`,
      totalTicks,
      phase,
      progress: p,
      nodeHealth, nodeSeverity, valueOverrides, edgeStates,
      cumBauCost: (BAU.total / 7) * t * per,
      cumIncrementalCost: impactTotal * easeInOut(accrueP),
    });
  }
  return frames;
}

/* Impact breakdown lines (everything except total + service risk) */
export function impactBreakdown(event) {
  const imp = event.estimated_no_action_impact || {};
  return Object.entries(imp)
    .filter(([k]) => k !== 'total_incremental_cost_usd' && k !== 'service_risk')
    .map(([k, v]) => ({ key: k, value: v }));
}

/* ------------------------------------------------------------------ */
/* Timeline player: steps frames at a fixed cadence, then holds last.  */
/* ------------------------------------------------------------------ */
export class TimelinePlayer {
  constructor(frames, onFrame, { msPerTick = 380, loopHold = false } = {}) {
    this.frames = frames;
    this.onFrame = onFrame;
    this.msPerTick = msPerTick;
    this.loopHold = loopHold;
    this.i = 0;
    this.timer = null;
    this.playing = false;
  }
  play() {
    if (this.playing) return;
    this.playing = true;
    this.timer = setInterval(() => this.step(), this.msPerTick);
    this.onFrame(this.frames[this.i], this.i);
  }
  step() {
    if (this.i >= this.frames.length - 1) {
      if (this.loopHold) { this.pause(); return; }
      this.pause(); return;
    }
    this.i += 1;
    this.onFrame(this.frames[this.i], this.i);
  }
  pause() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  restart() {
    this.pause();
    this.i = 0;
    this.play();
  }
  seek(i) {
    this.i = Math.max(0, Math.min(this.frames.length - 1, i));
    this.onFrame(this.frames[this.i], this.i);
  }
  destroy() { this.pause(); }
}
