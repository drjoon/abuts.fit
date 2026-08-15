// change-log:
// - 2026-08-15: PTX 수락 기공소는 design-claim 없이 핸드오프(카드 업로드). internalLab 허용.
// - 2026-08-15: PTX 연동은 수락 기공소 디자인 → 업로드 즉시 제조 착수 + 어벗디자인비 지급.
// - 2026-08-15: PTX 연동 의뢰는 디자인 STL만 저장·미러하고 가공 진입은 기공소/치과 컨펌 후.
// - 2026-08-10: 디자인 완료 어벗 STL 업로드 → 동일 Request 제조사 가공 핸드오프.
// related files:
// - web/backend/utils/designClaim.js
// - web/backend/utils/designAccess.js
// - web/backend/models/request.model.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  canClaimOrHandoffDesignRequest,
  isAcceptingLabForPtxDesignRequest,
} from "../../utils/designAccess.js";
import { isDesignClaimActive } from "../../utils/designClaim.js";
import { updateReviewStatusByStage } from "./common.review.controller.js";
import {
  canStartAbutmentProduction,
  mirrorDesignFileToPracticeTransfer,
  tryStartAbutmentProduction,
} from "../../services/practiceTransferProduction.service.js";
import { grantAbutmentDesignLabFee } from "../../services/practiceTransferBilling.service.js";

const toStoredFileMeta = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const s3Key = String(raw.s3Key || "").trim();
  if (!s3Key) return null;
  return {
    originalName:
      String(raw.originalName || raw.fileName || "").trim() || "file.stl",
    fileType: String(raw.mimetype || raw.fileType || "application/octet-stream").trim(),
    fileSize: Number(raw.size ?? raw.fileSize ?? 0) || 0,
    filePath: undefined,
    s3Key,
    s3Url: String(raw.s3Url || raw.location || "").trim() || undefined,
    uploadedAt: raw.uploadedAt ? new Date(raw.uploadedAt) : new Date(),
  };
};

/**
 * POST /api/requests/:id/design-handoff
 * 완성 어벗 STL을 primary로 교체.
 * PTX 연동(수락 기공소): 미러 + lab confirm 자동 + 즉시 제조 착수 + 어벗디자인비.
 * 비PTX: 기존처럼 제조사 가공 핸드오프.
 */
export async function handoffDesignToProduction(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin" && role !== "internalLab") {
      return res.status(403).json({
        success: false,
        message: "디자인 핸드오프는 지정 디자이너만 할 수 있습니다.",
      });
    }

    const userId = req.user?._id ? String(req.user._id) : "";
    if (!userId) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const bodyFile =
      req.body?.file && typeof req.body.file === "object"
        ? req.body.file
        : req.body;
    const nextPrimary = toStoredFileMeta(bodyFile);
    if (!nextPrimary) {
      return res.status(400).json({
        success: false,
        message: "완성 어벗 STL 파일(s3Key)이 필요합니다.",
      });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const allowed = await canClaimOrHandoffDesignRequest(req.user, request);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: request?.partnerBilling?.relatedPracticeTransferId
          ? "기공의뢰 커스텀어벗 디자인은 수락한 기공소만 할 수 있습니다."
          : "디자인 큐 접근 권한이 없습니다.",
      });
    }

    const productMode = String(request?.caseInfos?.productMode || "").trim();
    if (productMode !== "design_custom_abutment") {
      return res.status(400).json({
        success: false,
        message: "디자인+생산 의뢰만 핸드오프할 수 있습니다.",
      });
    }

    if (String(request.manufacturerStage || "").trim() !== "준비") {
      return res.status(400).json({
        success: false,
        message: "준비 단계 의뢰만 핸드오프할 수 있습니다.",
      });
    }

    // 수락 기공소(PTX)는 카드에서 바로 업로드 — 디자인 파트너 클레임 불필요.
    const acceptingLabPtx = isAcceptingLabForPtxDesignRequest(req.user, request);
    const claimerId = request?.designClaim?.claimedBy
      ? String(request.designClaim.claimedBy)
      : "";
    if (
      role !== "admin" &&
      !acceptingLabPtx &&
      (!isDesignClaimActive(request.designClaim) ||
        !claimerId ||
        claimerId !== userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "수락한 디자이너만 승인할 수 있습니다. 먼저 「수락」으로 잡아 주세요.",
      });
    }

    if (!request.caseInfos) request.caseInfos = {};

    const prevPrimary = toStoredFileMeta(request.caseInfos.file);
    const prevExtras = Array.isArray(request.caseInfos.files)
      ? request.caseInfos.files
      : [];
    const sourceRows = [];
    const seen = new Set();
    for (const row of [prevPrimary, ...prevExtras.map(toStoredFileMeta)]) {
      if (!row?.s3Key || seen.has(row.s3Key)) continue;
      if (row.s3Key === nextPrimary.s3Key) continue;
      seen.add(row.s3Key);
      sourceRows.push(row);
    }

    request.caseInfos.designSourceFiles = sourceRows;
    request.caseInfos.files = sourceRows;
    request.caseInfos.file = nextPrimary;
    // 구강스캔 기준 CAM/NC는 무효 — 완성 어벗으로 재생성
    request.caseInfos.camFile = undefined;
    request.caseInfos.ncFile = undefined;

    const labAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (labAnchorId && Types.ObjectId.isValid(labAnchorId)) {
      request.designLabBusinessAnchorId = new Types.ObjectId(labAnchorId);
    }
    request.designCompletedBy = new Types.ObjectId(userId);
    request.designCompletedAt = new Date();

    await request.save();

    const relatedTransferId = request?.partnerBilling?.relatedPracticeTransferId
      ? String(request.partnerBilling.relatedPracticeTransferId)
      : "";

    // PTX: 수락 기공소 업로드 → 미러 + 컨펌 자동 + 즉시 제조 + 어벗디자인비
    if (relatedTransferId && Types.ObjectId.isValid(relatedTransferId)) {
      await mirrorDesignFileToPracticeTransfer({
        transferId: relatedTransferId,
        file: {
          originalName: nextPrimary.originalName,
          mimetype: nextPrimary.fileType,
          size: nextPrimary.fileSize,
          s3Key: nextPrimary.s3Key,
        },
        tooth: String(request?.caseInfos?.tooth || "").trim(),
        patientName: String(request?.caseInfos?.patientName || "").trim(),
      });

      // mirror 후 production.designReadyAt 반영된 최신 문서 사용
      let transferDoc = await PracticeTransfer.findById(relatedTransferId);
      const isAcceptingLab = isAcceptingLabForPtxDesignRequest(req.user, request);
      let productionStarted = false;
      let designFeeGrant = null;

      if (transferDoc && isAcceptingLab) {
        const now = new Date();
        const productionPatch = {
          ...(transferDoc.production && typeof transferDoc.production === "object"
            ? transferDoc.production
            : {}),
          labDesignConfirmedAt:
            transferDoc.production?.labDesignConfirmedAt || now,
          labDesignConfirmedBy:
            transferDoc.production?.labDesignConfirmedBy || req.user?._id || null,
          // 수락 기공소가 직접 디자인 → 치과 컨펌 게이트 생략
          skipDesignConfirm: true,
        };
        transferDoc.production = productionPatch;
        await PracticeTransfer.updateOne(
          { _id: transferDoc._id },
          {
            $set: {
              "production.labDesignConfirmedAt": productionPatch.labDesignConfirmedAt,
              "production.labDesignConfirmedBy":
                productionPatch.labDesignConfirmedBy,
              "production.skipDesignConfirm": true,
            },
          },
        );

        try {
          designFeeGrant = await grantAbutmentDesignLabFee({
            requestDoc: request,
            transferId: relatedTransferId,
            labAnchorId:
              labAnchorId || String(transferDoc.targetLabAnchorId || "").trim(),
            actorUserId: userId,
          });
        } catch (grantErr) {
          console.error("[DESIGN_HANDOFF] abutment design fee grant failed", grantErr);
        }

        if (canStartAbutmentProduction(transferDoc)) {
          try {
            const start = await tryStartAbutmentProduction({
              transferDoc,
              actorUserId: userId,
            });
            productionStarted = Boolean(start?.started);
          } catch (startErr) {
            console.error("[DESIGN_HANDOFF] production start failed", startErr);
            productionStarted = false;
          }
        }
      } else if (transferDoc && canStartAbutmentProduction(transferDoc)) {
        // 레거시(파트너 디자인 후 컨펌 완료된 건) 호환
        try {
          const start = await tryStartAbutmentProduction({
            transferDoc,
            actorUserId: userId,
          });
          productionStarted = Boolean(start?.started);
        } catch {
          productionStarted = false;
        }
      }

      return res.status(200).json({
        success: true,
        message: productionStarted
          ? "디자인 업로드 및 제조 주문이 시작되었습니다."
          : "디자인 파일이 저장되었습니다.",
        data: {
          requestId: String(request._id),
          relatedPracticeTransferId: relatedTransferId,
          awaitingDesignConfirm: !productionStarted,
          productionStarted,
          abutmentDesignFee: designFeeGrant
            ? {
                granted: Boolean(designFeeGrant.granted),
                amount: designFeeGrant.amount ?? 0,
                unitFee: designFeeGrant.unitFee ?? 0,
                qty: designFeeGrant.qty ?? 0,
                reason: designFeeGrant.reason || null,
              }
            : null,
        },
      });
    }

    // 제조사 준비→가공 진입 SSOT 재사용 (비PTX)
    req.body = {
      ...(req.body && typeof req.body === "object" ? req.body : {}),
      status: "APPROVED",
      stage: "machining",
      nextUpCamRunGuard: true,
      forceReprocess: false,
      approvalTriggerSource: "design-handoff",
    };
    req.__designPartner = true;

    return updateReviewStatusByStage(req, res);
  } catch (error) {
    console.error("[DESIGN_HANDOFF_ERROR]", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "디자인 핸드오프 중 오류가 발생했습니다.",
    });
  }
}
