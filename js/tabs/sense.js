import { renderGraph } from '../graph.js?v=experience5';
import { TimelinePlayer } from '../sim.js';
import { EVENTS, ALERT_META, money } from '../model.js?v=experience5';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary } from '../scenario.js?v=experience5';

export function renderSense(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const alertVisible = !!ctx.state.senseAlertsVisible;
  const bau = runBau();
  const disruption = runScenario(event.id);
  const summary = disruptionSummary(bau, disruption, event);

  view.innerHTML = `
    <div class="sense-workspace ${alertVisible ? 'alert-open' : 'network-only'}">
      <section class="sense-main">
        <div class="scenario-titlebar sense-titlebar">
          <span class="${alertVisible ? 'alert-dot' : 'live-dot'}"></span>
          <b>${alertVisible ? 'SENSE · ACTIVE SUPPLY RISK' : 'LIVE UNCRUSTABLES SUPPLY NETWORK'}</b>
          <i>${alertVisible ? 'One material movement needs attention' : 'Select Sense or Alerts to inspect active risks'}</i>
        </div>
        <div class="workspace-graph" id="sense-canvas"></div>
        <div class="workspace-clock sense-clock ${alertVisible ? '' : 'network-status'}">
          <span class="mode" id="sense-mode">${alertVisible ? 'OUTBOUND DELAY DETECTED' : 'NETWORK OPERATING VIEW'}</span>
          <span class="day" id="sense-day">${alertVisible ? 'READY' : 'LIVE'}</span>
          <span class="phase pre" id="sense-phase">${alertVisible ? 'AWAITING SIMULATION' : 'NO ALERT LAYER'}</span>
          ${alertVisible ? '<button id="sense-restart">RUN AGAIN</button>' : ''}
        </div>
      </section>
      ${alertVisible ? `<aside class="sense-alert-rail">
        <div class="sense-alert-head"><span>ACTIVE ALERT</span><b>01</b></div>
        <article class="sense-alert-card">
          <div class="sense-alert-code"><span class="alert-dot"></span>${meta.code}</div>
          <h1>${meta.title}</h1>
          <div class="sense-cause"><span>CAUSE</span><b>${meta.sensed}</b></div>
          <button class="sense-simulate" id="sense-simulate">SIMULATE DISRUPTION</button>
        </article>
        <div class="sense-impact hidden" id="sense-impact">
          <span>30-DAY DISRUPTION COST</span>
          <strong>${money(summary.total, { plus: true })}</strong>
          <p>Computed from downtime, transport, inventory, retailer penalties and lost sales across the affected nodes.</p>
        </div>
        <div class="sense-rail-note" id="sense-note">The highlighted lane is delayed. Nodes remain unchanged until the disruption is simulated.</div>
      </aside>` : ''}
    </div>`;

  const graph = renderGraph(view.querySelector('#sense-canvas'), {
    changedMetricsOnly: true,
    compareNote: 'ONLY THE KPI CHANGED BY THIS DISRUPTION',
  });
  graph.setFrame(null);
  if (alertVisible) graph.setEdgeAlert('rel_oils_to_sugar_oils_inventory', 'OUTBOUND DELAY');

  if (!alertVisible) return () => graph.destroy();

  const button = view.querySelector('#sense-simulate');
  const restart = view.querySelector('#sense-restart');
  const day = view.querySelector('#sense-day');
  const phase = view.querySelector('#sense-phase');
  const impact = view.querySelector('#sense-impact');
  const note = view.querySelector('#sense-note');
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
    button.textContent = 'SIMULATION RUNNING';
    note.textContent = 'Following the delay through raw material, production, finished goods and retailer fulfillment.';

    player = new TimelinePlayer(disruption.frames, (frame, index) => {
      graph.setFrame(frame);
      day.textContent = `DAY ${index + 1} / 30`;
      phase.textContent = frame.phase === 'pre' ? 'BEFORE DELAY'
        : frame.phase === 'active' ? 'DISRUPTION SPREADING'
          : 'DOWNSTREAM IMPACT';
      phase.className = `phase ${frame.phase}`;
      if (index === disruption.frames.length - 1) {
        graph.setFrame(summary.frame);
        graph.setCompare(summary.compare);
        graph.setNodeCosts(summary.nodeCosts);
        graph.showNodeCostCards(summary.nodeCosts);
        impact.classList.remove('hidden');
        button.disabled = false;
        button.textContent = 'SIMULATE AGAIN';
        phase.textContent = 'IMPACT CONFIRMED';
        phase.className = 'phase active';
        note.textContent = 'All red nodes are affected. Hover or click a node to see only its changed KPI and computed cost.';
      }
    }, { msPerTick: 220 });
    player.play();
  };

  button.addEventListener('click', play);
  restart.addEventListener('click', play);
  return () => { player?.destroy(); graph.destroy(); };
}
