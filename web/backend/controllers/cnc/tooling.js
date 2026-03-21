const TOOL_ALERT_RANK = {
  disabled: 0,
  unknown: 1,
  ok: 2,
  warn: 3,
  alarm: 4,
};

const MAX_TOOLING_OBSERVATIONS = 500;
const MAX_TOOL_REPLACEMENT_HISTORY = 300;

const toNumber = (value, fallback = 0) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeToolLifeRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, idx) => ({
      toolNum: Math.max(1, toNumber(row?.toolNum, idx + 1)),
      useCount: Math.max(0, toNumber(row?.useCount, 0)),
      configCount: Math.max(0, toNumber(row?.configCount, 0)),
      warningCount: Math.max(0, toNumber(row?.warningCount, 0)),
      use: row?.use !== false,
    }))
    .filter((row) => Number.isFinite(row.toolNum));
}

export function normalizeToolingObservations(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, idx) => ({
      toolNum: Math.max(1, toNumber(row?.toolNum, idx + 1)),
      useCount: Math.max(0, toNumber(row?.useCount, 0)),
      configCount: Math.max(0, toNumber(row?.configCount, 0)),
      warningCount: Math.max(0, toNumber(row?.warningCount, 0)),
      use: row?.use !== false,
      source: String(row?.source || "snapshot").trim() || "snapshot",
      observedAt: row?.observedAt ? new Date(row.observedAt) : new Date(),
    }))
    .filter((row) => Number.isFinite(row.toolNum));
}

export function normalizeToolReplacementHistory(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, idx) => ({
      toolNum: Math.max(1, toNumber(row?.toolNum, idx + 1)),
      kind: row?.kind === "abnormal" ? "abnormal" : "normal",
      note: String(row?.note || "").trim(),
      observedUseCount: Math.max(0, toNumber(row?.observedUseCount, 0)),
      observedConfigCount: Math.max(0, toNumber(row?.observedConfigCount, 0)),
      observedWarningCount: Math.max(0, toNumber(row?.observedWarningCount, 0)),
      predictedReplacementUseCount: Math.max(
        0,
        toNumber(row?.predictedReplacementUseCount, 0),
      ),
      createdAt: row?.createdAt ? new Date(row.createdAt) : new Date(),
      createdBy: row?.createdBy || null,
      createdByName: String(row?.createdByName || "").trim(),
    }))
    .filter((row) => Number.isFinite(row.toolNum));
}

export function compareToolAlertLevel(a, b) {
  return (TOOL_ALERT_RANK[a] || 0) >= (TOOL_ALERT_RANK[b] || 0) ? a : b;
}

export function buildToolingSummary({ toolLifeRows, tooling }) {
  const rows = normalizeToolLifeRows(toolLifeRows);
  const observations = normalizeToolingObservations(tooling?.observations);
  const replacementHistory = normalizeToolReplacementHistory(
    tooling?.replacementHistory,
  );

  const historyByTool = new Map();
  for (const item of replacementHistory) {
    const key = String(item.toolNum);
    const list = historyByTool.get(key) || [];
    list.push(item);
    historyByTool.set(key, list);
  }

  const latestObservationByTool = new Map();
  for (const item of observations) {
    const key = String(item.toolNum);
    const prev = latestObservationByTool.get(key);
    if (!prev || new Date(item.observedAt).getTime() >= new Date(prev.observedAt).getTime()) {
      latestObservationByTool.set(key, item);
    }
  }

  let alertLevel = "unknown";
  let warningCount = 0;
  let alarmCount = 0;

  const tools = rows.map((row) => {
    const key = String(row.toolNum);
    const toolHistory = historyByTool.get(key) || [];
    const lastReplacement = toolHistory.length > 0 ? toolHistory[toolHistory.length - 1] : null;
    const samples = toolHistory
      .map((item) => Number(item.observedUseCount || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgReplacementUseCount =
      samples.length > 0
        ? samples.reduce((sum, value) => sum + value, 0) / samples.length
        : 0;
    const predictedReplacementUseCount =
      avgReplacementUseCount > 0
        ? avgReplacementUseCount
        : row.configCount > 0
          ? row.configCount
          : 0;
    const ratio =
      predictedReplacementUseCount > 0
        ? row.useCount / predictedReplacementUseCount
        : row.configCount > 0
          ? row.useCount / row.configCount
          : 0;
    const warningRatio = predictedReplacementUseCount > 0 ? 0.95 : 1;

    let status = "unknown";
    if (row.use === false) {
      status = "disabled";
    } else if (predictedReplacementUseCount <= 0 && row.useCount <= 0) {
      status = "unknown";
    } else if (
      ratio >= 1 ||
      (row.configCount > 0 && row.useCount >= row.configCount)
    ) {
      status = "alarm";
    } else if (ratio >= warningRatio) {
      status = "warn";
    } else {
      status = "ok";
    }

    if (status === "warn") warningCount += 1;
    if (status === "alarm") alarmCount += 1;
    alertLevel = compareToolAlertLevel(alertLevel, status);

    const latestObservation = latestObservationByTool.get(key) || null;

    return {
      toolNum: row.toolNum,
      useCount: row.useCount,
      configCount: row.configCount,
      warningCount: row.warningCount,
      use: row.use,
      status,
      riskRatio: Number.isFinite(ratio) ? ratio : 0,
      remainingUseCount:
        predictedReplacementUseCount > 0
          ? Math.max(0, predictedReplacementUseCount - row.useCount)
          : 0,
      avgReplacementUseCount:
        avgReplacementUseCount > 0 ? Math.round(avgReplacementUseCount * 100) / 100 : 0,
      predictedReplacementUseCount,
      predictedWarningUseCount:
        predictedReplacementUseCount > 0
          ? predictedReplacementUseCount * 0.95
          : 0,
      replacementCount: toolHistory.length,
      lastReplacementAt: lastReplacement?.createdAt || null,
      lastReplacementKind: lastReplacement?.kind || null,
      lastReplacementNote: lastReplacement?.note || "",
      lastObservedAt: latestObservation?.observedAt || null,
    };
  });

  const dueTools = tools
    .filter((tool) => tool.status === "warn" || tool.status === "alarm")
    .map((tool) => ({
      toolNum: tool.toolNum,
      status: tool.status,
      riskRatio: tool.riskRatio,
      remainingUseCount: tool.remainingUseCount,
      predictedReplacementUseCount: tool.predictedReplacementUseCount,
    }));

  return {
    alertLevel,
    totalTools: tools.length,
    warningCount,
    alarmCount,
    dueTools,
    tools,
    lastReplacementAt:
      replacementHistory.length > 0
        ? replacementHistory[replacementHistory.length - 1]?.createdAt || null
        : null,
  };
}

export function appendToolLifeObservations({
  previousRows,
  nextRows,
  existingObservations,
  observedAt,
  source,
}) {
  const prevMap = new Map(
    normalizeToolLifeRows(previousRows).map((row) => [String(row.toolNum), row]),
  );
  const nextList = normalizeToolLifeRows(nextRows);
  const base = normalizeToolingObservations(existingObservations);
  const when = observedAt ? new Date(observedAt) : new Date();
  const appended = [];

  for (const row of nextList) {
    const prev = prevMap.get(String(row.toolNum));
    const changed =
      !prev ||
      prev.useCount !== row.useCount ||
      prev.configCount !== row.configCount ||
      prev.warningCount !== row.warningCount ||
      prev.use !== row.use;
    if (!changed) continue;
    appended.push({
      toolNum: row.toolNum,
      useCount: row.useCount,
      configCount: row.configCount,
      warningCount: row.warningCount,
      use: row.use,
      source: String(source || "snapshot").trim() || "snapshot",
      observedAt: when,
    });
  }

  if (appended.length === 0) {
    return base.slice(-MAX_TOOLING_OBSERVATIONS);
  }

  return [...base, ...appended].slice(-MAX_TOOLING_OBSERVATIONS);
}

export function buildToolReplacementUpdate({ currentRows, payload, user }) {
  const rows = normalizeToolLifeRows(currentRows);
  const toolNum = Math.max(1, toNumber(payload?.toolNum, 1));
  const kind = payload?.kind === "abnormal" ? "abnormal" : "normal";
  const note = String(payload?.note || "").trim().slice(0, 500);
  const nextConfigCountRaw = payload?.newConfigCount;
  const now = new Date();
  const rowIndex = rows.findIndex((row) => row.toolNum === toolNum);
  const currentRow =
    rowIndex >= 0
      ? rows[rowIndex]
      : {
          toolNum,
          useCount: 0,
          configCount: 0,
          warningCount: 0,
          use: true,
        };

  const nextConfigCount =
    nextConfigCountRaw == null || nextConfigCountRaw === ""
      ? currentRow.configCount
      : Math.max(0, toNumber(nextConfigCountRaw, currentRow.configCount));
  const nextWarningCount =
    nextConfigCount > 0
      ? Math.min(nextConfigCount, Math.max(0, currentRow.warningCount))
      : 0;

  const replacementRecord = {
    toolNum,
    kind,
    note,
    observedUseCount: Math.max(0, currentRow.useCount),
    observedConfigCount: Math.max(0, currentRow.configCount),
    observedWarningCount: Math.max(0, currentRow.warningCount),
    predictedReplacementUseCount: Math.max(
      0,
      toNumber(payload?.predictedReplacementUseCount, currentRow.configCount),
    ),
    createdAt: now,
    createdBy: user?._id || null,
    createdByName: String(user?.name || user?.email || "").trim(),
  };

  const nextRow = {
    ...currentRow,
    toolNum,
    useCount: 0,
    configCount: nextConfigCount,
    warningCount: nextWarningCount,
    use: currentRow.use !== false,
  };

  const nextRows = [...rows];
  if (rowIndex >= 0) nextRows[rowIndex] = nextRow;
  else nextRows.push(nextRow);

  return {
    replacementRecord,
    nextRows: nextRows.sort((a, b) => a.toolNum - b.toolNum),
    observedAt: now,
  };
}

export function appendToolReplacementHistory(existingHistory, replacementRecord) {
  const base = normalizeToolReplacementHistory(existingHistory);
  return [...base, replacementRecord].slice(-MAX_TOOL_REPLACEMENT_HISTORY);
}
