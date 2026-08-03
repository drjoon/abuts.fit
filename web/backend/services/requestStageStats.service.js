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

  if (stage === "취소") return "취소";
  if (["tracking", "추적관리"].includes(stage)) return "추적관리";
  if (["shipping", "포장.발송"].includes(stage)) return "포장.발송";
  if (["packing", "세척.패킹"].includes(stage)) return "세척.패킹";
  if (["machining", "가공"].includes(stage)) return "가공";
  if (["cam", "CAM"].includes(stage)) return "CAM";
  if (["준비"].includes(stage)) return "준비";

  // 알 수 없는 상태는 request 단계 SSOT(준비)로 처리
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
