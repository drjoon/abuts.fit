// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/frontend/src/pages/admin/dashboard/AdminPracticeDelinquencyCard.tsx
//
// 미납 지속: 2차 기한 다음 날 09:00이 지났는데 전액 확인이 없는 달.
// 미납 기록: 그 시각을 넘겨 아직 안 들어왔거나, 넘긴 뒤에 전액이 확인된 달.
// 부분 납부: 전액보다 적게 기록된 달. 기한을 안 넘겼어도 포함한다.
// 선불 전환 대상: 미납 기록이 2회 이상이거나 부분 납부가 있는 치과. 자동 전환은 하지 않는다.

export const PREPAID_CONVERSION_PLAN_LINES = [
  "미납 기록이 2회 이상이거나, 일부만 들어온 치과가 대상입니다.",
  "새 기공의뢰와 스토어만 선불 크레딧으로 바꿉니다.",
  "이미 진행 중인 의뢰는 그대로 이어집니다.",
  "남은 미납은 계좌로 마저 받은 뒤 기공소에 보냅니다.",
  "한 달만 늦은 치과는 후불을 유지합니다.",
  "대상이 되면 담당자가 새 기공의뢰와 스토어를 선불 크레딧으로 바꿉니다.",
];

export function parseSettlementWon(value) {
  const raw =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw);
}

export function assertPartialAmount(totalAmount, amountReceived) {
  const total = parseSettlementWon(totalAmount);
  const amount = parseSettlementWon(amountReceived);
  if (total == null || !(total > 0) || amount == null) {
    throw new Error("금액을 확인해 주세요.");
  }
  if (amount >= total) {
    throw new Error("전액이면 입금 확인을 눌러 주세요.");
  }
  return amount;
}

function pausePassed(row, now) {
  if (!row?.scheduledTransferAt) return false;
  const at = new Date(row.scheduledTransferAt).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

export function isUnpaidSettlementRecord(row, now) {
  const total = parseSettlementWon(row?.totalAmount);
  if (!(total > 0) || !pausePassed(row, now)) return false;
  if (!row.paymentReceivedAt) return true;
  const paidAt = new Date(row.paymentReceivedAt).getTime();
  const suspendAt = new Date(row.scheduledTransferAt).getTime();
  return Number.isFinite(paidAt) && paidAt > suspendAt;
}

export function isOngoingUnpaidSettlement(row, now) {
  return isUnpaidSettlementRecord(row, now) && !row?.paymentReceivedAt;
}

export function isPartialSettlement(row) {
  if (row?.paymentReceivedAt) return false;
  const total = parseSettlementWon(row?.totalAmount);
  const received = parseSettlementWon(row?.amountReceived) || 0;
  return Boolean(total > 0 && received > 0 && received < total);
}

function monthSnapshot(row, now) {
  const total = parseSettlementWon(row.totalAmount) || 0;
  const received = parseSettlementWon(row.amountReceived) || 0;
  const ongoing = isOngoingUnpaidSettlement(row, now);
  const partial = isPartialSettlement(row);
  const paidLate = Boolean(row.paymentReceivedAt) && isUnpaidSettlementRecord(row, now);
  let kind = "open";
  if (ongoing && partial) kind = "ongoing_partial";
  else if (ongoing) kind = "ongoing";
  else if (partial) kind = "partial";
  else if (paidLate) kind = "paid_late";
  return {
    id: String(row._id || row.id || ""),
    yearMonth: String(row.yearMonth || ""),
    totalAmount: total,
    amountReceived: received,
    remaining: Math.max(0, total - (row.paymentReceivedAt ? total : received)),
    kind,
  };
}

function clinicSort(a, b) {
  const remain = (b.openRemaining || 0) - (a.openRemaining || 0);
  if (remain) return remain;
  return String(a.practiceName || "").localeCompare(String(b.practiceName || ""), "ko");
}

/**
 * 정산서 배열을 치과 단위 세 묶음과 선불 전환 대상으로 나눈다.
 */
export function classifyPracticeDelinquency(rows, nameById = new Map(), now = new Date()) {
  const byPractice = new Map();
  for (const row of rows || []) {
    const practiceAnchorId = String(row?.practiceAnchorId || "");
    if (!practiceAnchorId) continue;
    const month = monthSnapshot(row, now);
    const record = isUnpaidSettlementRecord(row, now);
    const ongoing = month.kind === "ongoing" || month.kind === "ongoing_partial";
    const partial = month.kind === "partial" || month.kind === "ongoing_partial";
    if (!record && !partial) continue;
    const clinic = byPractice.get(practiceAnchorId) || {
      practiceAnchorId,
      practiceName: nameById.get(practiceAnchorId) || "치과",
      unpaidRecordCount: 0,
      openRemaining: 0,
      partialRemaining: 0,
      months: [],
    };
    if (record) clinic.unpaidRecordCount += 1;
    if (ongoing) clinic.openRemaining += month.remaining;
    if (partial) clinic.partialRemaining += month.remaining;
    clinic.months.push(month);
    byPractice.set(practiceAnchorId, clinic);
  }

  const clinics = [...byPractice.values()].map((clinic) => {
    clinic.months.sort((a, b) => String(a.yearMonth).localeCompare(String(b.yearMonth)));
    clinic.prepaidCandidate =
      clinic.unpaidRecordCount >= 2 || clinic.months.some((month) => month.kind === "partial" || month.kind === "ongoing_partial");
    return clinic;
  });

  const withMonths = (list, pred) =>
    list
      .map((clinic) => ({
        ...clinic,
        months: clinic.months.filter(pred),
      }))
      .filter((clinic) => clinic.months.length > 0)
      .sort(clinicSort);

  const ongoing = withMonths(
    clinics,
    (month) => month.kind === "ongoing" || month.kind === "ongoing_partial",
  );
  const repeat = clinics
    .filter((clinic) => clinic.unpaidRecordCount >= 2)
    .map((clinic) => ({
      ...clinic,
      months: clinic.months.filter((month) => month.kind !== "partial"),
    }))
    .sort(clinicSort);
  const partial = withMonths(
    clinics,
    (month) => month.kind === "partial" || month.kind === "ongoing_partial",
  );
  const prepaidCandidates = clinics
    .filter((clinic) => clinic.prepaidCandidate)
    .sort(clinicSort);

  return { clinics, ongoing, repeat, partial, prepaidCandidates };
}
