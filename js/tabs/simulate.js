// SIMULATE — applies an alert overlay to a copy of the BAU graph and plays the
// disruption DES: node health degrades, lanes slow, and the do-nothing cost accrues.
import { renderGraph } from '../graph.js';
import { buildScenarioTimeline, TimelinePlayer, BAU_WEEKLY_TOTAL } from '../sim.js';
import { impactBreakdown } from '../sim.js';
import { EVENTS, ALERT_META, money, pretty } from '../model.js';

export function renderSimulate(view, ctx) {
  const graphHost = document.createElement('div');
  view.appendChild(graphHost);
  const graph = renderGraph(graphHost);

  /* scenario chips */
  const bar = document.createElement('div');
  bar.className = 'scenario-bar';
  bar.innerHTML = EVENTS.map(e => {
    const m = ALERT_META[e.id];
    const isTac = e.event_horizon === 'tactical';
    return `<button class="scenario-chip" data-id="${e.id}" title="${m.title}">
      <b class="${isTac ? 'tac' : 'lt'}">${m.code}</b> ${m.title}</button>`;
  }).join('');
  view.appendChild(bar);

  /* clock + impact card */
  const clock = document.createElement('div');
  clock.className = 'sim-clock';
  view.appendChild(clock);

  const impact = document.createElement('div');
  impact.className = 'impact-card';
  view.appendChild(impact);

  let player = null;
  let currentEvent = null;

  function riskClass(risk) { return String(risk || '').includes('high') ? 'risk' : 'risk'; }

  function loadEvent(eventId) {
    const event = EVENTS.find(e => e.id === eventId) || EVENTS[0];
    currentEvent = event;
    const m = ALERT_META[event.id];
    for (const c of bar.querySelectorAll('.scenario-chip')) c.classList.toggle('selected', c.dataset.id === event.id);

    if (player) player.destroy();
    const frames = buildScenarioTimeline(event);
    const horizonDays = frames.length * (frames[0].grain === 'day' ? 1 : 7);
    const impTotal = event.estimated_no_action_impact?.total_incremental_cost_usd ?? 0;
    const bauHorizon = (BAU_WEEKLY_TOTAL / 7) * horizonDays;

    clock.innerHTML = `
      <span class="mode">DES · OVERLAY</span>
      <span class="day" id="sc-day">—</span>
      <span class="phase pre" id="sc-phase">PRE-EVENT</span>
      <button id="sc-restart" title="Replay">⟲</button>`;
    const dayEl = clock.querySelector('#sc-day');
    const phaseEl = clock.querySelector('#sc-phase');

    impact.innerHTML = `
      <div class="impact-head">
        <span class="t">COST OF DOING NOTHING · ${m.code}</span>
        <span class="${riskClass(event.estimated_no_action_impact?.service_risk)}">${pretty(event.estimated_no_action_impact?.service_risk || '')} RISK</span>
      </div>
      <div class="impact-total">
        <div class="num" id="imp-num">$0</div>
        <div class="lbl">INCREMENTAL VS BAU · ACCRUING OVER ${event.trigger_window?.expected_duration_days}D EVENT WINDOW</div>
      </div>
      <div class="impact-lines">
        ${impactBreakdown(event).map(l => `<div class="impact-line"><span class="k">${pretty(l.key)}</span><span class="v">${money(l.value)}</span></div>`).join('')}
        <div class="impact-line"><span class="k" style="font-weight:700">business question</span></div>
        <div class="impact-line"><span class="k" style="opacity:.85;line-height:1.5">${event.business_question}</span></div>
      </div>
      <div class="impact-cta">
        <button class="btn-primary" id="imp-iv">RANK INTERVENTIONS ▸</button>
        <button class="btn-ghost" id="imp-act">AUTOMATE IN ACT ▸</button>
      </div>`;
    const numEl = impact.querySelector('#imp-num');
    impact.querySelector('#imp-iv').addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id }));
    impact.querySelector('#imp-act').addEventListener('click', () => ctx.gotoTab('act', { eventId: event.id }));

    graph.highlightAlert(null);
    player = new TimelinePlayer(frames, (f) => {
      graph.setFrame(f);
      dayEl.textContent = `${f.label} / ${f.totalTicks}`;
      phaseEl.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION ACTIVE' : 'AFTERMATH';
      phaseEl.className = `phase ${f.phase}`;
      numEl.textContent = money(f.cumIncrementalCost);
      ctx.setCost({
        title: `COST TO FULFILL · ${m.code} · DO NOTHING`,
        value: `${money(bauHorizon * (f.t / Math.max(1, frames.length - 1)) + f.cumIncrementalCost)}`,
        unit: `/${horizonDays}d`,
        sub: `BAU ${money(BAU_WEEKLY_TOTAL)}/wk <span class="neg">+ ${money(impTotal)} disruption</span>`,
      });
    }, { msPerTick: event.event_horizon === 'tactical' ? 520 : 300 });
    clock.querySelector('#sc-restart').addEventListener('click', () => player.restart());
    player.play();
  }

  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.scenario-chip');
    if (chip) { ctx.state.selectedEventId = chip.dataset.id; loadEvent(chip.dataset.id); }
  });

  loadEvent(ctx.state.selectedEventId || 'TAC_001_late_reefer_to_walmart_sams_dc');

  return () => { if (player) player.destroy(); graph.destroy(); };
}
