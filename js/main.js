// App shell: tab routing + header BAU cost cards (1-month / 6-month).
import { renderSense } from './tabs/sense.js';
import { renderSimulate } from './tabs/simulate.js';
import { renderIntervene } from './tabs/intervene.js';
import { renderAct } from './tabs/act.js';
import { EVENTS, DAYS_PER_MONTH } from './model.js';
import { fillCostCard, attachBreakdown } from './costcards.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const costCards = document.getElementById('cost-cards');
document.getElementById('alerts-count').textContent = EVENTS.length;

/* header cards: monthly + 6-month BAU cost to fulfill, hover = full breakdown */
const ONE_MO_WEEKS = DAYS_PER_MONTH / 7;
const card1 = document.getElementById('card-1mo');
const card6 = document.getElementById('card-6mo');
fillCostCard(card1, '1-MO BAU', ONE_MO_WEEKS);
fillCostCard(card6, '6-MO BAU', ONE_MO_WEEKS * 6);
attachBreakdown(card1, '1-MONTH BAU', ONE_MO_WEEKS);
attachBreakdown(card6, '6-MONTH BAU', ONE_MO_WEEKS * 6);

const state = { selectedEventId: null, selectedInterventionId: null };
let destroyCurrent = null;
let activeTab = null;

const ctx = {
  state,
  setHeaderCards(show) { costCards.style.display = show ? 'flex' : 'none'; },
  gotoTab(tab, opts = {}) {
    if (opts.eventId !== undefined) state.selectedEventId = opts.eventId;
    if (opts.interventionId !== undefined) state.selectedInterventionId = opts.interventionId;
    switchTab(tab);
  },
};

const TABS = { sense: renderSense, simulate: renderSimulate, intervene: renderIntervene, act: renderAct };

function switchTab(name) {
  if (!TABS[name]) return;
  if (destroyCurrent) { try { destroyCurrent(); } catch { /* noop */ } }
  view.innerHTML = '';
  activeTab = name;
  ctx.setHeaderCards(true);
  for (const b of tabbar.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === name);
  destroyCurrent = TABS[name](view, ctx) || null;
}

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b && b.dataset.tab !== activeTab) switchTab(b.dataset.tab);
});
document.getElementById('alerts-pill').addEventListener('click', () => switchTab('sense'));

/* deep-linking / verification: ?tab=simulate&event=TAC_001_...&pop=node_id&deploy=1 */
const params = new URLSearchParams(location.search);
if (params.get('event')) state.selectedEventId = params.get('event');
if (params.get('pop')) state.debugPopNode = params.get('pop');
if (params.get('deploy')) state.autoDeploy = true;
switchTab(params.get('tab') || 'sense');
