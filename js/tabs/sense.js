import { renderGraph } from '../graph.js?v=experience11';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, money } from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary } from '../scenario.js?v=experience11';

export function renderSense(view) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const bau = runBau();
  const disruption = runScenario(event.id);
  const summary = disruptionSummary(bau, disruption, event);

  view.innerHTML = `
    <div class="sense-workspace">
      <section class="sense-main">
        <div class="workspace-graph" id="sense-canvas"></div>
      </section>
      <aside class="sense-alert-rail">
        <div class="sense-alert-head"><span id="sense-rail-title">SENSE NETWORK</span><b id="sense-alert-count">READY</b></div>
        <div class="sense-discovery" id="sense-discovery">
          <div class="sense-radar"><i></i><i></i><span></span></div>
          <span class="section-kicker">SUPPLY SIGNAL MONITOR</span>
          <h1>Sense for disruptions</h1>
          <p>Scan supplier, purchase-order and transport signals for risks that need executive attention.</p>
          <button class="sense-simulate" id="sense-scan">SENSE NETWORK</button>
        </div>
        <div class="sense-alert-content hidden" id="sense-alert-content">
          <div class="rail-run-status sense-run-status">
            <div class="rail-run-head"><span>AS-IS SENSE RUN</span></div>
            <div class="rail-run-line">
              <b id="sense-day">DISRUPTION FOUND</b>
              <i class="phase active alert-blink" id="sense-phase">ACTION REQUIRED</i>
            </div>
          </div>
          <article class="sense-alert-card">
            <div class="sense-alert-code"><span class="alert-dot"></span>${meta.code}</div>
            <h1>${meta.title}</h1>
            <div class="sense-cause"><span>CAUSE</span><b>${meta.sensed}</b></div>
            <button class="sense-simulate" id="sense-simulate">SIMULATE AS-IS IMPACT</button>
          </article>
          <div class="sense-impact hidden" id="sense-impact">
            <span>30-DAY AS-IS DISRUPTION COST</span>
            <strong>${money(summary.total, { plus: true })}</strong>
            <p>Computed from downtime, transport, inventory, retailer penalties and lost sales across the affected nodes.</p>
          </div>
          <div class="sense-rail-note" id="sense-note">The delayed outbound lane is highlighted. Simulate the as-is impact to see where cost accumulates.</div>
        </div>
      </aside>
    </div>`;

  const graph = renderGraph(view.querySelector('#sense-canvas'), {
    changedMetricsOnly: true,
    compareNote: 'ONLY THE KPI CHANGED BY THIS DISRUPTION',
  });
  graph.setFrame(null);

  const discovery = view.querySelector('#sense-discovery');
  const alertContent = view.querySelector('#sense-alert-content');
  const railTitle = view.querySelector('#sense-rail-title');
  const alertCount = view.querySelector('#sense-alert-count');
  const scan = view.querySelector('#sense-scan');
  const button = view.querySelector('#sense-simulate');
  const impact = view.querySelector('#sense-impact');
  const note = view.querySelector('#sense-note');
  const day = view.querySelector('#sense-day');
  const phase = view.querySelector('#sense-phase');
  let player = null;
  let revealTimer = null;

  scan.addEventListener('click', () => {
    scan.disabled = true;
    scan.textContent = 'SENSING SUPPLY SIGNALS';
    revealTimer = setTimeout(() => {
      discovery.classList.add('hidden');
      alertContent.classList.remove('hidden');
      alertContent.classList.add('revealed');
      railTitle.textContent = 'DISRUPTION NOTIFICATION';
      alertCount.textContent = '01';
      graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');
      graph.pulseNode('supplier_oils_fats_regional');
    }, 720);
  });

  const play = () => {
    player?.destroy();
    graph.setCompare(null);
    graph.setNodeCosts(null);
    graph.clearNodeCostCards();
    graph.setFrame(null);
    graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');
    impact.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'SIMULATING AS-IS IMPACT';
    day.textContent = 'DAY 1 / 30';
    phase.textContent = 'BEFORE DELAY';
    phase.className = 'phase pre';
    note.textContent = 'Calculating impact through raw material, production, finished goods and retailer fulfillment.';

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
        button.textContent = 'RUN AS-IS AGAIN';
        day.textContent = 'DAY 30 / 30';
        phase.textContent = 'IMPACT CONFIRMED';
        phase.className = 'phase active';
        note.textContent = 'Compact badges connect to their exact nodes. Hover one to inspect its cost components and changed KPI.';
      }
    }, { msPerTick: 250 });
    player.play();
  };

  button.addEventListener('click', play);
  return () => {
    clearTimeout(revealTimer);
    player?.destroy();
    graph.destroy();
  };
}
