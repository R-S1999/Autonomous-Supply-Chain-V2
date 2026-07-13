// App shell: tab routing. Cost cards live inside the Sense/Simulate screens
// (right rail), computed by the DES engine.
import { renderSense } from './tabs/sense.js?v=sensefix';
import { renderSimulate } from './tabs/simulate.js?v=completiongate';
import { renderIntervene } from './tabs/intervene.js?v=actualsim';
import { renderAct } from './tabs/act.js?v=actualsim';
import { EVENTS } from './model.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
document.getElementById('alerts-count').textContent = EVENTS.length;

const state = { selectedEventId: null, selectedInterventionId: null };
let destroyCurrent = null;
let activeTab = null;

const ctx = {
  state,
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
