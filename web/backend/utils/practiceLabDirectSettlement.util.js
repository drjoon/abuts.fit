// related files:
// - web/backend/services/practiceLabDirectSettlement.service.js
// - web/backend/models/practiceLabDirectSettlement.model.js

export const DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH =
  String(process.env.DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH || "2026-10").trim() ||
  "2026-10";

export const DIRECT_SETTLEMENT_LOCKED_STATUSES = new Set([
  "DEPOSIT_CONFIRMED",
  "INVOICE_ISSUED",
  "SELF_INVOICE",
]);

export function isExternalLabBusinessType(businessType) {
  const kind = String(businessType || "").trim();
  return Boolean(kind) && kind !== "internalLab" && kind !== "admin";
}

/** 치과가 기공비를 직접 보내는 외부 기공소. 기공사업부·법인은 제외. */
export function isDirectPayLabAnchor(anchor) {
  if (!anchor) return false;
  if (anchor.businessType === "internalLab" || anchor.businessType === "admin") {
    return false;
  }
  return String(anchor.requestorKind || "").trim() === "lab";
}

export function isYearMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

export function nextYearMonth(yearMonth) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return "";
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function isEligibleDirectSettlementMonth(yearMonth, previousYearMonth) {
  if (!isYearMonth(yearMonth) || !isYearMonth(previousYearMonth)) return false;
  if (yearMonth < DIRECT_LAB_SETTLEMENT_START_YEAR_MONTH) return false;
  return yearMonth <= previousYearMonth;
}

export function roundWon(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function sumLineAmounts(lines) {
  return (Array.isArray(lines) ? lines : []).reduce(
    (sum, line) => sum + Math.max(0, Math.round(Number(line?.amount) || 0)),
    0,
  );
}

/** totalOverride가 있으면 그 금액, 없으면 줄 합계. */
export function resolvePayableAmount(lines, totalOverride) {
  if (totalOverride === null || totalOverride === undefined || totalOverride === "") {
    return sumLineAmounts(lines);
  }
  const override = roundWon(totalOverride);
  if (override === null) return sumLineAmounts(lines);
  return override;
}

export function isDirectSettlementLocked(status) {
  return DIRECT_SETTLEMENT_LOCKED_STATUSES.has(String(status || ""));
}

export function directSettlementStatusLabel(status) {
  switch (String(status || "")) {
    case "ADJUSTED":
      return "수정됨";
    case "DEPOSIT_CONFIRMED":
      return "입금 확인";
    case "INVOICE_ISSUED":
      return "계산서 발행";
    case "SELF_INVOICE":
      return "직접 발행";
    default:
      return "확인 전";
  }
}

export function patientLabelFromTransfer(transfer) {
  const name = String(transfer?.files?.patientName || "").trim();
  const teeth = [];
  const works = Array.isArray(transfer?.toothWorks) ? transfer.toothWorks : [];
  for (const work of works) {
    const tooth = String(work?.toothNumber || work?.tooth || "").trim();
    if (tooth && !teeth.includes(tooth)) teeth.push(tooth);
    if (teeth.length >= 8) break;
  }
  const toothText = teeth.join(",");
  if (name && toothText) return `${name} · ${toothText}`;
  return name || toothText || "기공의뢰";
}

export function labFeeAmountFromTransfer(transfer) {
  return Math.max(
    0,
    Math.round(
      Number(transfer?.billing?.labFeeTotal || 0) +
        Number(transfer?.billing?.labAbutmentTotal || 0),
    ),
  );
}

export function livePayoutAccount(anchor) {
  const bankName = String(anchor?.payoutAccount?.bankName || "").trim();
  const accountNumber = String(anchor?.payoutAccount?.accountNumber || "").trim();
  const holderName = String(anchor?.payoutAccount?.holderName || "").trim();
  if (!accountNumber) return null;
  return { bankName, accountNumber, holderName };
}
