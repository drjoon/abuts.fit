// change-log:
// - 2026-10-05: 어벗츠 고정 몫 40%.
// - 2026-10-05: 제조 구간 = 어벗츠 고정을 뺀 뒤 딜러 구간을 뺀 나머지.
// - 2026-10-05: 커스텀어벗 의뢰비 분배 — 딜러 1천~5천 누진 10~20% · 어벗츠 또는 제조 고정.
export const CUSTOM_ABUTMENT_SALE_WON = 13_000;
export const ABUTS_FIXED_SHARE_PCT = 40;
export const MANUFACTURER_FIXED_SHARE_PCT = 44;
/** 의뢰비 대비. 어벗츠 몫에서 차감. */
export const DEVOPS_FROM_ABUTS_SHARE_PCT = 5;

export type SplitMarginalBand = {
  fromQty: number;
  toQty: number | null;
  pct: number;
};

export const DEALER_MARGINAL_BANDS: ReadonlyArray<SplitMarginalBand> = [
  { fromQty: 1, toQty: 1_000, pct: 10 },
  { fromQty: 1_001, toQty: 2_000, pct: 12 },
  { fromQty: 2_001, toQty: 3_000, pct: 14 },
  { fromQty: 3_001, toQty: 4_000, pct: 16 },
  { fromQty: 4_001, toQty: 5_000, pct: 18 },
  { fromQty: 5_001, toQty: null, pct: 20 },
];

export function manufacturerMarginalPctForDealerPct(dealerPct: number): number {
  return 100 - ABUTS_FIXED_SHARE_PCT - dealerPct;
}

export const MANUFACTURER_MARGINAL_BANDS: ReadonlyArray<SplitMarginalBand> =
  DEALER_MARGINAL_BANDS.map((band) => ({
    ...band,
    pct: manufacturerMarginalPctForDealerPct(band.pct),
  }));

export const MANUFACTURER_FIXED_BANDS: ReadonlyArray<SplitMarginalBand> =
  DEALER_MARGINAL_BANDS.map((band) => ({
    ...band,
    pct: MANUFACTURER_FIXED_SHARE_PCT,
  }));

export const CUSTOM_ABUTMENT_SPLIT_QTY_ROWS: readonly number[] = [
  1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 11_000,
  12_000, 13_000, 14_000, 15_000, 16_000, 17_000, 18_000, 19_000, 20_000,
];

export type CustomAbutmentSplitRow = {
  qty: number;
  saleWon: number;
  dealerWon: number;
  dealerEffectivePct: number;
  dealerMarginalPct: number;
  dealerBandWon: number;
  manufacturerWon: number;
  manufacturerEffectivePct: number;
  manufacturerMarginalPct: number;
  manufacturerBandWon: number;
  abutsGrossWon: number;
  abutsGrossEffectivePct: number;
  devopsWon: number;
  abutsNetWon: number;
  abutsNetEffectivePct: number;
};

function dealerWonForQty(qty: number): number {
  let remaining = Math.max(0, Math.floor(qty));
  let won = 0;
  let cursor = 1;
  for (const band of DEALER_MARGINAL_BANDS) {
    if (remaining <= 0) break;
    const bandEnd = band.toQty ?? cursor + remaining - 1;
    const bandSize = bandEnd - cursor + 1;
    const take = Math.min(remaining, bandSize);
    won += take * Math.round((CUSTOM_ABUTMENT_SALE_WON * band.pct) / 100);
    remaining -= take;
    cursor += take;
  }
  return won;
}

export function dealerMarginalBandForQty(qty: number) {
  const n = Math.max(0, Math.floor(qty));
  let found = DEALER_MARGINAL_BANDS[0];
  for (const band of DEALER_MARGINAL_BANDS) {
    if (n >= band.fromQty && (band.toQty == null || n <= band.toQty)) {
      found = band;
      break;
    }
  }
  const bandStart = found.fromQty;
  const bandEnd = found.toQty == null ? n : Math.min(n, found.toQty);
  const bandQty = n <= 0 ? 0 : Math.max(0, bandEnd - bandStart + 1);
  const unitWon = Math.round((CUSTOM_ABUTMENT_SALE_WON * found.pct) / 100);
  return {
    pct: found.pct,
    bandQty,
    bandWon: bandQty * unitWon,
  };
}

function pctOfSale(won: number, qty: number): number {
  const sale = qty * CUSTOM_ABUTMENT_SALE_WON;
  if (sale <= 0) return 0;
  return (won / sale) * 100;
}

function withDevopsFromAbuts(
  qty: number,
  manufacturerWon: number,
  dealerWon: number,
  abutsGrossWon: number,
  manufacturerMarginalPct: number,
): CustomAbutmentSplitRow {
  const saleWon = qty * CUSTOM_ABUTMENT_SALE_WON;
  const devopsWon = Math.round(
    (saleWon * DEVOPS_FROM_ABUTS_SHARE_PCT) / 100,
  );
  const abutsNetWon = abutsGrossWon - devopsWon;
  const band = dealerMarginalBandForQty(qty);
  const manufacturerUnitWon = Math.round(
    (CUSTOM_ABUTMENT_SALE_WON * manufacturerMarginalPct) / 100,
  );
  return {
    qty,
    saleWon,
    dealerWon,
    dealerEffectivePct: pctOfSale(dealerWon, qty),
    dealerMarginalPct: band.pct,
    dealerBandWon: band.bandWon,
    manufacturerWon,
    manufacturerEffectivePct: pctOfSale(manufacturerWon, qty),
    manufacturerMarginalPct,
    manufacturerBandWon: band.bandQty * manufacturerUnitWon,
    abutsGrossWon,
    abutsGrossEffectivePct: pctOfSale(abutsGrossWon, qty),
    devopsWon,
    abutsNetWon,
    abutsNetEffectivePct: pctOfSale(abutsNetWon, qty),
  };
}

/** 어벗츠 고정. 나머지를 제조·딜러 누진. */
export function splitAbutsFixedRow(qty: number): CustomAbutmentSplitRow {
  const saleWon = qty * CUSTOM_ABUTMENT_SALE_WON;
  const dealerWon = dealerWonForQty(qty);
  const abutsGrossWon = Math.round((saleWon * ABUTS_FIXED_SHARE_PCT) / 100);
  const manufacturerWon = saleWon - abutsGrossWon - dealerWon;
  const band = dealerMarginalBandForQty(qty);
  return withDevopsFromAbuts(
    qty,
    manufacturerWon,
    dealerWon,
    abutsGrossWon,
    manufacturerMarginalPctForDealerPct(band.pct),
  );
}

/** 제조 44% 고정. 나머지 56%를 딜러 누진·어벗츠. */
export function splitManufacturerFixedRow(qty: number): CustomAbutmentSplitRow {
  const saleWon = qty * CUSTOM_ABUTMENT_SALE_WON;
  const dealerWon = dealerWonForQty(qty);
  const manufacturerWon = Math.round(
    (saleWon * MANUFACTURER_FIXED_SHARE_PCT) / 100,
  );
  const abutsGrossWon = saleWon - manufacturerWon - dealerWon;
  return withDevopsFromAbuts(
    qty,
    manufacturerWon,
    dealerWon,
    abutsGrossWon,
    MANUFACTURER_FIXED_SHARE_PCT,
  );
}

export function splitAbutsFixedRows(
  qtys: readonly number[] = CUSTOM_ABUTMENT_SPLIT_QTY_ROWS,
): CustomAbutmentSplitRow[] {
  return qtys.map(splitAbutsFixedRow);
}

export function splitManufacturerFixedRows(
  qtys: readonly number[] = CUSTOM_ABUTMENT_SPLIT_QTY_ROWS,
): CustomAbutmentSplitRow[] {
  return qtys.map(splitManufacturerFixedRow);
}

export function formatSharePct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${rounded.toFixed(1)}%`;
}

export function formatManwon(won: number): string {
  const man = won / 10_000;
  if (Number.isInteger(man)) return `${man.toLocaleString("ko-KR")}만`;
  return `${man.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`;
}
