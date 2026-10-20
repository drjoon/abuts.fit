// related files:
// - web/backend/jobs/cuffSpecSuggestWorker.js
// - web/backend/services/abutmentStl/cuffBlend.service.js (runCuffBlendInWorker mode "measure")
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js (개발팀이 결과를 보고 등록)
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx (카드 안내)
// - .cursor/rules/cuff-connection-spec.mdc
//
// 스펙 미등록(spec-pending) 의뢰를 specKey별로 모아, 서로 다른 filled STL이 5건 이상이면 11° 원뿔 끝 높이를 분석한다.
// outlier(기공소가 원뿔을 더 길게·짧게 그린 파일)를 뺀 다수 군집의 중앙값을 제안값으로 같은 specKey 카드 전체에 기록한다.
// 스펙표(CUFF_CONNECTION_SPECS)는 자동으로 고치지 않는다. 등록은 개발팀이 한다.
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";
import { runCuffBlendInWorker } from "./cuffBlend.service.js";
import { cuffConnectionSpecKey, resolveCuffConnectionSpec } from "./cuffConnectionSpecs.js";

export const SPEC_SUGGEST_MIN_SAMPLES = 5;
/** 같은 군집으로 보는 원뿔 끝 높이 폭(±0.03mm). */
export const SPEC_SUGGEST_CLUSTER_WIDTH_MM = 0.06;

const MEASURE_QUEUE_TIMEOUT_MS = Number(process.env.CUFF_SPEC_SUGGEST_QUEUE_TIMEOUT_MS || 120 * 1000);
/** s3Key → 측정값(null=원뿔 없음). 서버 재시작 전까지 같은 파일을 다시 재지 않는다. */
const measureCache = new Map();

const round3 = (v) => Math.round(v * 1000) / 1000;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * 원뿔 끝 높이 값들에서 폭 0.06mm 안에 가장 많이 모인 군집을 찾는다.
 * 군집이 전체의 과반이고 3건 이상일 때만 ready.
 * @param {number[]} values
 * @returns {{ status: "ready"|"mixed", taperHeightMm: number|null, clusterCount: number, outlierCount: number }}
 */
export function pickTaperCluster(values, width = SPEC_SUGGEST_CLUSTER_WIDTH_MM) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  let best = { start: 0, count: 0 };
  for (let i = 0, j = 0; i < v.length; i += 1) {
    while (v[i] - v[j] > width + 1e-9) j += 1;
    if (i - j + 1 > best.count) best = { start: j, count: i - j + 1 };
  }
  const cluster = v.slice(best.start, best.start + best.count);
  const ok = cluster.length >= 3 && cluster.length * 2 > v.length;
  return {
    status: ok ? "ready" : "mixed",
    taperHeightMm: ok ? round3(median(cluster)) : null,
    clusterCount: cluster.length,
    outlierCount: v.length - cluster.length,
  };
}

async function measureFile(s3Key) {
  if (measureCache.has(s3Key)) return measureCache.get(s3Key);
  const buffer = await getObjectBufferFromS3(s3Key);
  const res = await runCuffBlendInWorker(buffer, "measure", {}, { queueTimeoutMs: MEASURE_QUEUE_TIMEOUT_MS });
  // 일시 실패(큐 초과·시간 초과)는 캐시하지 않는다. 원뿔 없음만 캐시한다.
  if (res.status === "measured") {
    measureCache.set(s3Key, res.detail.measure);
    return res.detail.measure;
  }
  if (res.reason === "11° 원뿔 없음") {
    measureCache.set(s3Key, null);
    return null;
  }
  throw new Error(res.reason || "측정 실패");
}

/** @returns {Promise<{ keys: number, updated: number }>} */
export async function runCuffSpecSuggestOnce() {
  const docs = await Request.find({
    "caseInfos.cuffBlend.status": "spec-pending",
  })
    .select("requestId caseInfos")
    .lean();

  /** @type {Map<string, Map<string, true>>} specKey → 서로 다른 filled s3Key */
  const groups = new Map();
  for (const d of docs) {
    const ci = d.caseInfos || {};
    if (resolveCuffConnectionSpec(ci).spec) continue; // 형상 불일치(스펙은 있음)는 대상이 아니다.
    const key = cuffConnectionSpecKey(ci);
    if (key.split("|").some((part) => !part)) continue; // 임플란트 정보가 비어 있으면 묶을 수 없다.
    const s3Key = resolveFilledStlFile(ci)?.s3Key;
    if (!s3Key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(s3Key, true);
  }

  let updated = 0;
  for (const [key, files] of groups) {
    const sampleCount = files.size;
    let suggestion = { status: "collecting", sampleCount, needed: SPEC_SUGGEST_MIN_SAMPLES };
    if (sampleCount >= SPEC_SUGGEST_MIN_SAMPLES) {
      const measures = [];
      for (const s3Key of files.keys()) {
        try {
          const m = await measureFile(s3Key);
          if (m) measures.push(m);
        } catch (error) {
          console.warn("[cuffSpecSuggest] measure failed", key, error?.message || error);
        }
      }
      if (measures.length >= SPEC_SUGGEST_MIN_SAMPLES) {
        const picked = pickTaperCluster(measures.map((m) => m.taperTopZ));
        suggestion = {
          ...suggestion,
          status: picked.status,
          sampleCount: measures.length,
          taperHeightMm: picked.taperHeightMm,
          originDiameter: round3(median(measures.map((m) => m.originDiameter))),
          clusterCount: picked.clusterCount,
          outlierCount: picked.outlierCount,
        };
        console.log("[cuffSpecSuggest]", key, JSON.stringify(suggestion));
      }
    }
    const res = await Request.updateMany(
      { "caseInfos.cuffBlend.status": "spec-pending", "caseInfos.cuffBlend.specKey": key },
      { $set: { "caseInfos.cuffBlend.specSuggestion": { ...suggestion, analyzedAt: new Date() } } },
    );
    updated += res.modifiedCount || 0;
  }
  return { keys: groups.size, updated };
}
