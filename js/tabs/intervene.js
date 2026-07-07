// INTERVENE — every simulated intervention, ranked by cost to execute,
// against the cost of doing nothing for its alert.
import { EVENTS, ALERT_META, money, pretty, COST_COMPONENT_COUNT } from '../model.js';
import { BAU_WEEKLY_TOTAL } from '../sim.js';

export function renderIntervene(view, ctx) {
  ctx.setCost({
    title: 'COST TO FULFILL · BAU',
    value: money(BAU_WEEKLY_TOTAL),
    unit: '/wk',
    sub: `${COST_COMPONENT_COUNT} components · baseline for all comparisons`,
  });

  const wrap = document.createElement('div');
  wrap.className = 'intervene-wrap';

  const ordered = [...EVENTS].sort((a, b) => {
    const focus = ctx.state.selectedEventId;
    if (a.id === focus) return -1;
    if (b.id === focus) return 1;
    return (a.event_horizon === 'tactical' ? 0 : 1) - (b.event_horizon === 'tactical' ? 0 : 1);
  });

  wrap.innerHTML = `
    <div class="iv-header">
      <h2>SIMULATED INTERVENTIONS · RANKED BY COST TO EXECUTE</h2>
      <p>Every candidate was simulated on the alert-patched mesh (scenario comparison, no optimizer).
         Avoided cost = do-nothing impact − execution cost. Recommendation follows the decision-layer
         ranking rules: feasibility → protect high-priority retailer OTIF → lowest total fulfillment cost.</p>
    </div>
    ${ordered.map(e => eventCard(e)).join('')}`;

  function eventCard(e) {
    const m = ALERT_META[e.id];
    const isTac = e.event_horizon === 'tactical';
    const doNothing = e.estimated_no_action_impact?.total_incremental_cost_usd ?? 0;
    const rows = [...(e.candidate_interventions || [])]
      .sort((a, b) => (a.incremental_cost_usd ?? 0) - (b.incremental_cost_usd ?? 0));

    const rowHtml = rows.map((iv, i) => {
      const cost = iv.incremental_cost_usd ?? 0;
      const avoided = doNothing - cost;
      const reco = e.recommended_intervention_id === iv.id;
      const recovery = iv.projected_OTIF_recovery_pct ?? iv.projected_service_recovery_pct ?? null;
      return `<tr>
        <td class="rank">#${i + 1}</td>
        <td>
          <div class="iname">${pretty(iv.id)}${reco ? '<span class="badge-reco">RECOMMENDED</span>' : ''}</div>
          <div class="itype">${pretty(iv.action_type)}${iv.expected_effect ? ' · ' + pretty(iv.expected_effect) : ''}</div>
        </td>
        <td class="cost">${money(cost)}</td>
        <td class="avoided ${avoided < 0 ? 'neg' : ''}">${money(avoided, { plus: true })}</td>
        <td>${recovery != null
          ? `<span class="recov-bar"><i style="width:${recovery}%"></i></span>${recovery}%`
          : '<span class="risk">n/a</span>'}</td>
        <td class="risk">${pretty(iv.risk ?? iv.residual_risk ?? '—')}</td>
        <td><button class="iv-act-btn" data-act="${e.id}::${iv.id}">AUTOMATE ▸</button></td>
      </tr>`;
    }).join('');

    return `<div class="iv-event-card">
      <div class="iv-event-head">
        <span class="code ${isTac ? 'tac' : 'lt'}">${m.code}</span>
        <span class="title">${m.title}<span class="badge-base">${isTac ? 'ACTIVE ALERT' : 'FORECAST WATCH'}</span></span>
        <span class="donothing">
          <div class="v">${money(doNothing)}</div>
          <div class="k">COST OF DOING NOTHING</div>
        </span>
      </div>
      <table class="iv-table">
        <thead><tr>
          <th></th><th>INTERVENTION</th><th>COST TO EXECUTE</th><th>AVOIDED COST</th>
          <th>SERVICE RECOVERY</th><th>RESIDUAL RISK</th><th></th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="rank">—</td>
            <td><div class="iname">do_nothing<span class="badge-base">BASELINE</span></div>
              <div class="itype">accept disruption · ${pretty(e.estimated_no_action_impact?.service_risk || '')} service risk</div></td>
            <td class="cost" style="color:var(--red)">${money(doNothing)}</td>
            <td class="avoided neg">$0</td>
            <td><span class="risk">0%</span></td>
            <td class="risk">${pretty(e.estimated_no_action_impact?.service_risk || '')}</td>
            <td><button class="iv-act-btn" data-resim="${e.id}">RE-SIMULATE ▸</button></td>
          </tr>
          ${rowHtml}
        </tbody>
      </table>
    </div>`;
  }

  wrap.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]');
    if (act) {
      const [eventId, interventionId] = act.dataset.act.split('::');
      ctx.gotoTab('act', { eventId, interventionId });
      return;
    }
    const resim = ev.target.closest('[data-resim]');
    if (resim) ctx.gotoTab('simulate', { eventId: resim.dataset.resim });
  });

  view.appendChild(wrap);
  return () => {};
}
