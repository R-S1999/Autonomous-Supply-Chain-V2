# Uncrustables Supply Mesh — Sense · Simulate · Intervene · Act

Autonomous supply-chain demo for the J.M. Smucker **Uncrustables** frozen-sandwich network.
Everything on screen is loaded from the four YAML model files in this repo (compiled to
`js/data.generated.js` — no runtime YAML parsing, no framework, no build step).

## Tabs

| Tab | What it does |
| --- | --- |
| **SENSE** | Live BAU discrete-event view of the 29-node mesh. Hover any node for **all of its KPIs + the most relevant source system**. Cost-to-fulfill card shows **/wk, 1-month and 6-month** BAU fulfillment cost across the 15 decision-layer cost components. The alert feed shows the 6 events from the overlay: **hover** an alert for its information sources (signal systems + events), **click** it to trace the node/lanes the alert **originates** from — node health is deliberately untouched (health ≠ alerts; impact is unknown until simulated). |
| **SIMULATE** | Copies the BAU graph, applies the selected alert's overlay patches, and plays the disruption DES on entry: node health degrades (green → amber → red) from each node's critical metrics, affected lanes slow, and the **cost of doing nothing** accrues to the YAML's estimated no-action impact. |
| **INTERVENE** | Every simulated intervention, grouped per alert, **ranked by cost to execute**, next to the **cost of doing nothing**, avoided cost, projected service recovery and residual risk. Recommended option per the decision-layer ranking rules. |
| **ACT** | Autonomous intervention agent. Pick alert + intervention (recommended pre-selected), paste an OpenAI API key, deploy. The agent streams **technical execution steps** — which source system it queries (ERP/TMS/WMS/MES/APS/SRM/EDI from the YAML), the exact transaction/API/EDI doc, and the payload — then re-verifies via the sim. Without a key it runs a deterministic scripted executor built from the same source-system model. |

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
