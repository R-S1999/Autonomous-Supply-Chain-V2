import { renderGraph } from '../graph.js?v=cardlayout';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, money, pretty, kNum } from '../model.js?v=costledger';
import { runBau, runScenario } from '../engine.js?v=autocostcards';

function postRunSummary(bau, run, event) {
  const affected = event.affected_model_objects?.nodes || [];
  const severity = { good: 0, amber: 1, red: 2 };
  const compare = {}, valueOverrides = {}, nodeSummaryLabels = {}, nodeHealth = {};
  for (const id of affected) {
    const metrics = new Set(run.frames.flatMap(f => Object.keys(f.valueOverrides?.[id] || {})));
    for (const metric of metrics) {
      let low = { value: Infinity, day: 0 };
      for (const f of run.frames) {
        const value = f.valueOverrides?.[id]?.[metric];
        if (Number.isFinite(value) && value < low.value) low = { value, day: f.t + 1 };
      }
      if (!Number.isFinite(low.value)) continue;
      const normal = bau.frames[0].valueOverrides?.[id]?.[metric] ?? low.value;
      const unit = metric.includes('days_of_cover') ? 'days' : metric.includes('fill_rate_pct') ? 'percent' : 'number';
      (compare[id] ||= {})[metric] = {
        bau: normal, worst: low.value, day: low.day, unit,
        pct: normal ? Math.round((low.value - normal) / Math.abs(normal) * 100) : 0,
      };
      (valueOverrides[id] ||= {})[metric] = low.value;
      if (unit === 'days') nodeSummaryLabels[id] = `${low.value}d low`;
      else if (unit === 'percent') nodeSummaryLabels[id] = `${low.value}% low`;
      else if (metric.includes('sandwiches')) nodeSummaryLabels[id] = `${kNum(low.value)} sw/wk low`;
      else if (metric.includes('output_lb')) nodeSummaryLabels[id] = `${kNum(low.value)} lb/wk low`;
    }
    nodeHealth[id] = run.frames.reduce((worst, f) => severity[f.nodeHealth?.[id] || 'good'] > severity[worst] ? f.nodeHealth[id] : worst, 'good');
  }
  nodeSummaryLabels.supplier_oils_fats_regional = '5d tanker delay';
  const edgeStates = {};
  for (const f of run.frames) for (const [id, state] of Object.entries(f.edgeStates || {})) {
    if (state === 'disrupted' || !edgeStates[id]) edgeStates[id] = state;
  }
  const bau30 = bau.frames[29], total = run.total - bau30.cumTotal;
  const nodeCosts = Object.fromEntries(affected.map(id => {
    const scenarioComponents = run.nodeCostComponents?.[id] || {};
    const bauComponents = bau30.nodeCostComponents?.[id] || {};
    const buckets = new Set([...Object.keys(scenarioComponents), ...Object.keys(bauComponents)]);
    const components = [...buckets].map(key => ({
      key, value: (scenarioComponents[key] || 0) - (bauComponents[key] || 0),
    })).filter(x => Math.abs(x.value) >= .5).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return [id, { cost: (run.nodeCosts?.[id] || 0) - (bau30.nodeCosts?.[id] || 0), total, components }];
  }));
  return { compare, nodeCosts, frame: { nodeHealth, edgeStates, valueOverrides, nodeSummaryLabels } };
}

export function renderSimulate(view, ctx) {
  const event = EVENTS[0], meta = ALERT_META[event.id];
  const bau = runBau(), base = bau.frames[29], run = runScenario(event.id);
  const postRun = postRunSummary(bau, run, event);
  const interventions = event.candidate_interventions.map(iv => {
    const result = runScenario(event.id, iv.id);
    return { iv, avoided: run.total - result.total, worst: result.worstRetailer };
  });
  ctx.state.selectedEventId = event.id;
  view.innerHTML = `<div class="sim-workspace"><section class="sim-main">
    <div class="scenario-titlebar"><span class="alert-dot"></span><b>SIMULATE · ${meta.title}</b><i>Actual daily inventory, production and retailer fulfillment</i></div>
    <div class="workspace-graph" id="sim-canvas"></div>
    <div class="workspace-clock"><span class="mode">30-DAY DISCRETE-EVENT RUN</span><span class="day" id="sc-day">DAY 1 / 30</span><span class="phase pre" id="sc-phase">PRE-EVENT</span><button id="sc-restart">REPLAY</button></div>
  </section><aside class="economics-rail">
    <div class="rail-kicker">LIVE SCENARIO ECONOMICS</div>
    <div class="live-cost compact-cost"><span>COST OF DOING NOTHING</span><strong id="impact">$0</strong><i>vs 30-day BAU</i><div class="cost-meter"><b id="cost-meter"></b></div><p>Simulated downtime, retailer OTIF penalties and lost margin.</p><div class="lowest-fill"><span>LOWEST RETAILER FULFILLMENT</span><b id="lowest-fill">—</b></div></div>
    <div class="solution-placeholder" id="solution-placeholder"><div class="waiting-pulse"><i></i><i></i><i></i></div><b>SIMULATION IN PROGRESS</b><span>Alternative responses will appear after the 30-day run completes.</span></div>
    <div class="solution-panel hidden" id="solution-panel"><div class="rail-section-head"><span>SIMULATED INTERVENTIONS</span><b>3 OPTIONS</b></div><div class="rail-solutions">
      ${interventions.map((x, i) => `<article class="rail-solution" data-solution><div class="solution-index">0${i + 1}</div><div class="solution-body"><h3>${pretty(x.iv.id)}</h3><p>${INTERVENTION_PROPOSALS[x.iv.id]}</p><div class="solution-result"><span class="sim-status">SIMULATED</span><b>worst fill ${Math.round(x.worst.fill)}%</b></div></div></article>`).join('')}
    </div><button class="rail-cta" id="to-decide">COMPARE ROI IN DECIDE ▸</button></div>
  </aside></div>`;

  const graph = renderGraph(view.querySelector('#sim-canvas'));
  graph.setAlerts(Object.fromEntries(meta.origins.map(id => [id, [event.id]]))); graph.highlightAlert(event, meta.origins);
  const finalImpact = run.total - base.cumTotal;
  const impactEl = view.querySelector('#impact'), meter = view.querySelector('#cost-meter'), lowest = view.querySelector('#lowest-fill');
  const day = view.querySelector('#sc-day'), phase = view.querySelector('#sc-phase'), cta = view.querySelector('#to-decide');
  const solutionPanel = view.querySelector('#solution-panel'), placeholder = view.querySelector('#solution-placeholder'); let player;
  const play = () => {
    let worstSoFar = { name: '—', fill: 101, day: 0 };
    graph.setCompare(null); graph.setNodeCosts(null); graph.clearNodeCostCards();
    solutionPanel.classList.add('hidden'); solutionPanel.classList.remove('reveal'); placeholder.classList.remove('hidden');
    view.querySelectorAll('[data-solution]').forEach(el => el.classList.remove('ready'));
    player = new TimelinePlayer(run.frames, (f, i) => {
      graph.setFrame(f); day.textContent = `${f.label} / 30`;
      phase.textContent = f.phase === 'pre' ? 'PRE-EVENT' : f.phase === 'active' ? 'DISRUPTION PROPAGATING' : 'RECOVERY'; phase.className = `phase ${f.phase}`;
      const current = Math.max(0, f.cumTotal - bau.frames[i].cumTotal);
      impactEl.textContent = money(current, { plus: true }); meter.style.width = `${Math.min(100, current / finalImpact * 100)}%`;
      if (f.lowestRetailer.fill < worstSoFar.fill) worstSoFar = { ...f.lowestRetailer, day: i + 1 };
      lowest.textContent = `${worstSoFar.name} · ${worstSoFar.fill.toFixed(1)}% · DAY ${worstSoFar.day}`;
      if (i === run.frames.length - 1) {
        graph.setFrame(postRun.frame); graph.setCompare(postRun.compare); graph.setNodeCosts(postRun.nodeCosts); graph.showNodeCostCards(postRun.nodeCosts);
        phase.textContent = 'POST-RUN COSTS · NODE COMPONENTS DISPLAYED'; phase.className = 'phase aftermath';
        view.querySelectorAll('[data-solution]').forEach((el, n) => { el.classList.add('ready'); el.querySelector('.sim-status').textContent = `${money(interventions[n].avoided)} avoided`; });
        placeholder.classList.add('hidden'); solutionPanel.classList.remove('hidden'); solutionPanel.classList.add('reveal');
      }
    }, { msPerTick: 150 }); player.play();
  };
  view.querySelector('#sc-restart').addEventListener('click', () => { player.destroy(); play(); });
  cta.addEventListener('click', () => ctx.gotoTab('intervene', { eventId: event.id })); play();
  return () => { player?.destroy(); graph.destroy(); };
}
