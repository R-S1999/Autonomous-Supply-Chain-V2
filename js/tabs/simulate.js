import { renderGraph } from '../graph.js';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, money, pretty } from '../model.js';
import { runBau, runScenario } from '../engine.js';

export function renderSimulate(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  ctx.state.selectedEventId = event.id;
  view.innerHTML = `<div class="focus-sim">
    <div class="focus-alert"><span class="alert-dot"></span><div><b>${meta.code}</b><h2>${meta.title}</h2><p>${meta.sensed}</p></div></div>
    <div class="focus-graph" id="sim-canvas"></div>
    <div class="sim-clock focus-clock"><span class="mode">30-DAY DISCRETE-EVENT RUN</span><span class="day" id="sc-day">DAY 1 / 30</span><span class="phase pre" id="sc-phase">PRE-EVENT</span><button id="sc-restart">REPLAY</button></div>
    <section class="result-panel" id="results">
      <div class="impact-total"><div class="lbl">COST OF DOING NOTHING</div><div class="num" id="impact">—</div><p>Incremental cost versus the same 30-day BAU horizon, including retailer OTIF penalties and store-level lost margin.</p></div>
      <div class="solutions hidden" id="solutions"><div class="section-kicker">SIMULATED SOLUTIONS</div><h2>Three ways to protect store availability</h2><div class="solution-grid">
        ${(event.candidate_interventions || []).map((iv, i) => `<article class="solution-card"><span>0${i + 1}</span><h3>${pretty(iv.id)}</h3><p>${INTERVENTION_PROPOSALS[iv.id]}</p></article>`).join('')}
      </div><button class="btn-primary" id="to-decide">COMPARE ROI IN DECIDE ▸</button></div>
    </section>
  </div>`;
  const graph = renderGraph(view.querySelector('#sim-canvas'));
  graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  graph.highlightAlert(event, meta.origins);
  const bau = runBau();
  const run = runScenario(event.id);
  const impact = run.total - bau.frames[29].cumTotal;
  const day = view.querySelector('#sc-day');
  const phase = view.querySelector('#sc-phase');
  const solutions = view.querySelector('#solutions');
  let player;
  const play = () => {
    solutions.classList.add('hidden');
    view.querySelector('#impact').textContent = 'Computing…';
    player = new TimelinePlayer(run.frames, (f, i) => {
      graph.setFrame(f); day.textContent = `${f.label} / 30`;
      phase.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION PROPAGATING' : 'RECOVERY';
      phase.className = `phase ${f.phase}`;
      if (i === run.frames.length - 1) {
        view.querySelector('#impact').textContent = money(impact, { plus: true });
        solutions.classList.remove('hidden');
        solutions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, { msPerTick: 150 });
    player.play();
  };
  view.querySelector('#sc-restart').addEventListener('click', () => { player.destroy(); play(); });
  view.querySelector('#to-decide').addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id }));
  play();
  return () => { player?.destroy(); graph.destroy(); };
}
