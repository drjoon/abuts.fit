import s3Utils from "../utils/s3.utils.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import path from "path";
import fs from "fs/promises";
import Request from "../models/request.model.js";
import { getPresignedPutUrl } from "../utils/s3.utils.js";

const BG_STORAGE_BASE =
  process.env.BG_STORAGE_PATH ||
  path.resolve(process.cwd(), "../../bg/storage");

const REMOTE_BASE_BY_STEP = {
  "2-filled": process.env.RHINO_COMPUTE_BASE_URL,
  "3-nc": process.env.ESPRIT_ADDIN_BASE_URL,
  cnc: process.env.BRIDGE_BASE || process.env.BRIDGE_NODE_URL,
};

const trimSlash = (s = "") => s.replace(/\/+$/, "");

const buildS3Key = (sourceStep, fileName, requestId) => {
  if (requestId) {
    return `requests/${requestId}/${sourceStep}/${fileName}`;
  }
  return `bg/${sourceStep}/${fileName}`;
};

async function fetchRemoteFileBuffer(sourceStep, fileName) {
  const base = REMOTE_BASE_BY_STEP[sourceStep];
  if (!base) {
    console.log(
      `[BG-Callback] No remote base URL for sourceStep=${sourceStep}`
    );
    return null;
  }
  const baseUrl = trimSlash(base);
  const remoteUrl = `${baseUrl}/files/${encodeURIComponent(fileName)}`;
  console.log(`[BG-Callback] Attempting remote fetch: ${remoteUrl}`);
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(
        `[BG-Callback] Remote fetch failed: ${remoteUrl} status=${res.status}`
      );
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    console.log(
      `[BG-Callback] Remote fetch success: ${remoteUrl} size=${arrayBuffer.byteLength} bytes`
    );
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn(
      `[BG-Callback] Remote fetch exception for ${remoteUrl}: ${err.message}`
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
    `[BG-Callback] Received from ${sourceStep}: ${fileName} (originalFileName=${originalFileName}, Status: ${status})`
  );

  // 1. 의뢰 찾기
  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId });
    console.log(
      `[BG-Callback] Searched by requestId=${requestId}, found=${!!request}`
    );
  }

  // requestId로 못 찾은 경우, 파일명(originalFileName 또는 fileName)으로 검색
  if (!request) {
    const targetSearchName = originalFileName || fileName;
    const normalizedTarget = normalizeFileName(targetSearchName);
    console.log(
      `[BG-Callback] Searching by fileName: targetSearchName=${targetSearchName}, normalized=${normalizedTarget}`
    );

    if (normalizedTarget) {
      // 모든 진행 중인 의뢰를 가져와서 파일명 매칭 (최근 90일 내역 위주로 성능 고려 가능하나 일단 전체 검색)
      const allRequests = await Request.find({ status: { $ne: "취소" } })
        .select({ requestId: 1, caseInfos: 1 })
        .lean();
      console.log(
        `[BG-Callback] Found ${allRequests.length} active requests to search`
      );

      for (const r of allRequests) {
        const ci = r?.caseInfos || {};
        const storedNames = [
          ci?.file?.fileName,
          ci?.file?.originalName,
          ci?.file?.filePath,
          ci?.camFile?.fileName,
          ci?.camFile?.filePath,
          ci?.ncFile?.fileName,
          ci?.ncFile?.filePath,
        ].filter(Boolean);

        const hit = storedNames.some(
          (n) => normalizeFileName(n) === normalizedTarget
        );
        if (hit) {
          console.log(`[BG-Callback] Matched request: ${r.requestId}`);
          request = await Request.findById(r._id); // 갱신을 위해 도큐먼트 객체로 다시 가져옴
          break;
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
          "File received but no matching request found"
        )
      );
  }

  // 2. S3 업로드 (성공 시에만, 로컬 스토리지에서 읽어서)
  let s3Info = null;
  if (status === "success") {
    if (incomingS3Key && incomingS3Url) {
      s3Info = {
        fileName,
        s3Key: incomingS3Key,
        s3Url: incomingS3Url,
        fileSize: incomingFileSize,
        uploadedAt: new Date(),
      };
      console.log(
        `[BG-Callback] Using presigned upload meta: s3Key=${incomingS3Key}, s3Url=${incomingS3Url}, fileSize=${incomingFileSize}`
      );
    } else {
      try {
        // 1) 원격 BG 서버(Rhino/Esprit/Bridge)에 파일 서버가 있는 경우, HTTP로 받아온다.
        console.log(
          `[BG-Callback] Attempting to fetch file from remote: sourceStep=${sourceStep}, fileName=${fileName}`
        );
        let fileBuffer =
          (await fetchRemoteFileBuffer(sourceStep, fileName)) || null;

        // 2) 원격 fetch가 없거나 실패하면 로컬 경로에서 시도 (dev/로컬 호환)
        if (!fileBuffer) {
          const localFilePath = path.join(
            BG_STORAGE_BASE,
            sourceStep,
            fileName
          );
          console.log(
            `[BG-Callback] Remote fetch failed or no base URL, trying local path: ${localFilePath}`
          );
          fileBuffer = await fs.readFile(localFilePath);
          console.log(
            `[BG-Callback] Local file read success: ${localFilePath} size=${fileBuffer.length} bytes`
          );
        }

        const s3Key = buildS3Key(sourceStep, fileName, request?.requestId);
        const contentType =
          s3Utils.getFileType(fileName) === "3d_model"
            ? "application/octet-stream"
            : "application/octet-stream";

        console.log(
          `[BG-Callback] Uploading to S3 (fallback): s3Key=${s3Key}, fileSize=${fileBuffer.length}`
        );
        const uploaded = await s3Utils.uploadFileToS3(
          fileBuffer,
          s3Key,
          contentType
        );
        s3Info = {
          fileName,
          s3Key: uploaded.key,
          s3Url: uploaded.location,
          fileSize: fileBuffer.length,
          uploadedAt: new Date(),
        };
        console.log(
          `[BG-Callback] S3 upload success: s3Key=${s3Info.s3Key}, s3Url=${s3Info.s3Url}`
        );
      } catch (err) {
        console.error(
          `[BG-Callback] Failed to upload processed file to S3: ${err.message}\n${err.stack}`
        );
        // S3 업로드 실패해도 DB 업데이트는 진행 (로컬에는 파일이 있으므로)
      }
    }
  }

  // 3. 단계별 DB 업데이트
  const updateData = {};
  const now = new Date();

  if (status === "success") {
    switch (sourceStep) {
      case "2-filled":
        updateData.status = "CAM";
        updateData.status2 = "중";
        updateData["caseInfos.camFile"] = s3Info || {
          fileName,
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamStart"] = now;
        break;

      case "3-nc":
        updateData.status = "CAM";
        updateData.status2 = "후";
        updateData["caseInfos.ncFile"] = s3Info || {
          fileName,
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamComplete"] = now;
        break;

      case "cnc":
        updateData.status = "생산";
        updateData.status2 = "중";
        updateData["productionSchedule.actualMachiningStart"] = now;
        if (metadata?.machineId) {
          updateData["productionSchedule.assignedMachine"] = metadata.machineId;
        }
        break;
    }
  } else {
    // 실패 시 상태 업데이트
    console.error(
      `[BG-Callback] Processing failed for ${request.requestId} at ${sourceStep}`
    );
    // 실패 시 제조사 수동 대응을 위해 상태 변경 또는 로그 기록
    updateData[
      `reviewByStage.${
        sourceStep === "2-filled"
          ? "cam"
          : sourceStep === "3-nc"
          ? "cam"
          : "machining"
      }.status`
    ] = "REJECTED";
    updateData[
      `reviewByStage.${
        sourceStep === "2-filled"
          ? "cam"
          : sourceStep === "3-nc"
          ? "cam"
          : "machining"
      }.reason`
    ] = `백그라운드 작업 실패 (${sourceStep})`;
  }

  console.log(
    `[BG-Callback] Updating request ${request.requestId} with updateData:`,
    JSON.stringify(updateData, null, 2)
  );
  const updatedRequest = await Request.findByIdAndUpdate(
    request._id,
    { $set: updateData },
    { new: true }
  );
  console.log(
    `[BG-Callback] Request updated successfully. caseInfos.camFile=${JSON.stringify(
      updatedRequest?.caseInfos?.camFile
    )}`
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: true, requestId: request.requestId, s3Uploaded: !!s3Info },
        "Successfully registered processed file"
      )
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
  return res
    .status(200)
    .json(
      new ApiResponse(200, { ...presign, contentType }, "Presigned URL issued")
    );
});

export const getBgStatus = asyncHandler(async (req, res) => {
  // 나중에 BG 프로그램들의 상태를 취합해서 보여주는 로직 추가 가능
  return res.status(200).json(new ApiResponse(200, { ok: true }, "OK"));
});

// requestId로 의뢰 메타(caseInfos 등)를 조회
// GET /api/bg/request-meta?requestId=...
export const getRequestMeta = asyncHandler(async (req, res) => {
  const { requestId } = req.query;
  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }

  const request = await Request.findOne({ requestId })
    .select({ requestId: 1, caseInfos: 1 })
    .lean();

  if (!request) {
    return res
      .status(404)
      .json(new ApiResponse(404, { ok: false }, "Request not found"));
  }

  const ci = request.caseInfos || {};
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ok: true,
        requestId: request.requestId,
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
          lotNumber: ci.lotNumber || "",
        },
      },
      "Request meta"
    )
  );
});

// Rhino 서버가 재기동될 때 input 폴더에 없는 원본 STL 목록을 넘겨주기 위한 API
// GET /api/bg/pending-stl
// 조건: 요청이 취소/완료가 아니고, caseInfos.file은 있으나 camFile이 없는 건
export const listPendingStl = asyncHandler(async (req, res) => {
  const requests = await Request.find({
    status: { $nin: ["취소", "완료", "cancelled", "completed"] },
    "caseInfos.file.fileName": { $exists: true, $ne: null },
    $or: [
      { "caseInfos.camFile": { $exists: false } },
      { "caseInfos.camFile.fileName": { $exists: false } },
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
        return {
          requestId: r.requestId,
          fileName: f.fileName || f.originalName || f.filePath,
          s3Key: f.s3Key,
          s3Url: f.s3Url,
        };
      })
      ?.filter((x) => x?.fileName) || [];

  return res
    .status(200)
    .json(new ApiResponse(200, { items }, "Pending STL list"));
});

// 원본 STL을 Rhino 서버가 다시 받아갈 수 있게 내려주는 엔드포인트
// GET /api/bg/original-file?requestId=... or ?fileName=...
export const downloadOriginalFile = asyncHandler(async (req, res) => {
  const { requestId, fileName } = req.query;
  if (!requestId && !fileName) {
    throw new ApiError(400, "requestId or fileName is required");
  }

  let requestDoc = null;
  if (requestId) {
    requestDoc = await Request.findOne({ requestId });
  }
  if (!requestDoc && fileName) {
    const normalized = normalizeFileName(fileName);
    const all = await Request.find({}).select({ requestId: 1, caseInfos: 1 });
    for (const r of all) {
      const ci = r?.caseInfos || {};
      const stored = [
        ci?.file?.fileName,
        ci?.file?.originalName,
        ci?.file?.filePath,
      ].filter(Boolean);
      const hit = stored.some((n) => normalizeFileName(n) === normalized);
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
  const targetName = f.fileName || f.originalName || f.filePath || "file.stl";

  // 1) S3가 있으면 S3에서 읽기
  if (f.s3Key) {
    try {
      const buf = await s3Utils.getObjectBufferFromS3(f.s3Key);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`
      );
      return res.status(200).send(buf);
    } catch (err) {
      console.warn(
        `[BG-Original] S3 download failed key=${f.s3Key} err=${err?.message}`
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
          `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`
        );
        return res.status(200).send(Buffer.from(arrayBuffer));
      }
    } catch (err) {
      console.warn(
        `[BG-Original] URL download failed url=${f.s3Url} err=${err?.message}`
      );
    }
  }

  throw new ApiError(404, "Original file not accessible");
});

const normalizeFileName = (v) => {
  if (!v) return "";
  const s = String(v);
  let candidate = s;
  try {
    const hasHangul = /[가-힣]/.test(s);
    const bytes = new Uint8Array(
      Array.from(s).map((ch) => ch.charCodeAt(0) & 0xff)
    );
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const decodedHasHangul = /[가-힣]/.test(decoded);
    candidate = !hasHangul && decodedHasHangul ? decoded : s;
  } catch {
    candidate = s;
  }

  const base = String(candidate)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .slice(-1)[0];

  return base
    .normalize("NFC")
    .replace(/\.[^/.]+$/, "")
    .trim()
    .toLowerCase();
};

// BG 프로그램이 재기동될 때 input/output 폴더를 스캔하며,
// 백엔드에 "이 파일이 아직 미처리인가?"를 확인하기 위한 API
// GET /api/bg/file-status?sourceStep=1-stl&fileName=xxx.stl
export const getFileProcessingStatus = asyncHandler(async (req, res) => {
  const { sourceStep, fileName, force } = req.query;
  if (!sourceStep || !fileName) {
    throw new ApiError(400, "sourceStep and fileName are required");
  }

  const step = String(sourceStep);
  const normalized = normalizeFileName(fileName);
  if (!normalized) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { ok: true, processed: false, shouldProcess: false },
          "invalid fileName"
        )
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
      ci?.file?.fileName,
      ci?.file?.originalName,
      ci?.file?.filePath,
      ci?.camFile?.fileName,
      ci?.camFile?.filePath,
      ci?.ncFile?.fileName,
      ci?.ncFile?.filePath,
    ].filter(Boolean);

    const hit = storedNames.some((n) => normalizeFileName(n) === normalized);
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
        "No matching request"
      )
    );
  }

  const ci = matched.caseInfos || {};
  const reqStatus = String(matched.status || "").trim();
  const isClosed =
    reqStatus === "취소" ||
    reqStatus === "완료" ||
    reqStatus.toLowerCase() === "cancelled" ||
    reqStatus.toLowerCase() === "completed";
  const camStatus = ci?.reviewByStage?.cam?.status;

  if (step === "1-stl") {
    const processed = Boolean(ci?.camFile?.fileName || ci?.camFile?.s3Key);
    const shouldProcess = !processed && camStatus !== "REJECTED" && !isClosed;
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ok: true,
          processed,
          shouldProcess,
          requestId: matched.requestId,
          rejected: camStatus === "REJECTED",
          closed: isClosed,
        },
        "File status"
      )
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
        "File status"
      )
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ok: true, processed: false, shouldProcess: false },
        "Unsupported sourceStep"
      )
    );
});
