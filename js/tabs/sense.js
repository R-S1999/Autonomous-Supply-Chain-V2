// SENSE — current-state view. The 6-month BAU DES runs silently up front;
// what you see is its end state: node health as the network actually settles
// (not forced green), live computed KPIs in the popovers, alerts pinned on
// their origin nodes, and the 1-MO / 6-MO BAU cost-to-fulfill cards on the
// right — hover for the full simulated cost breakdown.
import { renderGraph } from '../graph.js?v=costledger3';
import { ALERTS_BY_ORIGIN } from '../model.js?v=costledger';
import { runBau } from '../engine.js?v=costledger';
import { bauCards, fillCostCard, attachBreakdown } from '../costcards.js?v=costledger';

export function renderSense(view, ctx) {
  view.innerHTML = `
    <div class="sim-layout">
      <div class="sim-canvas" id="sense-canvas"></div>
      <aside class="sim-rail sim-rail-right">
        <div class="cost-card rail-card" id="sn-1mo"></div>
        <div class="cost-card rail-card" id="sn-6mo"></div>
        <div class="rail-note">BAU discrete-event run · 182 days ·
          reorder policies, supplier caps, compliance & spoilage applied.
          Node colors are the settled end-state, not a target.</div>
      </aside>
    </div>`;

  const canvas = view.querySelector('#sense-canvas');
  const graph = renderGraph(canvas, {
    onSimulate: (eventId) => ctx.gotoTab('simulate', { eventId }),
  });

  const bau = runBau();
  graph.setAlerts(ALERTS_BY_ORIGIN);
  graph.setFrame(bau.frames[bau.frames.length - 1]); // settled 6-month state

  const { oneMo, sixMo } = bauCards();
  const c1 = view.querySelector('#sn-1mo');
  const c6 = view.querySelector('#sn-6mo');
  fillCostCard(c1, '1-MO BAU', oneMo);
  fillCostCard(c6, '6-MO BAU', sixMo);
  const d1 = attachBreakdown(c1, '1-MONTH BAU', oneMo);
  const d6 = attachBreakdown(c6, '6-MONTH BAU', sixMo);

  const hint = document.createElement('div');
  hint.className = 'sense-hint';
  hint.innerHTML = `<span class="alert-dot"></span> AMBER TAG = ALERT ORIGIN ·
    CLICK FOR DISRUPTION DETAIL · HOVER FOR LIVE KPIS`;
  canvas.appendChild(hint);

  if (ctx.state.debugPopNode) setTimeout(() => graph.showPopover(ctx.state.debugPopNode), 600);

  return () => { d1(); d6(); graph.destroy(); };
}
