// related files:
// - web/backend/services/creditBalance.service.js
// - web/backend/services/demoConversion.service.js
// - web/backend/utils/practiceTransferAutoMatchCore.js
// - web/backend/controllers/businesses/business.demoMode.util.js
// change-log:
// - 2026-10-04: 기공소 데모 크레딧 = 데모 치과 PTX에서 적립된 LAB_SETTLEMENT_CREDIT(정산·인출 제외).
//   협력: 수행 기공소만 직접 수령(어벗츠기공본부=gross 경유, 승인·제외 없음).
//   하청·어벗츠 자체: 어벗츠기공소(원청) 매출분이 수령 대상(하청 기공소 매입분은 어벗츠가 지급하므로 제외 안 함).
import mongoose from "mongoose";
import LedgerLine from "../models/ledgerLine.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  getAssigneeLabAnchorId,
  getPrimeLabAnchorId,
  isCooperationAssignee,
  isSubcontractAssignee,
} from "../utils/practiceTransferAutoMatchCore.js";

const PTX_SELECT = {
  practiceBusinessAnchorId: 1,
  targetLabAnchorId: 1,
  assigneeLabAnchorId: 1,
  assigneeKind: 1,
  "autoMatch.claimedAt": 1,
};

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

/**
 * 이 PTX에서 ownerId 의 기공크레딧이 치과 직접 지급 대상인지.
 * - direct: 협력 수행 기공소 / 외부 지정 기공소 (해당 기공소가 승인)
 * - abuts: 하청·어벗츠 자체 수행의 원청 매출분 (어벗츠가 승인)
 * - ignore: 어벗츠기공본부(협력 gross 경유), 하청 기공소 매입분
 */
export function classifyPracticeCreditOwner({ ownerId, ptx, ownerIsInternalLab }) {
  const owner = String(ownerId || "").trim();
  const prime = getPrimeLabAnchorId(ptx);
  const assignee = getAssigneeLabAnchorId(ptx);
  if (isCooperationAssignee(ptx)) {
    return owner && owner === assignee ? "direct" : "ignore";
  }
  if (isSubcontractAssignee(ptx)) {
    return owner && owner === prime ? "abuts" : "ignore";
  }
  return ownerIsInternalLab ? "abuts" : "direct";
}

async function loadAnchorTypes(ids, session) {
  if (!ids.length) return new Map();
  const rows = await BusinessAnchor.find({ _id: { $in: ids } })
    .select({ businessType: 1, name: 1 })
    .session(session || null)
    .lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

/**
 * 기공소 입장: 현재 데모 중인 치과별 직접 지급 대상 적립(순합).
 * 데모 치과가 실사용으로 전환되면 자동으로 빠진다(전환 시 ADJUST로 정산).
 */
export async function aggregateLabDemoSettlementByPractice(
  labAnchorId,
  { session = null } = {},
) {
  const labId = toObjectId(labAnchorId);
  if (!labId) return [];

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: "requestor",
        ownerId: labId,
        accountCode: "LAB_SETTLEMENT_CREDIT",
        refType: "PRACTICE_TRANSFER",
        refId: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$refId",
        total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
      },
    },
  ]).session(session || null);
  if (!rows.length) return [];

  const ptxList = await PracticeTransfer.find({
    _id: { $in: rows.map((row) => row._id) },
  })
    .select(PTX_SELECT)
    .session(session || null)
    .lean();
  const ptxById = new Map(ptxList.map((ptx) => [String(ptx._id), ptx]));

  const practiceIds = [
    ...new Set(
      ptxList
        .map((ptx) => String(ptx.practiceBusinessAnchorId || ""))
        .filter(Boolean),
    ),
  ];
  if (!practiceIds.length) return [];
  const demoPractices = await BusinessAnchor.find({
    _id: { $in: practiceIds },
    demoMode: true,
    demoModeExitedAt: null,
  })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  const demoSet = new Set(demoPractices.map((row) => String(row._id)));
  if (!demoSet.size) return [];

  const types = await loadAnchorTypes([labId], session);
  const ownerIsInternalLab =
    String(types.get(String(labId))?.businessType || "") === "internalLab";

  const byPractice = new Map();
  for (const row of rows) {
    const ptx = ptxById.get(String(row._id));
    const practiceId = String(ptx?.practiceBusinessAnchorId || "");
    if (!ptx || !demoSet.has(practiceId)) continue;
    const kind = classifyPracticeCreditOwner({
      ownerId: labId,
      ptx,
      ownerIsInternalLab,
    });
    if (kind === "ignore") continue;
    byPractice.set(
      practiceId,
      (byPractice.get(practiceId) || 0) + Number(row.total || 0),
    );
  }

  return [...byPractice.entries()].map(([practiceId, amount]) => ({
    practiceAnchorId: new mongoose.Types.ObjectId(practiceId),
    amount: Math.round(amount),
  }));
}

/** 기공소 데모 크레딧 합계(양수 치과분만). */
export async function computeLabDemoSettlementCredit(
  labAnchorId,
  { session = null } = {},
) {
  const rows = await aggregateLabDemoSettlementByPractice(labAnchorId, {
    session,
  });
  return rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
}

/**
 * 치과 입장: 직접 지급할 기공소별 금액(양수만).
 * 전환 시점 정산(ADJUST)과 기공소 데모 크레딧이 같은 숫자.
 * isAbutsLab=true 인 행은 어벗츠 승인이 필요하다.
 */
export async function aggregatePracticeLabCredits(
  practiceAnchorId,
  { session = null } = {},
) {
  const practiceId = toObjectId(practiceAnchorId);
  if (!practiceId) return [];

  const ptxList = await PracticeTransfer.find({
    practiceBusinessAnchorId: practiceId,
  })
    .select(PTX_SELECT)
    .session(session || null)
    .lean();
  if (!ptxList.length) return [];
  const ptxById = new Map(ptxList.map((ptx) => [String(ptx._id), ptx]));

  const rows = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: "requestor",
        accountCode: "LAB_SETTLEMENT_CREDIT",
        refType: "PRACTICE_TRANSFER",
        refId: { $in: ptxList.map((ptx) => ptx._id) },
        ownerId: { $ne: practiceId },
      },
    },
    {
      $group: {
        _id: { ownerId: "$ownerId", refId: "$refId" },
        total: { $sum: { $ifNull: ["$amountExcludingVat", "$amount"] } },
      },
    },
  ]).session(session || null);
  if (!rows.length) return [];

  const types = await loadAnchorTypes(
    [...new Set(rows.map((row) => String(row._id.ownerId)))].map(
      (id) => new mongoose.Types.ObjectId(id),
    ),
    session,
  );

  const byOwner = new Map();
  for (const row of rows) {
    const ownerKey = String(row._id.ownerId);
    const ptx = ptxById.get(String(row._id.refId));
    if (!ptx) continue;
    const ownerIsInternalLab =
      String(types.get(ownerKey)?.businessType || "") === "internalLab";
    const kind = classifyPracticeCreditOwner({
      ownerId: ownerKey,
      ptx,
      ownerIsInternalLab,
    });
    if (kind === "ignore") continue;
    byOwner.set(ownerKey, (byOwner.get(ownerKey) || 0) + Number(row.total || 0));
  }

  return [...byOwner.entries()]
    .map(([ownerKey, amount]) => ({
      labAnchorId: new mongoose.Types.ObjectId(ownerKey),
      amount: Math.round(amount),
      isAbutsLab:
        String(types.get(ownerKey)?.businessType || "") === "internalLab",
    }))
    .filter((row) => row.amount > 0);
}
