// App shell: tab routing. Cost cards live inside the Sense/Simulate screens
// (right rail), computed by the DES engine.
import { renderSense } from './tabs/sense.js?v=experience27';
import { renderSimulate } from './tabs/simulate.js?v=experience27';
import { renderIntervene } from './tabs/intervene.js?v=experience23';
import { renderAct } from './tabs/act.js?v=experience27';
import { renderSummary } from './tabs/summary.js?v=experience21';
import { EVENTS } from './model.js?v=experience23';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
document.getElementById('alerts-count').textContent = EVENTS.length;

let savedInterventionId = null;
try { savedInterventionId = sessionStorage.getItem('selectedInterventionId'); } catch { /* storage may be disabled */ }
const state = {
  selectedEventId: null,
  selectedInterventionId: savedInterventionId,
  autoRunSimulation: false,
};
let destroyCurrent = null;
let activeTab = null;

const ctx = {
  state,
  selectIntervention(interventionId) {
    state.selectedInterventionId = interventionId;
    try {
      if (interventionId) sessionStorage.setItem('selectedInterventionId', interventionId);
      else sessionStorage.removeItem('selectedInterventionId');
    } catch { /* storage may be disabled */ }
  },
  gotoTab(tab, opts = {}) {
    if (opts.eventId !== undefined) state.selectedEventId = opts.eventId;
    if (opts.interventionId !== undefined) this.selectIntervention(opts.interventionId);
    if (opts.autoRun !== undefined) state.autoRunSimulation = Boolean(opts.autoRun);
    switchTab(tab);
  },
};

const TABS = {
  sense: renderSense,
  simulate: renderSimulate,
  intervene: renderIntervene,
  act: renderAct,
  summary: renderSummary,
};

function switchTab(name) {
  if (!TABS[name]) return;
  if (destroyCurrent) { try { destroyCurrent(); } catch { /* noop */ } }
  view.innerHTML = '';
  activeTab = name;
  for (const b of tabbar.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === name);
  destroyCurrent = TABS[name](view, ctx) || null;
}

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (b.dataset.tab !== activeTab || b.dataset.tab === 'sense') switchTab(b.dataset.tab);
});
document.getElementById('alerts-pill').addEventListener('click', () => {
  switchTab('sense');
});

/* deep-linking / verification: ?tab=simulate&event=TAC_001_...&pop=node_id&deploy=1 */
const params = new URLSearchParams(location.search);
if (params.get('event')) state.selectedEventId = params.get('event');
if (params.get('pop')) state.debugPopNode = params.get('pop');
if (params.get('deploy')) state.autoDeploy = true;
switchTab(params.get('tab') || 'sense');
