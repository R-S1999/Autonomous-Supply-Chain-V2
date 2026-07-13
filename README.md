# Longmont Autonomous Supply Chain

A focused browser simulation of a sugar-and-oils inbound delay propagating through the J.M. Smucker Uncrustables Longmont chain.

## Network

The active model contains only the relevant path: sugar and oils suppliers → Sugar & Oils inventory → fruit-spread processing → Longmont → Longmont finished goods → West Cold DC → Grocery/Mass retailer DC → grocery store.

## Experience

| Tab | Purpose |
| --- | --- |
| **Sense** | Shows the focused chain, its live BAU state, and the single inbound-delay alert. |
| **Simulate** | Plays the 30-day disruption through to the store, then calculates the cost of doing nothing and reveals three possible solutions. |
| **Decide** | Compares execution cost, avoided cost, ROI, and store service recovery for each solution. |
| **Act** | Runs the selected response as a connected BPM-style workflow with plain-language updates at each supply-chain node. |

Retail impact includes OTIF penalties and lost margin for unfulfilled store demand.

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
