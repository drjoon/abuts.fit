import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  addKoreanBusinessDays,
  bumpRollbackCount,
  ensureReviewByStageDefaults,
} from "./utils.js";
import s3Utils, { deleteFileFromS3 } from "../../utils/s3.utils.js";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
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
  return "12";
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
  const programNo = extractProgramNoFromNcText(content);
  const camDiameter = extractCamDiameterFromNcText(content);
  const normalizedName =
    programNo != null
      ? `O${String(programNo).padStart(4, "0")}.nc`
      : String(fileName || "").trim();
  if (!normalizedName) {
    return { ok: false, reason: "missing fileName" };
  }
  const relPath =
    String(storeScope || "") === "direct_root"
      ? makeDirectRootNcName({ requestId, fileName: normalizedName })
      : `nc/${String(requestId || "").trim()}/${normalizedName}`;
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
        : existingPath || requestedBridgePath;

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
      if (!request.caseInfos.ncFile.filePath) {
        request.caseInfos.ncFile.filePath = bridgePath;
        await request.save();
      }
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

export async function getNcFileUrl(req, res) {
  try {
    const { id } = req.params;
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

    const originalBase = getBaseName(
      request.caseInfos?.file?.filePath ||
        request.caseInfos?.file?.fileName ||
        request.caseInfos?.file?.originalName,
    );
    const camBase = getBaseName(
      request.caseInfos?.camFile?.filePath ||
        request.caseInfos?.camFile?.fileName ||
        request.caseInfos?.camFile?.originalName,
    );

    const originalName =
      request.caseInfos?.camFile?.filePath ||
      request.caseInfos?.camFile?.fileName ||
      request.caseInfos?.camFile?.originalName ||
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

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    if (s3Key) {
      try {
        await deleteFileFromS3(s3Key);
      } catch (e) {
        console.warn("delete nc file s3 failed", e);
      }
    }

    const bridgePath = String(
      request?.caseInfos?.ncFile?.filePath || "",
    ).trim();
    if (bridgePath && BRIDGE_BASE) {
      try {
        await fetch(
          `${BRIDGE_BASE}/api/bridge-store/file?path=${encodeURIComponent(
            bridgePath,
          )}`,
          { method: "DELETE", headers: withBridgeHeaders() },
        );
      } catch (e) {
        console.warn("delete nc file bridge-store failed", e);
      }
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.ncFile = undefined;
    if (rollbackOnly) {
      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage.machining = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
    }

    const isRollbackToRequest = req.query.nextStage === "request";
    const rollbackStageKey = isRollbackToRequest ? "machining" : "cam";
    bumpRollbackCount(request, rollbackStageKey);

    if (isRollbackToRequest) {
      request.manufacturerStage = "의뢰";
    } else {
      request.manufacturerStage = "CAM";

      const organizationId =
        request.requestorOrganizationId || request.requestor?.organizationId;
      if (organizationId) {
        const spendRows = await CreditLedger.find({
          organizationId,
          type: "SPEND",
          refType: "REQUEST",
          refId: request._id,
        })
          .select({ amount: 1 })
          .lean();

        const totalSpend = (spendRows || []).reduce((acc, r) => {
          const n = Number(r?.amount || 0);
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);

        const refundAmount = Math.abs(totalSpend);
        if (refundAmount > 0) {
          const uniqueKey = `request:${String(request._id)}:rollback_cam_refund`;
          await CreditLedger.updateOne(
            { uniqueKey },
            {
              $setOnInsert: {
                organizationId,
                userId: req.user?._id || null,
                type: "REFUND",
                amount: refundAmount,
                refType: "REQUEST",
                refId: request._id,
                uniqueKey,
              },
            },
            { upsert: true },
          );
        }
      }
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 삭제되고 CAM 단계로 되돌아갑니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
