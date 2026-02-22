import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { normalizeRequestForResponse } from "./utils.js";
import s3Utils, {
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";

const bumpRollbackCount = (request, stageKey) => {
  if (!request) return;
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.rollbackCounts = request.caseInfos.rollbackCounts || {};
  const key = String(stageKey || "").trim();
  if (!key) return;
  request.caseInfos.rollbackCounts[key] =
    Number(request.caseInfos.rollbackCounts[key] || 0) + 1;
};

const ensureReviewByStageDefaults = (request) => {
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  request.caseInfos.reviewByStage.request = request.caseInfos.reviewByStage
    .request || { status: "PENDING" };
  request.caseInfos.reviewByStage.cam = request.caseInfos.reviewByStage.cam || {
    status: "PENDING",
  };
  request.caseInfos.reviewByStage.machining = request.caseInfos.reviewByStage
    .machining || { status: "PENDING" };
  request.caseInfos.reviewByStage.packing = request.caseInfos.reviewByStage
    .packing || { status: "PENDING" };
  request.caseInfos.reviewByStage.shipping = request.caseInfos.reviewByStage
    .shipping || { status: "PENDING" };
  request.caseInfos.reviewByStage.tracking = request.caseInfos.reviewByStage
    .tracking || { status: "PENDING" };
};

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

    const request = await Request.findById(id).lean();
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

    const s3Key = request?.caseInfos?.file?.s3Key;
    const fileName =
      request?.caseInfos?.file?.filePath ||
      request?.caseInfos?.file?.fileName ||
      request?.caseInfos?.file?.originalName ||
      "download.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "원본 STL 파일 정보가 없습니다.",
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
      data: { url },
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

    const request = await Request.findById(id).lean();
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
      data: { url },
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
      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage.cam = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      bumpRollbackCount(request, "cam");
      request.manufacturerStage = "의뢰";
      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    // camFile 제거, 상태 롤백
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
    request.lotNumber.part = undefined;
    request.lotNumber.final = undefined;
    request.lotNumber.material = "";
    request.manufacturerStage = "의뢰";

    await request.save();

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
