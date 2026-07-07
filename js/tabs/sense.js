// SENSE — live BAU discrete-event view: mesh, node health, cost of fulfillment
// (1-month + 6-month), alert feed with information sources + origin tracing.
import { renderGraph } from '../graph.js';
import { buildBauTimeline, TimelinePlayer, BAU_WEEKLY_TOTAL } from '../sim.js';
import { EVENTS, ALERT_META, money, pretty, COST_COMPONENT_COUNT, DAYS_PER_MONTH } from '../model.js';

export function renderSense(view, ctx) {
  const graphHost = document.createElement('div');
  view.appendChild(graphHost);
  const graph = renderGraph(graphHost);

  /* header cost card: BAU weekly + 1-month + 6-month cost of fulfillment */
  const oneMonth = (BAU_WEEKLY_TOTAL / 7) * DAYS_PER_MONTH;
  const sixMonth = oneMonth * 6;
  ctx.setCost({
    title: 'COST TO FULFILL · BAU',
    value: money(BAU_WEEKLY_TOTAL),
    unit: '/wk',
    sub: `${COST_COMPONENT_COUNT} components · 1-MO ${money(oneMonth)} · 6-MO ${money(sixMonth)}`,
  });

  /* ---- DES clock + player (BAU runs a 6-month horizon) ---- */
  const clock = document.createElement('div');
  clock.className = 'sim-clock';
  clock.innerHTML = `
    <span class="mode">DES · BAU LIVE</span>
    <span class="day" id="clock-day">DAY 0</span>
    <span class="phase bau" id="clock-phase">STEADY STATE</span>
    <span class="mode" id="clock-accrued"></span>
    <button id="clock-restart" title="Restart simulation">⟲</button>`;
  view.appendChild(clock);

  const frames = buildBauTimeline(182);
  const dayEl = clock.querySelector('#clock-day');
  const accEl = clock.querySelector('#clock-accrued');
  const player = new TimelinePlayer(frames, (f) => {
    graph.setFrame(f);
    dayEl.textContent = `${f.label} / 182`;
    accEl.textContent = `ACCRUED ${money(f.cumBauCost)}`;
  }, { msPerTick: 320 });
  clock.querySelector('#clock-restart').addEventListener('click', () => player.restart());
  player.play();
  if (ctx.state.debugPopNode) setTimeout(() => graph.showPopover(ctx.state.debugPopNode), 600);

  /* ---- alert feed ---- */
  const feed = document.createElement('div');
  feed.className = 'alert-feed';
  feed.innerHTML = `
    <div class="alert-feed-head"><span class="alert-dot"></span> ALERT FEED
      <span class="count">${EVENTS.length} ACTIVE</span></div>
    <div class="alert-rows">
      ${[...EVENTS].sort((a, b) =>
        (a.event_horizon === 'tactical' ? 0 : 1) - (b.event_horizon === 'tactical' ? 0 : 1)).map(e => {
        const m = ALERT_META[e.id] || { code: e.id, title: e.id };
        const isTac = e.event_horizon === 'tactical';
        return `<div class="alert-row" data-id="${e.id}">
          <span class="alert-code ${isTac ? '' : 'lt'}">${m.code}</span>
          <span class="alert-title">${m.title}</span>
          <button class="alert-sim-btn" data-sim="${e.id}">SIMULATE ▸</button>
        </div>`;
      }).join('')}
    </div>`;
  view.appendChild(feed);

  /* hover tooltip = information sources for the alert */
  const tip = document.createElement('div');
  tip.className = 'alert-tip hidden';
  view.appendChild(tip);

  function showTip(eventId, rowEl) {
    const e = EVENTS.find(x => x.id === eventId);
    const m = ALERT_META[eventId];
    tip.innerHTML = `
      <div class="alert-tip-title">INFORMATION SOURCES · ${m.code}</div>
      ${(e.signal_sources || []).map(s => `
        <div class="alert-tip-sys">
          <b>${pretty(s.system)}</b>
          ${(s.events || []).map(ev => `<span>· ${pretty(ev)}</span>`).join('')}
        </div>`).join('')}
      <div class="alert-tip-foot">Expected in ~${e.trigger_window?.expected_start_in_days}d ·
        window ${e.trigger_window?.expected_duration_days}d · click row to trace origin</div>`;
    tip.classList.remove('hidden');
    const vr = view.getBoundingClientRect();
    const rr = rowEl.getBoundingClientRect();
    tip.style.left = `${rr.right - vr.left + 10}px`;
    tip.style.top = '0px';
    const top = Math.min(rr.top - vr.top - 8, vr.height - tip.offsetHeight - 12);
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() { tip.classList.add('hidden'); }

  /* origin banner shown when an alert is selected */
  const banner = document.createElement('div');
  banner.className = 'origin-banner';
  banner.style.display = 'none';
  view.appendChild(banner);

  let selectedAlert = null;
  function selectAlert(eventId) {
    if (selectedAlert === eventId) return clearAlert();
    selectedAlert = eventId;
    const e = EVENTS.find(x => x.id === eventId);
    const m = ALERT_META[eventId];
    graph.highlightAlert(e, m.origins);
    for (const r of feed.querySelectorAll('.alert-row')) r.classList.toggle('selected', r.dataset.id === eventId);
    banner.innerHTML = `
      <div class="txt"><b>${m.code} ORIGINATES HERE</b> — highlighted nodes & lanes are where this
      disruption enters the mesh (expected in ~${e.trigger_window?.expected_start_in_days}d).
      Node health is unaffected today; the impact is unknown until the simulation engine runs the overlay.</div>
      <button class="btn-primary" data-sim="${eventId}">RUN SIMULATION ▸</button>
      <button class="btn-ghost" data-clear="1">DISMISS</button>`;
    banner.style.display = 'flex';
  }
  function clearAlert() {
    selectedAlert = null;
    graph.highlightAlert(null);
    banner.style.display = 'none';
    for (const r of feed.querySelectorAll('.alert-row')) r.classList.remove('selected');
  }

  feed.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.alert-row');
    if (row) showTip(row.dataset.id, row);
  });
  feed.addEventListener('mouseleave', hideTip);
  view.addEventListener('click', (e) => {
    const sim = e.target.closest('[data-sim]');
    if (sim) { ctx.gotoTab('simulate', { eventId: sim.dataset.sim }); return; }
    if (e.target.closest('[data-clear]')) { clearAlert(); return; }
    const row = e.target.closest('.alert-row');
    if (row) selectAlert(row.dataset.id);
  });

  return () => { player.destroy(); graph.destroy(); };
}
