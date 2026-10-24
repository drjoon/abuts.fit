// change-log:
// - 2026-10-24: 보철이 끝난 의뢰만 택배 라벨 후보. 치과별로 묶는다.
// related files:
// - web/frontend/src/shared/lab/LabShipLabelDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
import { isGuideTourDemoTransfer } from "@/shared/guideTour/guideTourLabReceiveDemo";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import {
  getPracticeTransferLabReceiveDisplayStatus,
  listPracticeTransferPendingProstheticSlots,
  listPracticeTransferProstheticUploadSlots,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";

const PRINTED_KEY = "abuts.labShipLabelPrinted";

export type LabShipLabelCase = {
  id: string;
  practiceKey: string;
  practiceName: string;
  patientName: string;
  teeth: string;
  arrivalDate: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  phone: string;
};

/** 보철 작업이 끝나 치과로 보낼 수 있는 의뢰 */
export function isLabProsthesisReadyToShip(
  transfer: PracticeTransferLabReceiveItem,
): boolean {
  if (isGuideTourDemoTransfer(transfer)) return false;
  const stage = String(transfer.manufacturerStage || "").trim();
  if (
    transfer.labRejected ||
    stage === "거부" ||
    stage === "작업취소" ||
    stage === "취소" ||
    stage === "기한만료" ||
    Boolean(String(transfer.workCanceledAt || "").trim())
  ) {
    return false;
  }
  const status = getPracticeTransferLabReceiveDisplayStatus(transfer);
  if (
    status === "거부" ||
    status === "취소" ||
    status === "기한만료" ||
    status === "자동매칭" ||
    status === "발송완료" ||
    status === "수신완료"
  ) {
    return false;
  }

  const slots = listPracticeTransferProstheticUploadSlots(transfer);
  const pending = listPracticeTransferPendingProstheticSlots(transfer);
  const resultCount = Math.max(
    Number(transfer.resultFileCount || 0) || 0,
    Array.isArray(transfer.resultFiles) ? transfer.resultFiles.length : 0,
  );
  if (slots.length > 0) {
    if (pending.length === 0) return true;
    return (
      transfer.requireLabProsthesisUpload === false && status === "작업완료"
    );
  }
  return resultCount > 0 && status === "작업완료";
}

export function listLabShipLabelCases(
  transfers: readonly PracticeTransferLabReceiveItem[],
): LabShipLabelCase[] {
  const rows: LabShipLabelCase[] = [];
  for (const transfer of transfers) {
    if (!isLabProsthesisReadyToShip(transfer)) continue;
    const id = String(transfer.transferId || transfer._id || "").trim();
    if (!id) continue;
    const practiceName =
      String(transfer.practice?.businessName || "").trim() || "치과";
    const practiceKey =
      String(transfer.practiceBusinessAnchorId || "").trim() || practiceName;
    const address = String(transfer.practice?.address || "").trim();
    const addressDetail = String(transfer.practice?.addressDetail || "").trim();
    const zipCode = String(transfer.practice?.zipCode || "").trim();
    const phone = String(transfer.practice?.phone || "").trim();
    rows.push({
      id,
      practiceKey,
      practiceName,
      patientName: resolvePracticeTransferListPatientName(transfer) || "환자",
      teeth: resolvePracticeTransferListToothNumbers(transfer),
      arrivalDate: String(transfer.arrivalDate || "").trim(),
      address,
      addressDetail,
      zipCode,
      phone,
    });
  }
  rows.sort((a, b) => {
    const byPractice = a.practiceName.localeCompare(b.practiceName, "ko");
    if (byPractice !== 0) return byPractice;
    return a.arrivalDate.localeCompare(b.arrivalDate) || a.patientName.localeCompare(b.patientName, "ko");
  });
  return rows;
}

export type LabShipPracticeGroup = {
  key: string;
  name: string;
  cases: LabShipLabelCase[];
};

export function groupLabShipCasesByPractice(
  cases: readonly LabShipLabelCase[],
): LabShipPracticeGroup[] {
  const order: string[] = [];
  const map = new Map<string, LabShipPracticeGroup>();
  for (const row of cases) {
    let group = map.get(row.practiceKey);
    if (!group) {
      group = { key: row.practiceKey, name: row.practiceName, cases: [] };
      map.set(row.practiceKey, group);
      order.push(row.practiceKey);
    }
    group.cases.push(row);
  }
  return order.map((key) => map.get(key)!);
}

export function readLabShipPrinted(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PRINTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const id = String(key || "").trim();
      const at = String(value || "").trim();
      if (id && at) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

export function markLabShipPrinted(ids: readonly string[]) {
  const prev = readLabShipPrinted();
  const at = new Date().toISOString();
  for (const id of ids) {
    const key = String(id || "").trim();
    if (key) prev[key] = at;
  }
  try {
    localStorage.setItem(PRINTED_KEY, JSON.stringify(prev));
  } catch {
    // 표시만 놓친다. 출력 자체는 끝났다.
  }
  return prev;
}
