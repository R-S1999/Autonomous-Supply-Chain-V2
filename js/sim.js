// Discrete-event simulation engine (daily/weekly tick) for BAU and alert-overlay scenarios.
// Produces a timeline of frames the graph renderer animates through.
import { bauWeeklyCost, eventNodeSeverity, eventEdgeIds, healthFromSeverity } from './model.js';

const BAU = bauWeeklyCost();
export const BAU_WEEKLY_TOTAL = BAU.total;
export const BAU_COMPONENTS = BAU.components;

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

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
    for (const [id, sev] of Object.entries(sevByNode)) {
      const s = sev * p;
      nodeSeverity[id] = s;
      nodeHealth[id] = healthFromSeverity(s);
    }
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
