// change-log:
// - 2026-09-28: 커프 재디자인 — 제조사 Re, 의뢰자 제안 수락/거절(cuff-proposal), 의뢰자용 filled-file-url.
// - 2026-09-28: HF(Hole Filling) — filled STL 상부 스크류홀을 서버에서 메워 같은 S3 키에 덮어쓴다.
// - 2026-09-03: Filled STL 생성 중단(cancel-regeneration) — stlPreload CANCELLED·준비 탭 블러 해제.
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
  canAccessRequestAsRequestor,
} from "./utils.js";
import s3Utils, {
  getSignedUrl as getSignedUrlForS3Key,
  putObjectToS3,
} from "../../utils/s3.utils.js";
import { emitAppEventToRoles } from "../../socket.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { clearPracticeTransferAbutmentMachiningStarted } from "../../services/practiceTransferProduction.service.js";
import {
  applyFilledStlFileToCaseInfos,
  clearFilledStlFileOnCaseInfos,
  resolveFilledStlFile,
} from "../../utils/filledStlFile.js";
import { resolveDesignAccessForUser } from "../../utils/designAccess.js";
import { fillUpperScrewHoleInWorker } from "../../utils/screwHoleFill.service.js";
import {
  applyCuffBlendToFilledStl,
  emitCuffProposalUpdated,
} from "../../services/abutmentStl/cuffBlend.service.js";

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

    // filled STL: stlFile SSOT, camFile = legacy mirror
    const camFile = resolveFilledStlFile(request?.caseInfos) || null;
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
      camFile?.filePath ||
      camFile?.fileName ||
      camFile?.originalName ||
      "filled.stl";
    if (!s3Key) {
      if (camFile) {
        console.warn(
          "[getCamFileUrl] filled STL exists but s3Key missing:",
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
    // Rhino filled STL — stlFile SSOT (+ legacy camFile mirror)
    applyFilledStlFileToCaseInfos(request.caseInfos, {
      fileName: resolvedFileName,
      fileType,
      fileSize,
      filePath: resolvedFilePath,
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    });

    // 업로드 시 공정 전환은 하지 않고, 기존 단계 유지 (수동 승인 버튼 클릭 시에만 전환)
    // request.manufacturerStage = "CAM";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Filled STL이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Filled STL 저장 중 오류가 발생했습니다.",
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

    // filled STL 제거(stlFile + legacy camFile), 상태 롤백
    const previousManufacturerStage = String(
      request.manufacturerStage || "",
    ).trim();
    request.caseInfos = request.caseInfos || {};
    clearFilledStlFileOnCaseInfos(request.caseInfos);
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

/**
 * Rhino Filled STL 생성 중단: stlPreload=CANCELLED → 준비 탭「라이노 작업중」블러 해제.
 * (진행 중 Rhino 작업은 best-effort — 완료되면 filled STL이 붙고 블러는 이미 해제된 상태)
 */
export async function cancelFilledStlRegenerationByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId) {
      return res
        .status(400)
        .json({ success: false, message: "requestId is required" });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const request = await Request.findOne({ requestId });
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const cancelled = {
      status: "CANCELLED",
      updatedAt: new Date(),
      error: "filled_stl_regeneration_cancelled",
    };

    await Request.updateOne(
      { _id: request._id },
      { $set: { "productionSchedule.stlPreload": cancelled } },
    );

    if (
      request.productionSchedule &&
      typeof request.productionSchedule === "object"
    ) {
      request.productionSchedule.stlPreload = cancelled;
    } else {
      request.productionSchedule = { stlPreload: cancelled };
    }

    const fresh = await Request.findById(request._id).lean();
    const normalized = fresh
      ? await normalizeRequestForResponse(fresh)
      : {
          requestId,
          _id: String(request._id),
          productionSchedule: {
            ...(request.productionSchedule || {}),
            stlPreload: { status: "CANCELLED" },
          },
        };

    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:filled-stl-regeneration-cancelled",
      {
        source: "stl-cancel-regeneration",
        requestId,
        requestMongoId: String(request._id || "").trim() || null,
        request: normalized,
      },
    );

    return res.status(200).json({
      success: true,
      message: "라이노 작업을 중단했습니다.",
      data: {
        requestId,
        request: normalized,
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "라이노 작업 중단에 실패했습니다.",
    });
  }
}

export async function fillFilledStlHoleByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId) {
      throw new ApiError(400, "requestId가 필요합니다.");
    }

    const request = await Request.findOne({ requestId })
      .select({ requestId: 1, manufacturerStage: 1, caseInfos: 1 })
      .lean();
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }

    const filled = resolveFilledStlFile(request.caseInfos);
    const s3Key = String(filled?.s3Key || "").trim();
    if (!s3Key) {
      throw new ApiError(404, "filled STL이 없습니다.");
    }

    const source = await s3Utils.getObjectBufferFromS3(s3Key);
    const result = await fillUpperScrewHoleInWorker(source);
    if (!result.ok) {
      throw new ApiError(result.busy ? 503 : 422, result.reason || "스크류홀을 메우지 못했습니다.");
    }

    await putObjectToS3(s3Key, result.buffer, {
      contentType: "application/sla",
    });

    const now = new Date();
    const $set = { "caseInfos.stlMetadataUpdatedAt": now };
    for (const field of ["stlFile", "camFile"]) {
      if (String(request.caseInfos?.[field]?.s3Key || "").trim() !== s3Key) {
        continue;
      }
      $set[`caseInfos.${field}.fileSize`] = result.buffer.length;
      $set[`caseInfos.${field}.uploadedAt`] = now;
    }
    await Request.updateOne({ _id: request._id }, { $set });

    console.log("[fill-hole] done", { requestId, s3Key, ...result.stats });

    return res.status(200).json({
      success: true,
      message: "스크류홀을 메웠습니다.",
      data: {
        requestId,
        s3Key,
        stats: result.stats,
        ncStale: Boolean(String(request.caseInfos?.ncFile?.s3Key || "").trim()),
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "스크류홀 메우기에 실패했습니다.",
    });
  }
}

/** Re: 70°보다 누운 커프를 피니시라인-0.2mm ~ 커넥션 상단 사이 G2 곡면(70° 이내)으로 바꾼다. */
export async function redesignFilledStlCuffByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId) {
      throw new ApiError(400, "requestId가 필요합니다.");
    }

    const request = await Request.findOne({ requestId })
      .select({ requestId: 1, manufacturerStage: 1, caseInfos: 1 })
      .lean();
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }

    const filled = resolveFilledStlFile(request.caseInfos);
    const s3Key = String(filled?.s3Key || "").trim();
    if (!s3Key) {
      throw new ApiError(404, "filled STL이 없습니다.");
    }

    const result = await applyCuffBlendToFilledStl({
      s3Key,
      caseInfos: request.caseInfos,
      mode: "redesign",
    });
    if (!result.ok) {
      throw new ApiError(422, result.reason || "커프를 재디자인하지 못했습니다.");
    }

    const now = new Date();
    const $set = {
      "caseInfos.stlMetadataUpdatedAt": now,
      "caseInfos.cuffBlend": result.record,
    };
    for (const field of ["stlFile", "camFile"]) {
      if (String(request.caseInfos?.[field]?.s3Key || "").trim() !== s3Key) {
        continue;
      }
      $set[`caseInfos.${field}.fileSize`] = result.fileSize;
      $set[`caseInfos.${field}.uploadedAt`] = now;
    }
    const proposalPending = request.caseInfos?.cuffProposal?.status === "proposed";
    if (proposalPending) {
      $set["caseInfos.cuffProposal.status"] = "applied-by-manufacturer";
      $set["caseInfos.cuffProposal.decidedAt"] = now;
      $set["caseInfos.cuffProposal.decidedBy"] = req.user?._id || null;
    }
    const updated = await Request.findOneAndUpdate({ _id: request._id }, { $set }, { new: true }).lean();
    if (proposalPending && updated) emitCuffProposalUpdated(updated);

    console.log("[cuff-redesign] done", { requestId, s3Key, ...result.detail });

    return res.status(200).json({
      success: true,
      message: "커프를 재디자인했습니다.",
      data: {
        requestId,
        s3Key,
        cuffBlend: result.record,
        detail: result.detail,
        ncStale: Boolean(String(request.caseInfos?.ncFile?.s3Key || "").trim()),
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "커프 재디자인에 실패했습니다.",
    });
  }
}

/** 의뢰자·제조사: filled STL(커프 보정·재디자인 반영본) 서명 URL. 의뢰자는 자기 사업자 의뢰만. */
export async function getFilledFileUrl(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "유효하지 않은 의뢰 ID입니다.");
    }
    const request = await Request.findById(id)
      .select({ requestId: 1, requestor: 1, businessAnchorId: 1, caseInfos: 1 })
      .lean();
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }
    const role = String(req.user?.role || "").trim();
    const allowed =
      role === "manufacturer" ||
      role === "admin" ||
      (role === "requestor" && (await canAccessRequestAsRequestor(req, request)));
    if (!allowed) {
      throw new ApiError(403, "다운로드 권한이 없습니다.");
    }
    const filled = resolveFilledStlFile(request.caseInfos);
    const s3Key = String(filled?.s3Key || "").trim();
    if (!s3Key) {
      throw new ApiError(404, "수정된 3D 모델 파일이 없습니다.");
    }
    const fileName = String(filled?.fileName || filled?.filePath || `${request.requestId}.filled.stl`)
      .split("/")
      .pop();
    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    return res.status(200).json({
      success: true,
      data: { url, fileName, uploadedAt: filled?.uploadedAt || null },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "수정된 파일 URL 생성 중 오류가 발생했습니다.",
    });
  }
}

async function loadProposalRequest(req) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "유효하지 않은 의뢰 ID입니다.");
  }
  const request = await Request.findById(id)
    .select({ requestId: 1, requestor: 1, businessAnchorId: 1, manufacturerStage: 1, caseInfos: 1 })
    .lean();
  if (!request) {
    throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
  }
  if (!(await canAccessRequestAsRequestor(req, request))) {
    throw new ApiError(403, "이 의뢰를 변경할 권한이 없습니다.");
  }
  if (request.caseInfos?.cuffProposal?.status !== "proposed") {
    throw new ApiError(409, "대기 중인 커프 형상 제안이 없습니다.");
  }
  return request;
}

async function finishProposalDecision(res, request, $set, $unset, message) {
  const update = { $set };
  if ($unset && Object.keys($unset).length) update.$unset = $unset;
  const updated = await Request.findOneAndUpdate(
    { _id: request._id, "caseInfos.cuffProposal.status": "proposed" },
    update,
    { new: true },
  ).lean();
  if (!updated) {
    throw new ApiError(409, "커프 형상 제안이 이미 처리됐습니다.");
  }
  const normalized = await normalizeRequestForResponse(updated);
  emitCuffProposalUpdated(updated, { request: normalized });
  emitAppEventToRoles(["manufacturer", "admin"], "request:updated", { request: normalized });
  if (updated.businessAnchorId) {
    triggerDashboardSummaryRefreshForAnchorId(updated.businessAnchorId, "cuff-proposal-decision");
  }
  return res.status(200).json({ success: true, message, data: { request: normalized } });
}

/** 의뢰자: 커프 형상 제안 수락 → filled STL을 제안대로 재디자인(준비 단계만). */
export async function acceptCuffProposalByRequestor(req, res) {
  try {
    const request = await loadProposalRequest(req);
    if (String(request.manufacturerStage || "").trim() !== "준비") {
      throw new ApiError(409, "준비 단계에서만 커프 형상을 바꿀 수 있습니다.");
    }
    const s3Key = String(resolveFilledStlFile(request.caseInfos)?.s3Key || "").trim();
    if (!s3Key || s3Key !== String(request.caseInfos.cuffProposal.s3Key || "").trim()) {
      throw new ApiError(409, "3D 모델이 다시 생성돼 제안이 만료됐습니다.");
    }
    const result = await applyCuffBlendToFilledStl({
      s3Key,
      caseInfos: request.caseInfos,
      mode: "redesign",
    });
    if (!result.ok) {
      throw new ApiError(422, result.reason || "커프 형상을 바꾸지 못했습니다.");
    }
    const now = new Date();
    const $set = {
      "caseInfos.stlMetadataUpdatedAt": now,
      "caseInfos.cuffBlend": result.record,
      "caseInfos.cuffProposal.status": "accepted",
      "caseInfos.cuffProposal.decidedAt": now,
      "caseInfos.cuffProposal.decidedBy": req.user?._id || null,
    };
    for (const field of ["stlFile", "camFile"]) {
      if (String(request.caseInfos?.[field]?.s3Key || "").trim() !== s3Key) continue;
      $set[`caseInfos.${field}.fileSize`] = result.fileSize;
      $set[`caseInfos.${field}.uploadedAt`] = now;
    }
    // filled가 바뀌면 이전 NC는 맞지 않는다(Rhino 재생성과 같은 규칙).
    const $unset = String(request.caseInfos?.ncFile?.s3Key || "").trim() ? { "caseInfos.ncFile": 1 } : null;
    console.log("[cuff-proposal] accepted", { requestId: request.requestId, s3Key, ...result.detail });
    return await finishProposalDecision(res, request, $set, $unset, "커프 형상을 바꿨습니다.");
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "커프 형상 변경에 실패했습니다.",
    });
  }
}

/** 의뢰자: 커프 형상 제안 거절(기존 디자인 유지). */
export async function declineCuffProposalByRequestor(req, res) {
  try {
    const request = await loadProposalRequest(req);
    const now = new Date();
    return await finishProposalDecision(
      res,
      request,
      {
        "caseInfos.cuffProposal.status": "declined",
        "caseInfos.cuffProposal.decidedAt": now,
        "caseInfos.cuffProposal.decidedBy": req.user?._id || null,
      },
      null,
      "기존 디자인을 유지합니다.",
    );
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "제안 거절에 실패했습니다.",
    });
  }
}
