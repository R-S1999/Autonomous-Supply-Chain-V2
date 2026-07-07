// SVG supply-mesh renderer: tier columns, teal ring nodes, dashed bezier lanes,
// animated flow particles, KPI hover popovers, alert-origin highlighting.
import { BAU_GRAPH, } from './data.generated.js';
import {
  COLUMNS, NODE_META, nodesById, columnOf, primaryKpiOf, nodeSubLabel, nodeSource,
  pretty, fmtKpiValue, kpiOf,
} from './model.js';

const VB_W = 1560, VB_H = 880;
const COL_X = [95, 318, 516, 720, 922, 1112, 1350];
const COL_R = [15, 19, 22, 26, 19, 22, 23];
const BOUNDARY_X = 1237;
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ---- layout ------------------------------------------------------- */
export function computeLayout() {
  const byCol = COLUMNS.map(() => []);
  for (const node of BAU_GRAPH.nodes) {
    const c = columnOf(node);
    if (c >= 0) byCol[c].push(node);
  }
  const pos = {};
  const yTop = 118, yBottom = 838;
  byCol.forEach((nodes, c) => {
    nodes.sort((a, b) => (NODE_META[a.id]?.order ?? 99) - (NODE_META[b.id]?.order ?? 99));
    const step = (yBottom - yTop) / nodes.length;
    nodes.forEach((node, i) => {
      pos[node.id] = { x: COL_X[c], y: yTop + step * (i + 0.5), r: COL_R[c], col: c };
    });
  });
  return pos;
}

function edgePath(a, b) {
  const x1 = a.x + a.r + 5, y1 = a.y, x2 = b.x - b.r - 7, y2 = b.y;
  const dx = (x2 - x1) * 0.46;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function flowMagnitude(rel) {
  return rel.modeled_weekly_flow_lb ?? rel.modeled_weekly_flow_sandwiches / 12 ??
    rel.modeled_weekly_flow_units / 20 ?? rel.modeled_weekly_flow_cases * 4 ??
    rel.modeled_weekly_flow_cartons / 5 ?? rel.modeled_weekly_flow_wrappers / 20 ?? 100000;
}

/* ==================================================================== */
export function renderGraph(container, opts = {}) {
  container.classList.add('graph-wrap');
  const svg = svgEl('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, class: 'mesh', preserveAspectRatio: 'xMidYMid meet' });
  container.appendChild(svg);

  const pos = computeLayout();
  const gEdges = svgEl('g'), gParticles = svgEl('g'), gNodes = svgEl('g'), gTop = svgEl('g');
  svg.append(gEdges, gParticles, gNodes, gTop);

  /* column headers */
  COLUMNS.forEach((col, i) => {
    const t = svgEl('text', { x: COL_X[i], y: 58, class: 'col-title', 'text-anchor': 'middle' });
    t.textContent = col.title;
    const u = svgEl('rect', { x: COL_X[i] - 14, y: 66, width: 28, height: 3, rx: 1.5, class: 'col-underline' });
    gTop.append(t, u);
  });

  /* retailer boundary */
  {
    const line = svgEl('line', { x1: BOUNDARY_X, y1: 92, x2: BOUNDARY_X, y2: 848, class: 'boundary-line' });
    const bg = svgEl('rect', { x: BOUNDARY_X - 10, y: 100, width: 20, height: 172, rx: 4, class: 'boundary-tag' });
    const txt = svgEl('text', {
      x: BOUNDARY_X, y: 186, class: 'boundary-text', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      transform: `rotate(90 ${BOUNDARY_X} 186)`,
    });
    txt.textContent = 'RETAILER BOUNDARY';
    gTop.append(line, bg, txt);
  }

  /* edges */
  const edgeEls = {}, particleSets = {};
  for (const rel of BAU_GRAPH.relationships) {
    const a = pos[rel.from], b = pos[rel.to];
    if (!a || !b) continue;
    const downstream = b.col >= 4;
    const path = svgEl('path', { d: edgePath(a, b), class: `lane ${downstream ? 'lane-down' : 'lane-up'}`, 'data-id': rel.id });
    gEdges.appendChild(path);
    edgeEls[rel.id] = path;

    const mag = flowMagnitude(rel) || 100000;
    const n = mag > 600000 ? 3 : mag > 200000 ? 2 : 1;
    const len = path.getTotalLength();
    const dots = [];
    for (let i = 0; i < n; i++) {
      const dot = svgEl('circle', { r: 2.4, class: `flow-dot ${downstream ? 'dot-down' : 'dot-up'}` });
      gParticles.appendChild(dot);
      dots.push({ el: dot, phase: (i + Math.random() * 0.6) / n });
    }
    particleSets[rel.id] = { path, len, dots, state: 'flow' };
  }

  /* nodes */
  const nodeEls = {};
  for (const node of BAU_GRAPH.nodes) {
    const p = pos[node.id];
    if (!p) continue;
    const g = svgEl('g', { class: 'node h-good', 'data-id': node.id, transform: `translate(${p.x} ${p.y})` });
    const halo = svgEl('circle', { r: p.r + 7, class: 'node-halo' });
    const alertRing = svgEl('circle', { r: p.r + 11, class: 'node-alert-ring' });
    const ring = svgEl('circle', { r: p.r, class: 'node-ring' });
    const dot = svgEl('circle', { r: Math.max(3.2, p.r / 4.6), class: 'node-dot' });
    const name = svgEl('text', { y: p.r + 15, class: 'node-name', 'text-anchor': 'middle' });
    name.textContent = NODE_META[node.id]?.name ?? node.id;
    const sub = svgEl('text', { y: p.r + 28, class: 'node-sub', 'text-anchor': 'middle' });
    sub.textContent = nodeSubLabel(node);
    const originTag = svgEl('text', { y: -(p.r + 12), class: 'origin-tag', 'text-anchor': 'middle' });
    originTag.textContent = '⚠ ORIGIN';
    g.append(alertRing, halo, ring, dot, name, sub, originTag);
    gNodes.appendChild(g);
    nodeEls[node.id] = g;
  }

  /* agent badge (Act tab) */
  const agentBadge = svgEl('g', { class: 'agent-badge hidden' });
  const abBg = svgEl('rect', { x: -34, y: -14, width: 68, height: 20, rx: 10, class: 'agent-badge-bg' });
  const abDot = svgEl('circle', { cx: -22, cy: -4, r: 3.4, class: 'agent-badge-dot' });
  const abTx = svgEl('text', { x: 6, y: -0.5, class: 'agent-badge-text', 'text-anchor': 'middle' });
  abTx.textContent = 'AGENT';
  agentBadge.append(abBg, abDot, abTx);
  gTop.appendChild(agentBadge);

  /* ---- popover ----------------------------------------------------- */
  const pop = document.createElement('div');
  pop.className = 'kpi-pop hidden';
  container.appendChild(pop);
  let currentFrame = null;
  let hideTimer = null;

  function showPopover(nodeId) {
    const node = nodesById[nodeId];
    const meta = NODE_META[nodeId];
    const overrides = currentFrame?.valueOverrides?.[nodeId] || {};
    const health = currentFrame?.nodeHealth?.[nodeId] || 'good';
    const kpis = node.kpis || [];
    const extraMetrics = Object.keys(overrides).filter(m => !kpis.some(k => k.name === m));
    pop.innerHTML = `
      <div class="pop-head">
        <div>
          <div class="pop-title">${meta?.name ?? node.id}</div>
          <div class="pop-role">${pretty(node.role)}</div>
        </div>
        <span class="chip chip-${health}">${health === 'good' ? 'HEALTHY' : health.toUpperCase()}</span>
      </div>
      <div class="pop-kpis">
        ${kpis.map(k => {
          const ov = overrides[k.name];
          const base = fmtKpiValue(k);
          const now = ov != null ? fmtKpiValue({ ...k, modeled_value: ov }) : null;
          return `<div class="pop-kpi">
            <span class="pop-kpi-name">${pretty(k.name)}</span>
            <span class="pop-kpi-val ${ov != null ? 'overridden' : ''}">
              ${ov != null ? `<s>${base}</s> → ${now}` : base}
            </span>
          </div>`;
        }).join('')}
        ${extraMetrics.map(m => `<div class="pop-kpi">
            <span class="pop-kpi-name">${pretty(m)}</span>
            <span class="pop-kpi-val overridden">${Math.round(overrides[m] * 10) / 10}</span>
          </div>`).join('')}
      </div>
      <div class="pop-src"><span>SOURCE</span>${pretty(nodeSource(node))}</div>`;
    pop.classList.remove('hidden');

    const wrapR = container.getBoundingClientRect();
    const nodeR = nodeEls[nodeId].querySelector('.node-ring').getBoundingClientRect();
    const popW = 320;
    let left = nodeR.right - wrapR.left + 14;
    if (left + popW > wrapR.width - 8) left = nodeR.left - wrapR.left - popW - 14;
    let top = nodeR.top - wrapR.top - 20;
    pop.style.left = `${Math.max(6, left)}px`;
    pop.style.top = '0px';
    const h = pop.offsetHeight;
    top = Math.max(6, Math.min(top, wrapR.height - h - 10));
    pop.style.top = `${top}px`;
  }
  function hidePopover() { pop.classList.add('hidden'); }

  for (const [id, g] of Object.entries(nodeEls)) {
    g.addEventListener('mouseenter', () => { clearTimeout(hideTimer); showPopover(id); });
    g.addEventListener('mouseleave', () => { hideTimer = setTimeout(hidePopover, 140); });
    if (opts.onNodeClick) g.addEventListener('click', () => opts.onNodeClick(id));
  }

  /* ---- particle animation ------------------------------------------ */
  let raf = null, last = performance.now(), t0 = 0;
  const SPEED = { flow: 0.055, disrupted: 0.018, watch: 0.055 };
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    t0 += dt / 1000;
    for (const ps of Object.values(particleSets)) {
      const sp = SPEED[ps.state] ?? SPEED.flow;
      for (const d of ps.dots) {
        d.phase = (d.phase + sp * dt / 1000) % 1;
        const pt = ps.path.getPointAtLength(d.phase * ps.len);
        d.el.setAttribute('cx', pt.x);
        d.el.setAttribute('cy', pt.y);
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  /* ---- public api --------------------------------------------------- */
  const api = {
    setFrame(frame) {
      currentFrame = frame;
      for (const [id, g] of Object.entries(nodeEls)) {
        const h = frame?.nodeHealth?.[id] || 'good';
        g.classList.remove('h-good', 'h-amber', 'h-red');
        g.classList.add(`h-${h}`);
      }
      for (const [id, ps] of Object.entries(particleSets)) {
        const st = frame?.edgeStates?.[id] || 'flow';
        ps.state = st;
        edgeEls[id].classList.toggle('lane-disrupted', st === 'disrupted');
        edgeEls[id].classList.toggle('lane-watch', st === 'watch');
        for (const d of ps.dots) d.el.classList.toggle('dot-disrupted', st === 'disrupted');
      }
    },
    highlightAlert(event, originIds = []) {
      const affN = new Set(event?.affected_model_objects?.nodes || []);
      const affE = new Set(event?.affected_model_objects?.relationships || []);
      const on = !!event;
      for (const [id, g] of Object.entries(nodeEls)) {
        g.classList.toggle('dimmed', on && !affN.has(id));
        g.classList.toggle('alert-linked', on && affN.has(id));
        g.classList.toggle('alert-origin', on && originIds.includes(id));
      }
      for (const [id, el] of Object.entries(edgeEls)) {
        el.classList.toggle('dimmed', on && !affE.has(id));
        el.classList.toggle('lane-alert', on && affE.has(id));
        const ps = particleSets[id];
        if (ps) for (const d of ps.dots) d.el.classList.toggle('dimmed', on && !affE.has(id));
      }
    },
    setAgentBadge(nodeId) {
      if (!nodeId || !pos[nodeId]) { agentBadge.classList.add('hidden'); return; }
      const p = pos[nodeId];
      agentBadge.setAttribute('transform', `translate(${p.x} ${p.y - p.r - 34})`);
      agentBadge.classList.remove('hidden');
    },
    pulseNode(nodeId) {
      const g = nodeEls[nodeId];
      if (!g) return;
      g.classList.remove('agent-pulse');
      void g.getBBox; // reflow-ish; class re-add restarts animation
      requestAnimationFrame(() => g.classList.add('agent-pulse'));
      setTimeout(() => g.classList.remove('agent-pulse'), 1600);
    },
    showPopover,
    destroy() { cancelAnimationFrame(raf); container.innerHTML = ''; container.classList.remove('graph-wrap'); },
  };
  api.setFrame(null);
  return api;
}
