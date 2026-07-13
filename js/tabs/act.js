import { renderGraph } from '../graph.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_NODES, NODE_META, pretty } from '../model.js';

const STEP_COPY = {
  expedite_sugar_oils_shipments: [
    ['supplier_sugar_bulk_refiner', 'SAP', 'Connecting to SAP and confirming the delayed sugar purchase order'], ['supplier_oils_fats_regional', 'TMS', 'Checking tanker location and available expedite capacity'], ['inventory_sugar_oils_receiving', 'WMS', 'Booking priority receiving slots for both expedited loads'], ['processing_fruit_spread_network', 'APS', 'Refreshing fruit-spread material availability'], ['plant_longmont_frozen_sandwich', 'MES', 'Protecting Longmont priority production orders'], ['retailer_dc_grocery_mass', 'OMS', 'Updating the retailer delivery promise'], ['grocery_mass_store', 'POS', 'Monitoring store shelf availability until recovery'],
  ],
  source_emergency_regional_supply: [
    ['supplier_sugar_bulk_refiner', 'SAP', 'Reading the uncovered sugar requirement from SAP'], ['supplier_oils_fats_regional', 'SRM', 'Confirming delayed oil volume and specification'], ['inventory_sugar_oils_receiving', 'SRM', 'Checking qualified regional supply and receiving capacity'], ['processing_fruit_spread_network', 'SAP', 'Releasing emergency purchase requirements'], ['plant_longmont_frozen_sandwich', 'APS', 'Recalculating Longmont material availability'], ['cold_dc_west', 'WMS', 'Protecting West DC deployment quantities'], ['retailer_dc_grocery_mass', 'OMS', 'Confirming retailer replenishment recovery'], ['grocery_mass_store', 'POS', 'Verifying store fill rate above the guardrail'],
  ],
  prioritize_longmont_and_adjust_schedule: [
    ['inventory_sugar_oils_receiving', 'SAP', 'Reading available sugar and oil inventory'], ['processing_fruit_spread_network', 'APS', 'Allocating ingredients to priority fruit-spread batches'], ['plant_longmont_frozen_sandwich', 'MES', 'Resequencing Longmont to priority store SKUs'], ['frozen_inventory_longmont', 'WMS', 'Reserving finished goods for protected orders'], ['cold_dc_west', 'APS', 'Updating the West DC deployment plan'], ['retailer_dc_grocery_mass', 'OMS', 'Publishing revised delivery commitments'], ['grocery_mass_store', 'POS', 'Monitoring availability and penalty exposure'],
  ],
};

export function renderAct(view, ctx) {
  const event = EVENTS[0]; const meta = ALERT_META[event.id]; const initial = ctx.state.selectedInterventionId || event.recommended_intervention_id;
  view.innerHTML = `<div class="act-workspace"><section class="act-main"><div class="compact-alert act-alert"><span class="live-dot"></span><div><b>AUTONOMOUS RESPONSE ACTIVE</b><h2>${meta.title}</h2><p>Network simulation remains visible while the agent executes the selected response.</p></div></div><div class="workspace-graph" id="act-graph"></div></section>
    <aside class="agent-rail"><div class="agent-head"><span class="section-kicker">ACT · LIVE WORKFLOW</span><h2>Intervention agent</h2><label>DECIDED INTERVENTION</label><select id="act-iv">${event.candidate_interventions.map(iv => `<option value="${iv.id}" ${iv.id === initial ? 'selected' : ''}>${pretty(iv.id)}</option>`).join('')}</select><p id="act-desc"></p></div><div class="agent-progress"><div class="progress-line"><i id="moving-dot"></i></div><div class="agent-steps" id="bpm-line"></div></div><div class="agent-update" id="bpm-update"><b>READY</b><span>Preparing workflow…</span></div><button class="rail-cta" id="deploy">RUN WORKFLOW ↻</button></aside></div>`;
  const graph = renderGraph(view.querySelector('#act-graph')); graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  const select = view.querySelector('#act-iv'), line = view.querySelector('#bpm-line'), update = view.querySelector('#bpm-update'), btn = view.querySelector('#deploy'), dot = view.querySelector('#moving-dot');
  let timers = [];
  function prepare() {
    timers.forEach(clearTimeout); timers = []; const steps = STEP_COPY[select.value];
    view.querySelector('#act-desc').textContent = INTERVENTION_PROPOSALS[select.value];
    line.innerHTML = steps.map((s, i) => `<div class="agent-step" data-i="${i}"><i></i><div><b>${s[1]} · ${NODE_META[s[0]]?.name || s[0]}</b><span>${s[2]}</span></div></div>`).join('');
    graph.highlightAlert(event, meta.origins, INTERVENTION_NODES[select.value]); dot.style.top = '8px'; update.innerHTML = '<b>AGENT READY</b><span>Connecting to the required enterprise systems.</span>'; btn.disabled = false;
  }
  function run() {
    prepare(); btn.disabled = true; btn.textContent = 'WORKFLOW RUNNING'; const steps = STEP_COPY[select.value];
    steps.forEach((s, i) => timers.push(setTimeout(() => {
      const el = line.querySelector(`[data-i="${i}"]`); el.classList.add('active'); if (i) line.querySelector(`[data-i="${i - 1}"]`)?.classList.replace('active', 'done');
      dot.style.top = `${i * (100 / Math.max(1, steps.length - 1))}%`; graph.pulseNode(s[0]); graph.setAgentBadge(s[0]); update.innerHTML = `<b>${s[1]} CONNECTED</b><span>${s[2]}</span>`;
      if (i === steps.length - 1) timers.push(setTimeout(() => { el.classList.replace('active', 'done'); update.innerHTML = '<b>WORKFLOW COMPLETE</b><span>Longmont supply is protected and store monitoring remains active.</span>'; btn.disabled = false; btn.textContent = 'RUN WORKFLOW ↻'; }, 700));
    }, i * 850)));
  }
  select.addEventListener('change', run); btn.addEventListener('click', run); prepare(); timers.push(setTimeout(run, 350));
  return () => { timers.forEach(clearTimeout); graph.destroy(); };
}
