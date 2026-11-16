// 여러 케이스에서 같은 치종이 같은 방향으로 고쳐지면 생성 로직 제안으로 만든다.
// 커프 높이·대합 거리처럼 의뢰자 취향인 값은 여기 넣지 않는다. 그 값은 치과 기본값으로 남긴다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/frontend/src/shared/practice/abutmentDesignLogic.ts

const MIN_CASES = 3;
const MIN_SHARE = 0.75;

export const TOOTH_KIND_LABEL = {
  incisor: "절치",
  canine: "견치",
  premolar: "소구치",
  molar: "대구치",
};

/** 생성기가 치종마다 반복해서 틀리는 축. 취향 값(마진·대합 거리·굵기)은 없다. */
export const GENERATION_AXES = {
  tiltLabialDeg: {
    label: "기울기",
    unit: "°",
    verb: "기울입니다",
    noise: 1.5,
    round: 0.5,
    proposalCap: 8,
    ruleCap: 12,
    positive: { bias: "설측으로 기울어", fix: "순측으로", before: "설측" },
    negative: { bias: "순측으로 기울어", fix: "설측으로", before: "순측" },
  },
  tiltMesialDeg: {
    label: "근원심 기울기",
    unit: "°",
    verb: "기울입니다",
    noise: 1.5,
    round: 0.5,
    proposalCap: 8,
    ruleCap: 12,
    positive: { bias: "원심으로 기울어", fix: "근심으로", before: "원심" },
    negative: { bias: "근심으로 기울어", fix: "원심으로", before: "근심" },
  },
  shiftLabialMm: {
    label: "윗면 위치",
    unit: "mm",
    verb: "옮깁니다",
    noise: 0.2,
    round: 0.1,
    proposalCap: 1.2,
    ruleCap: 1.5,
    positive: { bias: "설측으로 놓여", fix: "순측으로", before: "설측" },
    negative: { bias: "순측으로 놓여", fix: "설측으로", before: "순측" },
  },
  shiftMesialMm: {
    label: "윗면 근원심",
    unit: "mm",
    verb: "옮깁니다",
    noise: 0.2,
    round: 0.1,
    proposalCap: 1.2,
    ruleCap: 1.5,
    positive: { bias: "원심으로 놓여", fix: "근심으로", before: "원심" },
    negative: { bias: "근심으로 놓여", fix: "원심으로", before: "근심" },
  },
  yawDeg: {
    label: "포스트 회전",
    unit: "°",
    verb: "돌립니다",
    noise: 4,
    round: 1,
    proposalCap: 10,
    ruleCap: 15,
    positive: { bias: "시계 방향으로 돌아가", fix: "반시계로", before: "시계" },
    negative: { bias: "반시계 방향으로 돌아가", fix: "시계로", before: "반시계" },
  },
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function roundTo(value, step) {
  if (!(step > 0)) return value;
  const n = Math.round(value / step) * step;
  return Math.round(n * 1000) / 1000;
}

function formatAmount(absValue, spec) {
  const n = roundTo(absValue, spec.round);
  const text = Number.isInteger(n) ? String(n) : String(n);
  return spec.unit ? `${text}${spec.unit}` : text;
}

export function toothKindOf(toothNumber) {
  const digits = String(toothNumber || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const pos = Number(digits[1]);
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}

export function sanitizeGenerationDelta(axis, before, after) {
  const spec = GENERATION_AXES[axis];
  if (!spec) return null;
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  let delta = a - b;
  if (Math.abs(delta) < spec.noise) return null;
  delta = clamp(delta, -spec.ruleCap, spec.ruleCap);
  return {
    axis,
    before: roundTo(b, spec.round / 2 || 0.01),
    after: roundTo(a, spec.round / 2 || 0.01),
    delta: roundTo(delta, spec.round / 2 || 0.01),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function observationId(row) {
  return String(row?.id || row?._id || "");
}

/**
 * disposition 이 비었거나 pending 인 편집만 본다.
 * 같은 의뢰의 같은 치종은 한 표로 묶고, 3건 이상이 같은 방향이면 제안을 만든다.
 */
export function buildLogicProposals(observations) {
  const buckets = new Map();
  for (const obs of observations || []) {
    if (obs?.disposition === "approved" || obs?.disposition === "dismissed") continue;
    if (obs?.disposition != null && obs.disposition !== "pending") continue;
    const spec = GENERATION_AXES[obs?.axis];
    const kind = obs?.toothKind;
    const id = observationId(obs);
    if (!spec || !TOOTH_KIND_LABEL[kind] || !obs?.transferId || !id) continue;
    const delta = Number(obs.delta);
    if (!Number.isFinite(delta) || Math.abs(delta) < spec.noise) continue;
    const key = `${kind}:${obs.axis}`;
    const list = buckets.get(key) || [];
    list.push(obs);
    buckets.set(key, list);
  }

  const drafts = [];
  for (const [key, rows] of buckets) {
    const [toothKind, axis] = key.split(":");
    const spec = GENERATION_AXES[axis];
    const byTransfer = new Map();
    for (const row of rows) {
      const list = byTransfer.get(row.transferId) || [];
      list.push(row);
      byTransfer.set(row.transferId, list);
    }
    const votes = [];
    for (const [transferId, list] of byTransfer) {
      votes.push({ transferId, delta: median(list.map((row) => Number(row.delta))), rows: list });
    }
    if (votes.length < MIN_CASES) continue;
    const positive = votes.filter((vote) => vote.delta > 0);
    const negative = votes.filter((vote) => vote.delta < 0);
    const majority = positive.length >= negative.length ? positive : negative;
    if (majority.length < MIN_CASES) continue;
    if (majority.length / votes.length < MIN_SHARE) continue;
    const sign = majority[0].delta > 0 ? 1 : -1;
    let delta = roundTo(median(majority.map((vote) => vote.delta)), spec.round);
    delta = clamp(delta, -spec.proposalCap, spec.proposalCap);
    if (Math.abs(delta) < spec.noise) continue;
    const phrase = delta < 0 ? spec.negative : spec.positive;
    const amount = formatAmount(Math.abs(delta), spec);
    const kindLabel = TOOTH_KIND_LABEL[toothKind];
    const ids = [];
    const samples = [];
    const ranked = [...majority].sort(
      (a, b) => new Date(b.rows[0]?.updatedAt || 0).getTime() - new Date(a.rows[0]?.updatedAt || 0).getTime(),
    );
    for (const vote of ranked) {
      const agreeing = vote.rows.filter((row) => Math.sign(Number(row.delta)) === sign);
      for (const row of agreeing) ids.push(observationId(row));
      if (samples.length >= 4 || agreeing.length === 0) continue;
      const sample = [...agreeing].sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)))[0];
      const sampleAmount = formatAmount(Math.abs(Number(sample.delta)), spec);
      const samplePhrase = Number(sample.delta) < 0 ? spec.negative : spec.positive;
      samples.push({
        transferId: String(vote.transferId),
        patientName: String(sample.patientName || "").trim(),
        practiceName: String(sample.practiceName || "").trim(),
        toothNumber: String(sample.toothNumber || "").trim(),
        changeText: `${samplePhrase.fix} ${sampleAmount}`,
      });
    }
    drafts.push({
      toothKind,
      axis,
      delta,
      changeLabel: `${kindLabel} ${spec.label}`,
      summary: `${kindLabel}는 ${phrase.bias} 생성되고 있습니다.`,
      detail: `여러 케이스에서 ${phrase.fix} 고쳐 맞췄습니다.`,
      applyText: `다음 생성부터 ${phrase.fix} ${amount} ${spec.verb}.`,
      beforeText: phrase.before,
      afterText: `${phrase.fix} ${amount}`,
      observationIds: ids,
      samples,
    });
  }
  return drafts;
}

export function clampRuleDelta(axis, current, addition) {
  const spec = GENERATION_AXES[axis];
  if (!spec) return 0;
  const base = Number(current);
  const add = Number(addition);
  const sum = (Number.isFinite(base) ? base : 0) + (Number.isFinite(add) ? add : 0);
  return roundTo(clamp(sum, -spec.ruleCap, spec.ruleCap), spec.round);
}
