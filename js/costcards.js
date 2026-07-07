// BAU cost-to-fulfill cards (1-month / 6-month) with a hover breakdown that
// sums every decision-layer cost component to the total.
import { bauWeeklyCost, money, pretty, COST_COMPONENT_COUNT } from './model.js';

const BAU = bauWeeklyCost();
export const BAU_WEEKLY = BAU.total;

export function fillCostCard(el, label, weeks) {
  el.innerHTML = `
    <div class="cost-title">COST TO FULFILL · ${label}</div>
    <div class="cost-main"><span>${money(BAU.total * weeks)}</span></div>
    <div class="cost-sub">${COST_COMPONENT_COUNT} components · hover for breakdown</div>`;
}

export function attachBreakdown(el, label, weeks) {
  const tip = document.createElement('div');
  tip.className = 'cost-breakdown hidden';
  tip.innerHTML = `
    <div class="cb-title">${label} · ALL ${COST_COMPONENT_COUNT} COST COMPONENTS</div>
    ${Object.entries(BAU.components).map(([k, v]) =>
      `<div class="cb-row"><span>${pretty(k)}</span><b>${money(v * weeks)}</b></div>`).join('')}
    <div class="cb-row total"><span>TOTAL COST TO FULFILL</span><b>${money(BAU.total * weeks)}</b></div>`;
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
