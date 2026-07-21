import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES,
  INTERVENTION_AGENT_STEPS, INTERVENTION_NODES, NODE_META, money,
} from '../model.js?v=experience23';
import { runBau, runScenario } from '../engine.js?v=costledger';

function agentPlan(interventionId) {
  const steps = INTERVENTION_AGENT_STEPS[interventionId] || [];
  return `<div class="decision-agent-plan"><span>AI AGENT SCHEDULING PLAN · ${steps.length} STEPS</span><ul>${steps.map(step =>
    `<li><b>${step[1]} · ${NODE_META[step[0]]?.name || step[0]}</b><em>${step[2]}</em></li>`).join('')}</ul></div>`;
}

export function renderIntervene(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const bau = runBau().frames[29];
  const doNothing = runScenario(event.id);
  const doNothingCost = doNothing.total - bau.cumTotal;
  const doNothingLoss = doNothing.cum.lost_margin_cost - bau.cum.lost_margin_cost;
  const rows = event.candidate_interventions.map(intervention => {
    const run = runScenario(event.id, intervention.id);
    const net = run.total - bau.cumTotal;
    const avoided = doNothingCost - net;
    const loss = run.cum.lost_margin_cost - bau.cum.lost_margin_cost;
    return {
      intervention,
      net,
      avoided,
      roi: avoided / intervention.incremental_cost_usd,
      recovery: Math.max(0, 1 - loss / doNothingLoss),
    };
  }).sort((a, b) => b.roi - a.roi);

  view.innerHTML = `<div class="decide-viewport">
    <header class="decide-summary">
      <div>
        <span class="section-kicker">DECIDE · 30-DAY HORIZON</span>
        <h1>Choose the response to carry forward</h1>
        <p>${meta.title} · Select one option, then simulate it or enact it through the AI Agent.</p>
      </div>
      <div class="decide-dn"><span>DO NOTHING</span><b>${money(doNothingCost, { plus: true })}</b><i>incremental exposure</i></div>
    </header>
    <section class="decision-grid compact-decisions">
      ${rows.map((row, index) => {
        const id = row.intervention.id;
        const selected = ctx.state.selectedInterventionId === id;
        return `<article class="decision-card ${index === 0 ? 'best' : ''} ${selected ? 'selected' : ''}" data-decision-card="${id}">
          <div class="card-top"><div class="rank">0${index + 1}</div>${index === 0 ? '<div class="best-badge">BEST ROI</div>' : ''}</div>
          <h2>${INTERVENTION_TITLES[id]}</h2>
          <p>${INTERVENTION_PROPOSALS[id]}</p>
          <div class="decision-metrics">
            <div><span>Execution cost</span><b>${money(row.intervention.incremental_cost_usd)}</b></div>
            <div><span>Avoided cost</span><b>${money(row.avoided)}</b></div>
            <div><span>Net impact</span><b>${money(row.net, { plus: true })}</b></div>
            <div><span>ROI</span><b>${row.roi.toFixed(1)}×</b></div>
          </div>
          ${agentPlan(id)}
          <div class="recovery-row"><span>RETAILER SERVICE RECOVERY</span><b>${Math.round(row.recovery * 100)}%</b><i><em style="width:${Math.round(row.recovery * 100)}%"></em></i></div>
          <div class="acts-on">SCHEDULES · ${(INTERVENTION_NODES[id] || []).map(nodeId => NODE_META[nodeId]?.name).join(' → ')}</div>
          <button class="iv-act-btn" data-select-intervention="${id}">${selected ? 'SELECTED' : 'SELECT INTERVENTION'}</button>
        </article>`;
      }).join('')}
    </section>
    <footer class="decide-action-bar">
      <div><span>SELECTED INTERVENTION</span><b id="decide-selection">No intervention selected</b></div>
      <button id="simulate-selected" disabled>SIMULATE SELECTED</button>
      <button id="act-selected" disabled>ENACT IN ACT</button>
    </footer>
  </div>`;

  const selectionLabel = view.querySelector('#decide-selection');
  const simulateButton = view.querySelector('#simulate-selected');
  const actButton = view.querySelector('#act-selected');

  const selectIntervention = interventionId => {
    ctx.selectIntervention(interventionId);
    view.querySelectorAll('[data-decision-card]').forEach(card => {
      const selected = card.dataset.decisionCard === interventionId;
      card.classList.toggle('selected', selected);
      card.querySelector('[data-select-intervention]').textContent = selected ? 'SELECTED' : 'SELECT INTERVENTION';
    });
    selectionLabel.textContent = INTERVENTION_TITLES[interventionId];
    simulateButton.disabled = false;
    actButton.disabled = false;
  };

  view.addEventListener('click', eventClick => {
    const selectButton = eventClick.target.closest('[data-select-intervention]');
    if (selectButton) selectIntervention(selectButton.dataset.selectIntervention);
  });
  simulateButton.addEventListener('click', () => {
    if (!ctx.state.selectedInterventionId) return;
    ctx.gotoTab('simulate', {
      eventId: event.id,
      interventionId: ctx.state.selectedInterventionId,
      autoRun: true,
    });
  });
  actButton.addEventListener('click', () => {
    if (!ctx.state.selectedInterventionId) return;
    ctx.gotoTab('act', {
      eventId: event.id,
      interventionId: ctx.state.selectedInterventionId,
    });
  });

  if (ctx.state.selectedInterventionId && INTERVENTION_TITLES[ctx.state.selectedInterventionId]) {
    selectIntervention(ctx.state.selectedInterventionId);
  }
}
