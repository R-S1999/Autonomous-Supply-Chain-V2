// SIMULATE — models ONE disruption at a time. Left rail: all alerts, stacked,
// never overlapping the mesh. Right rail: 1-month + 6-month BAU cost cards
// (hover = full component breakdown) with the cost-of-doing-nothing beneath.
import { renderGraph } from '../graph.js';
import { buildScenarioTimeline, TimelinePlayer, impactBreakdown } from '../sim.js';
import { EVENTS, ALERT_META, money, pretty, DAYS_PER_MONTH } from '../model.js';
import { fillCostCard, attachBreakdown } from '../costcards.js';

export function renderSimulate(view, ctx) {
  ctx.setHeaderCards(false); // the two BAU cards live inside this screen instead

  view.innerHTML = `
    <div class="sim-layout">
      <aside class="sim-rail sim-rail-left">
        <div class="rail-title">DISRUPTIONS · PICK ONE TO MODEL</div>
        ${EVENTS.map(e => {
          const m = ALERT_META[e.id];
          const isTac = e.event_horizon === 'tactical';
          return `<button class="rail-chip" data-id="${e.id}">
            <b class="${isTac ? 'tac' : 'lt'}">${m.code}</b>
            <span>${m.title}</span>
            <i>${isTac ? 'ACTIVE' : 'WATCH'} · ~${e.trigger_window?.expected_start_in_days}d out</i>
          </button>`;
        }).join('')}
      </aside>
      <div class="sim-canvas" id="sim-canvas"></div>
      <aside class="sim-rail sim-rail-right">
        <div class="cost-card rail-card" id="rc-1mo"></div>
        <div class="cost-card rail-card" id="rc-6mo"></div>
        <div class="impact-card in-rail" id="rc-impact"></div>
      </aside>
    </div>`;

  const ONE_MO_WEEKS = DAYS_PER_MONTH / 7;
  const c1 = view.querySelector('#rc-1mo');
  const c6 = view.querySelector('#rc-6mo');
  fillCostCard(c1, '1-MO BAU', ONE_MO_WEEKS);
  fillCostCard(c6, '6-MO BAU', ONE_MO_WEEKS * 6);
  const detach1 = attachBreakdown(c1, '1-MONTH BAU', ONE_MO_WEEKS);
  const detach6 = attachBreakdown(c6, '6-MONTH BAU', ONE_MO_WEEKS * 6);

  const canvas = view.querySelector('#sim-canvas');
  const rail = view.querySelector('.sim-rail-left');
  const impact = view.querySelector('#rc-impact');
  const graph = renderGraph(canvas, {
    onSimulate: (eventId) => loadEvent(eventId),
  });

  const clock = document.createElement('div');
  clock.className = 'sim-clock';
  canvas.appendChild(clock);

  let player = null;

  function loadEvent(eventId) {
    const event = EVENTS.find(e => e.id === eventId) || EVENTS[0];
    ctx.state.selectedEventId = event.id;
    const m = ALERT_META[event.id];
    for (const c of rail.querySelectorAll('.rail-chip')) c.classList.toggle('selected', c.dataset.id === event.id);

    /* only the disruption being modeled shows on the mesh */
    graph.setAlerts({ [m.origins[0]]: [event.id], ...(m.origins[1] ? { [m.origins[1]]: [event.id] } : {}) });

    if (player) player.destroy();
    const frames = buildScenarioTimeline(event);

    clock.innerHTML = `
      <span class="mode">DES · ${m.code}</span>
      <span class="day" id="sc-day">—</span>
      <span class="phase pre" id="sc-phase">PRE-EVENT</span>
      <button id="sc-restart" title="Replay">⟲</button>`;
    const dayEl = clock.querySelector('#sc-day');
    const phaseEl = clock.querySelector('#sc-phase');

    impact.innerHTML = `
      <div class="impact-head">
        <span class="t">COST OF DOING NOTHING</span>
        <span class="risk">${pretty(event.estimated_no_action_impact?.service_risk || '')} RISK</span>
      </div>
      <div class="impact-total">
        <div class="num" id="imp-num">$0</div>
        <div class="lbl">INCREMENTAL VS BAU · ${event.trigger_window?.expected_duration_days}D EVENT WINDOW</div>
      </div>
      <div class="impact-lines">
        ${impactBreakdown(event).map(l => `<div class="impact-line"><span class="k">${pretty(l.key)}</span><span class="v">${money(l.value)}</span></div>`).join('')}
      </div>
      <div class="impact-q">${event.business_question}</div>
      <div class="impact-cta">
        <button class="btn-primary" id="imp-iv">RANK INTERVENTIONS ▸</button>
        <button class="btn-ghost" id="imp-act">AUTOMATE ▸</button>
      </div>`;
    const numEl = impact.querySelector('#imp-num');
    impact.querySelector('#imp-iv').addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id }));
    impact.querySelector('#imp-act').addEventListener('click', () => ctx.gotoTab('act', { eventId: event.id }));

    player = new TimelinePlayer(frames, (f) => {
      graph.setFrame(f);
      dayEl.textContent = `${f.label} / ${f.totalTicks}`;
      phaseEl.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION ACTIVE' : 'AFTERMATH';
      phaseEl.className = `phase ${f.phase}`;
      numEl.textContent = money(f.cumIncrementalCost);
    }, { msPerTick: event.event_horizon === 'tactical' ? 240 : 130 });
    clock.querySelector('#sc-restart').addEventListener('click', () => player.restart());
    player.play();
  }

  rail.addEventListener('click', (e) => {
    const chip = e.target.closest('.rail-chip');
    if (chip) loadEvent(chip.dataset.id);
  });

  loadEvent(ctx.state.selectedEventId || 'TAC_001_late_reefer_to_walmart_sams_dc');

  return () => { if (player) player.destroy(); detach1(); detach6(); graph.destroy(); };
}
