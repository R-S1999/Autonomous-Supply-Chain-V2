import { renderGraph } from '../graph.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_NODES, NODE_META, pretty } from '../model.js';

const STEP_COPY = {
  expedite_sugar_oils_shipments: [
    ['supplier_sugar_bulk_refiner', 'Connecting to SAP and confirming the delayed sugar purchase order'],
    ['supplier_oils_fats_regional', 'Checking tanker location and carrier capacity'],
    ['inventory_sugar_oils_receiving', 'Booking priority receiving slots for both expedited loads'],
    ['processing_fruit_spread_network', 'Refreshing the fruit-spread material availability plan'],
    ['plant_longmont_frozen_sandwich', 'Protecting Longmont priority production orders'],
    ['retailer_dc_grocery_mass', 'Updating the retailer delivery promise'],
    ['grocery_mass_store', 'Monitoring store shelf availability until recovery'],
  ],
  source_emergency_regional_supply: [
    ['supplier_sugar_bulk_refiner', 'Reading the supply exception and uncovered requirement from SAP'],
    ['supplier_oils_fats_regional', 'Confirming the delayed oil volume and quality specification'],
    ['inventory_sugar_oils_receiving', 'Checking qualified regional supply and available receiving capacity'],
    ['processing_fruit_spread_network', 'Releasing emergency sugar and oil requirements to the approved source'],
    ['plant_longmont_frozen_sandwich', 'Recalculating Longmont material availability and production promise'],
    ['cold_dc_west', 'Protecting West DC deployment quantities'],
    ['retailer_dc_grocery_mass', 'Confirming retailer replenishment recovery'],
    ['grocery_mass_store', 'Verifying store fill rate has returned above the guardrail'],
  ],
  prioritize_longmont_and_adjust_schedule: [
    ['inventory_sugar_oils_receiving', 'Reading available sugar and oil inventory from SAP'],
    ['processing_fruit_spread_network', 'Allocating available ingredients to priority fruit-spread batches'],
    ['plant_longmont_frozen_sandwich', 'Resequencing Longmont to the highest-priority store SKUs'],
    ['frozen_inventory_longmont', 'Reserving finished goods for protected orders'],
    ['cold_dc_west', 'Updating the West DC deployment plan'],
    ['retailer_dc_grocery_mass', 'Publishing revised retailer delivery commitments'],
    ['grocery_mass_store', 'Monitoring store availability and penalty exposure'],
  ],
};

export function renderAct(view, ctx) {
  const event = EVENTS[0]; const meta = ALERT_META[event.id];
  const initial = ctx.state.selectedInterventionId || event.recommended_intervention_id;
  view.innerHTML = `<div class="bpm-act"><div class="bpm-head"><span class="section-kicker">ACT</span><h1>Execute the response</h1><p>Follow the intervention across the Longmont supply chain. Updates are shown in business language at the node where work occurs.</p><div class="bpm-controls"><select id="act-iv">${event.candidate_interventions.map(iv => `<option value="${iv.id}" ${iv.id === initial ? 'selected' : ''}>${pretty(iv.id)}</option>`).join('')}</select><button class="btn-primary" id="deploy">START WORKFLOW ▸</button></div></div><div class="bpm-graph" id="act-graph"></div><section class="bpm-panel"><div class="bpm-line" id="bpm-line"></div><div class="bpm-update" id="bpm-update"><b>READY</b><span>Select a response and start the workflow.</span></div></section></div>`;
  const graph = renderGraph(view.querySelector('#act-graph'));
  graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  const select = view.querySelector('#act-iv'); const line = view.querySelector('#bpm-line');
  const update = view.querySelector('#bpm-update'); const btn = view.querySelector('#deploy');
  let timers = [];
  function prepare() {
    timers.forEach(clearTimeout); timers = [];
    const steps = STEP_COPY[select.value];
    line.innerHTML = steps.map((s, i) => `<div class="bpm-step" data-i="${i}"><i>${i + 1}</i><span>${NODE_META[s[0]]?.name || s[0]}</span></div>`).join('');
    graph.highlightAlert(event, meta.origins, INTERVENTION_NODES[select.value]);
    update.innerHTML = `<b>READY</b><span>${INTERVENTION_PROPOSALS[select.value]}</span>`;
    btn.disabled = false; btn.textContent = 'START WORKFLOW ▸';
  }
  function run() {
    prepare(); btn.disabled = true; btn.textContent = 'WORKFLOW RUNNING';
    const steps = STEP_COPY[select.value];
    steps.forEach((s, i) => timers.push(setTimeout(() => {
      const el = line.querySelector(`[data-i="${i}"]`); el.classList.add('active');
      if (i) line.querySelector(`[data-i="${i - 1}"]`)?.classList.replace('active', 'done');
      graph.pulseNode(s[0]); graph.setAgentBadge(s[0]);
      update.innerHTML = `<b>${String(i + 1).padStart(2, '0')} · ${NODE_META[s[0]]?.name || s[0]}</b><span>${s[1]}</span>`;
      if (i === steps.length - 1) timers.push(setTimeout(() => { el.classList.replace('active', 'done'); update.innerHTML = '<b>WORKFLOW COMPLETE</b><span>Longmont supply is protected and store availability monitoring is active.</span>'; btn.disabled = false; btn.textContent = 'RUN AGAIN ↻'; }, 900));
    }, i * 1100)));
  }
  select.addEventListener('change', run); btn.onclick = run; prepare();
  timers.push(setTimeout(run, 400));
  return () => { timers.forEach(clearTimeout); graph.destroy(); };
}
