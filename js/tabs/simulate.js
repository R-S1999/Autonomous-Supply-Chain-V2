// SIMULATE — plays the DES for ONE disruption on its comparison horizon
// (tactical → 1 month, long-term → 6 months, same horizons as the BAU cards)
// so "cost of doing nothing" is a clean simulated delta vs BAU.
import { renderGraph } from '../graph.js';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, money, pretty } from '../model.js';
import { runBau, runScenario } from '../engine.js';
import { bauCards, fillCostCard, attachBreakdown } from '../costcards.js';

export function renderSimulate(view, ctx) {
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
            <i>${isTac ? 'ACTIVE · 1-MO RUN' : 'WATCH · 6-MO RUN'}</i>
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

  const { oneMo, sixMo } = bauCards();
  const c1 = view.querySelector('#rc-1mo');
  const c6 = view.querySelector('#rc-6mo');
  fillCostCard(c1, '1-MO BAU', oneMo);
  fillCostCard(c6, '6-MO BAU', sixMo);
  const detach1 = attachBreakdown(c1, '1-MONTH BAU', oneMo);
  const detach6 = attachBreakdown(c6, '6-MONTH BAU', sixMo);

  const canvas = view.querySelector('#sim-canvas');
  const rail = view.querySelector('.sim-rail-left');
  const impact = view.querySelector('#rc-impact');
  const graph = renderGraph(canvas, { onSimulate: (eventId) => loadEvent(eventId) });

  const clock = document.createElement('div');
  clock.className = 'sim-clock';
  canvas.appendChild(clock);

  const bau = runBau();
  let player = null;

  function loadEvent(eventId) {
    const event = EVENTS.find(e => e.id === eventId) || EVENTS[0];
    ctx.state.selectedEventId = event.id;
    const m = ALERT_META[event.id];
    for (const c of rail.querySelectorAll('.rail-chip')) c.classList.toggle('selected', c.dataset.id === event.id);
    graph.setAlerts(Object.fromEntries(m.origins.map(o => [o, [event.id]])));

    if (player) player.destroy();
    const run = runScenario(event.id);
    const frames = run.frames;
    const H = run.horizon;
    const finalInc = run.total - bau.frames[H - 1].cumTotal;
    /* final bucket deltas vs BAU on the same horizon */
    const deltas = Object.entries(run.cum)
      .map(([k, v]) => ({ k, d: v - bau.frames[H - 1].cum[k] }))
      .filter(x => Math.abs(x.d) > 500)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 6);

    clock.innerHTML = `
      <span class="mode">DES · ${m.code} · ${H === 30 ? '1-MO' : '6-MO'} HORIZON</span>
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
        <div class="lbl">SIMULATED INCREMENTAL VS BAU · SAME ${H === 30 ? '1-MONTH' : '6-MONTH'} HORIZON</div>
      </div>
      <div class="impact-lines">
        ${deltas.map(x => `<div class="impact-line"><span class="k">${pretty(x.k)}</span><span class="v">${money(x.d, { plus: true })}</span></div>`).join('')}
        <div class="impact-line" style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px">
          <span class="k" style="font-weight:700">projected total</span>
          <span class="v" style="color:var(--red)">${money(finalInc, { plus: true })}</span></div>
      </div>
      <div class="impact-cta">
        <button class="btn-primary" id="imp-iv">RANK INTERVENTIONS ▸</button>
        <button class="btn-ghost" id="imp-act">AUTOMATE ▸</button>
      </div>`;
    const numEl = impact.querySelector('#imp-num');
    impact.querySelector('#imp-iv').addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id }));
    impact.querySelector('#imp-act').addEventListener('click', () => ctx.gotoTab('act', { eventId: event.id }));

    player = new TimelinePlayer(frames, (f, i) => {
      graph.setFrame(f);
      dayEl.textContent = `${f.label} / ${H}`;
      phaseEl.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION ACTIVE' : 'AFTERMATH';
      phaseEl.className = `phase ${f.phase}`;
      numEl.textContent = money(Math.max(0, f.cumTotal - bau.frames[Math.min(i, bau.frames.length - 1)].cumTotal));
    }, { msPerTick: H === 30 ? 260 : 65 });
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
