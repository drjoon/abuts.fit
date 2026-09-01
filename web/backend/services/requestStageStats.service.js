// change-log:
// - 2026-09-02: packing manufacturerStage SSOT는 세척.패킹만(레거시 세척.포장/packing/cleaning 제거).
// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
const MONITORING_STAGE_KEYS = [
  "준비",
  "CAM",
  "가공",
  "세척.패킹",
  "포장.발송",
  "추적관리",
  "취소",
];

export function normalizeMonitoringStageLabel(manufacturerStage) {
  const stage = String(manufacturerStage || "").trim();
  const lower = stage.toLowerCase();

  if (stage === "취소" || lower === "cancel") return "취소";
  if (
    ["tracking", "추적관리", "완료", "배송완료"].includes(stage) ||
    lower === "tracking"
  ) {
    return "추적관리";
  }
  if (
    ["shipping", "포장.발송", "배송대기", "배송중"].includes(stage) ||
    lower === "shipping"
  ) {
    return "포장.발송";
  }
  if (stage === "세척.패킹") {
    return "세척.패킹";
  }
  if (["machining", "가공"].includes(stage) || lower === "machining") {
    return "가공";
  }
  if (["cam", "CAM"].includes(stage) || lower === "cam") return "CAM";
  // 빈값·레거시(의뢰/request) 및 알 수 없는 상태는 request 단계 SSOT(준비)
  if (!stage || stage === "준비" || stage === "의뢰" || lower === "request") {
    return "준비";
  }

  return "준비";
}

export function createEmptyMonitoringStageCounts() {
  return {
    준비: 0,
    CAM: 0,
    가공: 0,
    "세척.패킹": 0,
    "포장.발송": 0,
    추적관리: 0,
    취소: 0,
  };
}

export function buildMonitoringStageStatsFromRequests(requests) {
  const byStatus = createEmptyMonitoringStageCounts();
  const rows = Array.isArray(requests) ? requests : [];

  for (const row of rows) {
    const label = normalizeMonitoringStageLabel(row?.manufacturerStage);
    if (byStatus[label] != null) {
      byStatus[label] += 1;
    }
  }

  return {
    total: rows.length,
    byStatus,
  };
}

export function buildMonitoringStageStatsFromGroupedRows(groupedRows, totalCount) {
  const byStatus = createEmptyMonitoringStageCounts();
  const rows = Array.isArray(groupedRows) ? groupedRows : [];

  let summedTotal = 0;
  for (const row of rows) {
    const count = Number(row?.count || 0);
    if (!Number.isFinite(count) || count <= 0) continue;

    const label = normalizeMonitoringStageLabel(row?._id);
    if (byStatus[label] != null) {
      byStatus[label] += count;
    }
    summedTotal += count;
  }

  const normalizedTotal = Number(totalCount);

  return {
    total: Number.isFinite(normalizedTotal) ? normalizedTotal : summedTotal,
    byStatus,
    stageKeys: MONITORING_STAGE_KEYS,
  };
}
