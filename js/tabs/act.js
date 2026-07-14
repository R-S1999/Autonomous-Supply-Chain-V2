import { renderGraph } from '../graph.js?v=agentnaming';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_AGENT_STEPS, INTERVENTION_NODES, NODE_META, money, pretty } from '../model.js?v=decidesteps';
import { runBau, runScenario } from '../engine.js?v=costledger';

// Enterprise-system and node routing is deterministic. The AI agent generates the
// concise user-facing action message for every routed step, which keeps the
// workflow safe, relevant to the selected intervention and visually stable.
function economics(event, interventionId) {
  const bau = runBau().frames[29], noAction = runScenario(event.id), selected = runScenario(event.id, interventionId);
  return { noAction: noAction.total - bau.cumTotal, net: selected.total - bau.cumTotal, avoided: noAction.total - selected.total };
}

function promptFor(event, intervention, blueprint) {
  const econ = economics(event, intervention.id);
  return [
    { role: 'system', content: `You write live enterprise-system status messages for the J.M. Smucker Uncrustables supply-chain intervention agent. Return exactly ${blueprint.length} NDJSON objects, one per line, with schema {"index":1,"message":"..."}. No markdown, headings, arrays, or extra text. Preserve the supplied order. Each message must be 7-16 words, present progressive, concrete, non-repetitive, and describe what the specified enterprise system is doing at that node. Do not invent another system, node, intervention, quantity, or outcome.` },
    { role: 'user', content: `ALERT: ${ALERT_META[event.id].title}
SELECTED INTERVENTION: ${pretty(intervention.id)}
INTERVENTION PURPOSE: ${INTERVENTION_PROPOSALS[intervention.id]}
SIMULATED ECONOMICS: do nothing ${money(econ.noAction)}; selected response ${money(econ.net)}; avoided cost ${money(econ.avoided)}.
ROUTED STEPS:
${blueprint.map((s, i) => `${i + 1}. system=${s[1]}; node=${NODE_META[s[0]]?.name || s[0]}; intent=${s[2]}`).join('\n')}
Generate the ${blueprint.length} status-message objects now.` },
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
  return blueprint.map((step, i) => {
    const generated = objects.find(o => Number(o.index) === i + 1) || objects[i];
    const message = String(generated?.message || '').trim();
    if (message.length < 12 || message.length > 180) throw new Error(`invalid generated message ${i + 1}`);
    return [step[0], step[1], message];
  });
}

async function generateMessages(event, intervention, blueprint, signal) {
  const response = await fetch('/api/act', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ messages: promptFor(event, intervention, blueprint) }),
  });
  if (!response.ok || !response.body) throw new Error(`OpenAI endpoint ${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', generatedText = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n'); pending = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim(); if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim(); if (!data || data === '[DONE]') continue;
      try { generatedText += JSON.parse(data).choices?.[0]?.delta?.content || ''; } catch { /* SSE keepalive */ }
    }
  }
  return parseGeneratedMessages(generatedText, blueprint);
}

export function renderAct(view, ctx) {
  const event = EVENTS[0], meta = ALERT_META[event.id], initial = ctx.state.selectedInterventionId || event.recommended_intervention_id;
  view.innerHTML = `<div class="act-workspace"><section class="act-main"><div class="scenario-titlebar act-title"><span class="live-dot"></span><b>ACT · ${meta.title}</b><i>Network state remains visible while the agent executes</i></div><div class="workspace-graph" id="act-graph"></div></section><aside class="agent-rail"><div class="agent-head"><span class="section-kicker">ACT · LIVE WORKFLOW</span><h2>AI Agent</h2><label>DECIDED INTERVENTION</label><select id="act-iv">${event.candidate_interventions.map(iv => `<option value="${iv.id}" ${iv.id === initial ? 'selected' : ''}>${pretty(iv.id)}</option>`).join('')}</select><p id="act-desc"></p><div class="agent-source" id="agent-source">AI AGENT · PREPARING WORKFLOW</div></div><div class="agent-progress"><div class="progress-line"><i id="moving-dot"></i></div><div class="agent-steps" id="bpm-line"></div></div><div class="agent-update" id="bpm-update"><b>GENERATING WORKFLOW</b><span>Building intervention-specific enterprise messages…</span></div><button class="rail-cta" id="deploy" disabled>PREPARING WORKFLOW</button></aside></div>`;
  const graph = renderGraph(view.querySelector('#act-graph')); graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  const select = view.querySelector('#act-iv'), line = view.querySelector('#bpm-line'), update = view.querySelector('#bpm-update'), btn = view.querySelector('#deploy'), dot = view.querySelector('#moving-dot'), source = view.querySelector('#agent-source');
  let timers = [], aborter = null, generation = 0;
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const currentIntervention = () => event.candidate_interventions.find(iv => iv.id === select.value);

  function renderSteps(steps) {
    line.innerHTML = steps.map((s, i) => `<div class="agent-step" data-i="${i}"><i></i><div><b>${s[1]} · ${NODE_META[s[0]]?.name || s[0]}</b><span>WAITING FOR AGENT</span></div></div>`).join('');
    graph.highlightAlert(event, meta.origins, INTERVENTION_NODES[select.value]); dot.style.top = '8px';
  }
  function animate(steps, generatedByAgent) {
    btn.disabled = true; btn.textContent = 'AGENT EXECUTING'; graph.clearAgentAction();
    steps.forEach((s, i) => timers.push(setTimeout(() => {
      const el = line.querySelector(`[data-i="${i}"]`), status = el.querySelector('span');
      el.classList.add('active'); status.textContent = 'PROCESSING ENTERPRISE ACTION';
      if (i) line.querySelector(`[data-i="${i - 1}"]`)?.classList.replace('active', 'done');
      dot.style.top = `${i * (100 / Math.max(1, steps.length - 1))}%`;
      graph.setAgentBadge(s[0]); graph.pulseNode(s[0]); graph.showAgentAction(s[0], s[1], '', 'processing');
      update.innerHTML = `<b>AGENT RUNNING · ${s[1]}</b><span>Processing the action at ${NODE_META[s[0]]?.name || s[0]}…</span>`;

      timers.push(setTimeout(() => {
        const actionSource = generatedByAgent ? 'AI AGENT' : 'FALLBACK';
        status.textContent = `${actionSource} ACTION EXECUTED`;
        graph.showAgentAction(s[0], s[1], s[2], 'revealed', actionSource);
        update.innerHTML = `<b>${s[1]} ACTION EXECUTED</b><span>The generated update is now displayed beside ${NODE_META[s[0]]?.name || s[0]}.</span>`;
      }, 540));

      if (i === steps.length - 1) timers.push(setTimeout(() => {
        el.classList.replace('active', 'done'); update.innerHTML = '<b>WORKFLOW COMPLETE</b><span>The selected intervention is committed and retailer fulfillment monitoring remains active.</span>'; btn.disabled = false; btn.textContent = 'REGENERATE & RUN ↻';
      }, 1250));
    }, i * 1400)));
  }
  async function generateAndRun() {
    const token = ++generation; aborter?.abort(); aborter = new AbortController(); clearTimers(); graph.clearAgentAction();
    const intervention = currentIntervention(), blueprint = INTERVENTION_AGENT_STEPS[intervention.id];
    view.querySelector('#act-desc').textContent = INTERVENTION_PROPOSALS[intervention.id];
    source.textContent = 'AI AGENT · GENERATING ENTERPRISE MESSAGES'; source.className = 'agent-source generating';
    update.innerHTML = '<b>GENERATING WORKFLOW</b><span>Creating enterprise-system messages for the selected intervention…</span>';
    btn.disabled = true; btn.textContent = 'PREPARING WORKFLOW'; renderSteps(blueprint);
    let steps = blueprint, generatedByAgent = false;
    try {
      steps = await generateMessages(event, intervention, blueprint, aborter.signal);
      if (token !== generation) return;
      generatedByAgent = true;
      source.textContent = 'AI AGENT · GENERATED WORKFLOW'; source.className = 'agent-source generated';
    } catch (error) {
      if (aborter.signal.aborted || token !== generation) return;
      source.textContent = 'SCRIPTED FALLBACK · AI AGENT UNAVAILABLE'; source.className = 'agent-source fallback';
    }
    renderSteps(steps); update.innerHTML = '<b>WORKFLOW READY</b><span>Enterprise connections validated. Beginning execution.</span>'; animate(steps, generatedByAgent);
  }
  select.addEventListener('change', generateAndRun); btn.addEventListener('click', generateAndRun); timers.push(setTimeout(generateAndRun, 350));
  return () => { generation += 1; aborter?.abort(); clearTimers(); graph.destroy(); };
}
