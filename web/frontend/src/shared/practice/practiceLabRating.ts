// related files:
// - web/backend/utils/practiceLabRating.js
// - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
// - 2026-08-14: 치과→기공소 rating·자동매칭 최소 별.
// - 2026-08-16: 자동매칭 별점은 전체 치과 평가 합산·평균. 우리 치과 1점 제외.
// - 2026-08-16: 5점제. 자동매칭 최소 2~5. 평가 3회 미만은 유효 3점. 기공비 배수 2/3/4/5→0.9/1/1.1/1.2.
// - 2026-08-16: 1점도 참여 가능(하한 1). 기공비 배수 1→×0.8. 우리치과 1점 하드 차단 제거.
// - 2026-08-16: 평가 3회 이하→유효 3점(유예 상수 3).
// - 2026-08-16: 별점 다운그레이드 — 유효별 수가배수 > 의뢰 별점배수일 때 표시 페이로드.
// - 2026-08-16: 공개 대역 — 치과가 하한·상한 직접 설정(기본 3~4).
// - 2026-08-16: 치과·기공소 쌍당 평가 1건. 재평가 시 덮어쓰기. 집계 ratingCount=평가 치과 수.
// - 2026-08-16: scaleAutoMatchFeeToLabStars — 기공소 수신 견적용 별점 확정 단일가.
// - 2026-08-19: 신규 지정 의뢰는 평가만. 별점 배수는 레거시 자동매칭.
// - 2026-08-19: 별점 기공비 배수 폐지(항상 ×1). 할증은 기공소 치과별 labFeeMultiplier만.
// - 2026-08-20: 치과 평가는 별점만. 자동매칭·별점 기공비 할인/할증 없음.
// - 2026-08-20: 별점은 수행 기공소(하청 포함). 하한·상한은 지정·하청 수신 게이트.
// - 2026-09-23: 치과 직접 지정 표시 =「어벗츠 · {이름}」(협력 0%). 하청만 실명 비공개.
// - 2026-09-20: 지정 기공소 치과향 표시 =「어벗츠 협력 · {이름}」(레거시 접두).
// - 2026-08-23: 우리 치과 1점 → 검색 가능·주문 불가(지정·하청 수행 동일).

export const PRACTICE_LAB_RATING_MIN = 1;
export const PRACTICE_LAB_RATING_MAX = 5;
export const PRACTICE_LAB_RATING_MEMO_MAX = 500;
/** 평가 모달 최초 작성 시 기본 별점(기존 평가 없을 때). */
export const DEFAULT_PRACTICE_LAB_RATING_STARS = 3;
export const DEFAULT_AUTO_MATCH_MIN_LAB_RATING = 3;
export const DEFAULT_AUTO_MATCH_MAX_LAB_RATING = 4;
export const AUTO_MATCH_MIN_SELECTABLE = 1;
/** 이 치과 수 이하 평가면 유효 별점=3(미평가 포함). 3곳 이하→3, 4곳부터 실평균. */
export const AUTO_MATCH_RATING_COUNT_GRACE = 3;
export const DEFAULT_EFFECTIVE_LAB_STARS = 3;

/** 하청 수행 시 치과 표시(실명 비공개). */
export const CERTIFIED_PARTNER_LAB_DISPLAY_NAME = "인증 협력 기공소";

/** 협력 기공소 — 치과향 표시 SSOT「어벗츠 · {이름}」. */
export const ABUTS_PARTNER_LAB_LABEL_PREFIX = "어벗츠";
/** 구 표시 접두(목록 병합 시 strip용). */
const ABUTS_PARTNER_LAB_LABEL_PREFIX_LEGACY_A = "어벗츠 협력";
const ABUTS_PARTNER_LAB_LABEL_PREFIX_LEGACY_B = "어벗츠 협력 기공소";

const ABUTS_INTERNAL_LAB_DISPLAY_NAMES = new Set([
  "어벗츠기공소",
  "어벗츠 기공소",
]);

/**
 * 파트너 기공소 핵심 이름만.
 * 「어벗츠 ·」「어벗츠 협력 ·」중첩 접두·인증 협력 접미를 반복 제거.
 */
export function normalizePracticePartnerLabCoreName(label: unknown): string {
  let name = String(label || "").trim();
  name = name.replace(/\s·\s인증 협력 기공소에서 처리$/, "").trim();
  for (let i = 0; i < 6; i += 1) {
    const next = name
      .replace(new RegExp(`^${ABUTS_PARTNER_LAB_LABEL_PREFIX_LEGACY_B}\\s*·\\s*`), "")
      .replace(new RegExp(`^${ABUTS_PARTNER_LAB_LABEL_PREFIX_LEGACY_A}\\s*·\\s*`), "")
      .replace(new RegExp(`^${ABUTS_PARTNER_LAB_LABEL_PREFIX}\\s*·\\s*`), "")
      .replace(/^어벗츠기공소\s*·\s*/, "")
      .replace(/^어벗츠\s*기공소\s*·\s*/, "")
      .trim();
    if (next === name) break;
    name = next;
  }
  if (!name || name === "-") return "";
  if (ABUTS_INTERNAL_LAB_DISPLAY_NAMES.has(name) || name === "어벗츠") {
    return "어벗츠기공소";
  }
  return name;
}

export function formatAbutsCooperationLabLabel(partnerName: unknown): string {
  const core = normalizePracticePartnerLabCoreName(partnerName);
  if (!core || core === "어벗츠기공소") return "어벗츠기공소";
  return `${ABUTS_PARTNER_LAB_LABEL_PREFIX} · ${core}`;
}

/** 치과 목록·캘린더·채팅 헤더 기공소 표시. 협력은 「어벗츠 · 파트너」. */
export function resolvePracticeTransferLabDisplayLabel({
  targetLab,
  handledByCertifiedPartner,
  assigneeKind,
  assigneeLabName,
}: {
  targetLab?: unknown;
  handledByCertifiedPartner?: unknown;
  assigneeKind?: unknown;
  assigneeLabName?: unknown;
} = {}): string {
  const partner = normalizePracticePartnerLabCoreName(assigneeLabName);
  const kind = String(assigneeKind || "").trim();
  const raw = String(targetLab || "").trim();
  if (!handledByCertifiedPartner && kind !== "subcontract" && partner) {
    const rawCore = normalizePracticePartnerLabCoreName(raw);
    const abutsOnly =
      !raw ||
      raw === "-" ||
      ABUTS_INTERNAL_LAB_DISPLAY_NAMES.has(raw) ||
      rawCore === "어벗츠기공소" ||
      raw === "자동 매칭" ||
      raw === "자동매칭";
    if (kind === "cooperation" || abutsOnly) {
      return formatAbutsCooperationLabLabel(partner);
    }
  }
  return formatPracticeTargetLabLabel({
    targetLab: raw,
    handledByCertifiedPartner,
  });
}

/**
 * 캘린더/범례 색 키.
 * 동일 파트너는 ObjectId(또는 정규화 표시명)로 하나로 합친다.
 */
export function resolvePracticeTransferLabColorKey({
  assigneeKind,
  assigneeLabAnchorId,
  targetLabAnchorId,
  targetLab,
  performingLabAnchorId,
  assigneeLabName,
  handledByCertifiedPartner,
}: {
  assigneeKind?: unknown;
  assigneeLabAnchorId?: unknown;
  targetLabAnchorId?: unknown;
  targetLab?: unknown;
  performingLabAnchorId?: unknown;
  assigneeLabName?: unknown;
  handledByCertifiedPartner?: unknown;
} = {}): string {
  const display = resolvePracticeTransferLabDisplayLabel({
    targetLab,
    handledByCertifiedPartner,
    assigneeKind,
    assigneeLabName,
  });
  const core = normalizePracticePartnerLabCoreName(display);
  if (!core || core === "어벗츠기공소") return "어벗츠기공소";

  const kind = String(assigneeKind || "").trim();
  const assigneeId = String(assigneeLabAnchorId || "").trim();
  const performingId = String(performingLabAnchorId || "").trim();
  const targetId = String(targetLabAnchorId || "").trim();

  if (kind === "cooperation" && assigneeId) return `lab:${assigneeId}`;
  if (assigneeId && assigneeId !== targetId) return `lab:${assigneeId}`;
  if (performingId && performingId !== targetId) return `lab:${performingId}`;
  // 레거시 직접 지정: target이 파트너 앵커
  if (targetId && core !== "어벗츠기공소") {
    const raw = String(targetLab || "").trim();
    const rawIsAbuts =
      ABUTS_INTERNAL_LAB_DISPLAY_NAMES.has(raw) ||
      raw === "자동 매칭" ||
      raw === "자동매칭";
    if (!rawIsAbuts || kind === "cooperation") {
      // cooperation인데 assigneeId 없으면 target은 보통 어벗츠 — name 키로
      if (!rawIsAbuts) return `lab:${targetId}`;
    }
  }
  return `name:${core}`;
}

export function formatPracticeTargetLabLabel({
  targetLab,
  handledByCertifiedPartner,
}: {
  targetLab?: unknown;
  handledByCertifiedPartner?: unknown;
} = {}): string {
  const name = String(targetLab || "").trim() || "-";
  if (handledByCertifiedPartner) {
    const core = normalizePracticePartnerLabCoreName(name);
    const base =
      !core || core === "어벗츠기공소" ? "어벗츠기공소" : "어벗츠기공소";
    return `${base} · ${CERTIFIED_PARTNER_LAB_DISPLAY_NAME}에서 처리`;
  }
  const core = normalizePracticePartnerLabCoreName(name);
  if (!core || core === "어벗츠기공소") return "어벗츠기공소";
  return formatAbutsCooperationLabLabel(core);
}

/** 목록 병합 시 표시 접미사/접두사 제거. 「어벗츠 · {핵심}」로 정규화. */
export function stripPracticeTargetLabDisplayDecorations(label: unknown): string {
  const core = normalizePracticePartnerLabCoreName(label);
  if (!core || core === "어벗츠기공소") return "어벗츠기공소";
  return formatAbutsCooperationLabLabel(core);
}

export type PracticeLabRatingPublic = {
  stars: number;
  memo: string;
  ratingCount: number;
  updatedAt?: string | null;
};

export type LabRatingSummary = {
  stars: number | null;
  ratingCount: number;
  effectiveStars: number;
};

/** 자동매칭 별점 다운그레이드(기공소 수신 카드). */
export type StarDowngradeInfo = {
  labEffectiveStars: number;
  autoMatchStars: number;
  labFeeMultiplier: number;
  autoMatchFeeMultiplier: number;
  offeredLabFee: number;
  expectedLabFeeAtOwnStars: number;
  labFeeDeltaWon: number;
};

export function normalizePracticeLabStars(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const stars = Math.round(n);
  if (stars < PRACTICE_LAB_RATING_MIN || stars > PRACTICE_LAB_RATING_MAX) {
    return null;
  }
  return stars;
}

export function normalizeAutoMatchMinLabRating(value: unknown): number {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MIN_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

export function normalizeAutoMatchMaxLabRating(value: unknown): number {
  const stars = normalizePracticeLabStars(value);
  if (stars == null) return DEFAULT_AUTO_MATCH_MAX_LAB_RATING;
  return Math.max(AUTO_MATCH_MIN_SELECTABLE, stars);
}

/** 공개 대역. 하한·상한은 치과 설정. max < min이면 max를 min으로. */
export function resolveAutoMatchEligibleStarBand({
  minStars,
  maxStars,
}: {
  minStars?: unknown;
  maxStars?: unknown;
} = {}): {
  minStars: number;
  maxStars: number;
} {
  const min = normalizeAutoMatchMinLabRating(minStars);
  const maxRaw = normalizeAutoMatchMaxLabRating(maxStars);
  return { minStars: min, maxStars: Math.max(min, maxRaw) };
}

/** 치과 별점은 평가 전용. 기공비 할인/할증에 쓰지 않음(항상 ×1). */
export function feeMultiplierForStars(_stars: unknown): number {
  return 1;
}

/**
 * 자동매칭 상한 수가 → 기공소 유효 별점 배수 단일가.
 * 라인·합산 labFee(max)에 적용. 의뢰 별점 대역 안으로 clamp.
 * labStars 미지정 시 기본 유효 3점(대역 내) — 상한으로 올리지 않음.
 */
export function scaleAutoMatchFeeToLabStars({
  feeAtMax,
  feeAtMin,
  budgetStars,
  budgetMaxStars,
  labStars,
}: {
  feeAtMax: number;
  feeAtMin?: number;
  budgetStars?: unknown;
  budgetMaxStars?: unknown;
  labStars?: unknown;
}): number {
  const maxFee = Math.max(0, Math.round(Number(feeAtMax) || 0));
  if (!(maxFee > 0)) return 0;
  const band = resolveAutoMatchEligibleStarBand({
    minStars: budgetStars,
    maxStars: budgetMaxStars ?? budgetStars,
  });
  const minM = feeMultiplierForStars(band.minStars);
  const maxM = feeMultiplierForStars(band.maxStars);
  const labRaw = Number(labStars);
  const fallback = Math.min(
    band.maxStars,
    Math.max(band.minStars, DEFAULT_EFFECTIVE_LAB_STARS),
  );
  const labEff =
    Number.isFinite(labRaw) && labRaw > 0
      ? Math.min(band.maxStars, Math.max(band.minStars, labRaw))
      : fallback;
  const labM = feeMultiplierForStars(labEff);
  if (!(maxM > 0) || labM === maxM) return maxFee;
  if (
    labM === minM &&
    feeAtMin != null &&
    Number.isFinite(Number(feeAtMin))
  ) {
    return Math.max(0, Math.round(Number(feeAtMin)));
  }
  return Math.max(0, Math.round((maxFee * labM) / maxM));
}

export function effectiveLabStars({
  stars,
  ratingCount,
}: {
  stars?: unknown;
  ratingCount?: unknown;
} = {}): number {
  const count = Math.max(0, Math.floor(Number(ratingCount) || 0));
  if (count <= AUTO_MATCH_RATING_COUNT_GRACE) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EFFECTIVE_LAB_STARS;
  return n;
}

export function normalizePracticeLabRatingMemo(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, PRACTICE_LAB_RATING_MEMO_MAX);
}

export function parsePracticeLabRatingPublic(
  raw: unknown,
): PracticeLabRatingPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const stars = normalizePracticeLabStars(row.stars);
  if (stars == null) return null;
  // 치과·기공소 쌍당 1건(레거시 ratingCount>1 정규화).
  return {
    stars,
    memo: normalizePracticeLabRatingMemo(row.memo),
    ratingCount: 1,
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
  };
}

export function parseLabRatingSummary(raw: unknown): LabRatingSummary {
  if (!raw || typeof raw !== "object") {
    return {
      stars: null,
      ratingCount: 0,
      effectiveStars: DEFAULT_EFFECTIVE_LAB_STARS,
    };
  }
  const row = raw as Record<string, unknown>;
  const ratingCount = Math.max(0, Math.floor(Number(row.ratingCount) || 0));
  const starsRaw = Number(row.stars);
  const stars =
    ratingCount > 0 && Number.isFinite(starsRaw) ? starsRaw : null;
  return {
    stars,
    ratingCount,
    effectiveStars: effectiveLabStars({ stars: starsRaw, ratingCount }),
  };
}

/**
 * 자동매칭 별점 다운그레이드.
 * 기공소 유효 별점의 수가배수 > 의뢰(자동매칭) 별점 배수이면 표시용 페이로드.
 */
export function resolveStarDowngrade({
  matchingMode,
  labEffectiveStars,
  autoMatchStars,
  offeredLabFee = 0,
}: {
  matchingMode?: unknown;
  labEffectiveStars?: unknown;
  autoMatchStars?: unknown;
  offeredLabFee?: unknown;
} = {}): StarDowngradeInfo | null {
  if (String(matchingMode || "").trim() !== "auto") return null;
  const requestStars = normalizePracticeLabStars(autoMatchStars);
  if (requestStars == null) return null;

  const labEffRaw = Number(labEffectiveStars);
  const labEff =
    Number.isFinite(labEffRaw) && labEffRaw > 0
      ? labEffRaw
      : DEFAULT_EFFECTIVE_LAB_STARS;
  const labMult = feeMultiplierForStars(labEff);
  const requestMult = feeMultiplierForStars(requestStars);
  if (!(labMult > requestMult)) return null;

  const offered = Math.max(0, Math.round(Number(offeredLabFee) || 0));
  const expected =
    offered > 0 && requestMult > 0
      ? Math.max(0, Math.round((offered * labMult) / requestMult))
      : 0;
  const delta = Math.max(0, expected - offered);

  return {
    labEffectiveStars: labEff,
    autoMatchStars: requestStars,
    labFeeMultiplier: labMult,
    autoMatchFeeMultiplier: requestMult,
    offeredLabFee: offered,
    expectedLabFeeAtOwnStars: expected,
    labFeeDeltaWon: delta,
  };
}

export function parseStarDowngrade(raw: unknown): StarDowngradeInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return resolveStarDowngrade({
    matchingMode: "auto",
    labEffectiveStars: row.labEffectiveStars,
    autoMatchStars: row.autoMatchStars,
    offeredLabFee: row.offeredLabFee,
  });
}

/** 별점 숫자 라벨(4 → "4", 4.25 → "4.3"). */
export function formatLabStarsLabel(stars: unknown): string {
  const n = Number(stars);
  if (!Number.isFinite(n) || n <= 0) return String(DEFAULT_EFFECTIVE_LAB_STARS);
  if (n % 1 !== 0) return n.toFixed(1);
  return String(Math.round(n * 10) / 10);
}
