import s3Utils from "../utils/s3.utils.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import BridgeSetting from "../models/bridgeSetting.model.js";
import { sendNotificationToRoles } from "../socket.js";
import path from "path";
import fs from "fs/promises";
import Request from "../models/request.model.js";
import CncEvent from "../models/cncEvent.model.js";
import { getPresignedPutUrl } from "../utils/s3.utils.js";

const BG_STORAGE_BASE =
  process.env.BG_STORAGE_PATH ||
  path.resolve(process.cwd(), "../../bg/storage");

const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || "";

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

const REMOTE_BASE_BY_STEP = {
  "2-filled": process.env.RHINO_COMPUTE_BASE_URL,
  "3-nc": process.env.ESPRIT_ADDIN_BASE_URL,
  cnc: process.env.BRIDGE_BASE || process.env.BRIDGE_NODE_URL,
};

export const registerBridgeSettings = asyncHandler(async (req, res) => {
  const {
    HILINK_DLL_ENTER_TIMEOUT_MS,
    HILINK_DLL_HOLD_FATAL_MS,
    HILINK_FAILFAST_ON_HANG,
    MOCK_CNC_MACHINING_ENABLED,
    DUMMY_CNC_SCHEDULER_ENABLED,
    CNC_JOB_ASSUME_MINUTES,
  } = req.body || {};

  const parseBool = (val) => {
    if (val === undefined || val === null) return null;
    const s = String(val).trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  };

  const doc = {
    _id: "default",
    hilinkDllEnterTimeoutMs: Number.isFinite(
      Number(HILINK_DLL_ENTER_TIMEOUT_MS),
    )
      ? Number(HILINK_DLL_ENTER_TIMEOUT_MS)
      : null,
    hilinkDllHoldFatalMs: Number.isFinite(Number(HILINK_DLL_HOLD_FATAL_MS))
      ? Number(HILINK_DLL_HOLD_FATAL_MS)
      : null,
    hilinkFailfastOnHang: parseBool(HILINK_FAILFAST_ON_HANG),
    mockCncMachiningEnabled: parseBool(MOCK_CNC_MACHINING_ENABLED),
    dummyCncSchedulerEnabled: parseBool(DUMMY_CNC_SCHEDULER_ENABLED),
    cncJobAssumeMinutes: Number.isFinite(Number(CNC_JOB_ASSUME_MINUTES))
      ? Number(CNC_JOB_ASSUME_MINUTES)
      : null,
  };

  await BridgeSetting.findOneAndUpdate({ _id: "default" }, doc, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { saved: true }, "Bridge settings registered"));
});

export const getBridgeSettings = asyncHandler(async (_req, res) => {
  const doc = await BridgeSetting.findById("default").lean();
  return res
    .status(200)
    .json(new ApiResponse(200, doc || {}, "Bridge settings fetched"));
});

const trimSlash = (s = "") => s.replace(/\/+$/, "");

const buildS3Key = (sourceStep, fileName, requestId) => {
  const safeFileName = path.basename(String(fileName || ""));
  if (requestId) {
    return `requests/${requestId}/${sourceStep}/${safeFileName}`;
  }
  return `bg/${sourceStep}/${safeFileName}`;
};

const selectStoredCaseFileName = (fileMeta = {}) => {
  const pick = fileMeta?.filePath || fileMeta?.originalName || "";
  return path.basename(String(pick || "").trim());
};

const buildStoredFileMeta = ({
  filePath,
  originalName,
  s3Key,
  s3Url,
  fileSize,
  uploadedAt,
} = {}) => {
  const safePath = path.basename(String(filePath || ""));
  const meta = {
    filePath: safePath,
    originalName: originalName || safePath,
    uploadedAt: uploadedAt || new Date(),
  };
  if (s3Key) meta.s3Key = s3Key;
  if (s3Url) meta.s3Url = s3Url;
  if (typeof fileSize === "number") meta.fileSize = fileSize;
  return meta;
};

export const registerFinishLine = asyncHandler(async (req, res) => {
  const { requestId, filePath, finishLine } = req.body || {};
  const now = new Date();

  if (!filePath) {
    throw new ApiError(400, "filePath is required");
  }

  if (!finishLine || !Array.isArray(finishLine?.points)) {
    throw new ApiError(400, "finishLine.points is required");
  }

  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId });
  }

  if (!request) {
    const normalizedTarget = normalizeFilePath(filePath);
    if (normalizedTarget) {
      const allRequests = await Request.find({ status: { $ne: "취소" } })
        .select({ requestId: 1, caseInfos: 1 })
        .lean();

      for (const r of allRequests) {
        const ci = r?.caseInfos || {};
        const storedPaths = [
          ci?.file?.filePath,
          ci?.camFile?.filePath,
          ci?.ncFile?.filePath,
        ].filter(Boolean);

        const hit = storedPaths.some(
          (n) => normalizeFilePath(n) === normalizedTarget,
        );
        if (hit) {
          request = await Request.findById(r._id);
          break;
        }
      }
    }
  }

  if (!request) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { found: false },
          "Finish line received but no matching request found",
        ),
      );
  }

  const points = finishLine?.points;
  if (!Array.isArray(points) || points.length < 2) {
    throw new ApiError(400, "finishLine.points must have at least 2 points");
  }

  const safeFinishLine = {
    ...finishLine,
    updatedAt: now,
  };
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.finishLine = safeFinishLine;
  await request.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: true, requestId: request.requestId },
        "Finish line saved",
      ),
    );
});

async function fetchRemoteFileBuffer(sourceStep, fileName) {
  const base = REMOTE_BASE_BY_STEP[sourceStep];
  if (!base) {
    console.log(
      `[BG-Callback] No remote base URL for sourceStep=${sourceStep}`,
    );
    return null;
  }
  const baseUrl = trimSlash(base);
  const remoteUrl = `${baseUrl}/files/${encodeURIComponent(fileName)}`;
  console.log(`[BG-Callback] Attempting remote fetch: ${remoteUrl}`);
  try {
    const res = await fetch(remoteUrl, {
      headers: withBridgeHeaders(),
    });
    if (!res.ok) {
      console.warn(
        `[BG-Callback] Remote fetch failed: ${remoteUrl} status=${res.status}`,
      );
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    console.log(
      `[BG-Callback] Remote fetch success: ${remoteUrl} size=${arrayBuffer.byteLength} bytes`,
    );
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn(
      `[BG-Callback] Remote fetch exception for ${remoteUrl}: ${err.message}`,
    );
    return null;
  }
}

/**
 * BG 프로그램들로부터 파일 처리 완료 보고를 받는 컨트롤러
 */
export const registerProcessedFile = asyncHandler(async (req, res) => {
  const {
    sourceStep, // '2-filled' (Rhino), '3-nc' (ESPRIT), 'cnc' (Bridge)
    fileName, // 처리된 파일명 (bg/storage/ 하위 상대 경로 포함 가능)
    originalFileName, // 원본 파일명 (연결용)
    requestId, // 의뢰 ID (있는 경우)
    status, // 'success', 'failed'
    metadata, // 추가 정보 (직경 등)
    s3Key: incomingS3Key, // presigned 업로드 후 전달되는 키
    s3Url: incomingS3Url, // presigned 업로드 후 전달되는 URL
    fileSize: incomingFileSize,
  } = req.body;

  if (!fileName || !sourceStep) {
    throw new ApiError(400, "fileName and sourceStep are required");
  }

  console.log(
    `[BG-Callback] Received from ${sourceStep}: ${fileName} (originalFileName=${originalFileName}, Status: ${status})`,
  );
  if (metadata) {
    try {
      console.log(
        "[BG-Callback] Incoming metadata:",
        JSON.stringify(metadata, null, 2),
      );
    } catch (metaLogErr) {
      console.log("[BG-Callback] Incoming metadata (raw):", metadata);
    }
  } else {
    console.log("[BG-Callback] Incoming metadata: <none>");
  }

  // 1. 의뢰 찾기
  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId });
    console.log(
      `[BG-Callback] Searched by requestId=${requestId}, found=${!!request}`,
    );
  }

  // requestId로 못 찾은 경우, 파일명(originalFileName 또는 fileName)으로 검색
  if (!request) {
    const targetSearchName = originalFileName || fileName;
    const normalizedTarget = normalizeFilePath(targetSearchName);
    console.log(
      `[BG-Callback] Searching by fileName: targetSearchName=${targetSearchName}, normalized=${normalizedTarget}`,
    );

    if (normalizedTarget) {
      // 모든 진행 중인 의뢰를 가져와서 파일명 매칭 (최근 90일 내역 위주로 성능 고려 가능하나 일단 전체 검색)
      const allRequests = await Request.find({ status: { $ne: "취소" } })
        .select({ requestId: 1, caseInfos: 1 })
        .lean();
      console.log(
        `[BG-Callback] Found ${allRequests.length} active requests to search`,
      );

      for (const r of allRequests) {
        const ci = r?.caseInfos || {};
        const storedNames = [
          ci?.file?.originalName,
          ci?.file?.filePath,
          ci?.camFile?.filePath,
          ci?.ncFile?.filePath,
        ].filter(Boolean);

        const normalizedNames = storedNames.map((n) => ({
          original: n,
          normalized: normalizeFilePath(n),
        }));

        const hit = normalizedNames.some(
          (item) => item.normalized === normalizedTarget,
        );

        if (hit) {
          console.log(`[BG-Callback] Matched request: ${r.requestId}`);
          console.log(
            `[BG-Callback] Match details - target: ${normalizedTarget}, stored: ${normalizedNames.map((n) => n.normalized).join(", ")}`,
          );
          request = await Request.findById(r._id); // 갱신을 위해 도큐먼트 객체로 다시 가져옴
          break;
        }
      }

      if (!request) {
        console.log(
          `[BG-Callback] No matching request found by fileName. Searched normalized target: ${normalizedTarget}`,
        );
        console.log(
          `[BG-Callback] Sample of stored file paths from first 3 requests:`,
        );
        for (let i = 0; i < Math.min(3, allRequests.length); i++) {
          const r = allRequests[i];
          const ci = r?.caseInfos || {};
          const paths = [
            ci?.file?.filePath,
            ci?.camFile?.filePath,
            ci?.ncFile?.filePath,
          ].filter(Boolean);
          console.log(
            `  Request ${r.requestId}: ${paths.map((p) => normalizeFilePath(p)).join(", ")}`,
          );
        }
      }
    }
  }

  if (!request) {
    console.warn(`[BG-Callback] Request not found for file: ${fileName}`);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { found: false },
          "File received but no matching request found",
        ),
      );
  }

  // 2. S3 업로드 (성공 시에만, 로컬 스토리지에서 읽어서)
  let s3Info = null;
  if (status === "success") {
    const resolvedOriginalName = originalFileName || fileName;
    if (incomingS3Key && incomingS3Url) {
      s3Info = buildStoredFileMeta({
        filePath: fileName,
        originalName: resolvedOriginalName,
        s3Key: incomingS3Key,
        s3Url: incomingS3Url,
        fileSize: incomingFileSize,
        uploadedAt: new Date(),
      });
      console.log(
        `[BG-Callback] Using presigned upload meta: s3Key=${incomingS3Key}, s3Url=${incomingS3Url}, fileSize=${incomingFileSize}`,
      );
    } else {
      try {
        // 1) 원격 BG 서버(Rhino/Esprit/Bridge)에 파일 서버가 있는 경우, HTTP로 받아온다.
        console.log(
          `[BG-Callback] Attempting to fetch file from remote: sourceStep=${sourceStep}, fileName=${fileName}`,
        );
        let fileBuffer =
          (await fetchRemoteFileBuffer(sourceStep, fileName)) || null;

        // 2) 원격 fetch가 없거나 실패하면 로컬 경로에서 시도 (dev/로컬 호환)
        if (!fileBuffer) {
          const localFilePath = path.join(
            BG_STORAGE_BASE,
            sourceStep,
            fileName,
          );
          console.log(
            `[BG-Callback] Remote fetch failed or no base URL, trying local path: ${localFilePath}`,
          );
          fileBuffer = await fs.readFile(localFilePath);
          console.log(
            `[BG-Callback] Local file read success: ${localFilePath} size=${fileBuffer.length} bytes`,
          );
        }

        const s3Key = buildS3Key(sourceStep, fileName, request?.requestId);
        const contentType =
          s3Utils.getFileType(fileName) === "3d_model"
            ? "application/octet-stream"
            : "application/octet-stream";

        console.log(
          `[BG-Callback] Uploading to S3 (fallback): s3Key=${s3Key}, fileSize=${fileBuffer.length}`,
        );
        const uploaded = await s3Utils.uploadFileToS3(
          fileBuffer,
          s3Key,
          contentType,
        );
        s3Info = buildStoredFileMeta({
          filePath: fileName,
          originalName: resolvedOriginalName,
          s3Key: uploaded.key,
          s3Url: uploaded.location,
          fileSize: fileBuffer.length,
          uploadedAt: new Date(),
        });
        console.log(
          `[BG-Callback] S3 upload success: s3Key=${s3Info.s3Key}, s3Url=${s3Info.s3Url}`,
        );
      } catch (err) {
        console.error(
          `[BG-Callback] Failed to upload processed file to S3: ${err.message}\n${err.stack}`,
        );
        // S3 업로드 실패해도 DB 업데이트는 진행 (로컬에는 파일이 있으므로)
      }
    }
  }

  // 3. 단계별 DB 업데이트
  const updateData = {};
  const now = new Date();
  const metadataUpdates = {};

  if (metadata && typeof metadata === "object") {
    if (metadata.diameter) {
      const max = Number(metadata.diameter.max);
      const conn = Number(metadata.diameter.connection);
      if (!Number.isNaN(max)) {
        metadataUpdates["caseInfos.maxDiameter"] = max;
      }
      if (!Number.isNaN(conn)) {
        metadataUpdates["caseInfos.connectionDiameter"] = conn;
      }
    }

    const finishLinePoints = metadata.finishLine?.points;
    if (Array.isArray(finishLinePoints) && finishLinePoints.length >= 2) {
      metadataUpdates["caseInfos.finishLine"] = {
        ...metadata.finishLine,
        updatedAt: now,
      };
    }
  }

  if (status === "success") {
    switch (sourceStep) {
      case "2-filled":
        updateData["caseInfos.camFile"] =
          s3Info ||
          buildStoredFileMeta({
            filePath: fileName,
            originalName: resolvedOriginalName,
            uploadedAt: now,
          });
        break;

      case "3-nc":
        updateData["caseInfos.ncFile"] =
          s3Info ||
          buildStoredFileMeta({
            filePath: fileName,
            originalName: resolvedOriginalName,
            uploadedAt: now,
          });
        updateData["productionSchedule.actualCamComplete"] = now;
        break;

      case "cnc-preload":
        updateData["productionSchedule.ncPreload"] = {
          status: "READY",
          machineId: metadata?.machineId
            ? String(metadata.machineId)
            : undefined,
          bridgePath: request?.caseInfos?.ncFile?.filePath,
          updatedAt: now,
          error: null,
        };
        break;

      case "cnc":
        updateData["productionSchedule.actualMachiningStart"] = now;
        updateData["productionSchedule.ncPreload"] = {
          status: "READY",
          machineId: metadata?.machineId
            ? String(metadata.machineId)
            : undefined,
          bridgePath: request?.caseInfos?.ncFile?.filePath,
          updatedAt: now,
          error: null,
        };
        if (metadata?.machineId) {
          updateData["productionSchedule.assignedMachine"] = metadata.machineId;
        }
        break;
    }

    Object.assign(updateData, metadataUpdates);
  } else {
    // 실패 시 상태 업데이트
    console.error(
      `[BG-Callback] Processing failed for ${request.requestId} at ${sourceStep}`,
    );
    if (sourceStep === "cnc" || sourceStep === "cnc-preload") {
      updateData["productionSchedule.ncPreload"] = {
        status: "FAILED",
        machineId: metadata?.machineId ? String(metadata.machineId) : undefined,
        bridgePath: request?.caseInfos?.ncFile?.filePath,
        updatedAt: now,
        error: String(metadata?.error || "") || `CNC 작업 실패 (${sourceStep})`,
      };
    } else {
      // 실패 시 제조사 수동 대응을 위해 상태 변경 또는 로그 기록
      const stageKey =
        sourceStep === "2-filled"
          ? "request"
          : sourceStep === "3-nc"
            ? "cam"
            : "machining";
      updateData[`caseInfos.reviewByStage.${stageKey}.status`] = "REJECTED";
      updateData[`caseInfos.reviewByStage.${stageKey}.reason`] =
        `백그라운드 작업 실패 (${sourceStep})`;
    }
  }

  console.log(
    `[BG-Callback] Updating request ${request.requestId} with updateData:`,
    JSON.stringify(updateData, null, 2),
  );

  try {
    const step = String(sourceStep || "").trim();
    if (step.toLowerCase().startsWith("cnc")) {
      const machineId = metadata?.machineId ? String(metadata.machineId) : null;
      const isOk =
        String(status || "")
          .trim()
          .toLowerCase() === "success";
      const eventType =
        step === "cnc-preload"
          ? "NC_PRELOAD"
          : step === "cnc" && isOk
            ? "MACHINING_START"
            : "CNC";

      await CncEvent.create({
        requestId: request?.requestId || null,
        machineId,
        sourceStep: step,
        status: isOk ? "success" : "failed",
        eventType,
        message: isOk ? "OK" : String(metadata?.error || "") || "FAILED",
        metadata: {
          fileName,
          originalFileName,
          ...(metadata && typeof metadata === "object" ? metadata : {}),
        },
      });
    }
  } catch (e) {
    console.error("[BG-Callback] CncEvent.create failed:", e?.message);
  }

  const updatedRequest = await Request.findByIdAndUpdate(
    request._id,
    { $set: updateData },
    { new: true },
  );
  console.log(
    `[BG-Callback] Request updated successfully. caseInfos.camFile=${JSON.stringify(
      updatedRequest?.caseInfos?.camFile,
    )}`,
  );

  try {
    sendNotificationToRoles(["manufacturer", "admin"], {
      type: "bg-file-processed",
      title: "BG 처리 완료",
      message: "파일 처리 결과가 반영되었습니다.",
      data: {
        requestId: request?.requestId || null,
        sourceStep: String(sourceStep || "").trim() || null,
        status: String(status || "").trim() || null,
        fileName: String(fileName || "").trim() || null,
      },
      timestamp: new Date(),
    });
  } catch {
    // ignore
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: true, requestId: request.requestId, s3Uploaded: !!s3Info },
        "Successfully registered processed file",
      ),
    );
});

/**
 * BG 앱이 직접 S3에 업로드하기 위한 presigned PUT URL 발급
 * body: { sourceStep, fileName, requestId? }
 */
export const getPresignedUploadUrl = asyncHandler(async (req, res) => {
  const { sourceStep, fileName, requestId } = req.body;
  if (!sourceStep || !fileName) {
    throw new ApiError(400, "sourceStep and fileName are required");
  }
  const key = buildS3Key(sourceStep, fileName, requestId);
  const contentType =
    s3Utils.getFileType(fileName) === "3d_model"
      ? "application/octet-stream"
      : "application/octet-stream";
  const presign = await getPresignedPutUrl(key, contentType, 3600);
  const s3Url = `https://${presign.bucket}.s3.amazonaws.com/${presign.key}`;
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...presign, s3Url, contentType },
        "Presigned URL issued",
      ),
    );
});

export const getBgStatus = asyncHandler(async (req, res) => {
  // 나중에 BG 프로그램들의 상태를 취합해서 보여주는 로직 추가 가능
  return res.status(200).json(new ApiResponse(200, { ok: true }, "OK"));
});

// requestId로 의뢰 메타(caseInfos 등)를 조회
// GET /api/bg/request-meta?requestId=... or ?filePath=...
export const getRequestMeta = asyncHandler(async (req, res) => {
  const { requestId, filePath } = req.query;
  if (!requestId && !filePath) {
    throw new ApiError(400, "requestId or filePath is required");
  }

  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId })
      .select({ requestId: 1, caseInfos: 1, lotNumber: 1 })
      .lean();
  }

  if (!request && filePath) {
    const normalized = normalizeFilePath(filePath);
    const all = await Request.find({ status: { $ne: "취소" } })
      .select({ requestId: 1, caseInfos: 1, lotNumber: 1 })
      .lean();

    for (const r of all) {
      const ci = r?.caseInfos || {};
      const storedNames = [
        ci?.file?.originalName,
        ci?.file?.filePath,
        ci?.camFile?.filePath,
        ci?.ncFile?.filePath,
      ].filter(Boolean);

      const hit = storedNames.some((n) => normalizeFilePath(n) === normalized);
      if (hit) {
        request = r;
        break;
      }
    }
  }

  if (!request) {
    return res
      .status(404)
      .json(new ApiResponse(404, { ok: false }, "Request not found"));
  }

  const ci = request.caseInfos || {};
  const finishLinePoints = Array.isArray(ci?.finishLine?.points)
    ? ci.finishLine.points
    : null;
  if (Array.isArray(finishLinePoints) && finishLinePoints.length >= 2) {
    console.log(
      `[BG] getRequestMeta: finishLine points available requestId=${request.requestId} count=${finishLinePoints.length}`,
    );
  }
  const lotPart = request?.lotNumber?.part || "";
  const serialCode = lotPart.length >= 3 ? lotPart.slice(-3) : "";
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ok: true,
        requestId: request.requestId,
        lotNumber: request.lotNumber || null,
        serialCode,
        caseInfos: {
          clinicName: ci.clinicName || "",
          patientName: ci.patientName || "",
          tooth: ci.tooth || "",
          implantManufacturer: ci.implantManufacturer || "",
          implantSystem: ci.implantSystem || "",
          implantType: ci.implantType || "",
          maxDiameter: ci.maxDiameter || 0,
          connectionDiameter: ci.connectionDiameter || 0,
          workType: ci.workType || "",
          lotNumber: lotPart,
          finishLine:
            Array.isArray(finishLinePoints) && finishLinePoints.length >= 2
              ? { points: finishLinePoints }
              : null,
        },
      },
      "Request meta",
    ),
  );
});

// Rhino 서버가 재기동될 때 input 폴더에 없는 원본 STL 목록을 넘겨주기 위한 API
// GET /api/bg/pending-stl
// 조건: 요청이 취소/완료가 아니고, caseInfos.file은 있으나 camFile이 없는 건
export const listPendingStl = asyncHandler(async (req, res) => {
  const requests = await Request.find({
    status: { $nin: ["취소", "완료", "cancelled", "completed"] },
    "caseInfos.file.filePath": { $exists: true, $ne: null },
    $or: [
      { "caseInfos.camFile": { $exists: false } },
      { "caseInfos.camFile.s3Key": { $exists: false } },
    ],
  })
    .select({
      requestId: 1,
      caseInfos: 1,
    })
    .lean();

  const items =
    requests
      ?.map((r) => {
        const ci = r?.caseInfos || {};
        const f = ci.file || {};
        // 백엔드(DB)에 저장된 원본 파일명을 그대로 사용 (BG는 조작/재생성 금지)
        const preferredName = selectStoredCaseFileName(f);
        return {
          requestId: r.requestId,
          filePath: preferredName,
          s3Key: f.s3Key,
          s3Url: f.s3Url,
          metadata: {
            clinicName: ci.clinicName,
            patientName: ci.patientName,
            tooth: ci.tooth,
          },
        };
      })
      ?.filter((x) => x?.filePath) || [];

  return res
    .status(200)
    .json(new ApiResponse(200, { items }, "Pending STL list"));
});

// 원본 STL을 Rhino 서버가 다시 받아갈 수 있게 내려주는 엔드포인트
// GET /api/bg/original-file?requestId=... or ?filePath=...
export const downloadOriginalFile = asyncHandler(async (req, res) => {
  const { requestId, filePath } = req.query;
  if (!requestId && !filePath) {
    throw new ApiError(400, "requestId or filePath is required");
  }

  let requestDoc = null;
  if (requestId) {
    requestDoc = await Request.findOne({ requestId });
  }
  if (!requestDoc && filePath) {
    const normalized = normalizeFilePath(filePath);
    const all = await Request.find({}).select({ requestId: 1, caseInfos: 1 });
    for (const r of all) {
      const ci = r?.caseInfos || {};
      const stored = [ci?.file?.originalName, ci?.file?.filePath].filter(
        Boolean,
      );
      const hit = stored.some((n) => normalizeFilePath(n) === normalized);
      if (hit) {
        requestDoc = r;
        break;
      }
    }
  }

  if (!requestDoc?.caseInfos?.file) {
    throw new ApiError(404, "Original file not found");
  }

  const f = requestDoc.caseInfos.file;
  const targetName = selectStoredCaseFileName(f) || "file.stl";

  // 1) S3가 있으면 S3에서 읽기
  if (f.s3Key) {
    try {
      const buf = await s3Utils.getObjectBufferFromS3(f.s3Key);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
      );
      return res.status(200).send(buf);
    } catch (err) {
      console.warn(
        `[BG-Original] S3 download failed key=${f.s3Key} err=${err?.message}`,
      );
    }
  }

  // 2) S3 키가 없고 URL만 있으면 프록시 다운로드
  if (f.s3Url) {
    try {
      const resp = await fetch(f.s3Url);
      if (resp.ok) {
        const arrayBuffer = await resp.arrayBuffer();
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
        );
        return res.status(200).send(Buffer.from(arrayBuffer));
      }
    } catch (err) {
      console.warn(
        `[BG-Original] URL download failed url=${f.s3Url} err=${err?.message}`,
      );
    }
  }

  throw new ApiError(404, "Original file not accessible");
});

function normalizeFilePath(v) {
  if (!v) return "";

  let candidate = String(v);

  try {
    if (/%[0-9A-Fa-f]{2}/.test(candidate)) {
      candidate = decodeURIComponent(candidate);
    }
  } catch {}

  try {
    const hasHangul = /[가-힣]/.test(candidate);
    const bytes = new Uint8Array(
      Array.from(candidate).map((ch) => ch.charCodeAt(0) & 0xff),
    );
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const decodedHasHangul = /[가-힣]/.test(decoded);
    if (!hasHangul && decodedHasHangul) {
      candidate = decoded;
    }
  } catch {}

  try {
    candidate = candidate.split(/[\\/]/).pop() || candidate;
  } catch {}

  return String(candidate || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_+/g, "_")
    .replace(/\.(stl|cam|fw|rhino)+$/i, "")
    .replace(/\.filled$/i, "")
    .replace(/\.+$/g, "");
}

const sanitizeComponent = (value) =>
  String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "");

const resolveCaseFileExt = (fileMeta = {}) => {
  const raw = String(fileMeta?.fileName || fileMeta?.originalName || "");
  if (raw.includes(".")) {
    const ext = raw.split(".").pop();
    if (ext) return `.${ext.toLowerCase()}`;
  }
  return ".stl";
};

const buildStandardCaseFileName = (requestDoc, fileMeta = {}) => {
  if (!requestDoc) return "";
  const reqId = sanitizeComponent(requestDoc.requestId || "");
  const ci = requestDoc.caseInfos || {};
  const clinic = sanitizeComponent(ci.clinicName || "");
  const patient = sanitizeComponent(ci.patientName || "");
  const tooth = sanitizeComponent(ci.tooth || "");
  const base = [reqId, clinic, patient, tooth].filter(Boolean).join("-");
  if (!base) return "";
  return `${base}${resolveCaseFileExt(fileMeta)}`;
};

// BG 프로그램이 재기동될 때 input/output 폴더를 스캔하며,
// 백엔드에 "이 파일이 아직 미처리인가?"를 확인하기 위한 API
// GET /api/bg/file-status?sourceStep=1-stl&fileName=xxx.stl
export const getFileProcessingStatus = asyncHandler(async (req, res) => {
  const { sourceStep, filePath, force } = req.query;
  if (!sourceStep || !filePath) {
    throw new ApiError(400, "sourceStep and filePath are required");
  }

  const step = String(sourceStep);
  const normalized = normalizeFilePath(filePath);
  if (!normalized) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { ok: true, processed: false, shouldProcess: false },
          "invalid filePath",
        ),
      );
  }

  // step별로 "처리 완료" 판단 기준을 단순화
  // - 1-stl -> 2-filled: caseInfos.camFile 존재 여부
  // - 2-filled -> 3-nc: caseInfos.ncFile 존재 여부
  // 취소/완료 여부를 판단해야 하므로 상태 필터 없이 검색
  const requests = await Request.find({})
    .select({ requestId: 1, caseInfos: 1, status: 1 })
    .lean();

  let matched = null;
  for (const r of requests) {
    const ci = r?.caseInfos || {};
    const storedNames = [
      ci?.file?.originalName,
      ci?.file?.filePath,
      ci?.camFile?.filePath,
      ci?.ncFile?.filePath,
    ].filter(Boolean);

    const hit = storedNames.some((n) => normalizeFilePath(n) === normalized);
    if (hit) {
      matched = r;
      break;
    }
  }

  if (!matched) {
    // 매칭되는 의뢰를 못 찾으면 기본적으로 처리하지 않지만,
    // force=true(재기동 복구 등)일 때는 shouldProcess를 true로 내려 복구를 허용한다.
    const shouldProcess = String(force || "").toLowerCase() === "true";
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          processed: false,
          shouldProcess,
          reason: "no_request",
        },
        "No matching request",
      ),
    );
  }

  const ci = matched.caseInfos || {};
  const reqStatus = String(matched.status || "").trim();
  const isClosed =
    reqStatus === "취소" ||
    reqStatus === "완료" ||
    reqStatus.toLowerCase() === "cancelled" ||
    reqStatus.toLowerCase() === "completed";
  const requestReviewStatus = ci?.reviewByStage?.request?.status;

  if (step === "1-stl") {
    const processed = Boolean(ci?.camFile?.fileName || ci?.camFile?.s3Key);
    const shouldProcess =
      !processed && requestReviewStatus !== "REJECTED" && !isClosed;
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          processed,
          shouldProcess,
          requestId: matched.requestId,
          rejected: requestReviewStatus === "REJECTED",
          closed: isClosed,
        },
        "File status",
      ),
    );
  }

  if (step === "2-filled") {
    const processed = Boolean(ci?.ncFile?.fileName || ci?.ncFile?.s3Key);
    const shouldProcess = !processed && !isClosed;
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          processed,
          shouldProcess,
          requestId: matched.requestId,
          closed: isClosed,
        },
        "File status",
      ),
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ok: true, processed: false, shouldProcess: false },
        "Unsupported sourceStep",
      ),
    );
});
