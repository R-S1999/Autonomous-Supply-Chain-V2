// BAU cost-to-fulfill cards (1-month / 6-month) computed by the DES engine.
// Hover breakdown = every decision-layer cost bucket accumulated by the run.
import { money, pretty, COST_COMPONENT_COUNT } from './model.js';
import { runBau } from './engine.js';

export function bauCards() {
  const bau = runBau();
  return {
    oneMo: bau.frames[29],
    sixMo: bau.frames[bau.frames.length - 1],
  };
}

export function fillCostCard(el, label, frame) {
  el.innerHTML = `
    <div class="cost-title">COST TO FULFILL · ${label}</div>
    <div class="cost-main"><span>${money(frame.cumTotal)}</span></div>
    <div class="cost-sub">DES-computed · ${COST_COMPONENT_COUNT} components · hover for breakdown</div>`;
}

export function attachBreakdown(el, label, frame) {
  const tip = document.createElement('div');
  tip.className = 'cost-breakdown hidden';
  tip.innerHTML = `
    <div class="cb-title">${label} · SIMULATED COST BUCKETS</div>
    ${Object.entries(frame.cum).map(([k, v]) =>
      `<div class="cb-row"><span>${pretty(k)}</span><b>${money(v)}</b></div>`).join('')}
    <div class="cb-row total"><span>TOTAL COST TO FULFILL</span><b>${money(frame.cumTotal)}</b></div>`;
  document.body.appendChild(tip);

  el.addEventListener('mouseenter', () => {
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const w = 272;
    tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 12))}px`;
    const below = r.bottom + 8;
    tip.style.top = '0px';
    const h = tip.offsetHeight;
    tip.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below}px`;
  });
  el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  return () => tip.remove();
}
