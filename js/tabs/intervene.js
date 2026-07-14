import { EVENTS, ALERT_META, INTERVENTION_PROPOSALS, INTERVENTION_NODES, NODE_META, money, pretty } from '../model.js?v=costledger';
import { runBau, runScenario } from '../engine.js?v=costledger';

export function renderIntervene(view, ctx) {
  const event = EVENTS[0]; const meta = ALERT_META[event.id];
  const bau = runBau().frames[29]; const dn = runScenario(event.id); const dnCost = dn.total - bau.cumTotal;
  const rows = event.candidate_interventions.map(iv => {
    const run = runScenario(event.id, iv.id); const net = run.total - bau.cumTotal; const avoided = dnCost - net;
    const dnLoss = dn.cum.lost_margin_cost - bau.cum.lost_margin_cost; const loss = run.cum.lost_margin_cost - bau.cum.lost_margin_cost;
    return { iv, net, avoided, roi: avoided / iv.incremental_cost_usd, recovery: Math.max(0, 1 - loss / dnLoss) };
  }).sort((a, b) => b.roi - a.roi);
  view.innerHTML = `<div class="decide-viewport">
    <header class="decide-summary"><div><span class="section-kicker">DECIDE · 30-DAY HORIZON</span><h1>Choose the best response</h1><p>${meta.title} · Every option is simulated against the same BAU baseline.</p></div><div class="decide-dn"><span>DO NOTHING</span><b>${money(dnCost, { plus: true })}</b><i>incremental exposure</i></div></header>
    <section class="decision-grid compact-decisions">${rows.map((r, i) => `<article class="decision-card ${i === 0 ? 'best' : ''}"><div class="card-top"><div class="rank">0${i + 1}</div>${i === 0 ? '<div class="best-badge">BEST ROI</div>' : ''}</div><h2>${pretty(r.iv.id)}</h2><p>${INTERVENTION_PROPOSALS[r.iv.id]}</p><div class="decision-metrics"><div><span>Execution cost</span><b>${money(r.iv.incremental_cost_usd)}</b></div><div><span>Avoided cost</span><b>${money(r.avoided)}</b></div><div><span>Net impact</span><b>${money(r.net, { plus: true })}</b></div><div><span>ROI</span><b>${r.roi.toFixed(1)}×</b></div></div><div class="recovery-row"><span>RETAILER SERVICE RECOVERY</span><b>${Math.round(r.recovery * 100)}%</b><i><em style="width:${Math.round(r.recovery * 100)}%"></em></i></div><div class="acts-on">ACTS ON · ${(INTERVENTION_NODES[r.iv.id] || []).map(id => NODE_META[id]?.name).join(' → ')}</div><button class="iv-act-btn" data-act="${r.iv.id}">SELECT & ACT ▸</button></article>`).join('')}</section>
    <footer class="decide-note">ROI = avoided disruption cost ÷ execution cost · Service recovery is calculated from retailer lost-margin reduction.</footer>
  </div>`;
  view.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) ctx.gotoTab('act', { eventId: event.id, interventionId: b.dataset.act }); });
}
