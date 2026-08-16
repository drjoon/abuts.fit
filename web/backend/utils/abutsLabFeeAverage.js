// related files:
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/backend/jobs/abutsLabFeeAverageWorker.js
// - web/backend/models/systemSettings.model.js
//
// 평균기공비: 기공비 설정 기공소 표본 → 1σ 이상치 제거 → 재평균 → 1천원 단위 올림.
// 매일 KST 자정 워커가 SystemSettings.abutsLabFeeSchedule.price를 갱신.

import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  isLabFeeScheduleConfigured,
} from "./labFeeSchedule.js";
import {
  loadAbutsLabFeeSchedule,
  listEnabledAbutsLabFeeCatalogItems,
  normalizeAbutsLabFeeItems,
  saveAbutsLabFeeSchedule,
} from "./abutsLabFeeSchedule.js";
import {
  labUnitPricesByCatalogId,
  normalizeCatalogItems,
} from "./practiceTransferAutoMatchBudget.js";
import { verifiedLabCapableAnchorFilter } from "./practiceTransferAutoMatch.js";

const FEE_STEP = 1000;
const MIN_SAMPLES = 2;

/** 1천원 단위 올림 */
export function ceilToFeeStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / FEE_STEP) * FEE_STEP;
}

/**
 * 표본에서 mean±1sd 밖을 제거하고 재평균.
 * @returns {number | null} 재평균(올림 전). 표본 부족이면 null.
 */
export function meanExcludingOneStdDev(samples) {
  const values = (Array.isArray(samples) ? samples : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (values.length < MIN_SAMPLES) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);

  const filtered =
    sd > 0
      ? values.filter((v) => Math.abs(v - mean) <= sd)
      : values.slice();
  if (filtered.length < 1) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

/**
 * 카탈로그 항목별 평균 단가 맵.
 * @returns {{ pricesById: Record<string, number>, sampleCounts: Record<string, number> }}
 */
export function computeAverageUnitPricesFromLabRows({
  labs,
  catalog,
} = {}) {
  const rows = normalizeCatalogItems(catalog);
  const buckets = {};
  for (const row of rows) buckets[row.id] = [];

  for (const lab of Array.isArray(labs) ? labs : []) {
    if (!isLabFeeScheduleConfigured(lab?.labFeeSchedule)) continue;
    const unitPrices = labUnitPricesByCatalogId(lab.labFeeSchedule, rows);
    for (const row of rows) {
      const price = Math.max(0, Math.round(Number(unitPrices[row.id] || 0)));
      if (price > 0) buckets[row.id].push(price);
    }
  }

  const pricesById = {};
  const sampleCounts = {};
  for (const row of rows) {
    const samples = buckets[row.id] || [];
    sampleCounts[row.id] = samples.length;
    const avg = meanExcludingOneStdDev(samples);
    if (avg == null) continue;
    const rounded = ceilToFeeStep(avg);
    if (rounded > 0) pricesById[row.id] = rounded;
  }
  return { pricesById, sampleCounts };
}

/** 기공비 설정된 verified lab/internalLab 로드 */
export async function loadLabsWithConfiguredFeeSchedules() {
  const labs = await BusinessAnchor.find({
    ...verifiedLabCapableAnchorFilter(),
  })
    .select({ _id: 1, labFeeSchedule: 1, businessType: 1 })
    .lean();
  return (labs || []).filter((lab) =>
    isLabFeeScheduleConfigured(lab?.labFeeSchedule),
  );
}

/**
 * 카탈로그 price를 재계산 평균으로 갱신(표본 부족 항목은 기존 유지).
 * @returns {{ updated: number, sampleCounts: Record<string, number>, averagedAt: string }}
 */
export async function recomputeAndPersistAbutsLabFeeAverages() {
  const schedule = await loadAbutsLabFeeSchedule();
  const catalog = listEnabledAbutsLabFeeCatalogItems(schedule);
  const labs = await loadLabsWithConfiguredFeeSchedules();
  const { pricesById, sampleCounts } = computeAverageUnitPricesFromLabRows({
    labs,
    catalog,
  });

  const averagedAt = new Date();
  const nextItems = normalizeAbutsLabFeeItems(schedule.items).map((item) => {
    if (item.enabled === false) return item;
    const nextPrice = pricesById[item.id];
    if (!(nextPrice > 0)) return item;
    if (item.unit === "perNTeeth" && Array.isArray(item.tiers) && item.tiers.length) {
      return {
        ...item,
        price: nextPrice,
        tiers: item.tiers.map((tier) => ({ ...tier, price: nextPrice, remake: 0 })),
      };
    }
    return { ...item, price: nextPrice };
  });

  await saveAbutsLabFeeSchedule(nextItems);

  // averagedAt 메타는 schedule 루트에 별도 저장
  const SystemSettings = (await import("../models/systemSettings.model.js"))
    .default;
  await SystemSettings.updateOne(
    { key: "global" },
    { $set: { "abutsLabFeeSchedule.averagedAt": averagedAt } },
  );

  return {
    updated: Object.keys(pricesById).length,
    sampleCounts,
    labsScanned: labs.length,
    averagedAt: averagedAt.toISOString(),
  };
}
