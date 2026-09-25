// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/scripts/db/migrate-request-spend-to-gl.js
// - web/backend/scripts/db/migrate-legacy-creditledger-to-gl.js
// - web/backend/scripts/db/rebalance-manufacturer-unit-price.js
// change-log:
// - 2026-09-24: 딜러십 — 신규 유치 요율(기본 20%)·예약 인하(15/10)·유치 시점 스탬프. 월 매출 누진 철회.
// - 2026-09-24: 딜러십 영업 수수료 — 딜러 BA당 월 매출 누진 구간(기본 ≤5천만 20%/≤1억 15%/초과 10%).
// - 2026-09-25: 하청 기본 수수료 5% → 10%.
// - 2026-09-24: 지정 플랫폼 사용료 — 관리자 설정(초기 2% · 이벤트 off). 저장값 자동 승격 없음. 하청 10%.
// - 2026-09-23: 런칭 이벤트 on/off 변경 예약(내일 0시 KST, 분배 비율과 동일).
// - 2026-09-22: (일시) 지정 플랫폼 수수료 없음 — 9/24 복원.
// - 2026-09-20: 하청 기본 5%(2026-09-25에 10%로 변경).
// - 2026-09-20: 기본 10% 고정 · 이벤트 15/20% · 요율 변경 예약(KST 0시 적용).
// - 2026-09-20: 딜러십 요율 선택지 10/15/20%로 고정(관리자 스냅).
// - 2026-09-20: 딜러십 영업 수수료 — 기본 10% · 이벤트 15%(기본 on). 관리자 플랫폼 설정.
// - 2026-09-20: DEALERSHIP_SALES_COMMISSION_RATE 15%(심플웨이·커스텀어벗, 배송비 제외).
// - 2026-09-20: 제조사 매입가 = 판매가의 50%(포함가). 리메이크도 같은 매입가.
// - 2026-09-09: 리메이크 제조사 지급 — 무료(0) → 건당 부가세 포함 6,600원(manufacturerRemakeUnitPrice).
// - 2026-09-06: allocateAffiliateVatAcrossSupplyParts — 분할 라인 VAT 합=전체 VAT(반올림 드리프트 방지).
// - 2026-09-06: 과세 미정산 net = 포함가 합 − |지급|. computeManufacturerDailyNetPayout.
// - 2026-09-06: 미정산 net = 공급가 합(VAT 제외). computeManufacturerDailyNetPayout.
// - 2026-08-23: 제조사=일반과세. 매입가(부가세 포함)→공급가 분해, affiliateVatRate 적용.
// - 2026-08-19: 견적 표시용 수수료 — 원청(하청 후) 전액 수주 0, 하청은 subcontractFeeRate.
// - 2026-08-18: (철회) 제조사 하청 면세(기공소 등록) — 일반과세로 복귀.
// - 2026-08-17: 제조사 하청은 어벗 1개당 고정단가(기본 9,000). %분배·타 역할 재분배는 별도.
// - 2026-08-15: 제조사 의뢰 공급가 기본 8,000 → 9,000.
// - 2026-08-15: 제조사 %분배 → 하청 고정단가(의뢰/배송). 잔여는 salesman/devops/admin 재분배.
// - 2026-08-14: DEFAULT_PLATFORM_FEE_RATE 0.25 → 0.1 (자동매칭 성공 수수료).
// - 2026-08-16: 지정 거래 수수료 적용 on/off(기본 off=이벤트 0%).

/**
 * 딜러십 영업 수수료 기본(호환 alias).
 * @deprecated resolveDealershipCommissionPolicy().activeRate / resolveDealershipRateForAcquiredAt 사용.
 */
export const DEALERSHIP_SALES_COMMISSION_RATE = 0.2;
/** 딜러십 최저(최종) 요율. */
export const DEALERSHIP_BASE_COMMISSION_RATE = 0.1;
/** 딜러십 신규 유치 기본 요율(초기 20%). */
export const DEALERSHIP_ACTIVE_COMMISSION_RATE = 0.2;
/** @deprecated DEALERSHIP_ACTIVE_COMMISSION_RATE */
export const DEALERSHIP_EVENT_COMMISSION_RATE = DEALERSHIP_ACTIVE_COMMISSION_RATE;
/** 요율 선택지(관리자 인하 사다리). */
export const DEALERSHIP_COMMISSION_RATE_OPTIONS = [0.2, 0.15, 0.1];
/** @deprecated */
export const DEALERSHIP_EVENT_COMMISSION_RATE_OPTIONS = [0.15, 0.2];

/** @deprecated 월 매출 누진 — 유치시점 고정 요율로 대체. */
export const DEFAULT_DEALERSHIP_COMMISSION_TIERS = Object.freeze([
  Object.freeze({ upToAmount: 50_000_000, rate: 0.2 }),
  Object.freeze({ upToAmount: 100_000_000, rate: 0.15 }),
  Object.freeze({ upToAmount: null, rate: 0.1 }),
]);

function snapToOptions(raw, options, fallback) {
  const n = Number(raw);
  const list = Array.isArray(options) && options.length ? options : [fallback];
  if (!Number.isFinite(n) || n < 0) return fallback;
  const clamped = Math.min(1, n);
  let best = list[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of list) {
    const dist = Math.abs(option - clamped);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
}

function snapDealershipActiveRate(raw) {
  return snapToOptions(
    raw,
    DEALERSHIP_COMMISSION_RATE_OPTIONS,
    DEALERSHIP_ACTIVE_COMMISSION_RATE,
  );
}

function snapDealershipBaseRate(_raw) {
  return DEALERSHIP_BASE_COMMISSION_RATE;
}

function snapDealershipEventRate(raw) {
  return snapDealershipActiveRate(raw);
}

function snapDealershipScheduledRate(raw) {
  return snapDealershipActiveRate(raw);
}

/**
 * 요율 변경 이력 정규화.
 * @returns {{ effectiveFrom: Date, rate: number }[]}
 */
export function normalizeDealershipCommissionRateLog(rawLog, activeRate) {
  const fallbackRate = snapDealershipActiveRate(activeRate);
  const rows = Array.isArray(rawLog) ? rawLog : [];
  const parsed = [];
  for (const row of rows) {
    const at = parseDealershipEventBound(row?.effectiveFrom ?? row?.at);
    if (!at) continue;
    parsed.push({
      effectiveFrom: at,
      rate: snapDealershipActiveRate(row?.rate),
    });
  }
  parsed.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  if (!parsed.length) {
    return [
      {
        effectiveFrom: new Date("2020-01-01T00:00:00+09:00"),
        rate: fallbackRate,
      },
    ];
  }
  return parsed;
}

/**
 * 딜러십 영업 수수료 정책.
 * - activeRate: 신규 유치(가입·재귀속) 요율은 20% 고정
 * - 15%·10% 인하 예약은 적용하지 않는다
 * - 이미 유치한 의뢰자의 스탬프(BA.dealershipCommissionRate)는 그대로 읽는다
 * - 90일(약 3개월) 무주문 리셋 후 재유치 시 그 당시 activeRate를 새로 스탬프
 */
export function resolveDealershipCommissionPolicy(creditSettings = {}) {
  const activeRate = DEALERSHIP_ACTIVE_COMMISSION_RATE;
  const baseRate = snapDealershipBaseRate(
    creditSettings?.dealershipBaseCommissionRate,
  );
  const rateLog = normalizeDealershipCommissionRateLog(
    creditSettings?.dealershipCommissionRateLog,
    activeRate,
  );
  const rateChangeScheduledAt = null;
  const rateChangeScheduledRate = null;
  // 레거시 호환 필드
  const eventRate = activeRate;
  const eventEnabled = true;
  const eventStartedAt = rateLog[0]?.effectiveFrom || null;
  const eventEndedAt = null;
  return {
    activeRate,
    baseRate,
    rateLog,
    eventRate,
    eventEnabled,
    eventStartedAt,
    eventEndedAt,
    rateChangeScheduledAt,
    rateChangeScheduledRate,
    /** @deprecated 신규 유치 요율 = activeRate */
    effectiveRate: activeRate,
    /** @deprecated 누진 제거 — 빈 배열 유지(호환) */
    tiers: [],
  };
}

/** @deprecated */
export function normalizeDealershipCommissionTiers(_rawTiers) {
  return DEFAULT_DEALERSHIP_COMMISSION_TIERS.map((t) => ({
    upToAmount: t.upToAmount,
    rate: t.rate,
  }));
}

/** @deprecated */
export function computeDealershipProgressiveCommission() {
  return { commissionAmount: 0, slices: [] };
}

function parseDealershipEventBound(raw) {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 예약 요율이 도래했는지. scheduledAt(KST 0시) ≤ now 이면 적용 대상.
 * @returns {{ due: boolean, applyAt: Date|null, rate: number|null }}
 */
export function resolveDueDealershipRateChange(_creditSettings = {}, _now = new Date()) {
  return { due: false, applyAt: null, rate: null };
}

/**
 * 예약 요율 적용 패치(저장용). due가 아니면 null.
 * activeRate를 예약 요율로 인하하고 rateLog에 기록. 이미 유치한 BA 스탬프는 불변.
 */
export function buildDealershipRateChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, applyAt, rate } = resolveDueDealershipRateChange(
    creditSettings,
    now,
  );
  if (!due || rate == null || !applyAt) return null;

  const prevActive = snapDealershipActiveRate(
    creditSettings?.dealershipActiveCommissionRate ??
      creditSettings?.dealershipEventCommissionRate,
  );
  const rateLog = normalizeDealershipCommissionRateLog(
    creditSettings?.dealershipCommissionRateLog,
    prevActive,
  );
  const last = rateLog[rateLog.length - 1];
  const nextLog =
    last &&
    Math.abs(last.rate - rate) < 1e-9 &&
    last.effectiveFrom.getTime() === applyAt.getTime()
      ? rateLog
      : [...rateLog, { effectiveFrom: applyAt, rate }];

  const patch = {
    dealershipRateChangeScheduledAt: null,
    dealershipRateChangeScheduledRate: null,
    dealershipActiveCommissionRate: rate,
    dealershipEventCommissionRate: rate,
    dealershipEventCommissionEnabled: true,
    dealershipBaseCommissionRate: DEALERSHIP_BASE_COMMISSION_RATE,
    dealershipCommissionRateLog: nextLog,
  };

  // 분배 비율 딜러%도 같은 예약일부터 맞춤(신규 잔여 분배).
  const dealerPct = Math.round(rate * 100);
  const mfrRaw = Number(creditSettings?.manufacturerSharePercent);
  const mfr = Math.max(
    0,
    Math.min(100, Number.isFinite(mfrRaw) && mfrRaw >= 0 ? mfrRaw : 50),
  );
  const devopsRaw = Number(creditSettings?.devopsSharePercent);
  const devops = Math.max(
    0,
    Math.min(
      Number.isFinite(devopsRaw) ? devopsRaw : 5,
      Math.max(0, 100 - mfr - dealerPct),
    ),
  );
  patch.salesmanSharePercent = dealerPct;
  patch.devopsSharePercent = devops;
  patch.abutsSharePercent = Math.max(0, 100 - mfr - dealerPct - devops);
  patch.regularSalesmanSharePercent = 0;
  patch.regularDevopsSharePercent = devops;
  patch.regularAbutsSharePercent = Math.max(0, 100 - devops);

  return patch;
}

/**
 * 개발운영사 분배% 예약이 도래했는지.
 * @returns {{ due: boolean, applyAt: Date|null, percent: number|null }}
 */
export function resolveDueDevopsShareChange(creditSettings = {}, now = new Date()) {
  const applyAt = parseDealershipEventBound(
    creditSettings?.devopsShareChangeScheduledAt,
  );
  if (!applyAt) return { due: false, applyAt: null, percent: null };
  const raw = Number(creditSettings?.devopsShareChangeScheduledPercent);
  if (!Number.isFinite(raw) || raw < 0) {
    return { due: false, applyAt, percent: null };
  }
  const percent = Math.min(100, Math.round(raw * 100) / 100);
  const due = now.getTime() >= applyAt.getTime();
  return { due, applyAt, percent };
}

/**
 * 개발운영사 분배% 예약 적용 패치. due가 아니면 null.
 */
export function buildDevopsShareChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, percent } = resolveDueDevopsShareChange(creditSettings, now);
  if (!due || percent == null) return null;

  const dealerRaw = Number(creditSettings?.salesmanSharePercent);
  const dealer = Math.max(
    0,
    Math.min(100, Number.isFinite(dealerRaw) ? dealerRaw : 20),
  );
  const mfrRaw = Number(creditSettings?.manufacturerSharePercent);
  const mfr = Math.max(
    0,
    Math.min(100, Number.isFinite(mfrRaw) && mfrRaw >= 0 ? mfrRaw : 50),
  );
  const devops = Math.min(percent, Math.max(0, 100 - mfr - dealer));
  const abuts = Math.max(0, 100 - mfr - dealer - devops);

  return {
    devopsShareChangeScheduledAt: null,
    devopsShareChangeScheduledPercent: null,
    salesmanSharePercent: dealer,
    devopsSharePercent: devops,
    abutsSharePercent: abuts,
    regularSalesmanSharePercent: 0,
    regularDevopsSharePercent: devops,
    regularAbutsSharePercent: Math.max(0, 100 - devops),
  };
}

/**
 * 제조사 분배% 예약이 도래했는지(커스텀어벗).
 */
export function resolveDueManufacturerShareChange(
  creditSettings = {},
  now = new Date(),
) {
  const applyAt = parseDealershipEventBound(
    creditSettings?.manufacturerShareChangeScheduledAt,
  );
  if (!applyAt) return { due: false, applyAt: null, percent: null };
  const raw = Number(creditSettings?.manufacturerShareChangeScheduledPercent);
  if (!Number.isFinite(raw) || raw < 0) {
    return { due: false, applyAt, percent: null };
  }
  const percent = Math.min(100, Math.round(raw * 100) / 100);
  const due = now.getTime() >= applyAt.getTime();
  return { due, applyAt, percent };
}

/**
 * 제조사 분배% 예약 적용 패치(커스텀어벗). due가 아니면 null.
 */
export function buildManufacturerShareChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, percent } = resolveDueManufacturerShareChange(
    creditSettings,
    now,
  );
  if (!due || percent == null) return null;

  const dealerRaw = Number(creditSettings?.salesmanSharePercent);
  const dealer = Math.max(
    0,
    Math.min(100, Number.isFinite(dealerRaw) ? dealerRaw : 20),
  );
  const devopsRaw = Number(creditSettings?.devopsSharePercent);
  const devops = Math.max(
    0,
    Math.min(
      Number.isFinite(devopsRaw) ? devopsRaw : 5,
      Math.max(0, 100 - percent - dealer),
    ),
  );
  const mfr = Math.min(percent, Math.max(0, 100 - dealer - devops));
  const abuts = Math.max(0, 100 - mfr - dealer - devops);

  const sale = Math.max(
    0,
    Math.round(
      Number(
        creditSettings?.labProductionPrice ??
          creditSettings?.membershipProductionPrice ??
          0,
      ) || 0,
    ),
  );

  return {
    manufacturerShareChangeScheduledAt: null,
    manufacturerShareChangeScheduledPercent: null,
    manufacturerSharePercent: mfr,
    devopsSharePercent: devops,
    abutsSharePercent: abuts,
    manufacturerRequestUnitPrice: Math.round((sale * mfr) / 100),
  };
}

/**
 * 커스텀어벗 런칭 이벤트 on/off 예약이 도래했는지.
 */
export function resolveDueCustomAbutmentLaunchEventChange(
  creditSettings = {},
  now = new Date(),
) {
  const applyAt = parseDealershipEventBound(
    creditSettings?.customAbutmentLaunchEventChangeScheduledAt,
  );
  if (!applyAt) return { due: false, applyAt: null, enabled: null };
  if (
    typeof creditSettings?.customAbutmentLaunchEventChangeScheduledEnabled !==
    "boolean"
  ) {
    return { due: false, applyAt, enabled: null };
  }
  const due = now.getTime() >= applyAt.getTime();
  return {
    due,
    applyAt,
    enabled: creditSettings.customAbutmentLaunchEventChangeScheduledEnabled,
  };
}

/**
 * 런칭 이벤트 on/off 예약 적용 패치. due가 아니면 null.
 */
export function buildCustomAbutmentLaunchEventChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, enabled, applyAt } = resolveDueCustomAbutmentLaunchEventChange(
    creditSettings,
    now,
  );
  if (!due || typeof enabled !== "boolean") return null;

  return {
    customAbutmentLaunchEventChangeScheduledAt: null,
    customAbutmentLaunchEventChangeScheduledEnabled: null,
    customAbutmentLaunchEventEnabled: enabled,
    customAbutmentLaunchEventStartedAt: null,
    customAbutmentLaunchEventEndedAt: enabled ? null : applyAt || now,
  };
}

/**
 * 스토어 제조사 분배% 예약이 도래했는지.
 */
export function resolveDueStoreManufacturerShareChange(
  creditSettings = {},
  now = new Date(),
) {
  const applyAt = parseDealershipEventBound(
    creditSettings?.storeManufacturerShareChangeScheduledAt,
  );
  if (!applyAt) return { due: false, applyAt: null, percent: null };
  const raw = Number(
    creditSettings?.storeManufacturerShareChangeScheduledPercent,
  );
  if (!Number.isFinite(raw) || raw < 0) {
    return { due: false, applyAt, percent: null };
  }
  const percent = Math.min(100, Math.round(raw * 100) / 100);
  const due = now.getTime() >= applyAt.getTime();
  return { due, applyAt, percent };
}

/**
 * 스토어 제조사 분배% 예약 적용 패치. due가 아니면 null.
 */
export function buildStoreManufacturerShareChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, percent } = resolveDueStoreManufacturerShareChange(
    creditSettings,
    now,
  );
  if (!due || percent == null) return null;

  const dealerRaw = Number(creditSettings?.storeSalesmanSharePercent);
  const dealer = Math.max(
    0,
    Math.min(100, Number.isFinite(dealerRaw) ? dealerRaw : 20),
  );
  const devopsRaw = Number(creditSettings?.storeDevopsSharePercent);
  const devops = Math.max(
    0,
    Math.min(
      Number.isFinite(devopsRaw) ? devopsRaw : 5,
      Math.max(0, 100 - percent - dealer),
    ),
  );
  const mfr = Math.min(percent, Math.max(0, 100 - dealer - devops));
  const abuts = Math.max(0, 100 - mfr - dealer - devops);

  return {
    storeManufacturerShareChangeScheduledAt: null,
    storeManufacturerShareChangeScheduledPercent: null,
    storeManufacturerSharePercent: mfr,
    storeDevopsSharePercent: devops,
    storeAbutsSharePercent: abuts,
  };
}

/**
 * 스토어 딜러 분배% 예약이 도래했는지.
 * @returns {{ due: boolean, applyAt: Date|null, rate: number|null }}
 */
export function resolveDueStoreDealerRateChange(
  _creditSettings = {},
  _now = new Date(),
) {
  return { due: false, applyAt: null, rate: null };
}

/**
 * 스토어 딜러 분배% 예약 적용 패치. due가 아니면 null.
 * (딜러십 이벤트 요율은 건드리지 않음 — 커스텀어벗 예약만 연동)
 */
export function buildStoreDealerRateChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, rate } = resolveDueStoreDealerRateChange(creditSettings, now);
  if (!due || rate == null) return null;

  const dealerPct = Math.round(rate * 100);
  const mfrRaw = Number(creditSettings?.storeManufacturerSharePercent);
  const mfr = Math.max(
    0,
    Math.min(100, Number.isFinite(mfrRaw) && mfrRaw >= 0 ? mfrRaw : 50),
  );
  const devopsRaw = Number(creditSettings?.storeDevopsSharePercent);
  const devops = Math.max(
    0,
    Math.min(
      Number.isFinite(devopsRaw) ? devopsRaw : 5,
      Math.max(0, 100 - mfr - dealerPct),
    ),
  );
  return {
    storeDealerRateChangeScheduledAt: null,
    storeDealerRateChangeScheduledRate: null,
    storeSalesmanSharePercent: dealerPct,
    storeDevopsSharePercent: devops,
    storeAbutsSharePercent: Math.max(0, 100 - mfr - dealerPct - devops),
  };
}

/**
 * 스토어 개발운영사 분배% 예약이 도래했는지.
 */
export function resolveDueStoreDevopsShareChange(
  creditSettings = {},
  now = new Date(),
) {
  const applyAt = parseDealershipEventBound(
    creditSettings?.storeDevopsShareChangeScheduledAt,
  );
  if (!applyAt) return { due: false, applyAt: null, percent: null };
  const raw = Number(creditSettings?.storeDevopsShareChangeScheduledPercent);
  if (!Number.isFinite(raw) || raw < 0) {
    return { due: false, applyAt, percent: null };
  }
  const percent = Math.min(100, Math.round(raw * 100) / 100);
  const due = now.getTime() >= applyAt.getTime();
  return { due, applyAt, percent };
}

/**
 * 스토어 개발운영사 분배% 예약 적용 패치. due가 아니면 null.
 */
export function buildStoreDevopsShareChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const { due, percent } = resolveDueStoreDevopsShareChange(
    creditSettings,
    now,
  );
  if (!due || percent == null) return null;

  const dealerRaw = Number(creditSettings?.storeSalesmanSharePercent);
  const dealer = Math.max(
    0,
    Math.min(100, Number.isFinite(dealerRaw) ? dealerRaw : 20),
  );
  const mfrRaw = Number(creditSettings?.storeManufacturerSharePercent);
  const mfr = Math.max(
    0,
    Math.min(100, Number.isFinite(mfrRaw) && mfrRaw >= 0 ? mfrRaw : 50),
  );
  const devops = Math.min(percent, Math.max(0, 100 - mfr - dealer));
  const abuts = Math.max(0, 100 - mfr - dealer - devops);

  return {
    storeDevopsShareChangeScheduledAt: null,
    storeDevopsShareChangeScheduledPercent: null,
    storeSalesmanSharePercent: dealer,
    storeDevopsSharePercent: devops,
    storeAbutsSharePercent: abuts,
  };
}

function resolveDueLabShareFieldChange(
  creditSettings,
  atKey,
  pctKey,
  now = new Date(),
) {
  const applyAt = parseDealershipEventBound(creditSettings?.[atKey]);
  if (!applyAt) return { due: false, applyAt: null, percent: null };
  const raw = Number(creditSettings?.[pctKey]);
  if (!Number.isFinite(raw) || raw < 0) {
    return { due: false, applyAt, percent: null };
  }
  const percent = Math.min(100, Math.round(raw * 100) / 100);
  const due = now.getTime() >= applyAt.getTime();
  return { due, applyAt, percent };
}

/**
 * 기공 분배% 예약 적용 패치(기공사업부·영업팀·개발운영). due 없으면 null.
 * 어벗츠 = 100 − (기공사업부 + 영업팀 + 개발운영사).
 */
export function buildLabShareChangeApplyPatch(
  creditSettings = {},
  now = new Date(),
) {
  const bizDue = resolveDueLabShareFieldChange(
    creditSettings,
    "labBizShareChangeScheduledAt",
    "labBizShareChangeScheduledPercent",
    now,
  );
  const salesDue = resolveDueLabShareFieldChange(
    creditSettings,
    "labSalesTeamShareChangeScheduledAt",
    "labSalesTeamShareChangeScheduledPercent",
    now,
  );
  const devopsDue = resolveDueLabShareFieldChange(
    creditSettings,
    "labDevopsShareChangeScheduledAt",
    "labDevopsShareChangeScheduledPercent",
    now,
  );
  if (!bizDue.due && !salesDue.due && !devopsDue.due) return null;

  const readPct = (raw, fallback) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(100, Math.round(n * 100) / 100);
  };

  let biz = readPct(creditSettings?.labBizSharePercent, 50);
  let salesTeam = readPct(creditSettings?.labSalesTeamSharePercent, 20);
  let devops = readPct(creditSettings?.labDevopsSharePercent, 5);

  if (bizDue.due && bizDue.percent != null) biz = bizDue.percent;
  if (salesDue.due && salesDue.percent != null) salesTeam = salesDue.percent;
  if (devopsDue.due && devopsDue.percent != null) devops = devopsDue.percent;

  // 합이 100 넘으면 어벗츠 0 기준으로 뒤에서부터 캡.
  if (biz + salesTeam + devops > 100) {
    devops = Math.min(devops, Math.max(0, 100 - biz - salesTeam));
    salesTeam = Math.min(salesTeam, Math.max(0, 100 - biz - devops));
    biz = Math.min(biz, Math.max(0, 100 - salesTeam - devops));
  }
  const abuts = Math.max(0, 100 - biz - salesTeam - devops);

  const patch = {
    labBizSharePercent: biz,
    labSalesTeamSharePercent: salesTeam,
    labDevopsSharePercent: devops,
    labAbutsSharePercent: abuts,
  };
  if (bizDue.due) {
    patch.labBizShareChangeScheduledAt = null;
    patch.labBizShareChangeScheduledPercent = null;
  }
  if (salesDue.due) {
    patch.labSalesTeamShareChangeScheduledAt = null;
    patch.labSalesTeamShareChangeScheduledPercent = null;
  }
  if (devopsDue.due) {
    patch.labDevopsShareChangeScheduledAt = null;
    patch.labDevopsShareChangeScheduledPercent = null;
  }
  return patch;
}

/**
 * 유치(가입·재귀속) 시점 기준 딜러십 요율.
 * stampedRate(BA.dealershipCommissionRate)가 있으면 우선.
 * 없으면 rateLog에서 acquiredAt 이하 최신 요율.
 * @returns {{ tier: "20"|"15"|"10"|"custom", rate: number }}
 */
export function resolveDealershipRateForAcquiredAt(
  acquiredAt,
  policy = {},
  stampedRate = null,
) {
  if (stampedRate != null && stampedRate !== "") {
    const rate = snapDealershipActiveRate(stampedRate);
    return { tier: String(Math.round(rate * 100)), rate };
  }

  const activeRate = snapDealershipActiveRate(
    policy.activeRate ?? policy.eventRate ?? DEALERSHIP_ACTIVE_COMMISSION_RATE,
  );
  const rateLog = normalizeDealershipCommissionRateLog(
    policy.rateLog,
    activeRate,
  );
  const at = parseDealershipEventBound(acquiredAt);
  if (!at) {
    return { tier: String(Math.round(activeRate * 100)), rate: activeRate };
  }

  let chosen = rateLog[0];
  for (const row of rateLog) {
    if (row.effectiveFrom.getTime() <= at.getTime()) {
      chosen = row;
    } else {
      break;
    }
  }
  const rate = chosen?.rate ?? activeRate;
  return { tier: String(Math.round(rate * 100)), rate };
}

export const WITH_SALESMAN_DEFAULT_RATES = {
  manufacturerRate: 0,
  devopsRate: 0.1,
  salesmanRate: 0.3,
  adminRate: 0.4,
};

/** 딜러 없을 때 잔여 분배 기본(개발운영 20% / 어벗츠 80%). */
export const WITHOUT_SALESMAN_RESIDUAL_RATES = {
  devopsRate: 0.2,
  salesmanRate: 0,
  adminRate: 0.8,
};

/** 제조사 하청 공급가·부가세 SSOT 기본값 (creditSettings와 동기). */
export const DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE = 8800;
/** 레거시 저장값. 정산은 리메이크 구분 없이 판매가의 50%를 쓴다. */
export const DEFAULT_MANUFACTURER_REMAKE_UNIT_PRICE = 6600;
/** 제조사 매입가(부가세 포함) = 판매가(부가세 면제) × 이 비율. */
export const MANUFACTURER_PURCHASE_OF_SALE_RATE = 0.5;
export const DEFAULT_MANUFACTURER_SHIPPING_UNIT_PRICE = 3500;
export const DEFAULT_AFFILIATE_VAT_RATE = 0.1;
export const MANUFACTURER_PRODUCTION_LEDGER_LABEL = "커스텀어벗 생산";

/** 제조사 매입가(부가세 포함) → 공급가/세액. 스토어 포함가 분해와 동일. */
export function splitManufacturerInclusiveUnitPrice(
  inclusiveAmount,
  vatRate = DEFAULT_AFFILIATE_VAT_RATE,
) {
  const total = Math.max(0, Math.round(Number(inclusiveAmount || 0)));
  const rate = Number(vatRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { supply: total, vat: 0, total, vatRate: 0 };
  }
  const normalizedRate = Math.min(1, rate);
  const supply = Math.round(total / (1 + normalizedRate));
  const vat = total - supply;
  return { supply, vat, total, vatRate: normalizedRate };
}

export function normalizeAffiliateVatRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_AFFILIATE_VAT_RATE;
  return Math.min(1, n);
}

/**
 * 공급가 분할(유료/무료의뢰/무료배송)에 VAT를 배분.
 * 라인별 round(supply×rate) 금지 — 합이 전체 VAT와 어긋나 포함가 +1원 등이 생김.
 * @param {{ supply: number, creditKind: string }[]} parts
 * @returns {{ supply: number, vat: number, total: number, creditKind: string }[]}
 */
export function allocateAffiliateVatAcrossSupplyParts(
  parts,
  vatRate = DEFAULT_AFFILIATE_VAT_RATE,
) {
  const normalized = (Array.isArray(parts) ? parts : [])
    .map((p) => ({
      creditKind: String(p?.creditKind || ""),
      supply: Math.max(0, Math.round(Number(p?.supply || 0))),
    }))
    .filter((p) => p.supply > 0 && p.creditKind);

  if (!normalized.length) return [];

  const rate = normalizeAffiliateVatRate(vatRate);
  const totalSupply = normalized.reduce((sum, p) => sum + p.supply, 0);
  const totalVat = rate > 0 ? Math.round(totalSupply * rate) : 0;
  if (totalVat <= 0) {
    return normalized.map((p) => ({
      ...p,
      vat: 0,
      total: p.supply,
    }));
  }

  const withExact = normalized.map((p) => {
    const exact = (p.supply / totalSupply) * totalVat;
    const vatFloor = Math.floor(exact);
    return {
      ...p,
      vat: vatFloor,
      frac: exact - vatFloor,
    };
  });
  let remain = totalVat - withExact.reduce((sum, p) => sum + p.vat, 0);
  withExact
    .slice()
    .sort((a, b) => b.frac - a.frac || b.supply - a.supply)
    .forEach((p) => {
      if (remain <= 0) return;
      p.vat += 1;
      remain -= 1;
    });

  return withExact.map(({ creditKind, supply, vat }) => ({
    creditKind,
    supply,
    vat,
    total: supply + vat,
  }));
}

/** 제조사 정산 카드·일별 집계에서 의뢰(생산)로 보는 이벤트. */
export const MANUFACTURER_REQUEST_EARN_EVENT_TYPES = [
  "REQUEST_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "PRACTICE_TRANSFER_ESCROW_RELEASE",
];
export const MANUFACTURER_SHIPPING_EARN_EVENT_TYPES = ["SHIPPING_SPEND_COMMIT"];

/** 미정산 순액 = 부가세 포함가 합(유료+무료) − |지급| + 조정. */
export function computeManufacturerDailyNetPayout({
  requestSupply = 0,
  shippingSupply = 0,
  requestInclusive,
  shippingInclusive,
  refundAmount = 0,
  payoutAmount = 0,
  adjustAmount = 0,
} = {}) {
  const request =
    requestInclusive !== undefined ? requestInclusive : requestSupply;
  const shipping =
    shippingInclusive !== undefined ? shippingInclusive : shippingSupply;
  return (
    Math.round(Number(request || 0)) +
    Math.round(Number(shipping || 0)) +
    Math.round(Number(refundAmount || 0)) -
    Math.abs(Math.round(Number(payoutAmount || 0))) +
    Math.round(Number(adjustAmount || 0))
  );
}

export function resolveConfiguredRevenueRates(devopsPayoutRates) {
  return {
    manufacturerRate: Number(
      devopsPayoutRates?.manufacturerRate ?? WITH_SALESMAN_DEFAULT_RATES.manufacturerRate,
    ),
    devopsRate: Number(devopsPayoutRates?.devopsRate ?? WITH_SALESMAN_DEFAULT_RATES.devopsRate),
    salesmanRate: Number(
      devopsPayoutRates?.salesmanRate ?? WITH_SALESMAN_DEFAULT_RATES.salesmanRate,
    ),
    adminRate: Number(devopsPayoutRates?.adminRate ?? WITH_SALESMAN_DEFAULT_RATES.adminRate),
  };
}

function roundRate4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

/**
 * 딜러사 소개가 없을 때: 딜러사 분배비의 절반 → 제조사, 나머지 절반 → 어벗츠.
 * 레거시 %분배용. 제조사 고정단가 경로에서는 salesman 몫만 admin에 가산한다.
 */
export function resolveRatesWithoutSalesman(configuredRates) {
  const rates = resolveConfiguredRevenueRates(configuredRates);
  const halfSalesman = Number(rates.salesmanRate || 0) / 2;
  return {
    manufacturerRate: roundRate4(Number(rates.manufacturerRate || 0) + halfSalesman),
    devopsRate: roundRate4(rates.devopsRate),
    salesmanRate: 0,
    adminRate: roundRate4(Number(rates.adminRate || 0) + halfSalesman),
  };
}

/** 잔여(비제조사) 분배율: 딜러사 없으면 개발운영 20% / 어벗츠 80% (설정 잔여 비중 SSOT). */
export function resolveResidualRatesWithoutSalesman(configuredRates) {
  const rates = resolveConfiguredRevenueRates(configuredRates);
  const devops = Number(rates.devopsRate || 0);
  const salesman = Number(rates.salesmanRate || 0);
  const admin = Number(rates.adminRate || 0);
  // 레거시 with-salesman 설정만 있을 때 폴드하지 않고 without 기본 비중 사용.
  if (
    Math.abs(devops - 0.1) < 1e-9 &&
    Math.abs(salesman - 0.3) < 1e-9 &&
    Math.abs(admin - 0.4) < 1e-9
  ) {
    return { ...WITHOUT_SALESMAN_RESIDUAL_RATES };
  }
  if (salesman <= 0 && devops + admin > 0) {
    return {
      devopsRate: roundRate4(devops),
      salesmanRate: 0,
      adminRate: roundRate4(admin),
    };
  }
  return { ...WITHOUT_SALESMAN_RESIDUAL_RATES };
}

export const WITHOUT_SALESMAN_RATES = resolveRatesWithoutSalesman(WITH_SALESMAN_DEFAULT_RATES);

export const DEFAULT_PLATFORM_FEE_RATE = 0.1;
/** 어벗츠 원청을 타 기공소가 하청 수행할 때 공제율(기본 10%, 수행 기공소 90%). */
export const DEFAULT_SUBCONTRACT_FEE_RATE = 0.1;
/** 지정 기공소(direct/협력) 정책 요율 2%(적용 on일 때). */
export const DEFAULT_DIRECT_PLATFORM_FEE_RATE = 0.02;
/** 직전 정책 요율(1%). 마이그레이션 참고용. */
export const PREV_DEFAULT_DIRECT_PLATFORM_FEE_RATE = 0.01;
/** 구 스키마 기본(off + 5%). 마이그레이션 참고용. */
export const LEGACY_DEFAULT_DIRECT_PLATFORM_FEE_RATE = 0.05;
/**
 * 지정 거래 수수료 적용 기본값.
 * false = 이벤트 기간 실효 0%(정책 요율 2%는 유지, 추후 공지 후 on 가능).
 */
export const DEFAULT_DIRECT_PLATFORM_FEE_ENABLED = false;
/** @deprecated 등록/미등록 2단계 폐지. 읽기 fallback 전용. */
export const DEFAULT_PARTNER_FEE_RATE = 0;
export const DEFAULT_NON_PARTNER_FEE_RATE = DEFAULT_PLATFORM_FEE_RATE;

export function resolvePlatformFeeRate(payoutRates) {
  const raw = payoutRates?.platformFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  const legacy = Number(
    payoutRates?.nonPartnerFeeRate ?? DEFAULT_PLATFORM_FEE_RATE,
  );
  return Number.isFinite(legacy)
    ? Math.min(1, Math.max(0, legacy))
    : DEFAULT_PLATFORM_FEE_RATE;
}

/** 지정 거래 수수료 적용 여부. 관리자 on만 부과(기본 off=이벤트 무료). */
export function isDirectPlatformFeeEnabled(payoutRates) {
  return payoutRates?.directPlatformFeeEnabled === true;
}

/**
 * 지정 거래 설정 요율(적용 off여도 저장값 유지).
 * 미설정만 기본 2%. 저장된 값은 관리자 설정 그대로(자동 승격 없음).
 */
export function resolveDirectPlatformFeeRateConfigured(payoutRates) {
  const raw = payoutRates?.directPlatformFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  return DEFAULT_DIRECT_PLATFORM_FEE_RATE;
}

/** 지정 거래(direct) 실효 수수료율. 적용 off면 0. */
export function resolveDirectPlatformFeeRate(payoutRates) {
  if (!isDirectPlatformFeeEnabled(payoutRates)) return 0;
  return resolveDirectPlatformFeeRateConfigured(payoutRates);
}

export function resolveSubcontractFeeRate(payoutRates) {
  const raw = payoutRates?.subcontractFeeRate;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.min(1, Math.max(0, Number(raw)));
  }
  return DEFAULT_SUBCONTRACT_FEE_RATE;
}

/**
 * 기공의뢰 플랫폼/하청 수수료율.
 * - 하청 수행(assigneeKind=subcontract): subcontractFeeRate (기본 10%)
 * - 협력(assigneeKind=cooperation)·어벗츠 자체 수행·지정: 지정 적용 on이면 directPlatformFeeRate(기본 2%), off면 0(이벤트)
 */
export function resolvePracticeTransferFeeRate({
  matchingMode,
  payoutRates,
  subcontracted = false,
} = {}) {
  if (subcontracted) return resolveSubcontractFeeRate(payoutRates);
  if (String(matchingMode || "").trim() === "auto") {
    return 0;
  }
  return resolveDirectPlatformFeeRate(payoutRates);
}

/**
 * 견적 표시용 수수료율.
 * 원청(어벗츠 기공사업부)이 하청을 준 뒤 자기 화면을 보면 전액 수주이므로 0.
 * 하청 수행 기공소는 subcontractFeeRate. 협력은 0.
 */
export function resolvePracticeTransferFeeRateForViewer({
  matchingMode,
  payoutRates,
  subcontracted = false,
  viewerIsPrimeContractor = false,
} = {}) {
  if (subcontracted && viewerIsPrimeContractor) return 0;
  return resolvePracticeTransferFeeRate({
    matchingMode,
    payoutRates,
    subcontracted,
  });
}

export function isShippingSpendRevenueContext({ refType, freeAccountCode }) {
  return (
    String(refType || "") === "SHIPPING_PACKAGE" ||
    String(freeAccountCode || "") === "REQ_FREE_SHIPPING_CREDIT"
  );
}

/** 판매가(부가세 면제) → 매입가(부가세 포함) = 50%. */
export function manufacturerPurchaseFromSale(saleAmount, rateOrSettings) {
  const sale = Math.max(0, Math.round(Number(saleAmount) || 0));
  let rate = MANUFACTURER_PURCHASE_OF_SALE_RATE;
  if (typeof rateOrSettings === "number") {
    const pct = Number(rateOrSettings);
    if (Number.isFinite(pct) && pct >= 0) {
      rate = Math.min(1, pct > 1 ? pct / 100 : pct);
    }
  } else if (rateOrSettings && typeof rateOrSettings === "object") {
    const pct = Number(rateOrSettings.manufacturerSharePercent);
    if (Number.isFinite(pct) && pct >= 0) {
      rate = Math.min(1, pct / 100);
    }
  }
  return Math.round(sale * rate);
}

function readPositiveWon(...values) {
  for (const raw of values) {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** 커스텀어벗 판매가. 없으면 0(호출부가 저장 매입가로 폴백). */
export function readCustomAbutmentSalePrice(creditSettings = {}) {
  return readPositiveWon(
    creditSettings?.labProductionPrice,
    creditSettings?.membershipProductionPrice,
    creditSettings?.minCreditForRequest,
  );
}

export function resolveManufacturerUnitSettings(creditSettings = {}) {
  // 제조사=일반과세. 매입가(부가세 포함)는 판매가의 50%. 리메이크도 동일.
  const vatRate = normalizeAffiliateVatRate(creditSettings?.affiliateVatRate);
  const sale = readCustomAbutmentSalePrice(creditSettings);
  const requestInclusive =
    sale > 0
      ? manufacturerPurchaseFromSale(sale, creditSettings)
      : Math.max(
          0,
          Math.round(
            Number(
              creditSettings?.manufacturerRequestUnitPrice ??
                DEFAULT_MANUFACTURER_REQUEST_UNIT_PRICE,
            ) || 0,
          ),
        );
  const shippingInclusive = Math.max(
    0,
    Math.round(
      Number(
        creditSettings?.manufacturerShippingUnitPrice ??
          DEFAULT_MANUFACTURER_SHIPPING_UNIT_PRICE,
      ) || 0,
    ),
  );
  const request = splitManufacturerInclusiveUnitPrice(requestInclusive, vatRate);
  const shipping = splitManufacturerInclusiveUnitPrice(
    shippingInclusive,
    vatRate,
  );
  return {
    requestSupply: request.supply,
    shippingSupply: shipping.supply,
    requestInclusive: request.total,
    shippingInclusive: shipping.total,
    vatRate,
  };
}

export function resolveManufacturerUnitQty({
  abutmentQty,
  isShippingSpend = false,
} = {}) {
  if (isShippingSpend) return 1;
  const qty = Math.floor(Number(abutmentQty) || 0);
  return Math.max(1, qty);
}

/**
 * 제조사 하청 단가를 적립할지.
 * 플랫폼 수수료·기공소 배송·신속추가는 제외. 생산(어벗 개당)·어벗츠→제조사 배송만.
 * 리메이크도 같은 매입가. 가입 무료 테스트만 제조사 0.
 */
export function resolveManufacturerUnitApply({
  usageKind = "",
  source = "",
  displayKind = "",
  abutmentQty = 0,
  abutmentRetailTotal = 0,
  isShippingSpend = false,
  isRemake = false,
  isSignupFreeTest = false,
} = {}) {
  void isRemake;
  const usage = String(usageKind || "").trim();
  const src = String(source || "").trim();
  const kind = String(displayKind || "").trim();
  if (usage === "express_surcharge") return false;
  if (usage === "practice_transfer_lab_shipping") return false;
  if (kind === "platform_fee" || src === "lab_platform_fee") return false;
  // 가입 무료 테스트 생산·배송은 제조사 무료.
  if (
    isSignupFreeTest &&
    !isShippingSpend &&
    usage !== "practice_transfer_abuts_shipping"
  ) {
    return false;
  }
  if (isSignupFreeTest && isShippingSpend) {
    return false;
  }
  if (isShippingSpend || usage === "practice_transfer_abuts_shipping") {
    return true;
  }
  if (src === "abutment_retail" || kind === "abuts_share") return true;
  if (
    (src === "non_partner_platform_fee" || src === "partner_platform_fee") &&
    !(Number(abutmentQty) > 0 || Number(abutmentRetailTotal) > 0)
  ) {
    return false;
  }
  return true;
}

/**
 * 제조사 하청 단가(공급가·VAT·합계).
 * applyManufacturerUnit=false(express_surcharge 등)이면 0.
 * 의뢰는 어벗 `qty`개당(매입가=판매가의 50%, 리메이크 구분 없음). 배송은 박스 1건.
 */
export function resolveManufacturerUnitEarn({
  isShippingSpend,
  creditSettings,
  applyManufacturerUnit = true,
  qty = 1,
  isRemake = false,
  remakeSaleAmount,
} = {}) {
  if (!applyManufacturerUnit) {
    return { supply: 0, vat: 0, total: 0, vatRate: 0, qty: 0 };
  }
  void isRemake;
  void remakeSaleAmount;
  const unit = resolveManufacturerUnitSettings(creditSettings);
  const units = resolveManufacturerUnitQty({
    abutmentQty: qty,
    isShippingSpend,
  });
  const unitSupply = isShippingSpend ? unit.shippingSupply : unit.requestSupply;
  const supply = unitSupply * units;
  const vat = Math.round(supply * unit.vatRate);
  return { supply, vat, total: supply + vat, vatRate: unit.vatRate, qty: units };
}

/**
 * @deprecated 레거시 %분배. 신규 커밋은 resolveRevenueOwnerBaseAllocation(고정단가) 사용.
 */
export function resolveRevenueBaseAllocation({ spendAmount, hasSalesmanReferrer, configuredRates }) {
  const effectiveRates = hasSalesmanReferrer
    ? resolveConfiguredRevenueRates(configuredRates)
    : resolveRatesWithoutSalesman(configuredRates);

  const plannedManufacturerBaseAmount = Math.round(
    spendAmount * Number(effectiveRates.manufacturerRate || 0),
  );
  const plannedDevopsBaseAmount = Math.round(spendAmount * Number(effectiveRates.devopsRate || 0));
  const plannedSalesmanBaseAmount = hasSalesmanReferrer
    ? Math.round(spendAmount * Number(effectiveRates.salesmanRate || 0))
    : 0;
  const plannedAdminBaseAmount = Math.max(
    spendAmount - plannedManufacturerBaseAmount - plannedDevopsBaseAmount - plannedSalesmanBaseAmount,
    0,
  );

  return {
    manufacturer: plannedManufacturerBaseAmount,
    devops: plannedDevopsBaseAmount,
    salesman: plannedSalesmanBaseAmount,
    admin: plannedAdminBaseAmount,
  };
}

function allocateResidualAmongAffiliates({
  residualAmount,
  hasSalesmanReferrer,
  configuredRates,
  owners,
}) {
  const residual = Math.max(0, Math.round(Number(residualAmount || 0)));
  const rates = hasSalesmanReferrer
    ? resolveConfiguredRevenueRates(configuredRates)
    : resolveResidualRatesWithoutSalesman(configuredRates);
  const devopsWeight = Math.max(0, Number(rates.devopsRate || 0));
  const salesmanWeight = hasSalesmanReferrer
    ? Math.max(0, Number(rates.salesmanRate || 0))
    : 0;
  const adminWeight = Math.max(0, Number(rates.adminRate || 0));
  const weightSum = devopsWeight + salesmanWeight + adminWeight;

  let plannedDevops = 0;
  let plannedSalesman = 0;
  let plannedAdmin = residual;
  if (weightSum > 0 && residual > 0) {
    plannedDevops = Math.round((residual * devopsWeight) / weightSum);
    plannedSalesman = Math.round((residual * salesmanWeight) / weightSum);
    plannedAdmin = Math.max(0, residual - plannedDevops - plannedSalesman);
  }

  const devops = owners?.devopsAnchorId ? plannedDevops : 0;
  const salesman = owners?.salesmanAnchorId ? plannedSalesman : 0;
  let admin =
    plannedAdmin +
    (plannedDevops - devops) +
    (plannedSalesman - salesman);

  const allocated = devops + salesman + admin;
  const gap = residual - allocated;
  if (gap !== 0) admin += gap;

  return { devops, salesman, admin };
}

export const REVENUE_OWNER_ORDER = ["manufacturer", "devops", "salesman", "admin"];

/** 플랫폼 creditSettings 잔여 비중(%) → 정산 residual rates. */
export function resolveResidualRatesFromCreditSettings(
  creditSettings = {},
  hasSalesmanReferrer = true,
) {
  if (hasSalesmanReferrer) {
    const salesman = Math.max(0, Number(creditSettings.salesmanSharePercent) || 0);
    const devops = Math.max(0, Number(creditSettings.devopsSharePercent) || 0);
    const abuts = Math.max(
      0,
      Number(
        creditSettings.abutsSharePercent ??
          Math.max(0, 100 - salesman - devops),
      ) || 0,
    );
    if (salesman + devops + abuts > 0) {
      return {
        manufacturerRate: 0,
        devopsRate: devops / 100,
        salesmanRate: salesman / 100,
        adminRate: abuts / 100,
      };
    }
  } else {
    if (!creditSettings || typeof creditSettings !== "object") {
      return null;
    }
    const devops = Math.max(
      0,
      Number(creditSettings.regularDevopsSharePercent) || 0,
    );
    const abuts = Math.max(
      0,
      Number(
        creditSettings.regularAbutsSharePercent ?? Math.max(0, 100 - devops),
      ) || 0,
    );
    if (devops + abuts > 0) {
      return {
        manufacturerRate: 0,
        devopsRate: devops / 100,
        salesmanRate: 0,
        adminRate: abuts / 100,
      };
    }
  }
  return null;
}

/**
 * 제조사 = 하청 고정 공급가. 잔여 = spend − 제조사 공급가 → salesman/devops/admin.
 * express 등 applyManufacturerUnit=false 이면 제조사 0·전액 잔여 분배.
 * 리메이크도 같은 매입가(판매가의 50%). 무료크레딧도 제조사 약정 단가 전액.
 * 배송: 제조사 배송 공급가, 잔여 → admin(및 잔여 비율이 있으면 동일 로직).
 * residual rates: creditSettings 잔여 비중 우선, 없으면 BA payoutRates.
 */
export function resolveRevenueOwnerBaseAllocation({
  spendAmount,
  hasSalesmanReferrer,
  configuredRates,
  owners,
  isShippingSpend,
  creditSettings,
  applyManufacturerUnit = true,
  qty = 1,
  isRemake = false,
  remakeSaleAmount,
}) {
  const spend = Math.max(0, Math.round(Number(spendAmount || 0)));
  const unitEarn = resolveManufacturerUnitEarn({
    isShippingSpend,
    creditSettings,
    applyManufacturerUnit,
    qty,
    isRemake,
    remakeSaleAmount,
  });

  // 저널 균형(의뢰자 소비 공급가 = REV 공급가 합): 단가는 소비액으로 캡.
  // 무료크레딧·리메이크도 같은 매입가(판매가의 50%).
  // VAT는 캡된 공급가×요율(어벗츠 추가 지급, 보존식 밖).
  const manufacturer =
    owners?.manufacturerAnchorId && applyManufacturerUnit
      ? Math.min(unitEarn.supply, spend)
      : 0;
  const manufacturerVat =
    manufacturer > 0 ? Math.round(manufacturer * Number(unitEarn.vatRate || 0)) : 0;

  const residual = Math.max(0, spend - manufacturer);

  if (isShippingSpend) {
    // 배송 잔여는 기본적으로 관리자. 타 role 앵커가 있어도 배송은 admin 귀속.
    return {
      manufacturer,
      devops: 0,
      salesman: 0,
      admin: residual,
      manufacturerVat,
      manufacturerVatRate: unitEarn.vatRate,
    };
  }

  const ratesFromCredit = resolveResidualRatesFromCreditSettings(
    creditSettings,
    hasSalesmanReferrer,
  );
  const residualSplit = allocateResidualAmongAffiliates({
    residualAmount: residual,
    hasSalesmanReferrer,
    configuredRates: ratesFromCredit || configuredRates,
    owners,
  });

  return {
    manufacturer,
    devops: residualSplit.devops,
    salesman: residualSplit.salesman,
    admin: residualSplit.admin,
    manufacturerVat,
    manufacturerVatRate: unitEarn.vatRate,
  };
}

function allocateIntegerByWeights({ total, weightByRole, roleOrder = REVENUE_OWNER_ORDER }) {
  const normalizedTotal = Math.max(0, Math.round(Number(total || 0)));
  const roles = roleOrder.filter((role) => Number(weightByRole?.[role] || 0) > 0);
  const allocated = Object.fromEntries(roleOrder.map((role) => [role, 0]));
  if (normalizedTotal <= 0 || roles.length <= 0) return allocated;

  const weightSum = roles.reduce(
    (sum, role) => sum + Math.max(0, Math.round(Number(weightByRole?.[role] || 0))),
    0,
  );
  if (weightSum <= 0) return allocated;

  const rawRows = roles.map((role) => {
    const weight = Math.max(0, Math.round(Number(weightByRole?.[role] || 0)));
    const raw = (normalizedTotal * weight) / weightSum;
    const floored = Math.floor(raw);
    return {
      role,
      weight,
      raw,
      floored,
      frac: raw - floored,
    };
  });

  let used = 0;
  for (const row of rawRows) {
    allocated[row.role] = row.floored;
    used += row.floored;
  }

  let remain = Math.max(0, normalizedTotal - used);
  rawRows.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
  });

  let idx = 0;
  while (remain > 0 && rawRows.length > 0) {
    allocated[rawRows[idx % rawRows.length].role] += 1;
    remain -= 1;
    idx += 1;
  }

  return allocated;
}

export function splitRevenueByCreditKindProRata({
  ownerBaseByRole,
  freeAmount,
  roleOrder = REVENUE_OWNER_ORDER,
}) {
  const result = {
    manufacturer: { paid: 0, free: 0 },
    devops: { paid: 0, free: 0 },
    salesman: { paid: 0, free: 0 },
    admin: { paid: 0, free: 0 },
  };

  const baseByRole = {
    manufacturer: Math.max(0, Math.round(Number(ownerBaseByRole?.manufacturer || 0))),
    devops: Math.max(0, Math.round(Number(ownerBaseByRole?.devops || 0))),
    salesman: Math.max(0, Math.round(Number(ownerBaseByRole?.salesman || 0))),
    admin: Math.max(0, Math.round(Number(ownerBaseByRole?.admin || 0))),
  };

  const totalBase = roleOrder.reduce((sum, role) => sum + Number(baseByRole[role] || 0), 0);
  const normalizedFree = Math.max(0, Math.min(totalBase, Math.round(Number(freeAmount || 0))));

  const freeByRole = allocateIntegerByWeights({
    total: normalizedFree,
    weightByRole: baseByRole,
    roleOrder,
  });

  let freeAllocatedTotal = 0;
  for (const role of roleOrder) {
    const base = Number(baseByRole[role] || 0);
    const free = Math.max(0, Math.min(base, Number(freeByRole[role] || 0)));
    const paid = Math.max(0, base - free);
    result[role] = { paid, free };
    freeAllocatedTotal += free;
  }

  return {
    ...result,
    freeAllocatedTotal,
    freeUnallocatedRemainder: Math.max(0, normalizedFree - freeAllocatedTotal),
  };
}
