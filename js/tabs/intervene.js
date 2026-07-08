// INTERVENE — the one disruption being modeled: every intervention re-run
// through the DES on the same horizon, ranked by simulated net impact vs BAU,
// against the simulated cost of doing nothing.
import { EVENTS, ALERT_META, eventsById, money, pretty } from '../model.js';
import { runBau, runScenario } from '../engine.js';

export function renderIntervene(view, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'intervene-wrap';
  view.appendChild(wrap);
  const bau = runBau();

  /* hover tooltip: composite cost of an option = simulated bucket deltas vs BAU */
  const cbData = {};
  const tip = document.createElement('div');
  tip.className = 'cost-breakdown hidden';
  document.body.appendChild(tip);
  function bucketDeltas(run, H) {
    const base = bau.frames[H - 1].cum;
    return Object.entries(run.cum)
      .map(([k, v]) => ({ k, d: v - base[k] }))
      .filter(x => Math.abs(x.d) > 500)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  }
  function showTip(key, cell) {
    const data = cbData[key];
    if (!data) return;
    const driver = data.deltas[0];
    tip.innerHTML = `
      <div class="cb-title">COMPOSITE COST · ${data.label}</div>
      ${data.deltas.map(x => `<div class="cb-row"><span>${pretty(x.k)}</span><b class="${x.d < 0 ? 'cb-neg' : ''}">${money(x.d, { plus: true })}</b></div>`).join('')}
      <div class="cb-row total"><span>SIM NET IMPACT VS BAU</span><b>${money(data.net, { plus: true })}</b></div>
      ${driver ? `<div class="cb-why">driven by ${pretty(driver.k)} (${money(driver.d, { plus: true })})${data.deltas[1] ? ` and ${pretty(data.deltas[1].k)} (${money(data.deltas[1].d, { plus: true })})` : ''}</div>` : ''}`;
    tip.classList.remove('hidden');
    const r = cell.getBoundingClientRect();
    const w = 292;
    tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 12))}px`;
    tip.style.top = '0px';
    const h = tip.offsetHeight;
    const below = r.bottom + 6;
    tip.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  }
  wrap.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('[data-cb]');
    if (cell) showTip(cell.dataset.cb, cell);
  });
  wrap.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-cb]')) tip.classList.add('hidden');
  });

  function render(eventId) {
    const e = eventsById[eventId] || EVENTS.find(x => x.event_horizon === 'tactical');
    ctx.state.selectedEventId = e.id;
    wrap.innerHTML = `
      <div class="iv-header">
        <h2>SIMULATED INTERVENTIONS · RANKED BY NET IMPACT</h2>
        <p>Each option was re-run through the discrete-event engine on the same horizon as BAU
           (tactical = 1 month, long-term = 6 months). Net impact = simulated total − BAU total.
           Avoided cost = do-nothing impact − net impact. Negative avoided cost means the
           intervention costs more than it saves — the sim will tell you when doing nothing wins.</p>
        <div class="iv-select">
          ${EVENTS.map(x => {
            const m = ALERT_META[x.id];
            const isTac = x.event_horizon === 'tactical';
            return `<button class="scenario-chip ${x.id === e.id ? 'selected' : ''}" data-id="${x.id}" title="${m.title}">
              <b class="${isTac ? 'tac' : 'lt'}">${m.code}</b></button>`;
          }).join('')}
        </div>
      </div>
      ${eventCard(e)}`;
  }

  function eventCard(e) {
    const m = ALERT_META[e.id];
    const isTac = e.event_horizon === 'tactical';
    const dn = runScenario(e.id);
    const H = dn.horizon;
    const bauT = bau.frames[H - 1].cumTotal;
    const bauShorts = bau.frames[H - 1].cum.lost_margin_cost;
    const dnInc = dn.total - bauT;
    const dnShorts = dn.cum.lost_margin_cost - bauShorts;

    cbData.do_nothing = { label: 'DO NOTHING', deltas: bucketDeltas(dn, H), net: dnInc };
    const rows = (e.candidate_interventions || []).map(iv => {
      const run = runScenario(e.id, iv.id);
      const net = run.total - bauT;
      const shorts = run.cum.lost_margin_cost - bauShorts;
      const recovery = dnShorts > 1000 ? Math.max(0, Math.min(1, 1 - shorts / dnShorts)) : null;
      cbData[iv.id] = { label: pretty(iv.id).toUpperCase(), deltas: bucketDeltas(run, H), net };
      return { iv, net, avoided: dnInc - net, recovery };
    }).sort((a, b) => a.net - b.net);

    const rowHtml = rows.map((r, i) => {
      const reco = e.recommended_intervention_id === r.iv.id;
      const simBest = i === 0 && r.avoided > 0;
      return `<tr>
        <td class="rank">#${i + 1}</td>
        <td>
          <div class="iname">${pretty(r.iv.id)}${simBest ? '<span class="badge-reco">SIM BEST</span>' : ''}${reco ? '<span class="badge-base">PLAYBOOK PICK</span>' : ''}</div>
          <div class="itype">${pretty(r.iv.action_type)} · declared budget ${money(r.iv.incremental_cost_usd)}</div>
        </td>
        <td class="cost has-cb" data-cb="${r.iv.id}">${money(r.net, { plus: true })}<i class="cb-hint">▾</i></td>
        <td class="avoided ${r.avoided < 0 ? 'neg' : ''}">${money(r.avoided, { plus: true })}</td>
        <td>${r.recovery != null
          ? `<span class="recov-bar"><i style="width:${Math.round(r.recovery * 100)}%"></i></span>${Math.round(r.recovery * 100)}%`
          : '<span class="risk">no service loss</span>'}</td>
        <td class="risk">${pretty(r.iv.risk ?? r.iv.residual_risk ?? '—')}</td>
        <td><button class="iv-act-btn" data-act="${e.id}::${r.iv.id}">AUTOMATE ▸</button></td>
      </tr>`;
    }).join('');

    return `<div class="iv-event-card">
      <div class="iv-event-head">
        <span class="code ${isTac ? 'tac' : 'lt'}">${m.code}</span>
        <span class="title">${m.title}<span class="badge-base">${isTac ? '1-MO HORIZON' : '6-MO HORIZON'}</span></span>
        <span class="donothing">
          <div class="v">${money(dnInc, { plus: true })}</div>
          <div class="k">SIMULATED COST OF DOING NOTHING</div>
        </span>
      </div>
      <table class="iv-table">
        <thead><tr>
          <th></th><th>INTERVENTION</th><th>SIM NET IMPACT VS BAU</th><th>AVOIDED COST</th>
          <th>SERVICE RECOVERY</th><th>RESIDUAL RISK</th><th></th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="rank">—</td>
            <td><div class="iname">do_nothing<span class="badge-base">BASELINE</span></div>
              <div class="itype">accept disruption · ${pretty(e.estimated_no_action_impact?.service_risk || '')} service risk</div></td>
            <td class="cost has-cb" style="color:var(--red)" data-cb="do_nothing">${money(dnInc, { plus: true })}<i class="cb-hint">▾</i></td>
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
    const chip = ev.target.closest('.scenario-chip');
    if (chip) { render(chip.dataset.id); return; }
    const act = ev.target.closest('[data-act]');
    if (act) {
      const [eventId, interventionId] = act.dataset.act.split('::');
      ctx.gotoTab('act', { eventId, interventionId });
      return;
    }
    const resim = ev.target.closest('[data-resim]');
    if (resim) ctx.gotoTab('simulate', { eventId: resim.dataset.resim });
  });

  render(ctx.state.selectedEventId || 'TAC_001_late_reefer_to_walmart_sams_dc');
  const dbg = new URLSearchParams(location.search).get('cb');
  if (dbg) setTimeout(() => {
    const cell = wrap.querySelector(`[data-cb="${dbg}"]`);
    if (cell) showTip(dbg, cell);
  }, 300);
  return () => tip.remove();
}
