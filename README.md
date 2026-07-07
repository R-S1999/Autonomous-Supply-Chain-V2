# Uncrustables Supply Mesh — Sense · Simulate · Intervene · Act

Autonomous supply-chain demo for the J.M. Smucker **Uncrustables** frozen-sandwich network.
Everything on screen is loaded from the four YAML model files in this repo (compiled to
`js/data.generated.js` — no runtime YAML parsing, no framework, no build step).

## Tabs

| Tab | What it does |
| --- | --- |
| **SENSE** | Current-state view of the 29-node mesh — no simulation runs here. Node health is live BAU state; goods movement is visible as flow particles that **light up the receiving node on arrival**. Alerts sit **on the nodes they originate from** as amber code tags. **Hover** a node for all its KPIs + the most relevant source system; **click** it to pin a popover with the disruption detail: time till it hits, event window, signal sources, business question, and a SIMULATE button. Health ≠ alerts: impact is unknown until simulated. The header shows **1-month and 6-month BAU cost to fulfill**; hovering either card breaks the total into all 15 decision-layer cost components. |
| **SIMULATE** | Models **one disruption at a time**. Left rail: all 6 alerts stacked, never overlapping the mesh. The overlay patches apply to a copy of the BAU graph and the disruption DES plays fast: node health degrades green → amber → red, affected lanes slow, and the **cost of doing nothing** accrues to the YAML's estimated no-action impact. Right rail: the 1-month + 6-month BAU cost cards (hover = component breakdown) stacked above the do-nothing impact card. |
| **INTERVENE** | Only the disruption being modeled: its candidate interventions **ranked by cost to execute** against the **cost of doing nothing**, with avoided cost, service-recovery bars, residual risk, and the YAML's RECOMMENDED badge. AUTOMATE jumps to Act. |
| **ACT** | Autonomous intervention agent with a full-height console. Pick alert + intervention (recommended pre-selected) and deploy: the agent streams **technical execution steps** — which source system it queries (ERP/TMS/WMS/MES/APS/SRM/EDI, from the YAML), the exact transaction/API/EDI doc, and the payload — then re-verifies via the sim. The OpenAI key comes from the Vercel env (`OPENAI_API_KEY`); without it the agent falls back to a deterministic scripted executor built from the same source-system data. |

## Model files

- `uncrustables_bau_graph_cost_enriched.yaml` — 29 nodes / 27 lanes, KPIs with source systems + costs
- `uncrustables_events_alerts_overlay.yaml` — 6 events (3 tactical, 3 long-term) with overlay patches
- `uncrustables_intervention_decision_layer.yaml` — 15-component cost rollup + intervention playbook
- `uncrustables_simulation_runtime_contract.yaml` — runtime sequence the sim engine follows

## Run locally

```bash
npm install        # only needed to regenerate data
npm run gen        # YAML → js/data.generated.js
npm run dev        # serves on http://localhost:5180
```

## Deploy

Push to GitHub → import in Vercel → deploy (zero config: static root + `api/act.js`
serverless function). Optionally set `OPENAI_API_KEY` in Vercel env to avoid pasting
a key in the UI.
