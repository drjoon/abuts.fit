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
    if (
      !prev ||
      new Date(item.observedAt).getTime() >= new Date(prev.observedAt).getTime()
    ) {
      latestObservationByTool.set(key, item);
    }
  }

  let alertLevel = "unknown";
  let warningCount = 0;
  let alarmCount = 0;

  const tools = rows.map((row) => {
    const key = String(row.toolNum);
    const toolHistory = historyByTool.get(key) || [];
    const lastReplacement =
      toolHistory.length > 0 ? toolHistory[toolHistory.length - 1] : null;
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
        avgReplacementUseCount > 0
          ? Math.round(avgReplacementUseCount * 100) / 100
          : 0,
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
    normalizeToolLifeRows(previousRows).map((row) => [
      String(row.toolNum),
      row,
    ]),
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
  const note = String(payload?.note || "")
    .trim()
    .slice(0, 500);
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

export function appendToolReplacementHistory(
  existingHistory,
  replacementRecord,
) {
  const base = normalizeToolReplacementHistory(existingHistory);
  return [...base, replacementRecord].slice(-MAX_TOOL_REPLACEMENT_HISTORY);
}

// ─── 슬롯 메타데이터 (toolSlots) 유틸 ───────────────────────────────────────

const VALID_TOOL_TYPES = new Set(["drill", "mill", "reamer", "other"]);
const MAX_TOOL_SLOTS = 100;

/**
 * toolSlots 배열을 정규화한다.
 * toolNum 기준으로 중복 제거, 필드 타입 보정.
 */
export function normalizeToolSlots(slots) {
  const list = Array.isArray(slots) ? slots : [];
  return list
    .map((slot) => ({
      toolNum: Math.max(1, toNumber(slot?.toolNum, 0)),
      toolName: String(slot?.toolName || "")
        .trim()
        .slice(0, 100),
      toolType: VALID_TOOL_TYPES.has(slot?.toolType) ? slot.toolType : "other",
      toolNote: String(slot?.toolNote || "")
        .trim()
        .slice(0, 300),
      // replacementStatus: mounted | removing | removed
      replacementStatus: ["mounted", "removing", "removed"].includes(
        slot?.replacementStatus,
      )
        ? slot.replacementStatus
        : "mounted",
      removalRequestedAt: slot?.removalRequestedAt
        ? new Date(slot.removalRequestedAt)
        : null,
      removalRequestedBy: slot?.removalRequestedBy || null,
      removalRequestedByName: String(slot?.removalRequestedByName || "").trim(),
      lastReplacedAt: slot?.lastReplacedAt
        ? new Date(slot.lastReplacedAt)
        : null,
      lastReplacedBy: slot?.lastReplacedBy || null,
      lastReplacedByName: String(slot?.lastReplacedByName || "").trim(),
    }))
    .filter((s) => s.toolNum > 0);
}

/**
 * 슬롯 목록에서 특정 toolNum 슬롯을 찾거나 없으면 기본값 반환.
 */
function findSlot(slots, toolNum) {
  const list = normalizeToolSlots(slots);
  return (
    list.find((s) => s.toolNum === toolNum) || {
      toolNum,
      toolName: "",
      toolType: "other",
      toolNote: "",
      replacementStatus: "mounted",
      removalRequestedAt: null,
      removalRequestedBy: null,
      removalRequestedByName: "",
      lastReplacedAt: null,
      lastReplacedBy: null,
      lastReplacedByName: "",
    }
  );
}

/**
 * BeginToolRemoval: 공구 해제 요청 처리.
 * 슬롯 상태를 mounted → removing으로 전환한다.
 * 이미 removing/removed 상태면 덮어쓴다(재요청 허용).
 *
 * @param {Object} params
 * @param {any[]} params.existingSlots - 현재 toolSlots 배열
 * @param {number} params.toolNum - 대상 슬롯 번호
 * @param {Object|null} params.user - 요청자 User 객체
 * @returns {{ nextSlots: any[] }}
 */
export function applyBeginToolRemoval({ existingSlots, toolNum, user }) {
  const slots = normalizeToolSlots(existingSlots);
  const idx = slots.findIndex((s) => s.toolNum === toolNum);
  const current = findSlot(existingSlots, toolNum);

  const updated = {
    ...current,
    toolNum,
    replacementStatus: "removing",
    removalRequestedAt: new Date(),
    removalRequestedBy: user?._id || null,
    removalRequestedByName: String(user?.name || user?.email || "").trim(),
  };

  const nextSlots = [...slots];
  if (idx >= 0) nextSlots[idx] = updated;
  else nextSlots.push(updated);

  return { nextSlots: nextSlots.slice(0, MAX_TOOL_SLOTS) };
}

/**
 * CompleteToolReplacement: 교체 완료 처리.
 * 슬롯 상태를 removing/removed → mounted로 전환하고
 * 공구 메타데이터(이름/타입/메모)를 업데이트한다.
 * 동시에 RecordToolReplacement(useCount 리셋)를 위한 replacementRecord를 생성한다.
 *
 * @param {Object} params
 * @param {any[]} params.existingSlots - 현재 toolSlots 배열
 * @param {any[]} params.currentRows - 현재 toolLifeRows 배열
 * @param {Object} params.payload - 프론트에서 받은 교체 완료 데이터
 * @param {Object|null} params.user - 요청자 User 객체
 * @returns {{ nextSlots, replacementRecord, nextRows }}
 */
export function applyCompleteToolReplacement({
  existingSlots,
  currentRows,
  payload,
  user,
}) {
  const toolNum = Math.max(1, toNumber(payload?.toolNum, 1));
  const slots = normalizeToolSlots(existingSlots);
  const idx = slots.findIndex((s) => s.toolNum === toolNum);
  const current = findSlot(existingSlots, toolNum);
  const now = new Date();

  const updated = {
    ...current,
    toolNum,
    toolName: String(payload?.toolName ?? current.toolName ?? "")
      .trim()
      .slice(0, 100),
    toolType: VALID_TOOL_TYPES.has(payload?.toolType)
      ? payload.toolType
      : current.toolType,
    toolNote: String(payload?.toolNote ?? current.toolNote ?? "")
      .trim()
      .slice(0, 300),
    replacementStatus: "mounted",
    removalRequestedAt: current.removalRequestedAt,
    removalRequestedBy: current.removalRequestedBy,
    removalRequestedByName: current.removalRequestedByName,
    lastReplacedAt: now,
    lastReplacedBy: user?._id || null,
    lastReplacedByName: String(user?.name || user?.email || "").trim(),
  };

  const nextSlots = [...slots];
  if (idx >= 0) nextSlots[idx] = updated;
  else nextSlots.push(updated);

  // buildToolReplacementUpdate를 재사용해 useCount 리셋 + 이력 레코드 생성
  const { replacementRecord, nextRows, observedAt } =
    buildToolReplacementUpdate({
      currentRows,
      payload: {
        toolNum,
        kind: payload?.kind === "abnormal" ? "abnormal" : "normal",
        note: String(payload?.note || "")
          .trim()
          .slice(0, 500),
        newConfigCount: payload?.newConfigCount ?? null,
        predictedReplacementUseCount:
          payload?.predictedReplacementUseCount ?? 0,
      },
      user,
    });

  return {
    nextSlots: nextSlots.slice(0, MAX_TOOL_SLOTS),
    replacementRecord,
    nextRows,
    observedAt,
  };
}

// ─── 가공 통계 (machiningStats) 유틸 ─────────────────────────────────────────

const MAX_DAILY_BUCKETS = 60; // 최근 60일치 버킷 유지

/**
 * KST 기준 YYYY-MM-DD 문자열 반환 (UTC+9).
 * KST 정책: 서버가 UTC 환경이므로 직접 offset 적용.
 */
function toKstYmdString(date) {
  const d = date instanceof Date ? date : new Date(date);
  // KST = UTC+9
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * machiningStats 배열을 정규화한다.
 */
export function normalizeMachiningStats(stats) {
  const list = Array.isArray(stats) ? stats : [];
  return list
    .map((s) => ({
      toolNum: Math.max(1, toNumber(s?.toolNum, 0)),
      totalJobCount: Math.max(0, toNumber(s?.totalJobCount, 0)),
      totalMachiningSeconds: Math.max(0, toNumber(s?.totalMachiningSeconds, 0)),
      currentJobCount: Math.max(0, toNumber(s?.currentJobCount, 0)),
      currentMachiningSeconds: Math.max(
        0,
        toNumber(s?.currentMachiningSeconds, 0),
      ),
      lastJobAt: s?.lastJobAt ? new Date(s.lastJobAt) : null,
      dailyBuckets: Array.isArray(s?.dailyBuckets)
        ? s.dailyBuckets
            .map((b) => ({
              ymd: String(b?.ymd || "").trim(),
              count: Math.max(0, toNumber(b?.count, 0)),
              seconds: Math.max(0, toNumber(b?.seconds, 0)),
            }))
            .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.ymd))
        : [],
    }))
    .filter((s) => s.toolNum > 0);
}

/**
 * 가공 완료 시 슬롯별 machiningStats를 업데이트한다.
 *
 * @param {Object} params
 * @param {any[]} params.existingStats - 현재 machiningStats 배열
 * @param {number} params.toolNum - 해당 슬롯 번호 (0이면 전체 슬롯에 적용)
 * @param {number} params.jobDurationSeconds - 이번 가공 시간(초)
 * @param {Date} params.completedAt - 가공 완료 시각
 * @returns {{ nextStats: any[] }}
 */
export function appendMachiningJobStats({
  existingStats,
  toolNum,
  jobDurationSeconds,
  completedAt,
}) {
  const stats = normalizeMachiningStats(existingStats);
  const durSec = Math.max(0, toNumber(jobDurationSeconds, 0));
  const when = completedAt instanceof Date ? completedAt : new Date();
  const ymd = toKstYmdString(when);

  // toolNum=0 은 장비 단위 통계 키로 예약
  const key = Math.max(0, toNumber(toolNum, 0));

  const idx = stats.findIndex((s) => s.toolNum === key);
  const current =
    idx >= 0
      ? stats[idx]
      : {
          toolNum: key,
          totalJobCount: 0,
          totalMachiningSeconds: 0,
          currentJobCount: 0,
          currentMachiningSeconds: 0,
          lastJobAt: null,
          dailyBuckets: [],
        };

  // 일별 버킷 업데이트
  const buckets = [...current.dailyBuckets];
  const bucketIdx = buckets.findIndex((b) => b.ymd === ymd);
  if (bucketIdx >= 0) {
    buckets[bucketIdx] = {
      ymd,
      count: buckets[bucketIdx].count + 1,
      seconds: buckets[bucketIdx].seconds + durSec,
    };
  } else {
    buckets.push({ ymd, count: 1, seconds: durSec });
  }
  // 오래된 버킷 정리 (날짜 내림차순 정렬 후 최근 MAX_DAILY_BUCKETS일만 유지)
  const sortedBuckets = buckets
    .sort((a, b) => b.ymd.localeCompare(a.ymd))
    .slice(0, MAX_DAILY_BUCKETS);

  const next = {
    toolNum: key,
    totalJobCount: current.totalJobCount + 1,
    totalMachiningSeconds: current.totalMachiningSeconds + durSec,
    currentJobCount: current.currentJobCount + 1,
    currentMachiningSeconds: current.currentMachiningSeconds + durSec,
    lastJobAt: when,
    dailyBuckets: sortedBuckets,
  };

  const nextStats = [...stats];
  if (idx >= 0) nextStats[idx] = next;
  else nextStats.push(next);

  return { nextStats };
}

/**
 * 공구 교체 완료 시 해당 슬롯의 currentJobCount/currentMachiningSeconds를 리셋한다.
 * totalJobCount/totalMachiningSeconds는 절대 누계이므로 유지한다.
 *
 * @param {any[]} existingStats - 현재 machiningStats 배열
 * @param {number} toolNum - 리셋할 슬롯 번호
 * @returns {{ nextStats: any[] }}
 */
export function resetCurrentMachiningStats(existingStats, toolNum) {
  const stats = normalizeMachiningStats(existingStats);
  const key = Math.max(1, toNumber(toolNum, 1));
  const idx = stats.findIndex((s) => s.toolNum === key);
  if (idx < 0) return { nextStats: stats };

  const nextStats = [...stats];
  nextStats[idx] = {
    ...nextStats[idx],
    currentJobCount: 0,
    currentMachiningSeconds: 0,
  };
  return { nextStats };
}
