// SENSE — current-state view of the mesh. No simulation runs here: node health
// is live BAU state, goods movement is shown by flow particles lighting nodes
// up on arrival, and alerts sit ON the nodes they originate from. Click a node
// to pin its popover: incoming disruptions (time-to-hit, window, signal
// sources) + all KPIs + most relevant source system.
import { renderGraph } from '../graph.js';
import { ALERTS_BY_ORIGIN } from '../model.js';

export function renderSense(view, ctx) {
  const graphHost = document.createElement('div');
  view.appendChild(graphHost);

  const graph = renderGraph(graphHost, {
    onSimulate: (eventId) => ctx.gotoTab('simulate', { eventId }),
  });
  graph.setAlerts(ALERTS_BY_ORIGIN);
  graph.setFrame(null); // BAU: all healthy, steady flow

  const hint = document.createElement('div');
  hint.className = 'sense-hint';
  hint.innerHTML = `<span class="alert-dot"></span> AMBER TAGS = ALERTS ORIGINATING AT THAT NODE ·
    CLICK A NODE FOR DISRUPTION DETAIL · HOVER FOR KPIS`;
  view.appendChild(hint);

  if (ctx.state.debugPopNode) setTimeout(() => graph.showPopover(ctx.state.debugPopNode), 600);

  return () => graph.destroy();
}
