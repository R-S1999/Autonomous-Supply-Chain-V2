import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES, money,
} from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';

function retailerSeries(run) {
  return run.frames.map(frame => {
    const values = Object.values(frame.retailerFill || {});
    return values.length ? Math.min(...values) : 100;
  });
}

function linePath(values, width, height, minY = 50, maxY = 100) {
  return values.map((value, index) => {
    const x = index / Math.max(1, values.length - 1) * width;
    const y = height - ((value - minY) / (maxY - minY)) * height;
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${Math.max(0, Math.min(height, y)).toFixed(1)}`;
  }).join(' ');
}

function fulfillmentChart(asIs, response, responseTitle) {
  const width = 650;
  const height = 210;
  const asIsWorst = Math.min(...asIs);
  const responseWorst = Math.min(...response);
  const asIsWorstDay = asIs.indexOf(asIsWorst);
  const responseWorstDay = response.indexOf(responseWorst);
  const x = day => day / 29 * width;
  const y = value => height - ((value - 50) / 50) * height;
  const ticks = [60, 80, 100];

  return `<svg class="summary-line-chart" viewBox="-54 -22 735 270" role="img"
    aria-label="Retailer fulfillment over 30 days. As-is drops to ${asIsWorst.toFixed(1)} percent and the selected response drops to ${responseWorst.toFixed(1)} percent.">
    <title>Retailer fulfillment over the 30-day simulation</title>
    <desc>Comparison between the untreated disruption and ${responseTitle}.</desc>
    ${ticks.map(tick => `<g class="summary-gridline"><line x1="0" y1="${y(tick)}" x2="${width}" y2="${y(tick)}"></line><text x="-12" y="${y(tick) + 4}" text-anchor="end">${tick}%</text></g>`).join('')}
    <g class="summary-axis-labels">
      <text x="0" y="${height + 27}">DAY 1</text>
      <text x="${x(9)}" y="${height + 27}" text-anchor="middle">DAY 10</text>
      <text x="${x(19)}" y="${height + 27}" text-anchor="middle">DAY 20</text>
      <text x="${width}" y="${height + 27}" text-anchor="end">DAY 30</text>
    </g>
    <path class="summary-line as-is" d="${linePath(asIs, width, height)}"></path>
    <path class="summary-line response" d="${linePath(response, width, height)}"></path>
    <g class="summary-point as-is" transform="translate(${x(asIsWorstDay)} ${y(asIsWorst)})">
      <circle r="5"></circle><text x="0" y="-13" text-anchor="middle">${asIsWorst.toFixed(1)}%</text>
    </g>
    <g class="summary-point response" transform="translate(${x(responseWorstDay)} ${y(responseWorst)})">
      <circle r="5"></circle><text x="0" y="${responseWorstDay === asIsWorstDay ? 22 : -13}" text-anchor="middle">${responseWorst.toFixed(1)}%</text>
    </g>
  </svg>`;
}

export function renderSummary(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const selectedId = ctx.state.selectedInterventionId;
  const selected = event.candidate_interventions.find(intervention => intervention.id === selectedId);
  const bau = runBau();
  const doNothing = runScenario(event.id);
  const selectedRun = selected ? runScenario(event.id, selected.id) : doNothing;
  const disruptionCost = doNothing.total - bau.frames[29].cumTotal;
  const responseCost = selectedRun.total - bau.frames[29].cumTotal;
  const saved = Math.max(0, doNothing.total - selectedRun.total);
  const savedPct = disruptionCost ? Math.round(saved / disruptionCost * 100) : 0;
  const responseTitle = selected ? INTERVENTION_TITLES[selected.id] : 'No intervention selected';
  const responseProposal = selected
    ? INTERVENTION_PROPOSALS[selected.id]
    : 'Choose an intervention in Decide to compare a recovery plan.';
  const asIsFill = retailerSeries(doNothing);
  const responseFill = retailerSeries(selectedRun);
  const asIsWidth = 100;
  const responseWidth = Math.max(4, responseCost / disruptionCost * 100);

  view.innerHTML = `<div class="summary-dashboard">
    <header class="summary-hero">
      <div class="summary-issue">
        <span class="section-kicker">EXECUTIVE SUMMARY · 30-DAY SIMULATION</span>
        <h1>${meta.title}</h1>
        <p>${meta.sensed}</p>
      </div>
      <div class="summary-response">
        <span>SELECTED PREVENTION METHOD</span>
        <h2>${responseTitle}</h2>
        <p>${responseProposal}</p>
      </div>
    </header>

    <section class="summary-kpis" aria-label="Disruption economics">
      <article>
        <span>COST OF DISRUPTION</span>
        <strong>${money(disruptionCost, { plus: true })}</strong>
        <p>As-is 30-day exposure</p>
      </article>
      <article class="saved">
        <span>COST SAVED</span>
        <strong>${selected ? money(saved) : '—'}</strong>
        <p>${selected ? `${savedPct}% of disruption exposure avoided` : 'Awaiting intervention selection'}</p>
      </article>
    </section>

    <section class="summary-charts">
      <article class="summary-chart fulfillment">
        <header>
          <div><span>RETAILER FULFILLMENT</span><h2>Service impact and recovery</h2></div>
          <div class="summary-legend"><i class="as-is"></i>As-is disruption <i class="response"></i>Selected response</div>
        </header>
        ${fulfillmentChart(asIsFill, responseFill, responseTitle)}
      </article>
      <article class="summary-chart economics">
        <header><span>DISRUPTION COST</span><h2>Exposure after intervention</h2></header>
        <div class="summary-cost-chart" role="img" aria-label="As-is disruption cost ${money(disruptionCost)} compared with ${money(responseCost)} after the selected response.">
          <div class="cost-bar-row">
            <div><span>AS-IS DISRUPTION</span><b>${money(disruptionCost)}</b></div>
            <i><em class="as-is" style="width:${asIsWidth}%"></em></i>
          </div>
          <div class="cost-bar-row">
            <div><span>AFTER RESPONSE</span><b>${money(responseCost)}</b></div>
            <i><em class="response" style="width:${responseWidth}%"></em></i>
          </div>
        </div>
        <div class="summary-avoided">
          <div class="summary-savings-ring" style="--saved-pct:${savedPct}"><b>${selected ? savedPct : 0}<small>%</small></b></div>
          <div>
            <strong>${selected ? money(saved) : '—'}</strong>
            <span>AVOIDED COST</span>
            <p>${selected ? 'Lower than doing nothing' : 'Select a response in Decide'}</p>
          </div>
        </div>
      </article>
    </section>
  </div>`;
}
