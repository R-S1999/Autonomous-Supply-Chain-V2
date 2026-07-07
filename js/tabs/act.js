// ACT — autonomous intervention agent. Given a chosen intervention, the agent
// works out WHICH source systems to hit and WHAT technical transactions to
// execute (EDI docs, ERP/TMS/WMS/MES API calls), streaming its execution plan.
// Uses OpenAI via /api/act (user-supplied key); falls back to a deterministic
// local executor built from the same YAML source-system data when no key/API.
import { renderGraph } from '../graph.js';
import { buildScenarioTimeline, TimelinePlayer } from '../sim.js';
import {
  EVENTS, ALERT_META, eventsById, nodesById, NODE_META, money, pretty,
} from '../model.js';
import { DECISION_LAYER } from '../data.generated.js';

const EVENT_TO_PLAYBOOK = {
  TAC_001_late_reefer_to_walmart_sams_dc: 'shipment_delay',
  TAC_002_mccalla_line_downtime_capacity_loss: 'plant_capacity_loss',
  TAC_003_west_cold_dc_capacity_constraint: 'cold_storage_capacity_constraint',
  LT_001_peanut_price_weather_supply_risk: 'peanut_price_increase',
  LT_002_fruit_base_crop_yield_pressure: 'fruit_base_crop_yield_pressure',
  LT_003_packaging_resin_and_paperboard_inflation: 'packaging_inflation_or_shortage',
};

function playbookFor(event, intervention) {
  const pb = DECISION_LAYER.intervention_playbook.find(p => p.event_type === EVENT_TO_PLAYBOOK[event.id]);
  if (!pb) return null;
  return pb.candidate_interventions.find(c => c.action_type === intervention.action_type)
    || pb.candidate_interventions.find(c => c.id !== 'do_nothing');
}

function sourceSystemsFor(event) {
  const systems = new Set();
  for (const sid of event.affected_model_objects?.nodes || []) {
    const node = nodesById[sid];
    for (const k of node?.kpis || []) systems.add(k.source_system);
  }
  for (const s of event.signal_sources || []) systems.add(s.system);
  return [...systems];
}

/* ------------------------------------------------------------------ */
export function renderAct(view, ctx) {
  const layout = document.createElement('div');
  layout.className = 'act-layout';
  layout.innerHTML = `
    <div class="act-graph"><div id="act-graph-host" style="position:absolute;inset:0"></div></div>
    <aside class="act-panel">
      <div class="act-head">
        <h2><span class="live"></span> AUTONOMOUS INTERVENTION AGENT</h2>
        <p>The agent reads the selected intervention's model patches, queries the requisite
        source systems, and executes the technical transactions needed to rectify the disruption.</p>
      </div>
      <div class="act-controls">
        <div>
          <label>ALERT</label>
          <select id="act-event">${EVENTS.map(e =>
            `<option value="${e.id}">${ALERT_META[e.id].code} · ${ALERT_META[e.id].title}</option>`).join('')}</select>
        </div>
        <div>
          <label>INTERVENTION</label>
          <select id="act-iv"></select>
        </div>
        <div class="row2">
          <div class="key-hint">Model <b>gpt-4o-mini</b> via <b>/api/act</b> · key from Vercel env <b>OPENAI_API_KEY</b> · scripted executor if unset</div>
          <button class="act-deploy" id="act-deploy">DEPLOY AGENT ▸</button>
        </div>
      </div>
      <div class="act-console" id="act-console">
        <div class="console-empty">// agent idle — select an alert + intervention and deploy.<br>
        // it will resolve source systems → build transactions → execute → verify.</div>
      </div>
      <div class="act-summary" id="act-summary" style="display:none">
        <div class="t">EXECUTION SUMMARY</div><div class="v" id="act-summary-v"></div>
      </div>
    </aside>`;
  view.appendChild(layout);

  const graphHost = layout.querySelector('#act-graph-host');
  const graph = renderGraph(graphHost);
  const selEvent = layout.querySelector('#act-event');
  const selIv = layout.querySelector('#act-iv');
  const deployBtn = layout.querySelector('#act-deploy');
  const consoleEl = layout.querySelector('#act-console');
  const summaryEl = layout.querySelector('#act-summary');
  const summaryV = layout.querySelector('#act-summary-v');

  let scenarioPlayer = null;
  let running = false;
  let aborter = null;

  function currentEvent() { return eventsById[selEvent.value]; }
  function currentIntervention() {
    return (currentEvent().candidate_interventions || []).find(iv => iv.id === selIv.value);
  }

  function fillInterventions() {
    const e = currentEvent();
    selIv.innerHTML = (e.candidate_interventions || []).map(iv =>
      `<option value="${iv.id}" ${iv.id === e.recommended_intervention_id ? 'selected' : ''}>
        ${pretty(iv.id)} · ${money(iv.incremental_cost_usd)}${iv.id === e.recommended_intervention_id ? ' · RECOMMENDED' : ''}</option>`).join('');
    if (ctx.state.selectedInterventionId &&
        (e.candidate_interventions || []).some(iv => iv.id === ctx.state.selectedInterventionId)) {
      selIv.value = ctx.state.selectedInterventionId;
    }
    showEventOnGraph();
  }

  function showEventOnGraph() {
    const e = currentEvent();
    const m = ALERT_META[e.id];
    graph.highlightAlert(e, m.origins);
    graph.setAlerts(Object.fromEntries(m.origins.map(o => [o, [e.id]])));
    graph.setAgentBadge(m.origins[0]);
    if (scenarioPlayer) scenarioPlayer.destroy();
    const frames = buildScenarioTimeline(e);
    scenarioPlayer = new TimelinePlayer(frames, f => graph.setFrame(f), { msPerTick: 420 });
    scenarioPlayer.play();
  }

  selEvent.addEventListener('change', () => { ctx.state.selectedInterventionId = null; fillInterventions(); });
  selIv.addEventListener('change', showEventOnGraph);
  if (ctx.state.selectedEventId) selEvent.value = ctx.state.selectedEventId;
  fillInterventions();

  /* ---------------- console rendering ---------------- */
  let stepCount = 0;
  let lastStatusEl = null;
  function resetConsole() {
    consoleEl.innerHTML = '';
    summaryEl.style.display = 'none';
    stepCount = 0;
    lastStatusEl = null;
  }
  function addNote(text) {
    const div = document.createElement('div');
    div.className = 'agent-note';
    div.textContent = text;
    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function addStep(step) {
    if (lastStatusEl) { lastStatusEl.textContent = '✓ COMMITTED'; lastStatusEl.classList.add('done'); }
    stepCount += 1;
    const div = document.createElement('div');
    div.className = 'agent-step';
    div.innerHTML = `
      <div class="step-head">
        <span class="n">STEP ${String(stepCount).padStart(2, '0')}</span>
        <span class="sys">${pretty(step.system || 'SYSTEM')}</span>
        <span class="status">EXECUTING…</span>
      </div>
      <div class="action">${step.action || ''}${step.call ? ` — <b>${step.call}</b>` : ''}</div>
      ${step.payload ? `<div class="payload">${typeof step.payload === 'string' ? step.payload : JSON.stringify(step.payload, null, 1)}</div>` : ''}`;
    consoleEl.appendChild(div);
    lastStatusEl = div.querySelector('.status');
    consoleEl.scrollTop = consoleEl.scrollHeight;
    const nodeId = step.node && nodesById[step.node] ? step.node : ALERT_META[currentEvent().id].origins[0];
    graph.pulseNode(nodeId);
    graph.setAgentBadge(nodeId);
  }
  function addSummary(text) {
    if (lastStatusEl) { lastStatusEl.textContent = '✓ COMMITTED'; lastStatusEl.classList.add('done'); }
    summaryV.textContent = text;
    summaryEl.style.display = 'block';
  }

  /* ---------------- LLM path ---------------- */
  function buildMessages(event, intervention) {
    const m = ALERT_META[event.id];
    const pb = playbookFor(event, intervention);
    const systems = sourceSystemsFor(event);
    const nodeNames = (event.affected_model_objects?.nodes || [])
      .map(id => `${id} ("${NODE_META[id]?.name}")`).join(', ');
    return [
      {
        role: 'system',
        content:
`You are the autonomous supply-chain intervention agent for the J.M. Smucker Uncrustables frozen-sandwich network.
You EXECUTE interventions by driving enterprise source systems (ERP, TMS, WMS, MES, APS, SRM, QMS, EDI gateways).
Respond ONLY with NDJSON: one JSON object per line, no markdown, no prose outside JSON.
Emit 6 to 9 execution-step objects, then exactly one final summary object.
Step schema: {"system":"<one of the provided source systems>","action":"<imperative technical action>","call":"<specific transaction/API/EDI doc, e.g. EDI 850 PO, SAP BAPI_PO_CREATE1, TMS POST /load-tenders, WMS wave-release>","payload":{<compact realistic field:value payload>},"node":"<node_id from the affected list>"}
Summary schema: {"summary":"<2-3 sentence wrap-up: what was executed, expected KPI recovery, residual risk>"}
Be concrete and technical: real quantities, lanes, dates, price terms taken from the context. Sequence logically: query/validate first, transact in the middle, then update planning systems and set monitoring.`,
      },
      {
        role: 'user',
        content:
`ALERT ${m.code}: ${m.title}
Business question: ${event.business_question}
Affected nodes: ${nodeNames}
Affected lanes: ${(event.affected_model_objects?.relationships || []).join(', ')}
Scenario assumptions: ${JSON.stringify(event.scenario_assumptions)}
Do-nothing impact: ${JSON.stringify(event.estimated_no_action_impact)}

CHOSEN INTERVENTION: ${intervention.id} (${intervention.action_type}) — cost ${money(intervention.incremental_cost_usd)}
${intervention.expected_effect ? 'Expected effect: ' + intervention.expected_effect : ''}
Decision-layer model patches: ${JSON.stringify(pb?.model_patches || [])}
Cost components triggered: ${JSON.stringify(pb?.cost_components_triggered || [])}

AVAILABLE SOURCE SYSTEMS (query/transact only against these): ${systems.join('; ')}

Execute this intervention now.`,
      },
    ];
  }

  async function runLLM(event, intervention, signal) {
    const res = await fetch('/api/act', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: buildMessages(event, intervention) }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`api/act ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let sse = '', text = '', consumed = 0;
    const pump = (chunk) => {
      sse += chunk;
      const lines = sse.split('\n');
      sse = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) text += delta;
        } catch { /* keepalive */ }
      }
      // consume complete NDJSON lines out of accumulated text
      let nl;
      while ((nl = text.indexOf('\n', consumed)) >= 0) {
        const raw = text.slice(consumed, nl).trim();
        consumed = nl + 1;
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          if (obj.summary) addSummary(obj.summary);
          else addStep(obj);
        } catch { addNote(raw); }
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pump(dec.decode(value, { stream: true }));
    }
    const tail = text.slice(consumed).trim();
    if (tail) {
      try {
        const obj = JSON.parse(tail);
        obj.summary ? addSummary(obj.summary) : addStep(obj);
      } catch { if (tail.length > 3) addNote(tail); }
    }
  }

  /* ---------------- scripted fallback executor ---------------- */
  function mockSteps(event, intervention) {
    const pb = playbookFor(event, intervention);
    const systems = sourceSystemsFor(event);
    const nodes = event.affected_model_objects?.nodes || [];
    const rels = event.affected_model_objects?.relationships || [];
    const assume = event.scenario_assumptions || {};
    const sys = (rx, fallback) => systems.find(s => rx.test(s)) || fallback;
    const steps = [
      {
        system: sys(/ERP|order_management/i, 'ERP_customer_order_management'),
        action: `Query open demand and exposure for ${ALERT_META[event.id].code}: pull affected order lines, quantities and requested delivery dates`,
        call: 'ERP OData GET /OpenDeliverySchedule?filter=affected_lanes',
        payload: { lanes: rels, assumptions: assume },
        node: nodes[0],
      },
      {
        system: sys(/WMS|inventory/i, 'WMS_inventory_snapshot'),
        action: 'Snapshot available-to-promise inventory and capacity at every affected node before committing the intervention',
        call: 'WMS GET /inventory/atp?nodes=' + nodes.join(','),
        payload: { nodes },
        node: nodes[1] || nodes[0],
      },
    ];
    const t = intervention.action_type;
    if (/expedite/.test(t)) {
      steps.push(
        { system: sys(/TMS/i, 'TMS_carrier_tracking'), action: 'Tender expedited team-driver reefer for the delayed load; apply expedite multiplier from the rate card', call: 'TMS POST /load-tenders {service:EXPEDITE_TEAM}', payload: { cases: assume.affected_cases, expedite_multiplier: assume.expedite_reefer_multiplier || 2.15 }, node: nodes[0] },
        { system: 'EDI_gateway', action: 'Issue updated ship notice and appointment rebooking to the retailer DC', call: 'EDI 856 ASN + EDI 214 status update', payload: { new_eta_days: 1.5 }, node: nodes.find(n => /retailer/.test(n)) || nodes[0] });
    } else if (/replacement|split|alternate|reallocation|network/.test(t)) {
      steps.push(
        { system: sys(/APS|planning/i, 'APS_deployment_plan'), action: 'Create replacement deployment orders from the alternate cold DC(s) sized to cover the at-risk cases', call: 'APS POST /deployment-orders', payload: { cover_cases: assume.affected_cases || assume.delayed_cases_at_risk, split: 'central+southeast' }, node: nodes.find(n => /cold_dc/.test(n)) || nodes[0] },
        { system: sys(/WMS/i, 'WMS_wave_management'), action: 'Release pick waves and reserve reefer dock doors for the replacement shipment', call: 'WMS wave-release + dock-scheduler PUT', payload: { priority: 'OTIF_PROTECT' }, node: nodes.find(n => /cold_dc/.test(n)) || nodes[0] },
        { system: 'EDI_gateway', action: 'Send replacement ASN to the retailer and update the delivery appointment', call: 'EDI 856 + retailer portal appointment API', payload: { rdd_met: true }, node: nodes.find(n => /retailer/.test(n)) || nodes[0] });
    } else if (/overtime|capacity_recovery|production/.test(t)) {
      steps.push(
        { system: sys(/MES/i, 'MES_shift_schedule'), action: 'Schedule overtime shifts at the unaffected plants and re-sequence SKUs to minimise changeovers', call: 'MES POST /shift-schedule {overtime_hours:16}', payload: { plants: ['scottsville', 'longmont'], uplift_pct: 12 }, node: nodes.find(n => /plant/.test(n)) || nodes[0] },
        { system: sys(/APS/i, 'APS_production_plan'), action: 'Rebalance the master production schedule and redeploy finished goods to protect Southeast orders', call: 'APS heuristics run + POST /deployment-orders', payload: { protect: 'walmart_sams' }, node: nodes.find(n => /frozen_inventory|cold_dc/.test(n)) || nodes[0] });
    } else if (/overflow|storage|substitution|reroute|pacing|flow_bypass/.test(t)) {
      steps.push(
        { system: sys(/3PL|portal/i, '3PL_cold_storage_portal'), action: 'Book overflow frozen pallet positions / reroute inbound loads per the intervention patch', call: '3PL POST /overflow-booking', payload: { pallets: assume.overflow_pallets_required, days: assume.overflow_days }, node: nodes.find(n => /cold_dc/.test(n)) || nodes[0] },
        { system: sys(/TMS/i, 'TMS_load_tender'), action: 'Re-tender affected inbound loads to the alternate DC lane', call: 'TMS PATCH /loads?lane=alternate', payload: { reroute_to: 'cold_dc_central' }, node: nodes.find(n => /cold_dc/.test(n)) || nodes[0] });
    } else { // forward buy / allocation / commercial / qualification
      steps.push(
        { system: sys(/SRM|supplier/i, 'SRM_supplier_portal'), action: 'Confirm supplier capacity commitment and price validity window before the increase lands', call: 'SRM GET /capacity-commitments', payload: { window_days: event.trigger_window?.expected_start_in_days }, node: nodes[0] },
        { system: sys(/ERP|procurement|purchas/i, 'ERP_purchasing'), action: `Create the forward-buy / reallocation purchase orders (${pretty(intervention.id)})`, call: 'SAP BAPI_PO_CREATE1 → EDI 850 to supplier', payload: { value_usd: intervention.incremental_cost_usd, terms: 'pre-increase contract price' }, node: nodes[0] },
        { system: sys(/WMS/i, 'WMS_inventory'), action: 'Reserve storage capacity and create inbound appointments for the additional volume', call: 'WMS POST /appointments (bulk)', payload: { additional_cover_weeks: 8 }, node: nodes.find(n => /inventory/.test(n)) || nodes[0] });
    }
    steps.push(
      { system: sys(/APS|planning/i, 'APS_deployment_plan'), action: 'Write the intervention back into the planning model: patched lead times, capacities and allocations', call: 'APS PATCH /scenario/commit', payload: (pb?.model_patches || []).slice(0, 3), node: nodes[0] },
      { system: 'simulation_runtime', action: 'Re-run the DES on the patched graph to verify recovery vs the do-nothing baseline', call: 'sim.run(scenario=intervention, horizon=event_window)', payload: { expected_avoided_cost_usd: (event.estimated_no_action_impact?.total_incremental_cost_usd || 0) - (intervention.incremental_cost_usd || 0) }, node: nodes[0] },
      { system: sys(/telemetry|tracking|monitor|EDI/i, 'TMS_carrier_tracking'), action: 'Arm monitoring: subscribe to the alert signal events and set KPI guardrails to auto-close or escalate', call: 'events.subscribe(' + (event.signal_sources?.[0]?.events || []).join(',') + ')', payload: { guardrail: 'OTIF ≥ 95%' }, node: nodes[nodes.length - 1] });
    const recovery = intervention.projected_OTIF_recovery_pct ?? intervention.projected_service_recovery_pct;
    const summary = `Executed ${pretty(intervention.id)} for ${money(intervention.incremental_cost_usd)} vs ${money(event.estimated_no_action_impact?.total_incremental_cost_usd)} do-nothing exposure` +
      (recovery ? `; projected service recovery ${recovery}%.` : '.') +
      ` Residual risk: ${pretty(intervention.risk ?? intervention.residual_risk ?? 'low')}. Monitoring armed on ${pretty(event.signal_sources?.[0]?.system || 'source systems')}.`;
    return { steps, summary };
  }

  async function runMock(event, intervention, signal) {
    addNote('// no OpenAI key or API unreachable — running scripted executor against the same source-system model');
    const { steps, summary } = mockSteps(event, intervention);
    for (const s of steps) {
      if (signal.aborted) return;
      await new Promise(r => setTimeout(r, 850));
      addStep(s);
    }
    await new Promise(r => setTimeout(r, 700));
    if (!signal.aborted) addSummary(summary);
  }

  /* ---------------- deploy ---------------- */
  async function deploy() {
    if (running) { aborter?.abort(); return; }
    const event = currentEvent();
    const intervention = currentIntervention();
    if (!intervention) return;
    running = true;
    aborter = new AbortController();
    deployBtn.textContent = 'STOP AGENT ■';
    deployBtn.classList.add('stop');
    resetConsole();
    addNote(`// deploying agent → ${ALERT_META[event.id].code} · ${pretty(intervention.id)} · budget ${money(intervention.incremental_cost_usd)}`);
    try {
      await runLLM(event, intervention, aborter.signal);
    } catch (err) {
      if (!aborter.signal.aborted) {
        addNote(`// LLM path unavailable (${err.message}) — falling back to scripted executor`);
        try { await runMock(event, intervention, aborter.signal); } catch { /* aborted */ }
      }
    } finally {
      running = false;
      deployBtn.textContent = 'DEPLOY AGENT ▸';
      deployBtn.classList.remove('stop');
    }
  }
  deployBtn.addEventListener('click', deploy);
  if (ctx.state.autoDeploy) { ctx.state.autoDeploy = false; setTimeout(deploy, 400); }

  return () => {
    aborter?.abort();
    if (scenarioPlayer) scenarioPlayer.destroy();
    graph.destroy();
  };
}
