import { useEffect, useMemo, useState } from "react";
import yaml from "js-yaml";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Factory,
  Play,
  Radar,
  Route,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import bauRaw from "../uncrustables_bau_graph_cost_enriched.yaml?raw";
import alertsRaw from "../uncrustables_events_alerts_overlay.yaml?raw";
import decisionRaw from "../uncrustables_intervention_decision_layer.yaml?raw";
import runtimeRaw from "../uncrustables_simulation_runtime_contract.yaml?raw";

type Kpi = {
  name: string;
  modeled_value: string | number | boolean;
  unit?: string;
  source_system?: string;
  source_events?: string[];
  calculation?: string;
};

type NodeRecord = {
  id: string;
  node_type: string;
  supply_chain_layer: string;
  material_family?: string;
  role?: string;
  kpis?: Kpi[];
};

type Relationship = {
  id: string;
  from: string;
  to: string;
  relationship_type: string;
  material?: string;
  modeled_weekly_flow_cases?: number;
  modeled_weekly_flow_sandwiches?: number;
  modeled_weekly_flow_lb?: number;
  modeled_weekly_flow_wrappers?: number;
  lead_time?: {
    modeled_mean_days?: number;
    modeled_p90_days?: number;
    source_systems?: string[];
  };
  cost?: Record<string, unknown>;
  mode?: string;
};

type EventAlert = {
  id: string;
  event_horizon: "long_term" | "tactical";
  event_type: string;
  status: string;
  business_question: string;
  signal_sources: { system: string; events: string[] }[];
  affected_model_objects: { nodes?: string[]; relationships?: string[] };
  overlay_patches?: {
    target_type: "node" | "relationship";
    target_id: string;
    metric?: string;
    path?: string;
    baseline_value?: number;
    scenario_value?: number;
  }[];
  scenario_assumptions?: Record<string, number | string>;
  estimated_no_action_impact: Record<string, number | string>;
  candidate_interventions: Intervention[];
  recommended_intervention_id: string;
  estimated_recommended_net_impact_usd?: number;
  simulation_instruction: string;
  trigger_window: {
    expected_start_in_days: number;
    expected_duration_days: number;
    planning_bucket: string;
  };
};

type Intervention = {
  id: string;
  action_type: string;
  description?: string;
  expected_effect?: string;
  incremental_cost_usd: number;
  projected_OTIF_recovery_pct?: number;
  projected_service_recovery_pct?: number;
  residual_risk?: string;
  risk?: string;
};

type DecisionLayer = {
  cost_rollup_model: {
    total_fulfillment_cost_formula: string;
    cost_components: { name: string; source_systems: string[]; calculation: string }[];
  };
  intervention_playbook: {
    event_type: string;
    candidate_interventions: {
      id: string;
      action_type: string;
      description: string;
      cost_components_triggered: string[];
      expected_kpi_effect?: Record<string, unknown>;
    }[];
  }[];
};

type Runtime = {
  simulation_runtime_contract: {
    runtime_steps: string[];
    recommended_outputs: Record<string, string[]>;
  };
};

type GraphPoint = NodeRecord & {
  x: number;
  y: number;
  label: string;
  health: number;
  scenarioHealth: number;
  source: string;
};

type Mode = "sense" | "simulate" | "decide" | "act";

const bau = yaml.load(bauRaw) as { nodes: NodeRecord[]; relationships: Relationship[] };
const alertOverlay = yaml.load(alertsRaw) as { events: EventAlert[] };
const decisionLayer = yaml.load(decisionRaw) as DecisionLayer;
const runtime = yaml.load(runtimeRaw) as Runtime;

const tabs: { id: Mode; label: string; icon: typeof Radar }[] = [
  { id: "sense", label: "Sense", icon: Radar },
  { id: "simulate", label: "Simulate", icon: Play },
  { id: "decide", label: "Decide", icon: ShieldCheck },
  { id: "act", label: "Act", icon: Bot },
];

const layerLabels: Record<string, string> = {
  raw_material_supplier: "Suppliers",
  packaging_supplier: "Suppliers",
  raw_material_inventory: "RM Inventory",
  packaging_inventory: "RM Inventory",
  secondary_processing: "Processing",
  manufacturing_plant: "Plants",
  finished_goods_inventory: "FG Inventory",
  cold_chain_distribution_center: "Cold Chain DC",
  retailer_distribution_center: "Retailer DC",
};

const layerOrder = [
  "raw_material_supplier",
  "packaging_supplier",
  "raw_material_inventory",
  "packaging_inventory",
  "secondary_processing",
  "manufacturing_plant",
  "finished_goods_inventory",
  "cold_chain_distribution_center",
  "retailer_distribution_center",
];

const activeDefault = alertOverlay.events.find((event) => event.status === "active_alert") ?? alertOverlay.events[0];

function titleize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bDc\b/g, "DC")
    .replace(/\bOtif\b/g, "OTIF")
    .replace(/\bUsd\b/g, "USD");
}

function compactLabel(id: string) {
  return titleize(
    id
      .replace(/^supplier_/, "")
      .replace(/^inventory_/, "")
      .replace(/^processing_/, "")
      .replace(/^plant_/, "")
      .replace(/^frozen_inventory_/, "FG ")
      .replace(/^cold_dc_/, "")
      .replace(/^retailer_dc_/, ""),
  );
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value > 9_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function getNumericImpact(event: EventAlert, key = "total_incremental_cost_usd") {
  const value = event.estimated_no_action_impact?.[key];
  return typeof value === "number" ? value : 0;
}

function getBauCost() {
  let weekly = 0;
  for (const rel of bau.relationships) {
    const flow =
      rel.modeled_weekly_flow_cases ??
      (rel.modeled_weekly_flow_sandwiches ? rel.modeled_weekly_flow_sandwiches / 48 : undefined) ??
      (rel.modeled_weekly_flow_lb ? rel.modeled_weekly_flow_lb / 36 : undefined) ??
      (rel.modeled_weekly_flow_wrappers ? rel.modeled_weekly_flow_wrappers / 48 : undefined) ??
      0;
    const costValue = Object.values(rel.cost ?? {}).find((candidate) => typeof candidate === "number") as number | undefined;
    weekly += flow * (costValue ?? 0.08);
  }
  const conversionAndMaterialProxy = bau.nodes.reduce((sum, node) => {
    const nodeCost = (node.kpis ?? [])
      .filter((kpi) => kpi.name.includes("cost") && typeof kpi.modeled_value === "number")
      .slice(0, 2)
      .reduce((inner, kpi) => inner + Number(kpi.modeled_value), 0);
    return sum + nodeCost * 11000;
  }, 0);
  return Math.round((weekly + conversionAndMaterialProxy) * 1.08);
}

function primarySource(node: NodeRecord) {
  const source = node.kpis?.find((kpi) => kpi.source_system)?.source_system;
  return source ? titleize(source) : "Operational system of record";
}

function nodeHealth(node: NodeRecord, event?: EventAlert, progress = 0) {
  const base = 88 - Math.min(18, (node.kpis?.length ?? 0) * 1.1);
  const affected = event?.affected_model_objects?.nodes?.includes(node.id);
  const patch = event?.overlay_patches?.find((item) => item.target_type === "node" && item.target_id === node.id);
  if (!affected) return Math.max(66, Math.round(base));
  const severity = patch && typeof patch.baseline_value === "number" && typeof patch.scenario_value === "number"
    ? Math.min(34, Math.abs(patch.scenario_value - patch.baseline_value) * 2.5)
    : 18;
  return Math.max(38, Math.round(base - severity * progress));
}

function getGraphPoints(event?: EventAlert, progress = 0) {
  const groups = new Map<string, NodeRecord[]>();
  for (const node of bau.nodes) {
    const label = layerLabels[node.supply_chain_layer] ? node.supply_chain_layer : node.node_type;
    groups.set(label, [...(groups.get(label) ?? []), node]);
  }

  const sortedLayers = [...groups.keys()].sort((a, b) => layerOrder.indexOf(a) - layerOrder.indexOf(b));
  return bau.nodes.map((node) => {
    const layer = layerLabels[node.supply_chain_layer] ? node.supply_chain_layer : node.node_type;
    const layerIndex = sortedLayers.indexOf(layer);
    const layerNodes = groups.get(layer) ?? [];
    const nodeIndex = layerNodes.findIndex((candidate) => candidate.id === node.id);
    const count = Math.max(1, layerNodes.length - 1);
    const y = 10 + (nodeIndex / count) * 78;
    return {
      ...node,
      x: 6 + (layerIndex / Math.max(1, sortedLayers.length - 1)) * 88,
      y,
      label: compactLabel(node.id),
      health: nodeHealth(node),
      scenarioHealth: nodeHealth(node, event, progress),
      source: primarySource(node),
    };
  });
}

function sortInterventions(event: EventAlert) {
  return [...event.candidate_interventions].sort((a, b) => a.incremental_cost_usd - b.incremental_cost_usd);
}

function findOriginNode(event: EventAlert) {
  const patchedNode = event.overlay_patches?.find((patch) => patch.target_type === "node")?.target_id;
  return patchedNode ?? event.affected_model_objects.nodes?.[0];
}

function AppGraph({
  mode,
  event,
  progress,
  selectedAlert,
  onSelectAlert,
}: {
  mode: Mode;
  event: EventAlert;
  progress: number;
  selectedAlert: boolean;
  onSelectAlert: () => void;
}) {
  const points = useMemo(() => getGraphPoints(event, mode === "sense" ? 0 : progress), [event, mode, progress]);
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const affectedNodes = new Set(event.affected_model_objects.nodes ?? []);
  const affectedEdges = new Set(event.affected_model_objects.relationships ?? []);
  const originNode = findOriginNode(event);
  const source = event.signal_sources[0];

  return (
    <section className="graph-panel">
      <div className="graph-header">
        <div>
          <p className="eyebrow">Uncrustables Supply Chain Mesh</p>
          <h1>Sense, Simulate, Decide and Act</h1>
        </div>
        <div className="metric-strip">
          <Metric label="BAU 1 Month" value={formatMoney(getBauCost() * 4.33)} />
          <Metric label="BAU 6 Month" value={formatMoney(getBauCost() * 26)} />
          <Metric label="Do Nothing" value={formatMoney(getBauCost() * 4.33 + getNumericImpact(event))} tone="warn" />
        </div>
      </div>

      <div className="graph-canvas">
        <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
          {bau.relationships.map((edge) => {
            const from = pointById.get(edge.from);
            const to = pointById.get(edge.to);
            if (!from || !to) return null;
            const isAffected = affectedEdges.has(edge.id);
            return (
              <path
                key={edge.id}
                d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`}
                className={isAffected && selectedAlert ? "edge affected" : "edge"}
              />
            );
          })}
        </svg>

        <div className="layer-labels">
          {[...new Set(points.map((point) => point.supply_chain_layer))].map((layer) => (
            <span key={layer}>{layerLabels[layer] ?? titleize(layer)}</span>
          ))}
        </div>

        {points.map((point) => {
          const affected = affectedNodes.has(point.id) && selectedAlert;
          const origin = point.id === originNode;
          const health = mode === "sense" ? point.health : point.scenarioHealth;
          return (
            <button
              key={point.id}
              className={`node ${affected ? "node-affected" : ""} ${origin && selectedAlert ? "node-origin" : ""}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-label={point.label}
            >
              <span className="node-ring" style={{ "--health": `${health}%` } as React.CSSProperties}>
                <span />
              </span>
              <span className="node-label">{point.label}</span>
              <span className="node-sub">{health}% health</span>
              <span className="node-tooltip">
                <strong>{point.label}</strong>
                <em>{titleize(point.role ?? point.node_type)}</em>
                <b>Most relevant source: {point.source}</b>
                {(point.kpis ?? []).slice(0, 7).map((kpi) => (
                  <span key={kpi.name}>
                    {titleize(kpi.name)}: {String(kpi.modeled_value)} {kpi.unit ? titleize(kpi.unit) : ""}
                  </span>
                ))}
              </span>
            </button>
          );
        })}

        <button className={`alert-card ${selectedAlert ? "selected" : ""}`} onClick={onSelectAlert}>
          <AlertTriangle size={16} />
          <span>
            <strong>{titleize(event.event_type)}</strong>
            <small>
              Starts in {event.trigger_window.expected_start_in_days} days · {formatMoney(getNumericImpact(event))} do-nothing
              risk
            </small>
          </span>
          <span className="alert-tooltip">
            <strong>Origin signal</strong>
            {source.system}: {source.events.map(titleize).join(", ")}
            <br />
            Click to highlight affected nodes and edges.
          </span>
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SimulationPanel({ event, progress }: { event: EventAlert; progress: number }) {
  const affectedCount = (event.affected_model_objects.nodes?.length ?? 0) + (event.affected_model_objects.relationships?.length ?? 0);
  return (
    <aside className="side-panel">
      <p className="eyebrow">Discrete Event Simulation</p>
      <h2>{progress < 1 ? "Scenario running" : "Projected impact locked"}</h2>
      <div className="progress-track">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="fact-grid">
        <Metric label="Affected Objects" value={String(affectedCount)} />
        <Metric label="Event Horizon" value={event.event_horizon === "tactical" ? "Daily" : "Weekly"} />
        <Metric label="Duration" value={`${event.trigger_window.expected_duration_days}d`} />
        <Metric label="No-Action Cost" value={formatMoney(getNumericImpact(event))} tone="warn" />
      </div>
      <div className="patch-list">
        {event.overlay_patches?.slice(0, 5).map((patch) => (
          <div key={`${patch.target_id}-${patch.metric ?? patch.path}`}>
            <span>{titleize(patch.target_id)}</span>
            <strong>{titleize(patch.metric ?? patch.path ?? "scenario metric")}</strong>
            <small>
              {String(patch.baseline_value)} <ArrowRight size={12} /> {String(patch.scenario_value)}
            </small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DecideView({ event }: { event: EventAlert }) {
  const ranked = sortInterventions(event);
  const doNothing = getNumericImpact(event);
  return (
    <section className="decision-panel">
      <div className="section-title">
        <p className="eyebrow">Simulation Output</p>
        <h2>Interventions ranked by cost to resolve</h2>
      </div>
      <div className="rank-grid">
        <article className="decision-card do-nothing">
          <CircleDollarSign size={20} />
          <span>Cost of doing nothing</span>
          <strong>{formatMoney(doNothing)}</strong>
          <p>{titleize(String(event.estimated_no_action_impact.service_risk ?? "service risk"))}</p>
        </article>
        {ranked.map((intervention, index) => (
          <article
            className={`decision-card ${intervention.id === event.recommended_intervention_id ? "recommended" : ""}`}
            key={intervention.id}
          >
            <span>Rank {index + 1}</span>
            <strong>{titleize(intervention.id)}</strong>
            <p>{titleize(intervention.expected_effect ?? intervention.action_type)}</p>
            <div className="card-row">
              <b>{formatMoney(intervention.incremental_cost_usd)}</b>
              <small>
                Avoids {formatMoney(Math.max(0, doNothing - intervention.incremental_cost_usd))}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActView({ event }: { event: EventAlert }) {
  const selected = event.candidate_interventions.find((item) => item.id === event.recommended_intervention_id) ?? sortInterventions(event)[0];
  const playbook = decisionLayer.intervention_playbook.find((item) => event.event_type.includes(item.event_type));
  const systems = [
    ...new Set([
      ...event.signal_sources.map((source) => source.system),
      ...(playbook?.candidate_interventions.find((item) => item.action_type === selected.action_type)?.cost_components_triggered ?? []),
    ]),
  ];
  return (
    <section className="act-panel">
      <div className="agent-node">
        <Bot size={30} />
        <span>AI Agent</span>
        <strong>{titleize(selected.id)}</strong>
      </div>
      <div className="agent-workflow">
        <h2>Technical automation plan</h2>
        <div className="workflow-list">
          <Workflow icon={Database} title="Query system signals" text={event.signal_sources.map((source) => titleize(source.system)).join(", ")} />
          <Workflow icon={Route} title="Resolve network objects" text={[...(event.affected_model_objects.nodes ?? []), ...(event.affected_model_objects.relationships ?? [])].map(titleize).join(", ")} />
          <Workflow icon={Zap} title="Apply intervention patch" text={titleize(selected.expected_effect ?? selected.action_type)} />
          <Workflow icon={CheckCircle2} title="Post action record" text={`Expected incremental cost ${formatMoney(selected.incremental_cost_usd)} and residual risk ${titleize(selected.residual_risk ?? selected.risk ?? "managed")}.`} />
        </div>
      </div>
      <div className="source-console">
        <h3>Source systems to query</h3>
        {systems.slice(0, 8).map((system) => (
          <span key={system}>{titleize(system)}</span>
        ))}
      </div>
    </section>
  );
}

function Workflow({ icon: Icon, title, text }: { icon: typeof Database; title: string; text: string }) {
  return (
    <div className="workflow-item">
      <Icon size={18} />
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </div>
  );
}

export function App() {
  const [mode, setMode] = useState<Mode>("sense");
  const [eventId, setEventId] = useState(activeDefault.id);
  const [selectedAlert, setSelectedAlert] = useState(false);
  const [progress, setProgress] = useState(0);
  const event = alertOverlay.events.find((item) => item.id === eventId) ?? activeDefault;

  useEffect(() => {
    if (mode === "sense") {
      setProgress(0);
      return;
    }
    setProgress(0);
    const startedAt = performance.now();
    const duration = mode === "simulate" ? 5400 : 2200;
    let frame = 0;
    const tick = (now: number) => {
      setProgress(Math.min(1, (now - startedAt) / duration));
      if (now - startedAt < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, eventId]);

  return (
    <main>
      <nav className="topbar">
        <div className="brand">
          <Factory size={18} />
          <span>Smucker's Uncrustables Supply Chain</span>
        </div>
        <div className="tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <select value={eventId} onChange={(change) => setEventId(change.target.value)}>
          {alertOverlay.events.map((item) => (
            <option key={item.id} value={item.id}>
              {titleize(item.event_type)}
            </option>
          ))}
        </select>
      </nav>

      <div className="workspace">
        <AppGraph
          mode={mode}
          event={event}
          progress={progress}
          selectedAlert={selectedAlert || mode !== "sense"}
          onSelectAlert={() => setSelectedAlert((value) => !value)}
        />
        {mode === "sense" && (
          <aside className="side-panel">
            <p className="eyebrow">Alert Feed</p>
            <h2>Origin-first alerting</h2>
            <p className="muted">
              Alerts are disruption signals, not node health. Click the alert on the mesh to show where the signal originates and which
              nodes or edges could be affected before simulation.
            </p>
            <div className="event-list">
              {alertOverlay.events.map((item) => (
                <button key={item.id} className={item.id === event.id ? "active" : ""} onClick={() => setEventId(item.id)}>
                  <Truck size={15} />
                  <span>{titleize(item.event_type)}</span>
                  <small>{item.trigger_window.expected_start_in_days}d</small>
                </button>
              ))}
            </div>
          </aside>
        )}
        {mode === "simulate" && <SimulationPanel event={event} progress={progress} />}
      </div>

      {mode === "decide" && <DecideView event={event} />}
      {mode === "act" && <ActView event={event} />}

      <footer>
        Runtime: {runtime.simulation_runtime_contract.runtime_steps.map(titleize).slice(0, 4).join(" · ")} · Cost rollup uses{" "}
        {decisionLayer.cost_rollup_model.cost_components.length} components from the decision layer.
      </footer>
    </main>
  );
}
