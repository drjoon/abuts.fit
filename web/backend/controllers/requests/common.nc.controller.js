// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/services/requestSnapshotTriggers.service.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-08-29: CAM 생성 중단(cancel-regeneration) — NC 삭제·Esprit /cancel·블러 해제(ncPreload NONE).
// - 2026-08-29: NC 재생성 시 ncPreload=GENERATING + ncFile 삭제 + cam-processing-started(ncCleared).
// - 2026-08-17: NC 롤백(준비) 시 우편함 해제.
// - 2026-08-16: NC 롤백(준비) 시 PTX abutmentProductionStartedAt 클리어.
import mongoose, { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  addKoreanBusinessDays,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
} from "./utils.js";
import s3Utils, { deleteFileFromS3 } from "../../utils/s3.utils.js";
import {
  abortEspritForNc,
  triggerEspritForNc,
} from "./common.review.esprit.js";
import { ensureRequestCreditRollbackDeleteOnRollbackToCam } from "./common.review.helpers.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { clearPracticeTransferAbutmentMachiningStarted } from "../../services/practiceTransferProduction.service.js";
import { resolveFilledStlFile } from "../../utils/filledStlFile.js";

/**
 * NC 재생성 시작 전 기존 NC 메타를 제거한다.
 * (Next Up 장비 이동 / 직경 변경 재생성과 동일 SSOT — UI「CAM 생성 중」조건)
 */
async function clearNcMetaBeforeRegeneration(request) {
  if (!request?._id) return;
  const generating = {
    status: "GENERATING",
    updatedAt: new Date(),
  };
  await Request.updateOne(
    { _id: request._id },
    {
      $set: { "productionSchedule.ncPreload": generating },
      $unset: { "caseInfos.ncFile": 1 },
    },
  );
  if (request.caseInfos && typeof request.caseInfos === "object") {
    request.caseInfos.ncFile = undefined;
  }
  if (request.productionSchedule && typeof request.productionSchedule === "object") {
    request.productionSchedule.ncPreload = generating;
  }
}

async function assertAndClaimManufacturerRequestAccess({ req, request }) {
  if (req?.user?.role !== "manufacturer") return;
  if (!request) {
    const err = new Error("의뢰를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  const currentManufacturerId = request?.caManufacturer
    ? String(request.caManufacturer)
    : "";
  const actorManufacturerId = req?.user?._id ? String(req.user._id) : "";
  const actorBusinessAnchorId = req?.user?.businessAnchorId
    ? String(req.user.businessAnchorId)
    : "";

  // 같은 사용자면 OK
  if (currentManufacturerId === actorManufacturerId) {
    return;
  }

  // 다른 사용자지만 같은 BusinessAnchor 소속이면 OK
  if (currentManufacturerId && actorBusinessAnchorId) {
    const User = mongoose.model("User");
    const currentManufacturer = await User.findById(
      currentManufacturerId,
    ).select("businessAnchorId");
    const currentBusinessAnchorId = currentManufacturer?.businessAnchorId
      ? String(currentManufacturer.businessAnchorId)
      : "";

    if (
      currentBusinessAnchorId &&
      currentBusinessAnchorId === actorBusinessAnchorId
    ) {
      return;
    }
  }

  // 다른 회사면 거부
  if (
    currentManufacturerId &&
    actorManufacturerId &&
    currentManufacturerId !== actorManufacturerId
  ) {
    const err = new Error("다른 제조사에 배정된 의뢰입니다.");
    err.statusCode = 403;
    throw err;
  }

  // caManufacturer가 없으면 현재 사용자로 설정
  if (!currentManufacturerId && req?.user?._id) {
    request.caManufacturer = req.user._id;
  }
}

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

function runNcFileCleanupInBackground({ requestId, s3Key, bridgePath }) {
  Promise.resolve()
    .then(async () => {
      if (s3Key) {
        try {
          await deleteFileFromS3(s3Key);
        } catch (e) {
          emitAppEventToRoles(
            ["manufacturer", "admin"],
            "request:async-action-failed",
            {
              requestId: requestId ? String(requestId) : null,
              action: "nc-file-cleanup",
              stage: "machining",
              message: `NC 파일 S3 정리 실패: ${e?.message || e}`,
            },
          );
          console.warn("[NC_ROLLBACK_ASYNC_S3_DELETE_FAILED]", {
            requestId,
            s3Key,
            error: e?.message || e,
          });
        }
      }

      if (bridgePath && BRIDGE_BASE) {
        try {
          await fetch(
            `${BRIDGE_BASE}/api/bridge-store/file?path=${encodeURIComponent(
              bridgePath,
            )}`,
            { method: "DELETE", headers: withBridgeHeaders() },
          );
        } catch (e) {
          emitAppEventToRoles(
            ["manufacturer", "admin"],
            "request:async-action-failed",
            {
              requestId: requestId ? String(requestId) : null,
              action: "nc-bridge-cleanup",
              stage: "machining",
              message: `NC 브리지 정리 실패: ${e?.message || e}`,
            },
          );
          console.warn("[NC_ROLLBACK_ASYNC_BRIDGE_DELETE_FAILED]", {
            requestId,
            bridgePath,
            error: e?.message || e,
          });
        }
      }
    })
    .catch((e) => {
      emitAppEventToRoles(
        ["manufacturer", "admin"],
        "request:async-action-failed",
        {
          requestId: requestId ? String(requestId) : null,
          action: "nc-file-cleanup",
          stage: "machining",
          message: `NC 비동기 정리 실패: ${e?.message || e}`,
        },
      );
      console.warn("[NC_ROLLBACK_ASYNC_CLEANUP_FAILED]", {
        requestId,
        s3Key,
        bridgePath,
        error: e?.message || e,
      });
    });
}

function extractProgramNoFromNcText(text) {
  const s = String(text || "");
  const m = s.toUpperCase().match(/\bO(\d{1,5})\b/m);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractCamDiameterFromNcText(text) {
  const s = String(text || "");
  const m = s.match(/\#\s*521\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDiameterGroup(diameter) {
  const d = Number(diameter);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (d <= 6) return "6";
  if (d <= 8) return "8";
  if (d <= 10) return "10";
  if (d <= 12) return "12";
  return "14";
}

function makeDirectRootNcName({ requestId, fileName }) {
  const rid = String(requestId || "").trim();
  const raw = String(fileName || "").trim() || "program.nc";
  const base = raw.replace(/\.[a-z0-9]{1,6}$/i, "");
  const safe = base
    .trim()
    .replace(/[^a-zA-Z0-9-_가-힣]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
  const head = rid ? `${rid}-${safe || "program"}` : safe || "program";
  return `${head}.nc`;
}

function makeRequestNcBridgePath(fileName, requestId) {
  const rid = String(requestId || "").trim();
  if (rid) {
    // 가공 아카이브는 bridge가 storage/{requestId}_{suffix}.nc 로 남긴다.
    // 여기(코드 보기/동기화)는 최신본 storage/{requestId}.nc 만 유지한다.
    return `${rid}.nc`;
  }
  const normalized = String(fileName || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^3-nc\//i, "");
  const leaf =
    (normalized.split("/").pop() || "program.nc").trim() || "program.nc";
  return leaf;
}

async function uploadNcToBridgeStore({
  requestId,
  s3Key,
  fileName,
  storeScope,
}) {
  if (!BRIDGE_BASE) {
    return { ok: false, reason: "BRIDGE_BASE is not configured" };
  }
  const buf = await s3Utils.getObjectBufferFromS3(s3Key);
  const content = buf.toString("utf8");
  const camDiameter = extractCamDiameterFromNcText(content);
  const normalizedName = String(fileName || "").trim() || "program.nc";
  if (!normalizedName) {
    return { ok: false, reason: "missing fileName" };
  }
  const relPath =
    String(storeScope || "") === "direct_root"
      ? makeDirectRootNcName({ requestId, fileName: normalizedName })
      : makeRequestNcBridgePath(normalizedName, requestId);
  const resp = await fetch(`${BRIDGE_BASE}/api/bridge-store/upload`, {
    method: "POST",
    headers: withBridgeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: relPath, content }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body?.success === false) {
    return {
      ok: false,
      reason: String(
        body?.message || body?.error || "bridge-store upload failed",
      ),
    };
  }
  const savedPath = String(body?.path || relPath);
  return { ok: true, path: savedPath, camDiameter };
}

export async function ensureNcFileOnBridgeStoreByRequestId(req, res) {
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

    const nc = request?.caseInfos?.ncFile || null;
    const s3Key = String(nc?.s3Key || "").trim();
    const fileName = String(nc?.fileName || nc?.originalName || "").trim();
    const existingPath = String(nc?.filePath || "").trim();
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "NC 파일이 없습니다.",
      });
    }

    const requestedBridgePath = String(req.body?.bridgePath || "").trim();
    const storeScope = String(req.body?.storeScope || "").trim();

    let bridgePath =
      storeScope === "direct_root"
        ? requestedBridgePath
        : makeRequestNcBridgePath(
            fileName || existingPath || requestedBridgePath,
            requestId,
          );

    if (!bridgePath) {
      const pushed = await uploadNcToBridgeStore({
        requestId,
        s3Key,
        fileName,
        storeScope,
      });
      if (!pushed.ok || !pushed.path) {
        return res.status(500).json({
          success: false,
          message: pushed.reason || "bridge-store upload failed",
        });
      }
      bridgePath = String(pushed.path);
    }

    const pushed2 = await uploadNcToBridgeStore({
      requestId,
      s3Key,
      fileName: fileName || "program.nc",
      storeScope,
    });
    if (pushed2.ok && pushed2.path) {
      bridgePath = String(pushed2.path);
    }

    try {
      request.caseInfos = request.caseInfos || {};
      request.caseInfos.ncFile = request.caseInfos.ncFile || {};
      request.caseInfos.ncFile.filePath = bridgePath;
      await request.save();
    } catch {
      // no-op
    }

    return res.status(200).json({
      success: true,
      data: {
        requestId,
        bridgePath,
        filePath: bridgePath,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "NC 파일 동기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function regenerateNcByRequestId(req, res) {
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

    await clearNcMetaBeforeRegeneration(request);
    await triggerEspritForNc({ request, force: true });

    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:cam-processing-started",
      {
        source: "nc-regenerate",
        requestId: request?.requestId || null,
        requestMongoId: String(request?._id || "").trim() || null,
        ncCleared: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "NC 재생성 요청을 전송했습니다.",
      data: { requestId, ncCleared: true },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "NC 재생성 요청 중 오류가 발생했습니다.",
    });
  }
}

export async function regenerateNcByRequestIdTwoPhase(req, res) {
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

    // 기록: 2-phase 재생성 요청 로깅 (간단한 이력 저장)
    try {
      request.caseInfos = request.caseInfos || {};
      request.caseInfos.ncRegenerations =
        request.caseInfos.ncRegenerations || [];
      request.caseInfos.ncRegenerations.push({
        type: "two-phase",
        createdBy: req.user?._id,
        createdAt: new Date(),
        params: {},
      });
      await request.save();
    } catch (e) {
      // 기록 실패는 치명적이지 않으므로 로그 후 진행
      console.warn(
        "[regenerateNcByRequestIdTwoPhase] failed to record ncRegeneration",
        e?.message || e,
      );
    }

    // 기존 NC 삭제 후 Two-Phase 재생성 (Next Up「CAM 생성 중」표시용)
    await clearNcMetaBeforeRegeneration(request);
    await triggerEspritForNc({ request, force: true, onePhase: false });

    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:cam-processing-started",
      {
        source: "nc-regenerate-2phase",
        requestId: request?.requestId || null,
        requestMongoId: String(request?._id || "").trim() || null,
        ncCleared: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "NC 재생성 요청을 전송했습니다. (Two-Phase 기본)",
      data: { requestId, ncCleared: true },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "NC 재생성 요청 중 오류가 발생했습니다.",
    });
  }
}

// 2026-06-08: One-Phase NC 재생성 (명시적 요청 시에만 사용, Two-Phase가 기본값)
export async function regenerateNcByRequestIdOnePhase(req, res) {
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

    // 기록: One-Phase 재생성 요청 로깅
    try {
      request.caseInfos = request.caseInfos || {};
      request.caseInfos.ncRegenerations =
        request.caseInfos.ncRegenerations || [];
      request.caseInfos.ncRegenerations.push({
        type: "one-phase",
        createdBy: req.user?._id,
        createdAt: new Date(),
        params: {},
      });
      await request.save();
    } catch (e) {
      console.warn(
        "[regenerateNcByRequestIdOnePhase] failed to record ncRegeneration",
        e?.message || e,
      );
    }

    await clearNcMetaBeforeRegeneration(request);
    await triggerEspritForNc({ request, force: true, onePhase: true });

    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:cam-processing-started",
      {
        source: "nc-regenerate-onephase",
        requestId: request?.requestId || null,
        requestMongoId: String(request?._id || "").trim() || null,
        ncCleared: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "NC 재생성 요청을 전송했습니다. (One-Phase)",
      data: { requestId, ncCleared: true },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "NC 재생성 요청 중 오류가 발생했습니다.",
    });
  }
}

/**
 * CAM/NC 생성 중단: NC 메타·파일 삭제, Esprit 큐/업로드 중단, 프론트 블러 해제.
 */
export async function cancelNcRegenerationByRequestId(req, res) {
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

    await assertAndClaimManufacturerRequestAccess({ req, request });

    const nc = request?.caseInfos?.ncFile || null;
    const s3Key = String(nc?.s3Key || "").trim();
    const bridgePath = String(nc?.filePath || "").trim();

    await Request.updateOne(
      { _id: request._id },
      {
        $set: {
          "productionSchedule.ncPreload": {
            status: "CANCELLED",
            updatedAt: new Date(),
            error: "cam_regeneration_cancelled",
          },
        },
        $unset: { "caseInfos.ncFile": 1 },
      },
    );

    if (request.caseInfos && typeof request.caseInfos === "object") {
      request.caseInfos.ncFile = undefined;
    }
    if (
      request.productionSchedule &&
      typeof request.productionSchedule === "object"
    ) {
      request.productionSchedule.ncPreload = {
        status: "CANCELLED",
        updatedAt: new Date(),
        error: "cam_regeneration_cancelled",
      };
    }

    runNcFileCleanupInBackground({
      requestId,
      s3Key: s3Key || null,
      bridgePath: bridgePath || null,
    });

    let espritAbort = { ok: false, skipped: true };
    try {
      espritAbort = await abortEspritForNc({ requestId });
    } catch (err) {
      console.warn("[ESPRIT] abort on cancel failed", {
        requestId,
        message: err?.message || err,
      });
      espritAbort = {
        ok: false,
        skipped: false,
        error: String(err?.message || err || "abort failed"),
      };
    }

    const fresh = await Request.findById(request._id).lean();
    const normalized = fresh
      ? normalizeRequestForResponse(fresh)
      : {
          requestId,
          _id: String(request._id),
          caseInfos: { ...(request.caseInfos || {}), ncFile: null },
          productionSchedule: {
            ...(request.productionSchedule || {}),
            ncPreload: { status: "CANCELLED" },
          },
        };

    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:cam-regeneration-cancelled",
      {
        source: "nc-cancel-regeneration",
        requestId,
        requestMongoId: String(request._id || "").trim() || null,
        ncCleared: true,
        request: normalized,
        espritAbort,
      },
    );

    return res.status(200).json({
      success: true,
      message: "CAM 생성을 중단했습니다.",
      data: {
        requestId,
        ncCleared: true,
        espritAbort,
        request: normalized,
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      message: error?.message || "CAM 생성 중단에 실패했습니다.",
    });
  }
}

export async function getNcFileUrl(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id)
      .select({
        caseInfos: 1,
      })
      .lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    const fileName =
      request?.caseInfos?.ncFile?.filePath ||
      request?.caseInfos?.ncFile?.fileName ||
      request?.caseInfos?.ncFile?.originalName ||
      "program.nc";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "NC 파일 정보가 없습니다.",
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
      message: "NC 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveNcFileAndMoveToMachining(req, res) {
  try {
    const { id } = req.params;
    const {
      fileName,
      fileType,
      fileSize,
      s3Key,
      s3Url,
      filePath,
      materialDiameter,
    } = req.body;
    const resolvedFileName = String(fileName || filePath || "").trim();
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!resolvedFileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    try {
      await assertAndClaimManufacturerRequestAccess({ req, request });
    } catch (accessError) {
      return res.status(accessError?.statusCode || 403).json({
        success: false,
        message: accessError?.message || "접근 권한이 없습니다.",
      });
    }

    let resolvedBridgePath = String(filePath || "").trim();
    let parsedCamDiameter = null;
    if (!resolvedBridgePath && s3Key) {
      try {
        const pushed = await uploadNcToBridgeStore({
          requestId: request.requestId,
          s3Key,
          fileName: resolvedFileName,
        });
        if (pushed.ok && pushed.path) {
          resolvedBridgePath = String(pushed.path);
          parsedCamDiameter =
            typeof pushed.camDiameter === "number" &&
            Number.isFinite(pushed.camDiameter) &&
            pushed.camDiameter > 0
              ? pushed.camDiameter
              : null;
        } else if (pushed.reason) {
          console.warn(
            "[saveNcFileAndMoveToMachining] bridge-store push skipped",
            {
              requestId: request.requestId,
              reason: pushed.reason,
            },
          );
        }
      } catch (e) {
        console.warn(
          "[saveNcFileAndMoveToMachining] bridge-store push failed",
          {
            requestId: request.requestId,
            error: String(e?.message || e),
          },
        );
      }
    }

    const normalize = (name) => {
      try {
        return String(name || "")
          .trim()
          .normalize("NFC")
          .toLowerCase();
      } catch {
        return String(name || "")
          .trim()
          .toLowerCase();
      }
    };

    const getBaseName = (n) => {
      let s = String(n || "").trim();
      if (!s) return "";
      s = s.replace(/\.cam\.stl$/i, "");
      s = s.replace(/\.stl$/i, "");
      s = s.replace(/\.nc$/i, "");
      return s;
    };

    const filledStl = resolveFilledStlFile(request.caseInfos);
    const originalBase = getBaseName(
      request.caseInfos?.file?.filePath ||
        request.caseInfos?.file?.fileName ||
        request.caseInfos?.file?.originalName,
    );
    const camBase = getBaseName(
      filledStl?.filePath || filledStl?.fileName || filledStl?.originalName,
    );

    const originalName =
      filledStl?.filePath ||
      filledStl?.fileName ||
      filledStl?.originalName ||
      request.caseInfos?.file?.filePath ||
      request.caseInfos?.file?.fileName ||
      request.caseInfos?.file?.originalName ||
      "";

    const lowerName = normalize(resolvedFileName);
    const uploadedBase = getBaseName(lowerName);

    if (!lowerName.endsWith(".nc")) {
      return res.status(400).json({
        success: false,
        message: "NC 파일(.nc)만 업로드할 수 있습니다.",
      });
    }

    const matchesOriginal =
      originalBase && normalize(originalBase) === normalize(uploadedBase);
    const matchesCam =
      camBase && normalize(camBase) === normalize(uploadedBase);

    const finalNcName = lowerName;

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.machining = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.ncFile = {
      fileName: finalNcName,
      originalName: originalName || resolvedFileName,
      fileType,
      fileSize,
      filePath: resolvedBridgePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    const matDia = Number(materialDiameter);
    const finalMatDia =
      Number.isFinite(matDia) && matDia > 0
        ? matDia
        : Number.isFinite(parsedCamDiameter) && parsedCamDiameter > 0
          ? parsedCamDiameter
          : null;
    if (finalMatDia != null) {
      request.productionSchedule = request.productionSchedule || {};
      request.productionSchedule.diameter = finalMatDia;
      request.productionSchedule.diameterGroup = toDiameterGroup(finalMatDia);
    }

    request.manufacturerStage = "가공";

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteNcFileAndRollbackCam(req, res) {
  const startedAtMs = Date.now();
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

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const rollbackStageKey = "machining";

    let requestMongoId = "";
    let requestId = "";
    let fromStage = null;
    let businessAnchorId = null;
    let s3Key = "";
    let bridgePath = "";
    let relatedPracticeTransferId = "";

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const requestInTx = await Request.findById(id)
          .select(
            "_id requestId businessAnchorId manufacturerStage requestCategory caseInfos.ncFile partnerBilling.relatedPracticeTransferId",
          )
          .session(session);

        if (!requestInTx) {
          const err = new Error("의뢰를 찾을 수 없습니다.");
          err.statusCode = 404;
          throw err;
        }

        requestMongoId = String(requestInTx._id || "").trim();
        requestId = String(requestInTx.requestId || "").trim();
        fromStage = String(requestInTx.manufacturerStage || "").trim() || null;
        businessAnchorId = String(requestInTx.businessAnchorId || "").trim() || null;
        s3Key = String(requestInTx?.caseInfos?.ncFile?.s3Key || "").trim();
        bridgePath = String(requestInTx?.caseInfos?.ncFile?.filePath || "").trim();
        relatedPracticeTransferId = String(
          requestInTx?.partnerBilling?.relatedPracticeTransferId || "",
        ).trim();

        console.log("[NC_ROLLBACK] request received", {
          requestMongoId,
          requestId,
          actorUserId: req.user?._id ? String(req.user._id) : null,
          role: String(req.user?.role || ""),
          currentStage: fromStage,
          nextStage: "준비",
          rollbackOnly,
          businessAnchorId,
        });

        // SSOT 정책: 가공→CAM(또는 CAM 이전) 롤백 시 REQUEST 소비 COMMIT을 물리 삭제하고 잔액을 복원한다.
        if (fromStage === "가공") {
          console.log("[NC_ROLLBACK] credit rollback candidate", {
            requestMongoId,
            requestId,
            currentStage: fromStage,
            businessAnchorId,
          });
          if (!businessAnchorId) {
            const err = new Error("의뢰 사업자 정보가 없어 크레딧 롤백을 수행할 수 없습니다.");
            err.statusCode = 409;
            throw err;
          }
          await ensureRequestCreditRollbackDeleteOnRollbackToCam({
            request: requestInTx,
            businessAnchorId,
            actorUserId: req.user?._id || null,
            session,
          });
        } else {
          console.log("[NC_ROLLBACK] credit rollback skipped by stage", {
            requestMongoId,
            requestId,
            currentStage: fromStage,
            businessAnchorId,
          });
        }

        const update = {
          $set: {
            manufacturerStage: "준비",
            mailboxAddress: null,
          },
          $inc: {
            [`caseInfos.rollbackCounts.${rollbackStageKey}`]: 1,
          },
        };

        if (rollbackOnly) {
          update.$set["caseInfos.reviewByStage.machining"] = {
            status: "PENDING",
            updatedAt: new Date(),
            updatedBy: req.user?._id,
            reason: "",
          };
        } else {
          update.$unset = {
            "caseInfos.ncFile": 1,
          };
        }

        await Request.updateOne({ _id: id }, update, { session });

        console.log("[NC_ROLLBACK] request stage updated", {
          requestMongoId,
          requestId,
          toStage: "준비",
          rollbackOnly,
        });
      });
    } finally {
      await session.endSession().catch(() => null);
    }

    try {
      await clearPracticeTransferAbutmentMachiningStarted({
        partnerBilling: {
          relatedPracticeTransferId: relatedPracticeTransferId || undefined,
        },
      });
    } catch {
      // best-effort
    }

    if (!rollbackOnly) {
      runNcFileCleanupInBackground({
        requestId: requestId || id,
        s3Key,
        bridgePath,
      });
    }

    const toStage = "준비";

    emitAppEventToRoles(["requestor", "manufacturer", "admin"], "request:stage-changed", {
      requestId: requestId || null,
      requestMongoId: requestMongoId || null,
      requestorBusinessAnchorId: businessAnchorId,
      businessAnchorId,
      ownerBusinessAnchorId: businessAnchorId,
      manufacturerStage: toStage,
      reviewStage: rollbackStageKey,
      reviewStatus: "PENDING",
      fromStage,
      toStage,
      source: rollbackOnly ? "nc-rollback-only" : "nc-rollback-with-delete",
    });

    if (businessAnchorId) {
      triggerDashboardSummaryRefreshForAnchorId(
        businessAnchorId,
        rollbackOnly ? "nc-rollback-only" : "nc-rollback-with-delete",
      ).catch((err) => {
        console.error(
          "[NC_ROLLBACK] triggerDashboardSummaryRefreshForAnchorId failed",
          err,
        );
      });
    }

    const elapsedMs = Date.now() - startedAtMs;
    console.log("[NC_ROLLBACK] completed", {
      requestMongoId,
      requestId,
      rollbackOnly,
      elapsedMs,
    });

    return res.status(200).json({
      success: true,
      message: rollbackOnly
        ? "NC 파일은 유지하고 준비 단계로 되돌렸습니다."
        : "NC 파일이 삭제되고 준비 단계로 되돌아갑니다.",
      data: {
        _id: requestMongoId,
        requestId,
        manufacturerStage: "준비",
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode || 0) || 500;
    const message =
      status >= 400 && status < 500
        ? String(error?.message || "요청을 처리할 수 없습니다.")
        : "NC 파일 삭제 중 오류가 발생했습니다.";

    const elapsedMs = Date.now() - startedAtMs;
    console.error("[deleteNcFileAndRollbackCam] failed", {
      status,
      message: error?.message || String(error || ""),
      stack: error?.stack || null,
      elapsedMs,
    });

    res.status(status).json({
      success: false,
      message,
      error: error?.message,
    });
  }
}
