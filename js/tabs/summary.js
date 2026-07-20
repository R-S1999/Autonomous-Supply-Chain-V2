import {
  EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_TITLES,
  NODE_META, kNum, money,
} from '../model.js?v=experience11';
import { runBau, runScenario } from '../engine.js?v=costledger';
import { recoverySummary } from '../scenario.js?v=experience11';

const KPI_NODE_ORDER = [
  'processing_fruit_spread_network',
  'plant_longmont_frozen_sandwich',
  'frozen_inventory_longmont',
  'cold_dc_west',
  'retailer_costco',
  'retailer_sams_club',
  'retailer_other',
];

function retailerSeries(run) {
  return run.frames.slice(0, 30).map(frame => {
    const values = Object.values(frame.retailerFill || {});
    return values.length ? Math.min(...values) : 100;
  });
}

function servicePath(values, width, height, minY = 50, maxY = 102) {
  return values.map((value, index) => {
    const x = index / Math.max(1, values.length - 1) * width;
    const y = height - ((value - minY) / (maxY - minY)) * height;
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${Math.max(0, Math.min(height, y)).toFixed(1)}`;
  }).join(' ');
}

function gapAreaPath(baseline, disrupted, width, height) {
  const point = (value, index) => {
    const x = index / Math.max(1, disrupted.length - 1) * width;
    const y = height - ((value - 50) / 52) * height;
    return `${x.toFixed(1)} ${Math.max(0, Math.min(height, y)).toFixed(1)}`;
  };
  const top = baseline.map((value, index) => point(value, index));
  const bottom = disrupted.map((value, index) => point(value, index)).reverse();
  return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
}

function fulfillmentChart(baseline, disrupted, response, responseTitle) {
  const width = 760;
  const height = 420;
  const worst = Math.min(...disrupted);
  const worstIndex = disrupted.indexOf(worst);
  const responseAtWorst = response[worstIndex];
  const lift = responseAtWorst - worst;
  const x = index => index / 29 * width;
  const y = value => height - ((value - 50) / 52) * height;
  const firstImpact = Math.max(0, disrupted.findIndex((value, index) => value < baseline[index] - .1));
  const lastImpact = Math.max(firstImpact, disrupted.findLastIndex((value, index) => value < baseline[index] - .1));
  const ticks = [60, 70, 80, 90, 100];
  const liftMid = (y(worst) + y(responseAtWorst)) / 2;

  return `<svg class="summary-service-svg" viewBox="-58 -35 875 505" role="img"
    aria-label="Thirty-day retailer fulfillment. Without disruption remains at 100 percent. With disruption falls to ${worst.toFixed(1)} percent on day ${worstIndex + 1}. The selected response improves that day to ${responseAtWorst.toFixed(1)} percent, a ${lift.toFixed(1)} percentage point service lift.">
    <title>Retailer fulfillment without disruption, with disruption, and with selected response</title>
    <desc>The selected response is ${responseTitle}. The shaded region is the service gap avoided by acting.</desc>
    <rect class="service-window" x="${x(firstImpact)}" y="0" width="${Math.max(12, x(lastImpact) - x(firstImpact))}" height="${height}"></rect>
    ${ticks.map(tick => `<g class="service-grid"><line x1="0" y1="${y(tick)}" x2="${width}" y2="${y(tick)}"></line><text x="-13" y="${y(tick) + 4}" text-anchor="end">${tick}%</text></g>`).join('')}
    <path class="service-gap-area" d="${gapAreaPath(baseline, disrupted, width, height)}"></path>
    <path class="service-line disrupted" d="${servicePath(disrupted, width, height)}"></path>
    <path class="service-line response" d="${servicePath(response, width, height)}"></path>
    <path class="service-line baseline" d="${servicePath(baseline, width, height)}"></path>
    <g class="service-axis-labels">
      <text x="0" y="${height + 29}">DAY 1</text>
      <text x="${x(9)}" y="${height + 29}" text-anchor="middle">DAY 10</text>
      <text x="${x(19)}" y="${height + 29}" text-anchor="middle">DAY 20</text>
      <text x="${width}" y="${height + 29}" text-anchor="end">DAY 30</text>
    </g>
    <g class="service-worst-point" transform="translate(${x(worstIndex)} ${y(worst)})">
      <circle r="6"></circle>
      <text x="-11" y="22" text-anchor="end">WITH DISRUPTION · ${worst.toFixed(1)}%</text>
    </g>
    <g class="service-response-point" transform="translate(${x(worstIndex)} ${y(responseAtWorst)})">
      <circle r="6"></circle>
      <text x="-11" y="-13" text-anchor="end">WITH RESPONSE · ${responseAtWorst.toFixed(1)}%</text>
    </g>
    ${lift > .05 ? `<g class="service-lift-annotation">
      <line x1="${x(worstIndex) + 18}" y1="${y(responseAtWorst)}" x2="${x(worstIndex) + 18}" y2="${y(worst)}"></line>
      <line x1="${x(worstIndex) + 11}" y1="${y(responseAtWorst)}" x2="${x(worstIndex) + 25}" y2="${y(responseAtWorst)}"></line>
      <line x1="${x(worstIndex) + 11}" y1="${y(worst)}" x2="${x(worstIndex) + 25}" y2="${y(worst)}"></line>
      <rect x="${x(worstIndex) + 31}" y="${liftMid - 23}" width="145" height="46" rx="7"></rect>
      <text x="${x(worstIndex) + 43}" y="${liftMid - 4}">+${lift.toFixed(1)} PTS</text>
      <text class="sub" x="${x(worstIndex) + 43}" y="${liftMid + 13}">WORST-DAY SERVICE LIFT</text>
    </g>` : ''}
  </svg>`;
}

function formatKpi(value, metric, unit) {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'days') return `${Number(value.toFixed(1))} days`;
  if (metric.includes('sandwiches')) return `${kNum(value)} / wk`;
  if (metric.includes('output_lb')) return `${kNum(value)} lb / wk`;
  return kNum(value);
}

function deltaKpi(before, after, metric, unit) {
  const delta = after - before;
  if (unit === 'percent') return `+${delta.toFixed(1)} pts`;
  if (unit === 'days') return `+${Number(delta.toFixed(1))} days`;
  if (metric.includes('sandwiches')) return `+${kNum(delta)} / wk`;
  if (metric.includes('output_lb')) return `+${kNum(delta)} lb / wk`;
  return `+${kNum(delta)}`;
}

function kpiRows(noAction, selectedRun, event) {
  const comparison = recoverySummary(noAction, selectedRun, event).compare;
  return KPI_NODE_ORDER.flatMap(nodeId => Object.entries(comparison[nodeId] || {}).map(([metric, values]) => ({
    nodeId,
    metric,
    before: values.bau,
    after: values.worst,
    unit: values.unit,
  }))).filter(row => row.after > row.before).slice(0, 4);
}

export function renderSummary(view, ctx) {
  const event = EVENTS[0];
  const meta = ALERT_META[event.id];
  const selectedId = ctx.state.selectedInterventionId;
  const selected = event.candidate_interventions.find(intervention => intervention.id === selectedId);
  const bau = runBau();
  const doNothing = runScenario(event.id);
  const selectedRun = selected ? runScenario(event.id, selected.id) : doNothing;
  const bau30 = bau.frames[29];
  const disruptionCost = doNothing.total - bau30.cumTotal;
  const saved = Math.max(0, doNothing.total - selectedRun.total);
  const savedPct = disruptionCost ? Math.round(saved / disruptionCost * 100) : 0;
  const responseTitle = selected ? INTERVENTION_TITLES[selected.id] : 'No intervention selected';
  const responseProposal = selected
    ? INTERVENTION_PROPOSALS[selected.id]
    : 'Choose an intervention in Decide to compare a recovery plan.';
  const baselineFill = retailerSeries(bau);
  const disruptedFill = retailerSeries(doNothing);
  const responseFill = retailerSeries(selectedRun);
  const worst = Math.min(...disruptedFill);
  const worstIndex = disruptedFill.indexOf(worst);
  const responseAtWorst = responseFill[worstIndex];
  const serviceLift = responseAtWorst - worst;
  const disruptionDays = disruptedFill.filter(value => value < 95).length;
  const responseRiskDays = responseFill.filter(value => value < 95).length;
  const rows = kpiRows(doNothing, selectedRun, event);

  view.innerHTML = `<div class="summary-v2">
    <header class="summary-v2-head">
      <div class="summary-v2-issue">
        <span>DISRUPTION · 30-DAY SIMULATION</span>
        <h1>${meta.title}</h1>
        <p>${meta.sensed}</p>
      </div>
      <div class="summary-v2-method">
        <span>SELECTED RESPONSE</span>
        <h2>${responseTitle}</h2>
        <p>${responseProposal}</p>
      </div>
      <div class="summary-v2-economics">
        <div><span>EXPOSURE</span><b>${money(disruptionCost, { plus: true })}</b></div>
        <div><span>COST SAVED</span><b>${selected ? money(saved) : '—'}</b><em>${selected ? `${savedPct}% avoided` : 'Select response'}</em></div>
      </div>
    </header>

    <main class="summary-v2-body">
      <section class="summary-service-panel">
        <header>
          <div>
            <span>RETAILER FULFILLMENT</span>
            <h2>Service protected by the selected response</h2>
            <p>Lowest fulfillment across Costco, Sam's Club and other retailers.</p>
          </div>
          <div class="service-legend">
            <i class="baseline"></i>Without disruption
            <i class="disrupted"></i>With disruption
            <i class="response"></i>Selected response
          </div>
        </header>
        ${fulfillmentChart(baselineFill, disruptedFill, responseFill, responseTitle)}
      </section>

      <aside class="summary-insight-rail">
        <section class="service-lift-block">
          <span>WORST-DAY SERVICE LIFT</span>
          <div><strong>+${serviceLift.toFixed(1)}</strong><em>percentage points</em></div>
          <p>On day ${worstIndex + 1}, fulfillment improves from ${worst.toFixed(1)}% to ${responseAtWorst.toFixed(1)}%.</p>
          <div class="service-scenario-strip">
            <div><span>NO DISRUPTION</span><b>${baselineFill[worstIndex].toFixed(1)}%</b></div>
            <div><span>DISRUPTED</span><b>${worst.toFixed(1)}%</b></div>
            <div><span>WITH RESPONSE</span><b>${responseAtWorst.toFixed(1)}%</b></div>
          </div>
          <div class="service-days"><b>${disruptionDays}</b> days below 95% without action <i></i><b>${responseRiskDays}</b> with response</div>
        </section>

        <section class="node-lift-block">
          <header><span>AFFECTED NODE KPI LIFT</span><h2>Operational recovery</h2></header>
          <div class="node-lift-list">
            ${rows.length ? rows.map(row => `<article class="node-lift-row">
              <div class="node-lift-name"><b>${NODE_META[row.nodeId]?.name || row.nodeId}</b><span>${row.metric.replaceAll('_', ' ')}</span></div>
              <div class="node-lift-values">
                <span><small>DISRUPTED LOW</small><b>${formatKpi(row.before, row.metric, row.unit)}</b></span>
                <i>→</i>
                <span class="after"><small>WITH RESPONSE</small><b>${formatKpi(row.after, row.metric, row.unit)}</b></span>
              </div>
              <em>${deltaKpi(row.before, row.after, row.metric, row.unit)}</em>
            </article>`).join('') : '<div class="node-lift-empty">Select an intervention in Decide to show operational KPI recovery.</div>'}
          </div>
        </section>
      </aside>
    </main>
  </div>`;
}
