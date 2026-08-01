// related files:
// - web/backend/rules.md
// - web/backend/modules/admin/admin.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/services/creditBalance.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";

import ChargeOrder from "../../models/chargeOrder.model.js";
import AdminAuditLog from "../../models/adminAuditLog.model.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

const DEFAULT_SHIPPING_FEE = 3500;
const REQUEST_SPEND_ELIGIBLE_STAGES = new Set([
  "가공",
  "세척.패킹",
  "포장.발송",
  "추적관리",
]);
const SHIPPING_SPEND_ELIGIBLE_STAGES = new Set(["포장.발송", "추적관리"]);

async function writeAuditLog({ req, action, details }) {
  const actorUserId = req.user?._id;
  if (!actorUserId) return;

  await AdminAuditLog.create({
    actorUserId,
    action,
    refType: "CREDIT_RECONCILE",
    refId: null,
    details: details ?? null,
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || ""),
  });
}

function isFreeByPolicy(reqDoc) {
  const priceAmount = Number(reqDoc?.price?.amount || 0);
  if (priceAmount <= 0) return true;

  const source = String(reqDoc?.source || "").trim().toLowerCase();
  if (source === "manufacturer_sample") return true;

  const rule = String(reqDoc?.price?.rule || "").trim().toLowerCase();
  if (rule === "manufacturer_sample") return true;

  const isNewSystemFree =
    reqDoc?.caseInfos?.newSystemRequest?.requested &&
    reqDoc?.caseInfos?.newSystemRequest?.free;
  if (isNewSystemFree) return true;

  return false;
}

function shouldBackfillRequestSpend(reqDoc) {
  const stage = String(reqDoc?.manufacturerStage || "").trim();
  return REQUEST_SPEND_ELIGIBLE_STAGES.has(stage);
}

function shouldBackfillShippingSpend(reqDoc) {
  const stage = String(reqDoc?.manufacturerStage || "").trim();
  return SHIPPING_SPEND_ELIGIBLE_STAGES.has(stage);
}

async function resolveTargetAnchors({ scope, anchorId, businessName }) {
  if (scope === "all-requestors") {
    return BusinessAnchor.find({ businessType: "requestor" })
      .select({ _id: 1, name: 1, businessType: 1 })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (anchorId) {
    if (!Types.ObjectId.isValid(String(anchorId))) return [];
    const anchor = await BusinessAnchor.findById(anchorId)
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  if (businessName) {
    const anchor = await BusinessAnchor.findOne({
      $or: [{ name: businessName }, { "metadata.companyName": businessName }],
    })
      .sort({ createdAt: -1 })
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  return [];
}

async function reconcileOneAnchor(anchor, { execute }) {
  const anchorId = new Types.ObjectId(String(anchor._id));

  const requests = await Request.find({
    businessAnchorId: anchorId,
    manufacturerStage: { $ne: "취소" },
  })
    .select({
      _id: 1,
      requestId: 1,
      requestor: 1,
      requestCategory: 1,
      manufacturerStage: 1,
      shippingPackageId: 1,
      createdAt: 1,
      updatedAt: 1,
      price: 1,
      source: 1,
      caseInfos: 1,
    })
    .lean();

  const packageIds = requests
    .map((r) => r.shippingPackageId)
    .filter(Boolean)
    .map((id) => String(id));

  const packages = packageIds.length
    ? await ShippingPackage.find({ _id: { $in: packageIds } })
        .select({ _id: 1, shippingFeeSupply: 1, createdAt: 1 })
        .lean()
    : [];

  const packageById = new Map((packages || []).map((p) => [String(p._id), p]));

  const missingRequestCommitCandidates = [];
  const missingShippingCommitCandidates = [];

  for (const reqDoc of requests) {
    const reqId = String(reqDoc?._id || "");
    if (!reqId) continue;

    const requestCategory = String(reqDoc?.requestCategory || "").trim();
    const isSampleRequest =
      requestCategory === "rnd_sample" || requestCategory === "copied_sample";
    if (isSampleRequest) continue;

    if (shouldBackfillRequestSpend(reqDoc)) {
      const expectedRequestSpend = Number(reqDoc?.price?.amount || 0);
      const freeByPolicy = isFreeByPolicy(reqDoc);
      if (!freeByPolicy && expectedRequestSpend > 0) {
        missingRequestCommitCandidates.push({
          requestMongoId: reqId,
          requestId: reqDoc?.requestId || null,
          uniqueKey: `request:${reqId}:machining_spend`,
          amount: -expectedRequestSpend,
          createdAt: reqDoc?.updatedAt || reqDoc?.createdAt || new Date(),
          userId: reqDoc?.requestor || null,
        });
      }
    }

    if (!shouldBackfillShippingSpend(reqDoc)) continue;

    const shippingPackageId = reqDoc?.shippingPackageId
      ? String(reqDoc.shippingPackageId)
      : "";
    if (!shippingPackageId) continue;

    const pkg = packageById.get(shippingPackageId);
    if (!pkg?._id) continue;

    const fee = Number(pkg?.shippingFeeSupply || DEFAULT_SHIPPING_FEE);
    if (!Number.isFinite(fee) || fee <= 0) continue;

    missingShippingCommitCandidates.push({
      packageMongoId: shippingPackageId,
      requestMongoId: reqId,
      requestId: reqDoc?.requestId || null,
      uniqueKey: `shippingPackage:${shippingPackageId}:shipping_fee`,
      amount: -fee,
      createdAt:
        reqDoc?.updatedAt || reqDoc?.createdAt || pkg?.createdAt || new Date(),
      userId: reqDoc?.requestor || null,
    });
  }

  const idempotencyKeys = [
    ...missingRequestCommitCandidates.map((item) => `gl:${item.uniqueKey}`),
    ...missingShippingCommitCandidates.map((item) => `gl:${item.uniqueKey}`),
  ];

  const postedJournals = idempotencyKeys.length
    ? await LedgerJournal.find({
        idempotencyKey: { $in: idempotencyKeys },
        eventType: { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
      })
        .select({ idempotencyKey: 1, eventType: 1 })
        .lean()
    : [];

  const postedSet = new Set(
    (postedJournals || []).map((row) => String(row?.idempotencyKey || "")),
  );

  const missingRequestCommitJournals = missingRequestCommitCandidates.filter(
    (item) => !postedSet.has(`gl:${item.uniqueKey}`),
  );
  const missingShippingCommitJournals = missingShippingCommitCandidates.filter(
    (item) => !postedSet.has(`gl:${item.uniqueKey}`),
  );

  let snapshotResynced = 0;
  if (execute) {
    await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: anchorId });
    snapshotResynced = 1;
  }

  return {
    anchorId: String(anchor._id),
    anchorName: String(anchor.name || ""),
    requestsChecked: requests.length,
    missingRequestCommitJournals,
    missingShippingCommitJournals,
    snapshotResynced,
  };
}

async function runCreditReconcile({ scope, anchorId, businessName, execute }) {
  const anchors = await resolveTargetAnchors({ scope, anchorId, businessName });
  if (!anchors.length) {
    return {
      scope,
      mode: execute ? "execute" : "dry-run",
      targetAnchors: 0,
      requestsChecked: 0,
      target: {
        missingRequestCommitJournals: 0,
        missingShippingCommitJournals: 0,
        totalMissingCommitJournals: 0,
      },
      applied: {
        snapshotResyncedAnchors: 0,
      },
      changedAnchors: [],
    };
  }

  let requestsChecked = 0;
  let targetMissingRequestCommitJournals = 0;
  let targetMissingShippingCommitJournals = 0;
  let appliedSnapshotResyncedAnchors = 0;

  const changedAnchors = [];

  for (const anchor of anchors) {
    const result = await reconcileOneAnchor(anchor, { execute });

    requestsChecked += result.requestsChecked;

    const missingRequestCount =
      result.missingRequestCommitJournals.length;
    const missingShippingCount =
      result.missingShippingCommitJournals.length;

    targetMissingRequestCommitJournals += missingRequestCount;
    targetMissingShippingCommitJournals += missingShippingCount;
    appliedSnapshotResyncedAnchors += Number(result.snapshotResynced || 0);

    const targetCount = missingRequestCount + missingShippingCount;

    if (targetCount > 0) {
      changedAnchors.push({
        anchorId: result.anchorId,
        anchorName: result.anchorName,
        targetCount,
        missingRequestCommitJournals: missingRequestCount,
        missingShippingCommitJournals: missingShippingCount,
      });
    }
  }

  return {
    scope,
    mode: execute ? "execute" : "dry-run",
    targetAnchors: anchors.length,
    requestsChecked,
    target: {
      missingRequestCommitJournals: targetMissingRequestCommitJournals,
      missingShippingCommitJournals: targetMissingShippingCommitJournals,
      totalMissingCommitJournals:
        targetMissingRequestCommitJournals + targetMissingShippingCommitJournals,
    },
    applied: {
      snapshotResyncedAnchors: appliedSnapshotResyncedAnchors,
    },
    changedAnchors,
  };
}

/**
 * 관리자: BusinessAnchor에 연결된 사용자 목록 조회
 * - 삭제 전 확인용
 */
export async function getBusinessAnchorLinkedUsers(req, res) {
  try {
    const { id } = req.params;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 BusinessAnchor ID입니다.",
      });
    }

    const businessAnchor = await BusinessAnchor.findById(id);
    if (!businessAnchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = businessAnchor._id;

    // 연결된 사용자 목록 조회
    const users = await User.find({
      businessAnchorId: businessAnchorId,
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        role: 1,
        subRole: 1,
        createdAt: 1,
      })
      .lean();

    // 관련 의뢰 수 확인
    const linkedRequestCount = await Request.countDocuments({
      businessAnchorId: businessAnchorId,
    });

    // 하위 소개 사업자(자식 anchor) 확인
    const childAnchorCount = await BusinessAnchor.countDocuments({
      referredByAnchorId: businessAnchorId,
    });

    return res.status(200).json({
      success: true,
      data: {
        businessAnchor: {
          _id: String(businessAnchor._id),
          name: businessAnchor.name,
          companyName:
            businessAnchor.metadata?.companyName || businessAnchor.name,
          businessNumber: businessAnchor.metadata?.businessNumber || "",
          businessType: businessAnchor.businessType,
        },
        users: users.map((u) => ({
          _id: String(u._id),
          name: u.name,
          email: u.email,
          role: u.role,
          subRole: u.subRole,
          isOwner: u.subRole === "owner",
          isStaff: u.subRole === "staff",
        })),
        stats: {
          userCount: users.length,
          requestCount: linkedRequestCount,
          childAnchorCount,
        },
      },
    });
  } catch (error) {
    console.error("[adminBusiness] getBusinessAnchorLinkedUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "연결된 사용자 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 관리자: BusinessAnchor 삭제 (연결된 사용자 함께 삭제)
 * - 하위 소개 사업자가 없을 경우에만 삭제 가능
 * - BusinessAnchor 문서 삭제
 * - 연결된 모든 User 문서 삭제
 * - 관련 의뢰의 businessAnchorId는 null로 설정 (의뢰 자체는 보존)
 */
export async function deleteBusinessAnchor(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 BusinessAnchor ID입니다.",
      });
    }

    const businessAnchor = await BusinessAnchor.findById(id);
    if (!businessAnchor) {
      return res.status(404).json({
        success: false,
        message: "사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = businessAnchor._id;
    const referredByAnchorId = businessAnchor.referredByAnchorId;

    // 1. 연결된 사용자 목록 조회
    const linkedUsers = await User.find({
      businessAnchorId: businessAnchorId,
    })
      .select({ _id: 1, name: 1, email: 1 })
      .lean();

    const linkedUserIds = linkedUsers.map((u) => u._id);

    // 2. 관련 의뢰 수 확인
    const linkedRequestCount = await Request.countDocuments({
      businessAnchorId: businessAnchorId,
    });

    // 3. 하위 소개 사업자(자식 anchor) 확인
    const childAnchorCount = await BusinessAnchor.countDocuments({
      referredByAnchorId: businessAnchorId,
    });

    if (childAnchorCount > 0) {
      return res.status(400).json({
        success: false,
        message: `이 사업자를 소개한 하위 사업자가 ${childAnchorCount}개 존재하여 삭제할 수 없습니다. 하위 사업자를 먼저 처리하세요.`,
      });
    }

    // 4. 연결된 사용자들 삭제 (하드 삭제)
    let deletedUsers = 0;
    if (linkedUserIds.length > 0) {
      const deleteUsersResult = await User.deleteMany({
        _id: { $in: linkedUserIds },
      });
      deletedUsers = deleteUsersResult.deletedCount || 0;
    }

    // 5. 의뢰의 businessAnchorId 참조 제거 (의뢰 자체는 보존)
    if (linkedRequestCount > 0) {
      await Request.updateMany(
        { businessAnchorId: businessAnchorId },
        {
          $set: {
            businessAnchorId: null,
            businessId: null, // 레거시 필드도 정리
          },
        },
      );
    }

    // 6. BusinessAnchor 삭제
    await BusinessAnchor.deleteOne({ _id: businessAnchorId });

    // 7. 소개 관계 변경 이벤트 emit (상위 소개자가 있다면)
    if (
      referredByAnchorId &&
      Types.ObjectId.isValid(String(referredByAnchorId))
    ) {
      emitReferralMembershipChanged(
        String(referredByAnchorId),
        "admin-delete-business-anchor",
      );
    }

    return res.status(200).json({
      success: true,
      message: "사업자와 연결된 사용자가 성공적으로 삭제되었습니다.",
      data: {
        deletedBusinessAnchorId: String(businessAnchorId),
        deletedUserCount: deletedUsers,
        deletedUsers: linkedUsers.map((u) => ({
          _id: String(u._id),
          name: u.name,
          email: u.email,
        })),
        unlinkedRequests: linkedRequestCount,
        deletedBy: adminId,
      },
    });
  } catch (error) {
    console.error("[adminBusiness] deleteBusinessAnchor error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminCheckCreditReconcile(req, res) {
  try {
    const scope = String(req.query.scope || "all-requestors").trim();
    const anchorId = String(req.query.anchorId || "").trim();
    const businessName = String(req.query.businessName || "").trim();

    const data = await runCreditReconcile({
      scope,
      anchorId,
      businessName,
      execute: false,
    });

    await writeAuditLog({
      req,
      action: "BUSINESS_CREDIT_RECONCILE_CHECK",
      details: {
        ...data,
        changedAnchors: data.changedAnchors.slice(0, 50),
      },
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[adminBusiness] adminCheckCreditReconcile error:", error);
    return res.status(500).json({
      success: false,
      message: "누락 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminExecuteCreditReconcile(req, res) {
  try {
    const scope = String(req.body?.scope || "all-requestors").trim();
    const anchorId = String(req.body?.anchorId || "").trim();
    const businessName = String(req.body?.businessName || "").trim();

    const data = await runCreditReconcile({
      scope,
      anchorId,
      businessName,
      execute: true,
    });

    await writeAuditLog({
      req,
      action: "BUSINESS_CREDIT_RECONCILE_EXECUTE",
      details: {
        ...data,
        changedAnchors: data.changedAnchors.slice(0, 100),
      },
    });

    return res.status(200).json({
      success: true,
      message: "점검 및 스냅샷 재동기화가 완료되었습니다.",
      data: {
        ...data,
        note: "SSOT 정책상 이 API는 General Ledger 누락 여부 점검 및 잔액 스냅샷 재동기화만 수행합니다. 누락 커밋 이벤트를 직접 생성하지 않습니다.",
      },
    });
  } catch (error) {
    console.error("[adminBusiness] adminExecuteCreditReconcile error:", error);
    return res.status(500).json({
      success: false,
      message: "누락 보정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function adminGetCreditReconcileHistory(req, res) {
  try {
    const limitRaw = Number(req.query.limit || 20);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const rows = await AdminAuditLog.find({
      action: {
        $in: [
          "BUSINESS_CREDIT_RECONCILE_CHECK",
          "BUSINESS_CREDIT_RECONCILE_EXECUTE",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: "actorUserId", select: { name: 1, email: 1 } })
      .lean();

    const items = (rows || []).map((row) => ({
      _id: String(row._id),
      action: String(row.action || ""),
      createdAt: row.createdAt,
      actor: {
        _id: String(row?.actorUserId?._id || ""),
        name: row?.actorUserId?.name || "",
        email: row?.actorUserId?.email || "",
      },
      details: row.details || null,
    }));

    return res.status(200).json({ success: true, data: { items, limit } });
  } catch (error) {
    console.error("[adminBusiness] adminGetCreditReconcileHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "보정 이력 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
