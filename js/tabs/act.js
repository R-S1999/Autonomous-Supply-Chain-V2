import { renderGraph } from '../graph.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_NODES, NODE_META, pretty } from '../model.js';

const STEP_COPY = {
  expedite_delayed_oil_tanker: [
    ['supplier_oils_fats_regional', 'TMS', 'Locating the delayed oil tanker and confirming driver hours'],
    ['supplier_oils_fats_regional', 'TMS', 'Upgrading the load to team-driver expedited service'],
    ['inventory_sugar_oils_receiving', 'SAP', 'Updating the oil purchase-order arrival date'],
    ['inventory_sugar_oils_receiving', 'WMS', 'Reserving a priority tanker unloading slot'],
    ['processing_fruit_spread_network', 'APS', 'Refreshing oil availability for fruit-spread batches'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Confirming the recovered Longmont production plan'],
    ['retailer_costco', 'OMS', 'Reconfirming Costco order fulfillment'],
    ['retailer_sams_club', 'OMS', "Reconfirming Sam's Club order fulfillment"],
  ],
  source_emergency_oil_supply: [
    ['inventory_sugar_oils_receiving', 'SAP', 'Reading the uncovered oil requirement and tank balance'],
    ['supplier_oils_fats_regional', 'SRM', 'Finding approved regional oil capacity'],
    ['supplier_oils_fats_regional', 'QMS', 'Confirming the alternate lot specification'],
    ['inventory_sugar_oils_receiving', 'SAP', 'Releasing the emergency oil purchase order'],
    ['inventory_sugar_oils_receiving', 'WMS', 'Booking priority receiving and quality release'],
    ['processing_fruit_spread_network', 'APS', 'Refreshing the fruit-spread material plan'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Confirming full Longmont production recovery'],
    ['cold_dc_west', 'WMS', 'Protecting retailer deployment quantities'],
  ],
  prioritize_longmont_oil_allocation: [
    ['inventory_sugar_oils_receiving', 'SAP', 'Reading usable oil inventory and open requirements'],
    ['processing_fruit_spread_network', 'APS', 'Allocating oil to lower-consumption priority recipes'],
    ['plant_longmont_frozen_sandwich', 'MES', 'Resequencing Longmont to protected retailer SKUs'],
    ['frozen_inventory_longmont', 'WMS', 'Reserving finished goods for priority orders'],
    ['cold_dc_west', 'APS', 'Rebalancing the West DC deployment plan'],
    ['retailer_sams_club', 'OMS', "Protecting Sam's Club committed orders"],
    ['retailer_costco', 'OMS', 'Protecting Costco committed orders'],
    ['retailer_other', 'OMS', 'Publishing revised availability to other retailers'],
  ],
};

export function renderAct(view, ctx) {
  const event = EVENTS[0], meta = ALERT_META[event.id], initial = ctx.state.selectedInterventionId || event.recommended_intervention_id;
  view.innerHTML = `<div class="act-workspace"><section class="act-main"><div class="scenario-titlebar act-title"><span class="live-dot"></span><b>ACT · ${meta.title}</b><i>Network state remains visible while the agent executes</i></div><div class="workspace-graph" id="act-graph"></div></section><aside class="agent-rail"><div class="agent-head"><span class="section-kicker">ACT · LIVE WORKFLOW</span><h2>Intervention agent</h2><label>DECIDED INTERVENTION</label><select id="act-iv">${event.candidate_interventions.map(iv => `<option value="${iv.id}" ${iv.id === initial ? 'selected' : ''}>${pretty(iv.id)}</option>`).join('')}</select><p id="act-desc"></p></div><div class="agent-progress"><div class="progress-line"><i id="moving-dot"></i></div><div class="agent-steps" id="bpm-line"></div></div><div class="agent-update" id="bpm-update"><b>READY</b><span>Preparing workflow…</span></div><button class="rail-cta" id="deploy">RUN WORKFLOW ↻</button></aside></div>`;
  const graph = renderGraph(view.querySelector('#act-graph')); graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  const select = view.querySelector('#act-iv'), line = view.querySelector('#bpm-line'), update = view.querySelector('#bpm-update'), btn = view.querySelector('#deploy'), dot = view.querySelector('#moving-dot'); let timers = [];
  function prepare() { timers.forEach(clearTimeout); timers = []; const steps = STEP_COPY[select.value]; view.querySelector('#act-desc').textContent = INTERVENTION_PROPOSALS[select.value]; line.innerHTML = steps.map((s, i) => `<div class="agent-step" data-i="${i}"><i></i><div><b>${s[1]} · ${NODE_META[s[0]]?.name || s[0]}</b><span>${s[2]}</span></div></div>`).join(''); graph.highlightAlert(event, meta.origins, INTERVENTION_NODES[select.value]); dot.style.top = '8px'; update.innerHTML = '<b>AGENT READY</b><span>Connecting to the required enterprise systems.</span>'; btn.disabled = false; }
  function run() { prepare(); btn.disabled = true; btn.textContent = 'WORKFLOW RUNNING'; const steps = STEP_COPY[select.value]; steps.forEach((s, i) => timers.push(setTimeout(() => { const el = line.querySelector(`[data-i="${i}"]`); el.classList.add('active'); if (i) line.querySelector(`[data-i="${i - 1}"]`)?.classList.replace('active', 'done'); dot.style.top = `${i * (100 / Math.max(1, steps.length - 1))}%`; graph.pulseNode(s[0]); graph.setAgentBadge(s[0]); update.innerHTML = `<b>${s[1]} CONNECTED</b><span>${s[2]}</span>`; if (i === steps.length - 1) timers.push(setTimeout(() => { el.classList.replace('active', 'done'); update.innerHTML = '<b>WORKFLOW COMPLETE</b><span>The selected oil-delay intervention is committed and retailer fulfillment monitoring remains active.</span>'; btn.disabled = false; btn.textContent = 'RUN WORKFLOW ↻'; }, 700)); }, i * 850))); }
  select.addEventListener('change', run); btn.addEventListener('click', run); prepare(); timers.push(setTimeout(run, 350));
  return () => { timers.forEach(clearTimeout); graph.destroy(); };
}
