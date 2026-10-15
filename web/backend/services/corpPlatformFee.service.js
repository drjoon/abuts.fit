// change-log:
// - 2026-10-15: 법인→어벗츠기공소 정액 청구 단가(플랫폼 사용료·CNC 장비 대여료·제품 단위 단가) 설정.
// related files:
// - web/backend/constants/abutsLabSettlement.js
// - web/backend/models/systemSettings.model.js
// - web/backend/controllers/admin/adminCorpPlatformFee.controller.js
// - rules.md §2.3
//
// 금액은 모두 부가세 포함(원, 정수). 청구 시 부가세를 따로 더하지 않는다.
// 거래금액 비율(정률)은 받지 않는다. 항목은 월 정액 2개와 제품 단위 고정 단가다.
// 제품 단위는 어벗츠기공소 기공수가 카탈로그(abutsLabFeeSchedule) 항목을 그대로 쓰고,
// 어벗츠 금액의 50%를 1000원 단위 올림한 값을 제안한다. 확정은 관리자가 저장한다.

export const CORP_FEE_MAX_WON = 100_000_000;
export const CORP_FEE_MAX_PRODUCTS = 50;
export const CORP_FEE_HISTORY_LIMIT = 50;

export const CORP_FEE_SUGGEST_RATIO = 0.5;
export const CORP_FEE_ROUND_UNIT_WON = 1000;

/** 어벗츠 금액의 50%를 1000원 단위로 올림한 제안가(부가세 포함). */
export function suggestCorpUnitFee(abutsPrice) {
  const price = Math.max(0, Number(abutsPrice) || 0);
  if (price <= 0) return 0;
  return (
    Math.ceil((price * CORP_FEE_SUGGEST_RATIO) / CORP_FEE_ROUND_UNIT_WON) *
    CORP_FEE_ROUND_UNIT_WON
  );
}

/**
 * 어벗츠기공소 기공수가 카탈로그 항목(적용 중, 검토 대기 제외)에
 * 저장된 법인 단가와 제안가를 붙인다. unitPrice null = 미결정.
 */
export function buildCorpProductRows(catalogItems, savedFees) {
  const saved = new Map(
    (Array.isArray(savedFees) ? savedFees : []).map((row) => [
      String(row?.key || ""),
      Math.max(0, toWon(row?.unitPrice) || 0),
    ]),
  );
  return (Array.isArray(catalogItems) ? catalogItems : [])
    .filter(
      (item) =>
        item?.id && item?.name && item.enabled !== false && !item.pendingReview,
    )
    .map((item) => {
      const key = String(item.id);
      const abutsPrice = Math.max(0, toWon(item.price) || 0);
      return {
        key,
        label: String(item.name),
        unit: item.unit,
        abutsPrice,
        suggestedPrice: suggestCorpUnitFee(abutsPrice),
        unitPrice: saved.has(key) ? saved.get(key) : null,
      };
    });
}

function toWon(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function cleanText(value, max) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** 저장 문서 → 응답 shape. 비어 있으면 기본 제품 목록을 채운다. */
export function normalizeCorpPlatformFees(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(src.productUnitFees) ? src.productUnitFees : [];
  return {
    platformUsageMonthlyFee: Math.max(0, toWon(src.platformUsageMonthlyFee) || 0),
    cncRentalMonthlyFee: Math.max(0, toWon(src.cncRentalMonthlyFee) || 0),
    productUnitFees: items.map((row) => ({
      key: cleanText(row?.key, 60),
      label: cleanText(row?.label, 60),
      unitPrice: Math.max(0, toWon(row?.unitPrice) || 0),
    })),
    note: cleanText(src.note, 500),
    updatedAt: src.updatedAt || null,
    updatedBy: cleanText(src.updatedBy, 60),
    history: Array.isArray(src.history) ? src.history : [],
  };
}

/**
 * PATCH 본문 검증. 주어진 필드만 반영한다.
 * 정률 필드(rate, percent 등)가 오면 거부한다.
 * @returns {{ ok: true, value: object } | { ok: false, message: string }}
 */
export function validateCorpPlatformFeesPatch(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const rateKeys = Object.keys(body).filter((k) => /rate|percent|ratio/i.test(k));
  if (rateKeys.length > 0) {
    return {
      ok: false,
      message:
        "법인 청구는 정액(제품 단위 고정 단가·월 정액)만 설정할 수 있습니다. 비율 항목은 받지 않습니다.",
    };
  }

  const value = {};
  for (const field of ["platformUsageMonthlyFee", "cncRentalMonthlyFee"]) {
    if (body[field] == null) continue;
    const won = toWon(body[field]);
    if (won == null || won < 0 || won > CORP_FEE_MAX_WON) {
      return {
        ok: false,
        message: "금액은 0원 이상 1억원 이하의 숫자여야 합니다.",
      };
    }
    value[field] = won;
  }

  if (body.productUnitFees != null) {
    if (!Array.isArray(body.productUnitFees)) {
      return { ok: false, message: "제품 단가 목록 형식이 올바르지 않습니다." };
    }
    if (body.productUnitFees.length > CORP_FEE_MAX_PRODUCTS) {
      return {
        ok: false,
        message: `제품 단가는 최대 ${CORP_FEE_MAX_PRODUCTS}개까지 등록할 수 있습니다.`,
      };
    }
    const seen = new Set();
    const items = [];
    for (const row of body.productUnitFees) {
      const key = cleanText(row?.key, 60);
      const label = cleanText(row?.label, 60);
      const won = toWon(row?.unitPrice);
      if (!key || !label) {
        return { ok: false, message: "제품 단가의 키와 이름은 비워 둘 수 없습니다." };
      }
      if (seen.has(key)) {
        return { ok: false, message: `제품 키가 중복되었습니다: ${key}` };
      }
      if (won == null || won < 0 || won > CORP_FEE_MAX_WON) {
        return {
          ok: false,
          message: `${label} 단가는 0원 이상 1억원 이하의 숫자여야 합니다.`,
        };
      }
      seen.add(key);
      items.push({ key, label, unitPrice: won });
    }
    value.productUnitFees = items;
  }

  if (body.note != null) value.note = cleanText(body.note, 500);

  if (Object.keys(value).length === 0) {
    return { ok: false, message: "변경할 항목이 없습니다." };
  }
  return { ok: true, value };
}

/** 변경 이력 1건(저장된 값 스냅샷). */
export function buildCorpFeeHistoryEntry({ next, actorLabel, at = new Date() }) {
  return {
    at,
    by: cleanText(actorLabel, 60),
    platformUsageMonthlyFee: next.platformUsageMonthlyFee,
    cncRentalMonthlyFee: next.cncRentalMonthlyFee,
    productUnitFees: next.productUnitFees,
    note: next.note,
  };
}
