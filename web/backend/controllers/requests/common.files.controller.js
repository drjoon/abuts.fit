// change-log:
// - 2026-08-18: CAM 파일 삭제 롤백 시 로트번호(value)는 유지(준비 단계 발급 SSOT).
// - 2026-08-17: CAM 롤백(준비) 시 우편함 해제.
// - 2026-08-16: CAM 롤백(준비) 시 PTX abutmentProductionStartedAt 클리어.
// - 2026-08-11: original/cam signed URL 응답에 fileName을 포함해 프론트 프리뷰가 STL/PLY/OBJ 확장자를 유지.
// - 2026-08-10: 디자인 파트너(designAccessEnabled) 원본 파일 URL 접근 허용.
// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/utils/designAccess.js
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  normalizeRequestForResponse,
  ensureReviewByStageDefaults,
  bumpRollbackCount,
} from "./utils.js";
import s3Utils, {
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";
import { emitAppEventToRoles } from "../../socket.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { clearPracticeTransferAbutmentMachiningStarted } from "../../services/practiceTransferProduction.service.js";
import { resolveDesignAccessForUser } from "../../utils/designAccess.js";

export async function getStlFileUrl(req, res) {
  return getCamFileUrl(req, res);
}

export async function getOriginalFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id)
      .select({
        requestId: 1,
        businessAnchorId: 1,
        caseInfos: 1,
      })
      .lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사/관리자는 전체 접근 가능,
    // 의뢰자는 본인 사업자 소속 의뢰건에 한해 접근 가능,
    // 디자인 파트너는 design_custom_abutment 원본 파일 접근 가능
    const role = String(req.user?.role || "").trim();
    if (role === "requestor") {
      const myAnchorId = String(req.user?.businessAnchorId || "").trim();
      const ownerAnchorId = String(request?.businessAnchorId || "").trim();
      const isOwner = Boolean(myAnchorId && ownerAnchorId && myAnchorId === ownerAnchorId);
      if (!isOwner) {
        const productMode = String(request?.caseInfos?.productMode || "").trim();
        const isDesignPartner =
          productMode === "design_custom_abutment" &&
          (await resolveDesignAccessForUser(req.user));
        if (!isDesignPartner) {
          return res
            .status(403)
            .json({ success: false, message: "다운로드 권한이 없습니다." });
        }
      }
    } else if (role !== "manufacturer" && role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.file?.s3Key;
    const fileName =
      request?.caseInfos?.file?.filePath ||
      request?.caseInfos?.file?.fileName ||
      request?.caseInfos?.file?.originalName ||
      "download.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "원본 3D 모델 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url, fileName },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "원본 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getCamFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id)
      .select({
        requestId: 1,
        caseInfos: 1,
      })
      .lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사 또는 관리자만 접근
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const parseS3KeyFromUrl = (u) => {
      try {
        if (!u || typeof u !== "string") return "";
        const url = new URL(u);
        const key = String(url.pathname || "").replace(/^\//, "");
        return key;
      } catch (e) {
        return "";
      }
    };

    const camFile = request?.caseInfos?.camFile || null;
    const s3Key = String(
      camFile?.s3Key ||
        parseS3KeyFromUrl(camFile?.s3Url) ||
        parseS3KeyFromUrl(camFile?.url) ||
        "",
    ).trim();

    console.log("[getCamFileUrl] hit", {
      id,
      requestId: request?.requestId,
      hasCamFile: !!camFile,
      camFileKeys: camFile ? Object.keys(camFile) : [],
      s3KeyLen: s3Key ? s3Key.length : 0,
    });
    const fileName =
      request?.caseInfos?.camFile?.filePath ||
      request?.caseInfos?.camFile?.fileName ||
      request?.caseInfos?.camFile?.originalName ||
      "cam-output.stl";
    if (!s3Key) {
      if (camFile) {
        console.warn(
          "[getCamFileUrl] camFile exists but s3Key missing:",
          JSON.stringify(
            {
              requestId: request?.requestId,
              id: request?._id,
              camFile,
            },
            null,
            2,
          ),
        );
      }
      return res.status(404).json({
        success: false,
        message: "CAM STL 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url, fileName },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveCamFileAndCompleteCam(req, res) {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, s3Key, s3Url, filePath } = req.body;

    const resolvedFileName = String(fileName || filePath || "").trim();
    const resolvedFilePath = String(filePath || resolvedFileName || "").trim();
    if (!resolvedFileName || !s3Key || !s3Url) {
      throw new ApiError(400, "필수 파일 정보가 없습니다.");
    }

    const request = await Request.findById(id);
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.cam = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.camFile = {
      fileName: resolvedFileName,
      fileType,
      fileSize,
      filePath: resolvedFilePath,
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 업로드 시 공정 전환은 하지 않고, 기존 단계 유지 (수동 승인 버튼 클릭 시에만 전환)
    // request.manufacturerStage = "CAM";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "CAM 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteCamFileAndRollback(req, res) {
  try {
    const { id } = req.params;
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    // 롤백 전용 모드: 파일/정보 삭제 없이 공정 단계만 변경
    if (rollbackOnly) {
      const previousManufacturerStage = String(
        request.manufacturerStage || "",
      ).trim();
      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage.cam = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      bumpRollbackCount(request, "cam");
      request.manufacturerStage = "준비";
      request.mailboxAddress = null;
      await request.save();

      try {
        await clearPracticeTransferAbutmentMachiningStarted(request);
      } catch {
        // best-effort
      }

      const normalized = await normalizeRequestForResponse(request);
      const businessAnchorId = String(request?.businessAnchorId || "").trim() || null;
      emitAppEventToRoles(["requestor", "manufacturer", "admin"], "request:stage-changed", {
        source: "cam-file-rollback-only",
        requestId: String(request?.requestId || "").trim() || null,
        requestMongoId: String(request?._id || "").trim() || null,
        requestorBusinessAnchorId: businessAnchorId,
        businessAnchorId,
        ownerBusinessAnchorId: businessAnchorId,
        fromStage: previousManufacturerStage || null,
        toStage: "준비",
        reviewStage: "cam",
        reviewStatus: "PENDING",
        manufacturerStage: "준비",
        request: normalized,
      });

      if (businessAnchorId) {
        triggerDashboardSummaryRefreshForAnchorId(
          businessAnchorId,
          "cam-file-rollback-only",
        ).catch((err) => {
          console.error(
            "[CAM_ROLLBACK] triggerDashboardSummaryRefreshForAnchorId failed",
            err,
          );
        });
      }

      return res.status(200).json({
        success: true,
        data: normalized,
      });
    }

    // camFile 제거, 상태 롤백
    const previousManufacturerStage = String(
      request.manufacturerStage || "",
    ).trim();
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.camFile = undefined;
    ensureReviewByStageDefaults(request);
    request.caseInfos.reviewByStage.cam = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    bumpRollbackCount(request, "cam");
    request.lotNumber = request.lotNumber || {};
    // 로트번호(value)는 준비 단계 발급 SSOT — CAM 파일 삭제 시에도 유지한다.
    request.lotNumber.material = "";
    request.manufacturerStage = "준비";

    await request.save();

    try {
      await clearPracticeTransferAbutmentMachiningStarted(request);
    } catch {
      // best-effort
    }

    const normalized = await normalizeRequestForResponse(request);
    const businessAnchorId = String(request?.businessAnchorId || "").trim() || null;
    emitAppEventToRoles(["requestor", "manufacturer", "admin"], "request:stage-changed", {
      source: "cam-file-rollback-with-delete",
      requestId: String(request?.requestId || "").trim() || null,
      requestMongoId: String(request?._id || "").trim() || null,
      requestorBusinessAnchorId: businessAnchorId,
      businessAnchorId,
      ownerBusinessAnchorId: businessAnchorId,
      fromStage: previousManufacturerStage || null,
      toStage: "준비",
      reviewStage: "cam",
      reviewStatus: "PENDING",
      manufacturerStage: "준비",
      request: normalized,
    });

    if (businessAnchorId) {
      triggerDashboardSummaryRefreshForAnchorId(
        businessAnchorId,
        "cam-file-rollback-with-delete",
      ).catch((err) => {
        console.error(
          "[CAM_ROLLBACK] triggerDashboardSummaryRefreshForAnchorId failed",
          err,
        );
      });
    }

    return res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
