import { renderGraph } from '../graph.js';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, money, pretty } from '../model.js';
import { runBau, runScenario } from '../engine.js';

export function renderSimulate(view, ctx) {
  const event = EVENTS[0]; const meta = ALERT_META[event.id];
  const bau = runBau(); const base = bau.frames[29]; const run = runScenario(event.id);
  const interventions = event.candidate_interventions.map(iv => {
    const result = runScenario(event.id, iv.id);
    const dnLoss = run.cum.lost_margin_cost - base.cum.lost_margin_cost;
    const ivLoss = result.cum.lost_margin_cost - base.cum.lost_margin_cost;
    return { iv, avoided: run.total - result.total, recovery: Math.max(0, 1 - ivLoss / dnLoss), worst: result.worstRetailer };
  });
  ctx.state.selectedEventId = event.id;
  view.innerHTML = `<div class="sim-workspace">
    <section class="sim-main">
      <div class="scenario-titlebar"><span class="alert-dot"></span><b>SIMULATE · ${meta.title}</b><i>Actual daily inventory, production and retailer fulfillment</i></div>
      <div class="workspace-graph" id="sim-canvas"></div>
      <div class="workspace-clock"><span class="mode">30-DAY DISCRETE-EVENT RUN</span><span class="day" id="sc-day">DAY 1 / 30</span><span class="phase pre" id="sc-phase">PRE-EVENT</span><button id="sc-restart">REPLAY</button></div>
    </section>
    <aside class="economics-rail">
      <div class="rail-kicker">LIVE SCENARIO ECONOMICS</div>
      <div class="live-cost"><span>COST OF DOING NOTHING</span><strong id="impact">$0</strong><i>vs 30-day BAU</i><div class="cost-meter"><b id="cost-meter"></b></div><p>Simulated downtime, retailer OTIF penalties and lost margin.</p><div class="lowest-fill"><span>LOWEST RETAILER FULFILLMENT</span><b id="lowest-fill">—</b></div></div>
      <div class="rail-section-head"><span>SIMULATED INTERVENTIONS</span><b>3 OPTIONS</b></div>
      <div class="rail-solutions">
        ${interventions.map((x, i) => `<article class="rail-solution" data-solution><div class="solution-index">0${i + 1}</div><div class="solution-body"><h3>${pretty(x.iv.id)}</h3><p>${INTERVENTION_PROPOSALS[x.iv.id]}</p><div class="solution-result"><span class="sim-status">WAITING FOR RUN</span><b>worst fill ${Math.round(x.worst.fill)}%</b></div></div></article>`).join('')}
      </div>
      <button class="rail-cta" id="to-decide" disabled>COMPARE ROI IN DECIDE ▸</button>
    </aside>
  </div>`;
  const graph = renderGraph(view.querySelector('#sim-canvas'));
  graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]])));
  graph.highlightAlert(event, meta.origins);
  const finalImpact = run.total - base.cumTotal;
  const impactEl = view.querySelector('#impact'); const meter = view.querySelector('#cost-meter'); const lowest = view.querySelector('#lowest-fill');
  const day = view.querySelector('#sc-day'); const phase = view.querySelector('#sc-phase');
  const cta = view.querySelector('#to-decide'); let player;
  const play = () => {
    let worstSoFar = { name: '—', fill: 101, day: 0 };
    cta.disabled = true;
    view.querySelectorAll('[data-solution]').forEach(el => { el.classList.remove('ready'); el.querySelector('.sim-status').textContent = 'WAITING FOR RUN'; });
    player = new TimelinePlayer(run.frames, (f, i) => {
      graph.setFrame(f); day.textContent = `${f.label} / 30`;
      phase.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION PROPAGATING' : 'RECOVERY'; phase.className = `phase ${f.phase}`;
      const current = Math.max(0, f.cumTotal - bau.frames[i].cumTotal);
      impactEl.textContent = money(current, { plus: true }); meter.style.width = `${Math.min(100, current / finalImpact * 100)}%`;
      if (f.lowestRetailer.fill < worstSoFar.fill) worstSoFar = { ...f.lowestRetailer, day: i + 1 };
      lowest.textContent = `${worstSoFar.name} · ${worstSoFar.fill.toFixed(1)}% · DAY ${worstSoFar.day}`;
      if (i === run.frames.length - 1) {
        view.querySelectorAll('[data-solution]').forEach((el, n) => { el.classList.add('ready'); el.querySelector('.sim-status').textContent = `${money(interventions[n].avoided)} avoided`; });
        cta.disabled = false;
      }
    }, { msPerTick: 150 }); player.play();
  };
  view.querySelector('#sc-restart').addEventListener('click', () => { player.destroy(); play(); });
  cta.addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id })); play();
  return () => { player?.destroy(); graph.destroy(); };
}
