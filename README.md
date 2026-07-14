# Longmont Autonomous Supply Chain

A focused browser simulation of a sugar-and-oils inbound delay propagating through the J.M. Smucker Uncrustables Longmont chain.

## Network

The active model retains the complete upstream ingredient network: flour, peanuts, peanut butter, fruit base, fruit spread, sugar, oils and packaging. Every required input converges on Longmont, the only sandwich-processing plant. Finished goods then flow through Longmont inventory and West Cold DC to Costco, Sam's Club and Other Retailers.

## Experience

| Tab | Purpose |
| --- | --- |
| **Sense** | Shows the focused chain, its live BAU state, and the single inbound-delay alert. |
| **Simulate** | Runs a deterministic 30-day inventory and production simulation for one delayed oils-and-fats tanker, calculating downtime, retailer shortages, OTIF penalties and lost margin. |
| **Decide** | Compares execution cost, avoided cost, ROI, and store service recovery for each solution. |
| **Act** | Uses an AI Agent to generate intervention-specific enterprise-system updates, then runs the selected response as a connected BPM-style workflow. |

Retail impact includes distinct Costco, Sam's Club and Other Retailers fulfillment, OTIF penalties and lost margin.

## Data and simulation

- `uncrustables_longmont_scenario.yaml` defines the focused network, alert, assumptions, and interventions.
- `scripts/build-data.mjs` filters the enriched BAU model and generates `js/data.generated.js`.
- `js/engine.js` runs BAU, do-nothing, and intervention scenarios on aligned horizons.

## Run locally

```bash
npm install
npm run gen
npm run dev
```

The deployed `/api/act` route reads `OPENAI_API_KEY` server-side. If that route is unavailable during local static preview, Act uses its intervention-specific scripted messages so the workflow remains runnable.
