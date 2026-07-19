import { renderGraph } from '../graph.js?v=experience16';
import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES,
  INTERVENTION_AGENT_STEPS, NODE_META, money,
} from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary } from '../scenario.js?v=experience11';

const STEP_INTERVAL_MS = 5200;
const PROCESSING_MS = 1500;
const FINAL_STEP_HOLD_MS = 4700;

function transientVisual(interventionId, index, completed) {
  if (interventionId === 'source_emergency_oil_supply') {
    if (index === 0) return completed
      ? {
        kind: 'supplier', phase: 'selected', label: 'Emergency Oil Supplier 14',
        detail: 'Qualified lot selected for tomorrow', toNodeId: 'inventory_sugar_oils_receiving',
      }
      : {
        kind: 'supplier', phase: 'searching', label: 'Qualified oil supplier search',
        detail: 'Comparing lots and delivery times', toNodeId: 'inventory_sugar_oils_receiving',
      };
    if (index === 1) return completed
      ? {
        kind: 'supplier', phase: 'routed', label: 'Emergency Oil Supplier 14',
        detail: 'SAP vendor and emergency route committed', toNodeId: 'inventory_sugar_oils_receiving',
      }
      : {
        kind: 'supplier', phase: 'onboarding', label: 'Emergency Oil Supplier 14',
        detail: 'Creating SAP vendor and purchase order', toNodeId: 'inventory_sugar_oils_receiving',
      };
  }
  if (interventionId === 'expedite_delayed_oil_tanker') {
    if (index === 0) return completed
      ? {
        kind: 'carrier', phase: 'selected', label: 'Team-driver Tanker 27',
        detail: 'Fastest qualified service selected', fromNodeId: 'supplier_oils_fats_regional',
        toNodeId: 'inventory_sugar_oils_receiving',
      }
      : {
        kind: 'carrier', phase: 'searching', label: 'Team-driver service search',
        detail: 'Comparing capacity and recovery time', fromNodeId: 'supplier_oils_fats_regional',
        toNodeId: 'inventory_sugar_oils_receiving',
      };
    if (index === 1) return completed
      ? {
        kind: 'carrier', phase: 'routed', label: 'Team-driver Tanker 27',
        detail: 'Alternate tanker route committed', fromNodeId: 'supplier_oils_fats_regional',
        toNodeId: 'inventory_sugar_oils_receiving',
      }
      : {
        kind: 'carrier', phase: 'onboarding', label: 'Team-driver Tanker 27',
        detail: 'Writing carrier and ETA into SAP', fromNodeId: 'supplier_oils_fats_regional',
        toNodeId: 'inventory_sugar_oils_receiving',
      };
  }
  return null;
}

function economics(event, interventionId) {
  const bau = runBau().frames[29];
  const noAction = runScenario(event.id);
  const selected = runScenario(event.id, interventionId);
  return {
    noAction: noAction.total - bau.cumTotal,
    net: selected.total - bau.cumTotal,
    avoided: noAction.total - selected.total,
  };
}

function promptFor(event, intervention, blueprint) {
  const econ = economics(event, intervention.id);
  return [
    {
      role: 'system',
      content: `You write live enterprise-system status messages for the J.M. Smucker Uncrustables supply-chain intervention agent. Return exactly ${blueprint.length} NDJSON objects, one per line, with schema {"index":1,"message":"..."}. No markdown, headings, arrays, or extra text. Preserve the supplied order. Each message must be 7-16 words, present progressive, concrete, non-repetitive, and describe how the specified enterprise system is scheduling or committing the action at that node. Do not invent another system, node, intervention, quantity, or outcome.`,
    },
    {
      role: 'user',
      content: `ALERT: ${ALERT_META[event.id].title}
SCHEDULED INTERVENTION: ${INTERVENTION_TITLES[intervention.id]}
INTERVENTION PURPOSE: ${INTERVENTION_PROPOSALS[intervention.id]}
SIMULATED ECONOMICS: do nothing ${money(econ.noAction)}; selected response ${money(econ.net)}; avoided cost ${money(econ.avoided)}.
ROUTED STEPS:
${blueprint.map((step, index) => `${index + 1}. system=${step[1]}; node=${NODE_META[step[0]]?.name || step[0]}; intent=${step[2]}`).join('\n')}
Generate the ${blueprint.length} status-message objects now.`,
    },
  ];
}

function parseGeneratedMessages(text, blueprint) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let objects;
  try {
    const parsed = JSON.parse(cleaned);
    objects = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    objects = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
  }
  if (objects.length !== blueprint.length) throw new Error(`expected ${blueprint.length} generated messages`);
  return blueprint.map((step, index) => {
    const generated = objects.find(object => Number(object.index) === index + 1) || objects[index];
    const message = String(generated?.message || '').trim();
    if (message.length < 12 || message.length > 180) throw new Error(`invalid generated message ${index + 1}`);
    return [step[0], step[1], message];
  });
}

async function generateMessages(event, intervention, blueprint, signal) {
  const response = await fetch('/api/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({ messages: promptFor(event, intervention, blueprint) }),
  });
  if (!response.ok || !response.body) throw new Error(`AI Agent endpoint ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let generatedText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try { generatedText += JSON.parse(data).choices?.[0]?.delta?.content || ''; } catch { /* streaming keepalive */ }
    }
  }
  return parseGeneratedMessages(generatedText, blueprint);
}

export function renderAct(view, ctx) {
  const event = EVENTS[0];
  const initial = ctx.state.selectedInterventionId || event.recommended_intervention_id;
  view.innerHTML = `<div class="act-workspace">
    <section class="act-main">
      <div class="scenario-titlebar act-title"><span class="live-dot"></span><b>ACT · SCHEDULED RECOVERY</b><i>Red nodes recover to green as the AI Agent completes each action</i></div>
      <div class="workspace-graph" id="act-graph"></div>
    </section>
    <aside class="agent-rail">
      <div class="agent-head">
        <span class="section-kicker">ACT · TIME TO ACT</span>
        <h2>AI Agent scheduler</h2>
        <label>SCHEDULED INTERVENTION</label>
        <select id="act-iv">${event.candidate_interventions.map(intervention => `<option value="${intervention.id}" ${intervention.id === initial ? 'selected' : ''}>${INTERVENTION_TITLES[intervention.id]}</option>`).join('')}</select>
        <p id="act-desc"></p>
        <div class="agent-source" id="agent-source">INTERVENTION SCHEDULED · PREPARING AGENT</div>
      </div>
      <div class="agent-progress"><div class="progress-line"><i id="moving-dot"></i></div><div class="agent-steps" id="bpm-line"></div></div>
      <div class="agent-update" id="bpm-update"><b>PREPARING SCHEDULE</b><span>Building intervention-specific enterprise actions…</span></div>
      <button class="rail-cta" id="deploy" disabled>PREPARING AGENT</button>
    </aside>
  </div>`;

  const graph = renderGraph(view.querySelector('#act-graph'));
  const disrupted = disruptionSummary(runBau(), runScenario(event.id), event);
  const select = view.querySelector('#act-iv');
  const line = view.querySelector('#bpm-line');
  const update = view.querySelector('#bpm-update');
  const button = view.querySelector('#deploy');
  const dot = view.querySelector('#moving-dot');
  const source = view.querySelector('#agent-source');
  let timers = [];
  let aborter = null;
  let generation = 0;

  const resetDisruptedNetwork = () => {
    graph.setFrame(disrupted.frame);
    graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');
    graph.clearTransientIntervention();
  };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const currentIntervention = () => event.candidate_interventions.find(intervention => intervention.id === select.value);

  function renderSteps(steps) {
    line.innerHTML = steps.map((step, index) => `<div class="agent-step" data-i="${index}"><i></i><div><b>${step[1]} · ${NODE_META[step[0]]?.name || step[0]}</b><span>WAITING TO BE SCHEDULED</span></div></div>`).join('');
    line.style.setProperty('--agent-step-count', steps.length);
    dot.style.top = '8px';
  }

  function animate(intervention, steps, generatedByAgent) {
    button.disabled = true;
    button.dataset.mode = 'run';
    button.textContent = 'AI AGENT ACTING';
    graph.clearAgentAction();
    steps.forEach((step, index) => timers.push(setTimeout(() => {
      const element = line.querySelector(`[data-i="${index}"]`);
      const status = element.querySelector('span');
      element.classList.add('active');
      status.textContent = 'SCHEDULING ENTERPRISE ACTION';
      if (index) line.querySelector(`[data-i="${index - 1}"]`)?.classList.replace('active', 'done');
      dot.style.top = `${index * (100 / Math.max(1, steps.length - 1))}%`;
      graph.setAgentBadge(step[0]);
      graph.pulseNode(step[0]);
      const processingVisual = transientVisual(intervention.id, index, false);
      if (processingVisual) {
        graph.clearAgentAction();
        graph.showTransientIntervention(processingVisual);
      } else {
        graph.clearTransientIntervention();
        graph.showAgentAction(step[0], step[1], '', 'processing');
      }
      update.innerHTML = `<b>AI AGENT SCHEDULING · ${step[1]}</b><span>Connecting to ${step[1]} at ${NODE_META[step[0]]?.name || step[0]}…</span>`;

      timers.push(setTimeout(() => {
        const actionSource = generatedByAgent ? 'AI AGENT' : 'FALLBACK';
        status.textContent = `${actionSource} ACTION SCHEDULED`;
        graph.setNodeHealth(step[0], 'good');
        const completedVisual = transientVisual(intervention.id, index, true);
        if (completedVisual) {
          graph.clearAgentAction();
          graph.showTransientIntervention(completedVisual);
        } else {
          graph.showAgentAction(step[0], step[1], step[2], 'revealed', actionSource);
        }
        update.innerHTML = `<b>${step[1]} ACTION SCHEDULED</b><span>${NODE_META[step[0]]?.name || step[0]} is recovering. The generated action remains visible before the next step.</span>`;
      }, PROCESSING_MS));

      if (index === steps.length - 1) timers.push(setTimeout(() => {
        element.classList.replace('active', 'done');
        for (const nodeId of event.affected_model_objects?.nodes || []) graph.setNodeHealth(nodeId, 'good');
        for (const edgeId of event.affected_model_objects?.relationships || []) graph.setEdgeState(edgeId, 'flow');
        graph.clearEdgeAlert();
        graph.clearTransientIntervention();
        update.innerHTML = '<b>INTERVENTION SCHEDULED</b><span>All enterprise actions are committed. The disrupted supply chain has recovered to green.</span>';
        button.disabled = false;
        button.dataset.mode = 'summary';
        button.textContent = 'VIEW SUMMARY';
      }, FINAL_STEP_HOLD_MS));
    }, index * STEP_INTERVAL_MS)));
  }

  async function generateAndRun() {
    const token = ++generation;
    aborter?.abort();
    aborter = new AbortController();
    clearTimers();
    graph.clearAgentAction();
    resetDisruptedNetwork();
    const intervention = currentIntervention();
    ctx.selectIntervention(intervention.id);
    const blueprint = INTERVENTION_AGENT_STEPS[intervention.id];
    view.querySelector('#act-desc').textContent = INTERVENTION_PROPOSALS[intervention.id];
    source.textContent = 'INTERVENTION SCHEDULED · AI AGENT PREPARING';
    source.className = 'agent-source generating';
    update.innerHTML = '<b>PREPARING SCHEDULE</b><span>Creating enterprise-system actions for the selected intervention…</span>';
    button.disabled = true;
    button.dataset.mode = 'run';
    button.textContent = 'PREPARING AGENT';
    renderSteps(blueprint);
    let steps = blueprint;
    let generatedByAgent = false;
    try {
      steps = await generateMessages(event, intervention, blueprint, aborter.signal);
      if (token !== generation) return;
      generatedByAgent = true;
      source.textContent = 'INTERVENTION SCHEDULED · AI AGENT READY';
      source.className = 'agent-source generated';
    } catch {
      if (aborter.signal.aborted || token !== generation) return;
      source.textContent = 'INTERVENTION SCHEDULED · FALLBACK READY';
      source.className = 'agent-source fallback';
    }
    renderSteps(steps);
    update.innerHTML = '<b>TIME TO ACT</b><span>Enterprise connections validated. Beginning the scheduled intervention.</span>';
    animate(intervention, steps, generatedByAgent);
  }

  select.addEventListener('change', generateAndRun);
  button.addEventListener('click', () => {
    if (button.dataset.mode === 'summary') {
      ctx.gotoTab('summary', {
        eventId: event.id,
        interventionId: currentIntervention().id,
      });
      return;
    }
    generateAndRun();
  });
  resetDisruptedNetwork();
  timers.push(setTimeout(generateAndRun, 350));
  return () => {
    generation += 1;
    aborter?.abort();
    clearTimers();
    graph.destroy();
  };
}
