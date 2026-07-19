import { renderGraph } from '../graph.js?v=experience5';
import { TimelinePlayer } from '../sim.js';
import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES, money,
} from '../model.js?v=experience5';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary, recoverySummary } from '../scenario.js?v=experience5';

export function renderSimulate(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const bau = runBau();
  const noAction = runScenario(event.id);
  const disruption = disruptionSummary(bau, noAction, event);
  const noActionLoss = noAction.cum.lost_margin_cost - bau.frames[29].cum.lost_margin_cost;
  const options = event.candidate_interventions.map(intervention => {
    const run = runScenario(event.id, intervention.id);
    const summary = recoverySummary(noAction, run, event);
    const loss = run.cum.lost_margin_cost - bau.frames[29].cum.lost_margin_cost;
    return {
      intervention,
      run,
      summary,
      recovery: Math.max(0, 1 - loss / noActionLoss),
    };
  });

  ctx.state.selectedEventId = event.id;
  view.innerHTML = `
    <div class="sim-workspace recovery-workspace">
      <section class="sim-main">
        <div class="workspace-graph" id="sim-canvas"></div>
      </section>
      <aside class="recovery-rail">
        <div class="recovery-head">
          <span>SIMULATED RESPONSES</span>
          <h1>Choose a recovery option</h1>
          <p>Each option reruns the same 30-day disruption with a different scheduled response.</p>
        </div>
        <div class="rail-run-status recovery-run-status">
          <div class="rail-run-head">
            <span id="sim-mode">DISRUPTED NETWORK BASELINE</span>
            <button id="sc-restart" disabled>RUN AGAIN</button>
          </div>
          <div class="rail-run-line">
            <b id="sc-day">SELECT AN OPTION</b>
            <i class="phase active" id="sc-phase">IMPACT CONFIRMED</i>
          </div>
        </div>
        <div class="recovery-options">
          ${options.map((option, index) => `
            <button class="recovery-option" data-option="${option.intervention.id}">
              <span class="recovery-index">0${index + 1}</span>
              <div>
                <h2>${INTERVENTION_TITLES[option.intervention.id]}</h2>
                <p>${INTERVENTION_PROPOSALS[option.intervention.id]}</p>
                <div class="recovery-metrics">
                  <span><b>${money(option.summary.avoided)}</b> cost avoided</span>
                  <span><b>${Math.round(option.recovery * 100)}%</b> service recovery</span>
                </div>
              </div>
            </button>`).join('')}
        </div>
        <div class="recovery-outcome" id="recovery-outcome">
          <span>SELECT AN OPTION</span>
          <b>Run a response simulation</b>
          <p>The affected nodes will improve as inventory and retailer service recover.</p>
        </div>
        <button class="rail-cta" id="to-decide" disabled>REVIEW ROI IN DECIDE</button>
      </aside>
    </div>`;

  const graph = renderGraph(view.querySelector('#sim-canvas'), {
    changedMetricsOnly: true,
    compareNote: 'DISRUPTED LOW → RECOVERED KPI',
  });
  graph.setFrame(disruption.frame);
  graph.setCompare(disruption.compare);

  const day = view.querySelector('#sc-day');
  const phase = view.querySelector('#sc-phase');
  const mode = view.querySelector('#sim-mode');
  const restart = view.querySelector('#sc-restart');
  const decide = view.querySelector('#to-decide');
  const outcome = view.querySelector('#recovery-outcome');
  let selected = null;
  let player = null;

  const play = option => {
    selected = option;
    ctx.state.selectedInterventionId = option.intervention.id;
    player?.destroy();
    graph.setCompare(null);
    graph.setNodeCosts(null);
    graph.clearNodeCostCards();
    view.querySelectorAll('[data-option]').forEach(card => card.classList.toggle('selected', card.dataset.option === option.intervention.id));
    restart.disabled = true;
    decide.disabled = true;
    mode.textContent = INTERVENTION_TITLES[option.intervention.id].toUpperCase();
    outcome.innerHTML = '<span>SIMULATION RUNNING</span><b>Applying the scheduled response</b><p>Recalculating inventory, production, shipments, penalties and lost sales at every node.</p>';

    player = new TimelinePlayer(option.run.frames, (frame, index) => {
      graph.setFrame(frame);
      day.textContent = `DAY ${index + 1} / 30`;
      phase.textContent = frame.phase === 'pre' ? 'SCHEDULED'
        : frame.phase === 'active' ? 'RESPONSE ACTIVE'
          : frame.phase === 'recovered' ? 'RECOVERED' : 'RECOVERING';
      phase.className = `phase ${frame.phase}`;
      if (index === option.run.frames.length - 1) {
        graph.setFrame(option.summary.frame);
        graph.setCompare(option.summary.compare);
        graph.setNodeCosts(option.summary.nodeCosts);
        graph.showNodeCostCards(option.summary.nodeCosts);
        day.textContent = 'DAY 30 / 30';
        phase.textContent = 'RECOVERY CONFIRMED';
        phase.className = 'phase recovered';
        outcome.innerHTML = `<span>SIMULATED OUTCOME</span><b>${money(option.summary.avoided)} disruption cost avoided</b><p>${Math.round(option.recovery * 100)}% of retailer service loss recovered. Green cards show the cost reduction at each node.</p>`;
        restart.disabled = false;
        decide.disabled = false;
      }
    }, { msPerTick: 220 });
    player.play();
  };

  view.querySelectorAll('[data-option]').forEach(button => {
    button.addEventListener('click', () => play(options.find(option => option.intervention.id === button.dataset.option)));
  });
  restart.addEventListener('click', () => selected && play(selected));
  decide.addEventListener('click', () => selected && ctx.gotoTab('intervene', {
    eventId: event.id,
    interventionId: selected.intervention.id,
  }));
  return () => { player?.destroy(); graph.destroy(); };
}
