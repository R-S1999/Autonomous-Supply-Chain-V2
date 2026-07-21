import { renderGraph } from '../graph.js?v=experience27';
import { TimelinePlayer } from '../sim.js';
import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES, NODE_META, money,
} from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { disruptionSummary, recoverySummary } from '../scenario.js?v=experience11';

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
          <div class="recovery-stage">
            <span><i id="recovery-stage-label">AWAITING RESPONSE</i><b id="recovery-stage-count">0 / 9 NODES</b></span>
            <em><i id="recovery-stage-meter"></i></em>
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
  const stageLabel = view.querySelector('#recovery-stage-label');
  const stageCount = view.querySelector('#recovery-stage-count');
  const stageMeter = view.querySelector('#recovery-stage-meter');
  const affectedNodes = event.affected_model_objects?.nodes || [];
  const affectedEdges = event.affected_model_objects?.relationships || [];
  let selected = null;
  let player = null;
  let autoRunTimer = null;

  const play = option => {
    selected = option;
    ctx.selectIntervention(option.intervention.id);
    player?.destroy();
    graph.setCompare(null);
    graph.setNodeCosts(null);
    graph.clearNodeCostCards();
    view.querySelectorAll('[data-option]').forEach(card => card.classList.toggle('selected', card.dataset.option === option.intervention.id));
    restart.disabled = true;
    decide.disabled = true;
    mode.textContent = INTERVENTION_TITLES[option.intervention.id].toUpperCase();
    stageLabel.textContent = 'RESPONSE SCHEDULED';
    stageCount.textContent = `0 / ${affectedNodes.length} NODES`;
    stageMeter.style.width = '0%';
    outcome.innerHTML = '<span>SIMULATION RUNNING</span><b>Applying the scheduled response</b><p>Recalculating inventory, production, shipments, penalties and lost sales at every node.</p>';

    const priorityOrder = option.intervention.id === 'prioritize_longmont_oil_allocation'
      ? [
        'inventory_sugar_oils_receiving', 'processing_fruit_spread_network',
        'plant_longmont_frozen_sandwich', 'retailer_costco', 'retailer_sams_club',
        'frozen_inventory_longmont', 'cold_dc_west', 'retailer_other',
        'supplier_oils_fats_regional',
      ]
      : affectedNodes;
    const recoveryTarget = option.recovery >= .95
      ? priorityOrder.length : Math.max(4, Math.round(priorityOrder.length * .56));
    let previousRecovered = 0;

    player = new TimelinePlayer(option.run.frames, (frame, index) => {
      const progress = index / Math.max(1, option.run.frames.length - 1);
      const recoveryProgress = Math.max(0, Math.min(1, (progress - .16) / .74));
      const recovered = Math.min(recoveryTarget, Math.floor(recoveryProgress * (recoveryTarget + 1)));
      const recoveredNodes = new Set(priorityOrder.slice(0, recovered));
      const nodeHealth = Object.fromEntries(affectedNodes.map(nodeId => [
        nodeId,
        recoveredNodes.has(nodeId) ? 'good'
          : nodeId === priorityOrder[recovered] && recoveryProgress > 0 ? 'amber' : 'red',
      ]));
      const recoveredEdgeCount = Math.min(affectedEdges.length,
        Math.floor((recovered / Math.max(1, recoveryTarget)) * affectedEdges.length));
      const edgeStates = Object.fromEntries(affectedEdges.map((edgeId, edgeIndex) => [
        edgeId, edgeIndex < recoveredEdgeCount ? 'flow' : 'disrupted',
      ]));
      graph.setFrame({ ...frame, nodeHealth, edgeStates });
      if (recovered > previousRecovered) graph.pulseNode(priorityOrder[recovered - 1]);
      previousRecovered = recovered;
      day.textContent = `DAY ${index + 1} / 30`;
      phase.textContent = recovered === 0 ? 'SCHEDULED'
        : recovered < recoveryTarget ? 'RECOVERING' : 'RECOVERED';
      phase.className = `phase ${recovered === 0 ? 'pre' : recovered < recoveryTarget ? 'active' : 'recovered'}`;
      stageLabel.textContent = recovered === 0 ? 'RESPONSE SCHEDULED'
        : recovered < recoveryTarget ? `REMOVING IMPACT · ${NODE_META[priorityOrder[recovered - 1]]?.name.toUpperCase()}`
          : option.recovery >= .95 ? 'NETWORK RECOVERED' : 'PRIORITY NODES RECOVERED';
      stageCount.textContent = `${recovered} / ${affectedNodes.length} NODES`;
      stageMeter.style.width = `${Math.round(recovered / affectedNodes.length * 100)}%`;
      if (index === option.run.frames.length - 1) {
        const finalRecovered = new Set(priorityOrder.slice(0, recoveryTarget));
        const finalHealth = Object.fromEntries(affectedNodes.map(nodeId => [
          nodeId, finalRecovered.has(nodeId) ? 'good' : 'amber',
        ]));
        graph.setFrame({ ...option.summary.frame, nodeHealth: finalHealth });
        graph.setCompare(option.summary.compare);
        graph.setNodeCosts(option.summary.nodeCosts);
        graph.showNodeCostCards(option.summary.nodeCosts);
        day.textContent = 'DAY 30 / 30';
        phase.textContent = 'RECOVERY CONFIRMED';
        phase.className = 'phase recovered';
        stageLabel.textContent = option.recovery >= .95 ? 'NETWORK RECOVERED' : 'PRIORITY RECOVERY COMPLETE';
        stageCount.textContent = `${recoveryTarget} / ${affectedNodes.length} NODES`;
        stageMeter.style.width = `${Math.round(recoveryTarget / affectedNodes.length * 100)}%`;
        outcome.innerHTML = `<span>SIMULATED OUTCOME</span><b>${money(option.summary.avoided)} disruption cost avoided</b><p>${Math.round(option.recovery * 100)}% of retailer service loss recovered. Green cards show the cost reduction at each node.</p>`;
        restart.disabled = false;
        decide.disabled = false;
      }
    }, { msPerTick: 420 });
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

  const preset = options.find(option => option.intervention.id === ctx.state.selectedInterventionId);
  if (preset) {
    selected = preset;
    view.querySelectorAll('[data-option]').forEach(card => {
      card.classList.toggle('selected', card.dataset.option === preset.intervention.id);
    });
    mode.textContent = INTERVENTION_TITLES[preset.intervention.id].toUpperCase();
    day.textContent = 'READY TO SIMULATE';
    phase.textContent = 'SELECTED IN DECIDE';
    phase.className = 'phase pre';
    outcome.innerHTML = `<span>SELECTED RESPONSE</span><b>${INTERVENTION_TITLES[preset.intervention.id]}</b><p>Run the option selected in Decide to see its node-by-node recovery.</p>`;
    restart.disabled = false;
    if (ctx.state.autoRunSimulation) {
      ctx.state.autoRunSimulation = false;
      autoRunTimer = setTimeout(() => play(preset), 80);
    }
  } else {
    ctx.state.autoRunSimulation = false;
  }

  return () => {
    if (autoRunTimer) clearTimeout(autoRunTimer);
    player?.destroy();
    graph.destroy();
  };
}
