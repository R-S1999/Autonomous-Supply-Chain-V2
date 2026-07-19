import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES, money,
} from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';

export function renderSummary(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const selectedId = ctx.state.selectedInterventionId;
  const selected = event.candidate_interventions.find(intervention => intervention.id === selectedId);
  const bau = runBau().frames[29];
  const doNothing = runScenario(event.id);
  const disruptionCost = doNothing.total - bau.cumTotal;
  const selectedRun = selected ? runScenario(event.id, selected.id) : null;
  const saved = selectedRun ? doNothing.total - selectedRun.total : null;

  view.innerHTML = `<div class="summary-viewport">
    <header class="summary-head">
      <span class="section-kicker">EXECUTIVE SUMMARY</span>
      <h1>Disruption response at a glance</h1>
    </header>
    <section class="summary-grid">
      <article class="summary-card summary-disruption">
        <span>DISRUPTION</span>
        <h2>${meta.title}</h2>
        <p>${meta.sensed}</p>
      </article>
      <article class="summary-card summary-cost">
        <span>COST OF DISRUPTION</span>
        <strong>${money(disruptionCost, { plus: true })}</strong>
        <p>30-day as-is impact</p>
      </article>
      <article class="summary-card summary-method">
        <span>PREVENTION METHOD</span>
        <h2>${selected ? INTERVENTION_TITLES[selected.id] : 'No intervention selected'}</h2>
        <p>${selected ? INTERVENTION_PROPOSALS[selected.id] : 'Choose an intervention in Decide to complete this summary.'}</p>
      </article>
      <article class="summary-card summary-saved">
        <span>COST SAVED</span>
        <strong>${selected ? money(saved) : '—'}</strong>
        <p>${selected ? 'Simulated avoided disruption cost' : 'Awaiting intervention selection'}</p>
      </article>
    </section>
  </div>`;
}
