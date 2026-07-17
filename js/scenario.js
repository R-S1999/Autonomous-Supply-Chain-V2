import { kNum } from './model.js?v=experience5';

function metricUnit(metric) {
  if (metric.includes('days_of_cover')) return 'days';
  if (metric.includes('fill_rate_pct')) return 'percent';
  return 'number';
}

function lowPoint(run, id, metric) {
  let low = { value: Infinity, day: 0 };
  for (const frame of run.frames) {
    const value = frame.valueOverrides?.[id]?.[metric];
    if (Number.isFinite(value) && value < low.value) low = { value, day: frame.t + 1 };
  }
  return Number.isFinite(low.value) ? low : null;
}

function summaryLabel(metric, point) {
  if (!point) return '';
  const unit = metricUnit(metric);
  if (unit === 'days') return `${point.value}d low`;
  if (unit === 'percent') return `${point.value}% low`;
  if (metric.includes('sandwiches')) return `${kNum(point.value)} sandwiches/wk low`;
  if (metric.includes('output_lb')) return `${kNum(point.value)} lb/wk low`;
  return `${kNum(point.value)} low`;
}

function nodeCostDelta(fromRun, toRun, ids, total) {
  return Object.fromEntries(ids.map(id => {
    const fromComponents = fromRun.nodeCostComponents?.[id] || {};
    const toComponents = toRun.nodeCostComponents?.[id] || {};
    const buckets = new Set([...Object.keys(fromComponents), ...Object.keys(toComponents)]);
    const components = [...buckets].map(key => ({
      key,
      value: (toComponents[key] || 0) - (fromComponents[key] || 0),
    })).filter(x => Math.abs(x.value) >= .5)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 3);
    return [id, {
      cost: (toRun.nodeCosts?.[id] || 0) - (fromRun.nodeCosts?.[id] || 0),
      total,
      components,
    }];
  }));
}

export function disruptionSummary(bau, run, event) {
  const ids = event.affected_model_objects?.nodes || [];
  const compare = {}, valueOverrides = {}, nodeSummaryLabels = {}, nodeHealth = {};
  for (const id of ids) {
    const metrics = new Set(run.frames.flatMap(frame => Object.keys(frame.valueOverrides?.[id] || {})));
    for (const metric of metrics) {
      const low = lowPoint(run, id, metric);
      if (!low) continue;
      const normal = bau.frames[0].valueOverrides?.[id]?.[metric] ?? low.value;
      (compare[id] ||= {})[metric] = {
        bau: normal, worst: low.value, day: low.day, unit: metricUnit(metric),
        tag: `LOW · DAY ${low.day}`,
      };
      (valueOverrides[id] ||= {})[metric] = low.value;
      nodeSummaryLabels[id] = summaryLabel(metric, low);
    }
    nodeHealth[id] = 'red';
  }
  nodeSummaryLabels.supplier_oils_fats_regional = '5-day outbound delay';
  const edgeStates = Object.fromEntries((event.affected_model_objects?.relationships || []).map(id => [id, 'disrupted']));
  const bau30 = bau.frames[29];
  const total = run.total - bau30.cumTotal;
  return {
    compare,
    nodeCosts: nodeCostDelta(bau30, run, ids, total),
    frame: { nodeHealth, edgeStates, valueOverrides, nodeSummaryLabels },
    total,
  };
}

export function recoverySummary(noAction, selected, event) {
  const ids = event.affected_model_objects?.nodes || [];
  const compare = {}, valueOverrides = {}, nodeSummaryLabels = {};
  for (const id of ids) {
    const metrics = new Set([
      ...noAction.frames.flatMap(frame => Object.keys(frame.valueOverrides?.[id] || {})),
      ...selected.frames.flatMap(frame => Object.keys(frame.valueOverrides?.[id] || {})),
    ]);
    for (const metric of metrics) {
      const before = lowPoint(noAction, id, metric);
      const after = lowPoint(selected, id, metric);
      if (!before || !after || before.value === after.value) continue;
      (compare[id] ||= {})[metric] = {
        bau: before.value, worst: after.value, day: after.day, unit: metricUnit(metric),
        tag: `RECOVERED · DAY ${after.day}`,
      };
      (valueOverrides[id] ||= {})[metric] = after.value;
      nodeSummaryLabels[id] = metricUnit(metric) === 'percent'
        ? `${after.value}% recovered`
        : summaryLabel(metric, after).replace(' low', ' recovered');
    }
  }
  const last = selected.frames.at(-1);
  const total = selected.total - noAction.total;
  return {
    compare,
    nodeCosts: nodeCostDelta(noAction, selected, ids, total),
    frame: {
      nodeHealth: { ...last.nodeHealth },
      edgeStates: { ...last.edgeStates },
      valueOverrides,
      nodeSummaryLabels,
    },
    avoided: noAction.total - selected.total,
  };
}
