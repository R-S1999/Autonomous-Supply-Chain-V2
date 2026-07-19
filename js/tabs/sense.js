import { renderGraph } from '../graph.js?v=experience5';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, money } from '../model.js?v=experience5';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary } from '../scenario.js?v=experience5';

export function renderSense(view) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const bau = runBau();
  const disruption = runScenario(event.id);
  const summary = disruptionSummary(bau, disruption, event);

  view.innerHTML = `
    <div class="sense-workspace alert-open">
      <section class="sense-main">
        <div class="workspace-graph" id="sense-canvas"></div>
      </section>
      <aside class="sense-alert-rail">
        <div class="sense-alert-head"><span>ACTIVE ALERT</span><b>01</b></div>
        <div class="rail-run-status sense-run-status">
          <div class="rail-run-head"><span>AS-IS SENSE RUN</span></div>
          <div class="rail-run-line">
            <b id="sense-day">READY</b>
            <i class="phase pre" id="sense-phase">AWAITING SENSE</i>
          </div>
        </div>
        <article class="sense-alert-card">
          <div class="sense-alert-code"><span class="alert-dot"></span>${meta.code}</div>
          <h1>${meta.title}</h1>
          <div class="sense-cause"><span>CAUSE</span><b>${meta.sensed}</b></div>
          <button class="sense-simulate" id="sense-simulate">SENSE AS-IS COST</button>
        </article>
        <div class="sense-impact hidden" id="sense-impact">
          <span>30-DAY AS-IS DISRUPTION COST</span>
          <strong>${money(summary.total, { plus: true })}</strong>
          <p>Computed from downtime, transport, inventory, retailer penalties and lost sales across the affected nodes.</p>
        </div>
        <div class="sense-rail-note" id="sense-note">The delayed lane is highlighted. Select Sense to calculate the as-is disruption cost.</div>
      </aside>
    </div>`;

  const graph = renderGraph(view.querySelector('#sense-canvas'), {
    changedMetricsOnly: true,
    compareNote: 'ONLY THE KPI CHANGED BY THIS DISRUPTION',
  });
  graph.setFrame(null);
  graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');

  const button = view.querySelector('#sense-simulate');
  const impact = view.querySelector('#sense-impact');
  const note = view.querySelector('#sense-note');
  const day = view.querySelector('#sense-day');
  const phase = view.querySelector('#sense-phase');
  let player = null;

  const play = () => {
    player?.destroy();
    graph.setCompare(null);
    graph.setNodeCosts(null);
    graph.clearNodeCostCards();
    graph.setFrame(null);
    graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');
    impact.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'SENSING AS-IS COST';
    day.textContent = 'DAY 1 / 30';
    phase.textContent = 'BEFORE DELAY';
    phase.className = 'phase pre';
    note.textContent = 'Calculating the as-is cost through raw material, production, finished goods and retailer fulfillment.';

    player = new TimelinePlayer(disruption.frames, (frame, index) => {
      graph.setFrame(frame);
      day.textContent = `DAY ${index + 1} / 30`;
      phase.textContent = frame.phase === 'pre' ? 'BEFORE DELAY'
        : frame.phase === 'active' ? 'DISRUPTION SPREADING' : 'DOWNSTREAM IMPACT';
      phase.className = `phase ${frame.phase}`;
      if (index === disruption.frames.length - 1) {
        graph.setFrame(summary.frame);
        graph.setCompare(summary.compare);
        graph.setNodeCosts(summary.nodeCosts);
        graph.showNodeCostCards(summary.nodeCosts);
        impact.classList.remove('hidden');
        button.disabled = false;
        button.textContent = 'SENSE AGAIN';
        day.textContent = 'DAY 30 / 30';
        phase.textContent = 'IMPACT CONFIRMED';
        phase.className = 'phase active';
        note.textContent = 'All red nodes are affected. Hover or click a node to see only its changed KPI and computed cost.';
      }
    }, { msPerTick: 220 });
    player.play();
  };

  button.addEventListener('click', play);
  return () => { player?.destroy(); graph.destroy(); };
}
