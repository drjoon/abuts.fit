// related files:
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/backend/controllers/requests/production.utils.js
// - web/backend/models/machiningRecord.model.js
// - web/backend/models/request.model.js
// - web/backend/rules.md
import MachiningRecord from "../../models/machiningRecord.model.js";
import Request from "../../models/request.model.js";

/** 추정 실패 시 fallback (초/mm). 15분 ≈ 900초를 대표 길이 10mm로 나눈 값에 가깝게 둔다. */
export const FALLBACK_SECONDS_PER_MM = 90;
export const DEFAULT_ESTIMATE_LOOKBACK = 40;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 2 * 60 * 60;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedEstimate = null;
let cachedAtMs = 0;

/**
 * 최근 완료 가공 기록에서 (durationSeconds / totalLength) 비율을 추출한다.
 * 보수적 예측: 유효 샘플 중 최대 비율(sec/mm)을 사용한다.
 */
export async function resolveConservativeMachiningSecondsPerMm({
  lookback = DEFAULT_ESTIMATE_LOOKBACK,
  forceRefresh = false,
} = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedEstimate &&
    now - cachedAtMs < CACHE_TTL_MS
  ) {
    return cachedEstimate;
  }

  const limit = Math.max(10, Math.min(120, Math.floor(Number(lookback) || DEFAULT_ESTIMATE_LOOKBACK)));
  const recs = await MachiningRecord.find({
    status: "COMPLETED",
    $or: [
      { durationSeconds: { $gte: MIN_DURATION_SECONDS, $lte: MAX_DURATION_SECONDS } },
      { elapsedSeconds: { $gte: MIN_DURATION_SECONDS, $lte: MAX_DURATION_SECONDS } },
    ],
  })
    .sort({ completedAt: -1 })
    .limit(limit)
    .select({ requestId: 1, durationSeconds: 1, elapsedSeconds: 1, completedAt: 1 })
    .lean();

  const requestIds = [
    ...new Set(
      (Array.isArray(recs) ? recs : [])
        .map((r) => String(r?.requestId || "").trim())
        .filter(Boolean),
    ),
  ];

  const requests = requestIds.length
    ? await Request.find({ requestId: { $in: requestIds } })
        .select({ requestId: 1, "caseInfos.totalLength": 1 })
        .lean()
    : [];

  const lengthByRequestId = new Map(
    requests.map((r) => [
      String(r?.requestId || "").trim(),
      Number(r?.caseInfos?.totalLength),
    ]),
  );

  const samples = [];
  for (const rec of Array.isArray(recs) ? recs : []) {
    const requestId = String(rec?.requestId || "").trim();
    const totalLength = Number(lengthByRequestId.get(requestId));
    const duration = Number(
      Number.isFinite(Number(rec?.durationSeconds)) && Number(rec.durationSeconds) > 0
        ? rec.durationSeconds
        : rec?.elapsedSeconds,
    );
    if (!requestId) continue;
    if (!Number.isFinite(totalLength) || totalLength <= 0) continue;
    if (
      !Number.isFinite(duration) ||
      duration < MIN_DURATION_SECONDS ||
      duration > MAX_DURATION_SECONDS
    ) {
      continue;
    }
    const secondsPerMm = duration / totalLength;
    if (!Number.isFinite(secondsPerMm) || secondsPerMm <= 0) continue;
    samples.push({
      requestId,
      totalLength,
      durationSeconds: Math.floor(duration),
      secondsPerMm,
      completedAt: rec?.completedAt || null,
    });
  }

  samples.sort((a, b) => b.secondsPerMm - a.secondsPerMm);
  const maxSample = samples[0] || null;
  const secondsPerMm = maxSample?.secondsPerMm || FALLBACK_SECONDS_PER_MM;

  const result = {
    secondsPerMm: Number(secondsPerMm),
    sampleCount: samples.length,
    lookback: limit,
    usedFallback: !maxSample,
    maxSample: maxSample
      ? {
          requestId: maxSample.requestId,
          totalLength: maxSample.totalLength,
          durationSeconds: maxSample.durationSeconds,
          secondsPerMm: Number(maxSample.secondsPerMm.toFixed(3)),
        }
      : null,
    method: "conservative_max_seconds_per_mm",
    label: maxSample
      ? `보수적 예측: 최대길이 1mm당 ${Math.ceil(secondsPerMm)}초 (최근 ${samples.length}건 중 최댓값)`
      : `보수적 예측: 최대길이 1mm당 ${FALLBACK_SECONDS_PER_MM}초 (최근 샘플 없음, fallback)`,
  };

  cachedEstimate = result;
  cachedAtMs = now;
  return result;
}

export function estimateMachiningSecondsForLength(totalLength, secondsPerMm) {
  const length = Number(totalLength);
  const rate = Number(secondsPerMm);
  if (!Number.isFinite(length) || length <= 0) {
    return Math.floor(FALLBACK_SECONDS_PER_MM * 10);
  }
  const effectiveRate =
    Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_SECONDS_PER_MM;
  return Math.max(MIN_DURATION_SECONDS, Math.ceil(length * effectiveRate));
}

export function estimateRemainingSecondsForRunningJob({
  totalLength,
  secondsPerMm,
  elapsedSeconds = 0,
}) {
  const full = estimateMachiningSecondsForLength(totalLength, secondsPerMm);
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  // 남은 시간이 과소평가되지 않도록 최소 20%는 남긴다.
  return Math.max(Math.ceil(full * 0.2), full - elapsed);
}
