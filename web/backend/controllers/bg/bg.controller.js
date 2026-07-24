import s3Utils from "../../utils/s3.utils.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import BridgeSetting from "../../models/bridgeSetting.model.js";
import { sendNotificationToRoles } from "../../socket.js";
import path from "path";
import fs from "fs/promises";
import Request from "../../models/request.model.js";
import Connection from "../../models/connection.model.js";
import CncEvent from "../../models/cncEvent.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import { getPresignedPutUrl } from "../../utils/s3.utils.js";
import {
  applyStatusMapping,
  normalizeRequestForResponse,
} from "../requests/utils.js";
import { normalizeImplantFields } from "../../utils/implantCanonical.js";
import { emitBgRuntimeStatus } from "./bgRuntimeEvents.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  resolvePrcFileNames,
  resolveConnectionTargetDiameter,
} from "../requests/prcMapping.utils.js";

const BG_STORAGE_BASE =
  process.env.BG_STORAGE_PATH ||
  path.resolve(process.cwd(), "../../bg/storage");

const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || "";

const normalizeRetentionGroove = (value) => {
  const rg = String(value || "")
    .trim()
    .toLowerCase();
  if (rg === "deep") return "deep";
  if (rg === "none" || rg === "shallow") return "none";
  return "deep";
};

const parseManufacturerHexRotationModeOrNull = (value) => {
  const v = String(value || "").trim();
  if (v === "구성정보") return "구성정보";
  if (v === "무보정") return "무보정";
  if (v === "보정") return "보정";
  return null;
};

const collectCaseInfoFileNameCandidates = (caseInfos) => {
  const ci = caseInfos || {};
  const cadCompanionFiles = Array.isArray(ci?.cadCompanionFiles)
    ? ci.cadCompanionFiles
    : [];

  const names = [
    ci?.file?.originalName,
    ci?.file?.filePath,
    ci?.camFile?.fileName,
    ci?.camFile?.filePath,
    ci?.ncFile?.fileName,
    ci?.ncFile?.filePath,
    ...cadCompanionFiles.flatMap((f) => [f?.originalName, f?.filePath, f?.s3Key]),
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const deduped = [];
  for (const n of names) {
    if (deduped.includes(n)) continue;
    deduped.push(n);
  }
  return deduped;
};

const buildCadConstructionMeta = (caseInfos) => {
  const candidates = collectCaseInfoFileNameCandidates(caseInfos);
  const lower = candidates.map((n) => n.toLowerCase());

  const exocadConstructionInfoFiles = candidates.filter((_, idx) =>
    lower[idx].endsWith(".constructioninfo"),
  );
  const exocadDentalProjectFiles = candidates.filter((_, idx) =>
    lower[idx].endsWith(".dentalproject"),
  );

  const threeShapePtsFiles = candidates.filter((_, idx) =>
    lower[idx].endsWith(".pts"),
  );
  const threeShapeClnFiles = candidates.filter((_, idx) =>
    lower[idx].endsWith(".cln"),
  );
  const threeShapeOrderFiles = candidates.filter((_, idx) =>
    lower[idx].endsWith(".3shapeorder"),
  );

  const hasExocad =
    exocadConstructionInfoFiles.length > 0 || exocadDentalProjectFiles.length > 0;
  const hasThreeShape =
    threeShapePtsFiles.length > 0 ||
    threeShapeClnFiles.length > 0 ||
    threeShapeOrderFiles.length > 0;

  const source = hasExocad
    ? "exocad"
    : hasThreeShape
      ? "3shape"
      : "unknown";

  const stlLike = candidates.find((name) => /\.stl$/i.test(name));
  const stlStem = stlLike
    ? path.basename(stlLike).replace(/\.stl$/i, "")
    : "*";

  return {
    source,
    detectedFiles: {
      exocad: {
        constructionInfo: exocadConstructionInfoFiles,
        dentalProject: exocadDentalProjectFiles,
      },
      threeShape: {
        pts: threeShapePtsFiles,
        cln: threeShapeClnFiles,
        order: threeShapeOrderFiles,
      },
    },
    expectedCompanionFiles: {
      exocad: [`${stlStem}.constructionInfo`, `${stlStem}.dentalProject`],
      threeShape: [`${stlStem}.pts`, `${stlStem}.cln`, `${stlStem}.3shapeOrder`],
    },
  };
};

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

async function removeRequestAutoJobsFromBridgeSnapshot({
  machineId,
  requestId,
}) {
  const rid = String(requestId || "").trim();
  if (!rid) return;

  const mid = String(machineId || "").trim();
  const machines = mid
    ? await CncMachine.find({ machineId: mid }).select(
        "machineId bridgeQueueSnapshot",
      )
    : await CncMachine.find({
        "bridgeQueueSnapshot.jobs.requestId": rid,
      }).select("machineId bridgeQueueSnapshot");

  for (const machine of machines || []) {
    const jobs = Array.isArray(machine?.bridgeQueueSnapshot?.jobs)
      ? machine.bridgeQueueSnapshot.jobs
      : [];
    if (jobs.length === 0) continue;

    const before = jobs.length;
    const nextJobs = jobs.filter(
      (j) => String(j?.requestId || "").trim() !== rid,
    );
    if (nextJobs.length === before) continue;

    machine.bridgeQueueSnapshot.jobs = nextJobs;
    machine.bridgeQueueSnapshot.updatedAt = new Date();
    await machine.save();
    console.warn(
      `[BG-Callback] Removed stale request_auto jobs from bridge snapshot: machine=${machine.machineId} requestId=${rid} removed=${before - nextJobs.length}`,
    );
  }
}

const REMOTE_BASE_BY_STEP = {
  "2-filled": process.env.RHINO_COMPUTE_BASE_URL,
  "3-nc": process.env.ESPRIT_ADDIN_BASE_URL,
  cnc: process.env.BRIDGE_BASE || process.env.BRIDGE_NODE_URL,
};

async function resolveConnectionL2FromCaseInfos(caseInfos) {
  const normalized = normalizeImplantFields(caseInfos || {});
  const manufacturer = String(normalized.implantManufacturer || "").trim();
  const brand = String(normalized.implantBrand || "").trim();
  const family = String(normalized.implantFamily || "").trim();
  const type = String(normalized.implantType || "").trim();
  if (!manufacturer || !brand || !family || !type) return null;

  const connection = await Connection.findOne({
    manufacturer,
    brand,
    family,
    type,
    category: "hanhwa-connection",
  })
    .select({ l2: 1 })
    .lean();

  const rawL2 = Number(connection?.l2);
  return Number.isFinite(rawL2) ? rawL2 : null;
}

export const registerBridgeSettings = asyncHandler(async (req, res) => {
  const {
    HILINK_DLL_ENTER_TIMEOUT_MS,
    HILINK_DLL_HOLD_FATAL_MS,
    HILINK_FAILFAST_ON_HANG,
    MOCK_CNC_MACHINING_ENABLED,
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
  const safePath = String(filePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const safeName = path.basename(safePath);
  const meta = {
    filePath: safePath,
    originalName: originalName || safeName,
    uploadedAt: uploadedAt || new Date(),
  };
  if (s3Key) meta.s3Key = s3Key;
  if (s3Url) meta.s3Url = s3Url;
  if (Number.isFinite(Number(fileSize))) meta.fileSize = Number(fileSize);
  return meta;
};

const normalizeFinishLineWithZExtrema = (finishLine) => {
  // finishline Z 메타데이터 SSOT 정책
  // - 레거시 별칭(top_z 등)은 저장/반환하지 않는다.
  // - `max_z`, `min_z`, `max_z_point`, `min_z_point`만 canonical 필드로 사용한다.
  // - 값 일관성을 위해 payload에 값이 있더라도 points 기준으로 서버에서 재계산해 덮어쓴다.
  const pointsRaw = Array.isArray(finishLine?.points) ? finishLine.points : [];
  const points = pointsRaw
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));

  if (points.length < 2) return null;

  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i][2] < points[minIdx][2]) minIdx = i;
    if (points[i][2] > points[maxIdx][2]) maxIdx = i;
  }

  return {
    ...(finishLine || {}),
    points,
    min_z: points[minIdx][2],
    max_z: points[maxIdx][2],
    min_z_point: points[minIdx],
    max_z_point: points[maxIdx],
  };
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

  const normalizedTarget = normalizeFilePath(filePath);
  const rawFilePath = String(filePath || "").trim();
  const baseName = rawFilePath ? path.basename(rawFilePath) : "";

  if (!request && baseName) {
    const directCandidates = Array.from(
      new Set([rawFilePath, baseName].filter(Boolean)),
    );

    request = await Request.findOne({
      manufacturerStage: { $ne: "취소" },
      $or: [
        { "caseInfos.file.filePath": { $in: directCandidates } },
        { "caseInfos.file.originalName": { $in: directCandidates } },
        { "caseInfos.camFile.filePath": { $in: directCandidates } },
        { "caseInfos.ncFile.filePath": { $in: directCandidates } },
      ],
    });
  }

  if (!request) {
    if (normalizedTarget) {
      const allRequests = await Request.find({
        manufacturerStage: { $ne: "취소" },
      })
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

  const safeFinishLineCore = normalizeFinishLineWithZExtrema(finishLine);
  if (!safeFinishLineCore) {
    throw new ApiError(400, "finishLine.points must have at least 2 valid xyz points");
  }

  const safeFinishLine = {
    ...safeFinishLineCore,
    updatedAt: now,
  };
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.finishLine = safeFinishLine;
  await request.save();

  // Note: Rhino-server가 STL 처리 시 자동으로 finish line과 메타데이터를 계산하여 등록함
  // 별도로 트리거할 필요 없음

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
    requestMongoId, // 의뢰 Mongo ObjectId (있는 경우, requestId보다 우선)
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
  // 중요: 원본/복사본이 동일 파일명을 공유할 수 있으므로 ObjectId 기반 식별을 최우선으로 사용한다.
  let request = null;
  const payloadRequestMongoId = String(
    requestMongoId || metadata?.requestMongoId || metadata?._id || "",
  ).trim();

  if (payloadRequestMongoId) {
    request = await Request.findById(payloadRequestMongoId);
    console.log(
      `[BG-Callback] Searched by requestMongoId=${payloadRequestMongoId}, found=${!!request}`,
    );
  }

  if (!request && requestId) {
    request = await Request.findOne({ requestId });
    console.log(
      `[BG-Callback] Searched by requestId=${requestId}, found=${!!request}`,
    );
  }

  // requestId로 못 찾은 경우, 3-nc 경로에서 requestId를 추정해 우선 검색
  // 예: fileName="3-nc/20260604-WHDNDTGF/xxx.nc" 또는 "20260604-WHDNDTGF/xxx.nc"
  if (!request && String(sourceStep || "").trim() === "3-nc") {
    try {
      const rawFile = String(fileName || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/^3-nc\//i, "");
      const [candidateRequestId] = rawFile.split("/");
      if (candidateRequestId) {
        const guessed = await Request.findOne({
          requestId: String(candidateRequestId).trim(),
        });
        if (guessed) {
          request = guessed;
          console.log(
            `[BG-Callback] Matched by nc output path requestId=${candidateRequestId}`,
          );
        }
      }
    } catch (e) {
      console.warn(
        "[BG-Callback] requestId guess from 3-nc path failed:",
        e?.message || e,
      );
    }
  }

  // 여전히 못 찾은 경우, 파일명(originalFileName 또는 fileName)으로 검색
  if (!request) {
    const targetSearchName = originalFileName || fileName;
    const normalizedTarget = normalizeFilePath(targetSearchName);
    console.log(
      `[BG-Callback] Searching by fileName: targetSearchName=${targetSearchName}, normalized=${normalizedTarget}`,
    );

    if (normalizedTarget) {
      // 모든 진행 중인 의뢰를 가져와서 파일명 매칭 (최근 90일 내역 위주로 성능 고려 가능하나 일단 전체 검색)
      const allRequests = await Request.find({
        manufacturerStage: { $ne: "취소" },
      })
        .select({
          requestId: 1,
          source: 1,
          manufacturerStage: 1,
          "rnd.doneAt": 1,
          updatedAt: 1,
          productionSchedule: 1,
          caseInfos: 1,
        })
        .lean();
      console.log(
        `[BG-Callback] Found ${allRequests.length} active requests to search`,
      );

      const matchedCandidates = [];
      for (const r of allRequests) {
        const ci = r?.caseInfos || {};

        // 재발 방지: R&D 보관 원본(doneAt 존재)은 BG 파일 콜백의 자동 매칭 대상으로 절대 사용하지 않는다.
        // CAM 재생성/NC 생성은 반드시 작업 복사본(doneAt=null)에서만 진행되어야 한다.
        const isImmutableRndSample =
          String(r?.source || "") === "manufacturer_sample" &&
          Boolean(r?.rnd?.doneAt);
        if (isImmutableRndSample) continue;

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

        if (!hit) continue;

        const requestReviewStatus = String(
          ci?.reviewByStage?.request?.status || "",
        ).trim();
        const actualCamStart = r?.productionSchedule?.actualCamStart;
        const actualCamComplete = r?.productionSchedule?.actualCamComplete;
        const hasNcFile = Boolean(ci?.ncFile?.s3Key || ci?.ncFile?.filePath);
        const stageLabel = String(r?.manufacturerStage || "").trim();
        const isSampleWorkingCopy =
          String(r?.source || "") === "manufacturer_sample" &&
          !Boolean(r?.rnd?.doneAt);
        const isActiveCamWindow =
          requestReviewStatus === "APPROVED" &&
          actualCamStart &&
          !actualCamComplete;

        // 동일 파일명을 공유하는 경우를 대비해 점수를 크게 벌려 오매칭 가능성을 낮춘다.
        //  1) CAM 처리 진행중(active window)
        //  2) 현재 단계가 의뢰/CAM
        //  3) NC 미생성
        //  4) 작업용 샘플 복사본(doneAt=null)
        //  5) 최근 업데이트
        let score = 0;
        if (isActiveCamWindow) score += 50;
        if (stageLabel === "의뢰" || stageLabel === "CAM") score += 15;
        if (!hasNcFile) score += 10;
        if (isSampleWorkingCopy) score += 8;

        matchedCandidates.push({
          _id: r?._id,
          requestId: r?.requestId,
          score,
          updatedAt: r?.updatedAt ? new Date(r.updatedAt).getTime() : 0,
          normalizedNames,
          stageLabel,
          isActiveCamWindow,
          isSampleWorkingCopy,
        });
      }

      if (matchedCandidates.length) {
        matchedCandidates.sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score;
          return b.updatedAt - a.updatedAt;
        });
        const chosen = matchedCandidates[0];
        console.log(`[BG-Callback] Matched request: ${chosen.requestId}`);
        console.log(
          `[BG-Callback] Match details - target: ${normalizedTarget}, chosenScore=${chosen.score}, stage=${chosen.stageLabel}, activeCamWindow=${chosen.isActiveCamWindow}, sampleWorkingCopy=${chosen.isSampleWorkingCopy}, stored: ${chosen.normalizedNames
            .map((n) => n.normalized)
            .join(", ")}`,
        );
        request = await Request.findById(chosen._id); // 갱신을 위해 도큐먼트 객체로 다시 가져옴
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

  // 재발 방지: R&D 보관 원본(doneAt!=null)은 완료 샘플 보관본이며 작업 대상이 아니다.
  // BG 콜백이 잘못 매칭되더라도 원본을 변경하지 않도록 즉시 무시한다.
  if (
    String(request?.source || "") === "manufacturer_sample" &&
    Boolean(request?.rnd?.doneAt)
  ) {
    console.warn("[BG-Callback] Ignored immutable R&D sample", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      sourceStep,
      fileName,
      requestIdFromPayload: requestId || null,
      requestMongoIdFromPayload: payloadRequestMongoId || null,
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          found: true,
          ignored: true,
          reason: "immutable_rnd_sample",
          requestId: request?.requestId || null,
        },
        "R&D 보관 원본은 BG 콜백 업데이트 대상이 아니므로 무시했습니다.",
      ),
    );
  }

  // 2. S3 업로드 (성공 시에만, 로컬 스토리지에서 읽어서)
  let s3Info = null;
  if (status === "success") {
    const resolvedOriginalName = originalFileName || fileName;
    const canonicalBgFilePath =
      sourceStep === "3-nc" && String(fileName || "").trim()
        ? (() => {
            const cleanName = String(fileName || "")
              .trim()
              .replace(/\\/g, "/")
              .replace(/^\/+/, "")
              .replace(/^3-nc\//i, "");
            // 이미 서브디렉토리가 포함된 경우(Esprit이 {date}-{code}/{stlName}.nc 형태로 저장)엔 그대로 사용
            // 단순 파일명(program.nc 등)이면 requestId 폴더를 추가하여 의뢰별 고유 경로 생성
            if (cleanName.includes("/")) {
              return `3-nc/${cleanName}`;
            }
            return requestId
              ? `3-nc/${requestId}/${cleanName}`
              : `3-nc/${cleanName}`;
          })()
        : fileName;
    if (incomingS3Key && incomingS3Url) {
      s3Info = buildStoredFileMeta({
        filePath: canonicalBgFilePath,
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
          filePath: canonicalBgFilePath,
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
        // Enhanced logic: prefer stl-registered metadata unless incoming metadata
        // includes an explicit timestamp showing it's newer.
        const existingRaw = request?.caseInfos?.stlMetadataUpdatedAt;
        const existingStlUpdatedAt = existingRaw ? new Date(existingRaw) : null;

        // BG may provide an updatedAt in the metadata payload. Try to read common keys.
        const incomingTsRaw =
          (metadata &&
            (metadata.updatedAt ||
              metadata.stlMetadataUpdatedAt ||
              metadata.metadataUpdatedAt)) ||
          null;
        const incomingStlUpdatedAt = incomingTsRaw
          ? new Date(incomingTsRaw)
          : null;

        if (!existingStlUpdatedAt) {
          // No authoritative STL metadata saved yet — accept incoming value.
          metadataUpdates["caseInfos.connectionDiameter"] = conn;
          if (incomingStlUpdatedAt) {
            metadataUpdates["caseInfos.stlMetadataUpdatedAt"] =
              incomingStlUpdatedAt;
          }
        } else if (incomingStlUpdatedAt) {
          // Both exist: accept only if incoming is newer
          if (incomingStlUpdatedAt.getTime() > existingStlUpdatedAt.getTime()) {
            metadataUpdates["caseInfos.connectionDiameter"] = conn;
            metadataUpdates["caseInfos.stlMetadataUpdatedAt"] =
              incomingStlUpdatedAt;
            console.log(
              `[BG-Callback] Overwriting connectionDiameter from processed-file because incoming metadata.updatedAt is newer. existing=${existingStlUpdatedAt.toISOString()} incoming=${incomingStlUpdatedAt.toISOString()} incoming_conn=${conn}`,
            );
          } else {
            console.log(
              `[BG-Callback] Skipping connectionDiameter update: existing stlMetadataUpdatedAt is newer. existing=${existingStlUpdatedAt.toISOString()} incoming=${incomingStlUpdatedAt.toISOString()} incoming_conn=${conn}`,
            );
          }
        } else {
          // existing exists but incoming has no timestamp — skip to avoid reverting
          console.log(
            `[BG-Callback] Skipping connectionDiameter update from processed-file because stlMetadataUpdatedAt exists (${existingStlUpdatedAt.toISOString()}) and incoming metadata has no timestamp. incoming_conn=${conn}`,
          );
        }
      }
    }

    const normalizedFinishLine = normalizeFinishLineWithZExtrema(
      metadata.finishLine,
    );
    if (normalizedFinishLine) {
      metadataUpdates["caseInfos.finishLine"] = {
        ...normalizedFinishLine,
        updatedAt: now,
      };
    }

    const hexRotation = metadata.hexRotation;
    if (hexRotation && typeof hexRotation === "object") {
      metadataUpdates["caseInfos.hexRotation"] = hexRotation;
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

      case "3-nc": {
        const ncStoredName = String(fileName || "").trim();
        // fileName이 이미 "requestId/program.nc" 형태일 수 있으므로 그대로 사용
        // 또는 단순 파일명일 경우 requestId 폴더 추가
        let ncBridgePath = "";
        if (ncStoredName) {
          // fileName에 이미 경로가 포함되어 있으면 그대로 사용
          if (ncStoredName.includes("/") || ncStoredName.includes("\\")) {
            ncBridgePath = `3-nc/${ncStoredName}`;
          } else {
            // 단순 파일명이면 requestId 폴더 추가
            ncBridgePath = requestId
              ? `3-nc/${requestId}/${ncStoredName}`
              : `3-nc/${ncStoredName}`;
          }
        }
        updateData["caseInfos.ncFile"] =
          s3Info ||
          buildStoredFileMeta({
            filePath: ncBridgePath || fileName,
            originalName: resolvedOriginalName,
            uploadedAt: now,
          });
        updateData["productionSchedule.actualCamComplete"] = now;

        // 비동기 CAM 플로우: 의뢰 승인 시점에는 CAM으로 stage를 올리지 않고,
        // Esprit(NC 생성) 완료 콜백 시점에만 CAM 단계로 전환한다.
        try {
          const cloned = {
            manufacturerStage: request?.manufacturerStage,
          };
          applyStatusMapping(cloned, "CAM");
          updateData["manufacturerStage"] = cloned.manufacturerStage;
        } catch {
          updateData["manufacturerStage"] = "CAM";
        }
        updateData["caseInfos.reviewByStage.request.status"] = "APPROVED";
        updateData["caseInfos.reviewByStage.request.reason"] = "";
        updateData["caseInfos.reviewByStage.request.updatedAt"] = now;
        break;
      }

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
        // CNC 가공 시작(또는 완료) 시점에만 manufacturerStage/status 를 '가공'으로 전환한다.
        try {
          const cloned = {
            manufacturerStage: request?.manufacturerStage,
          };
          applyStatusMapping(cloned, "가공");
          updateData["manufacturerStage"] = cloned.manufacturerStage;
        } catch {
          updateData["manufacturerStage"] = "가공";
        }
        updateData["caseInfos.reviewByStage.cam.status"] = "APPROVED";
        updateData["caseInfos.reviewByStage.cam.reason"] = "";
        updateData["caseInfos.reviewByStage.cam.updatedAt"] = now;
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
      try {
        await removeRequestAutoJobsFromBridgeSnapshot({
          machineId: metadata?.machineId ? String(metadata.machineId) : "",
          requestId: request?.requestId,
        });
      } catch (cleanupErr) {
        console.error(
          "[BG-Callback] Failed to cleanup bridge queue snapshot on CNC failure:",
          cleanupErr?.message || cleanupErr,
        );
      }
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
  const normalizedUpdatedRequest = updatedRequest
    ? await normalizeRequestForResponse(updatedRequest)
    : null;
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
        s3Key: s3Info?.s3Key || null, // 프론트엔드 캐시 무효화용
      },
      timestamp: new Date(),
    });
  } catch {
    // ignore
  }

  try {
    const step = String(sourceStep || "").trim();
    const stepLabel =
      step === "2-filled"
        ? "Filled STL 수신"
        : step === "3-nc"
          ? "NC 생성 완료"
          : step === "cnc"
            ? "가공 시작 반영"
            : step === "cnc-preload"
              ? "NC 프리로드 완료"
              : "BG 처리 완료";
    const stepStage =
      step === "2-filled"
        ? "request"
        : step === "3-nc"
          ? "cam"
          : step === "cnc" || step === "cnc-preload"
            ? "machining"
            : null;
    emitBgRuntimeStatus({
      requestId: request?.requestId || null,
      requestMongoId: String(request?._id || "").trim() || null,
      source: step || "bg",
      stage: stepStage,
      status:
        String(status || "")
          .trim()
          .toLowerCase() === "success"
          ? "completed"
          : "failed",
      label: stepLabel,
      tone:
        String(status || "")
          .trim()
          .toLowerCase() === "success"
          ? "blue"
          : "rose",
      clear:
        String(status || "")
          .trim()
          .toLowerCase() === "success",
      metadata: {
        fileName: String(fileName || "").trim() || null,
        sourceStep: step || null,
      },
    });

    const stageChangedSteps = new Set([
      "2-filled",
      "3-nc",
      "cnc",
      "cnc-preload",
    ]);
    const isSuccess =
      String(status || "")
        .trim()
        .toLowerCase() === "success";
    if (isSuccess && stageChangedSteps.has(step) && normalizedUpdatedRequest) {
      emitAppEventToRoles(["manufacturer", "admin"], "request:stage-changed", {
        source: "bg-file-processed",
        requestId: request?.requestId || null,
        requestMongoId: String(request?._id || "").trim() || null,
        fromStage: String(request?.manufacturerStage || "").trim() || null,
        toStage:
          String(normalizedUpdatedRequest?.manufacturerStage || "").trim() ||
          null,
        reviewStage:
          step === "2-filled"
            ? "request"
            : step === "3-nc"
              ? "cam"
              : "machining",
        reviewStatus: "APPROVED",
        request: normalizedUpdatedRequest,
      });
    }
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

export const registerRuntimeStatus = asyncHandler(async (req, res) => {
  const {
    requestId,
    requestMongoId,
    source,
    stage,
    status,
    label,
    tone,
    startedAt,
    elapsedSeconds,
    clear,
    metadata,
  } = req.body || {};

  const normalizedSource = String(source || "").trim();
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();
  const normalizedLabel = String(label || "").trim();
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedMongoId = String(requestMongoId || "").trim();

  if (!normalizedSource || !normalizedStatus) {
    throw new ApiError(400, "source and status are required");
  }

  let resolvedRequestId = normalizedRequestId;
  let resolvedMongoId = normalizedMongoId;

  if ((!resolvedRequestId || !resolvedMongoId) && resolvedMongoId) {
    const found = await Request.findById(resolvedMongoId)
      .select({ _id: 1, requestId: 1 })
      .lean()
      .catch(() => null);
    if (found) {
      resolvedRequestId =
        String(found.requestId || "").trim() || resolvedRequestId;
      resolvedMongoId = String(found._id || "").trim() || resolvedMongoId;
    }
  }

  if ((!resolvedRequestId || !resolvedMongoId) && resolvedRequestId) {
    const found = await Request.findOne({ requestId: resolvedRequestId })
      .select({ _id: 1, requestId: 1 })
      .lean()
      .catch(() => null);
    if (found) {
      resolvedRequestId =
        String(found.requestId || "").trim() || resolvedRequestId;
      resolvedMongoId = String(found._id || "").trim() || resolvedMongoId;
    }
  }

  emitBgRuntimeStatus({
    requestId: resolvedRequestId || null,
    requestMongoId: resolvedMongoId || null,
    source: normalizedSource,
    stage: stage ? String(stage).trim() : null,
    status: normalizedStatus,
    label: normalizedLabel || null,
    tone: tone ? String(tone).trim() : null,
    startedAt: startedAt || null,
    elapsedSeconds,
    clear: clear === true,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ok: true,
        requestId: resolvedRequestId || null,
        requestMongoId: resolvedMongoId || null,
        source: normalizedSource,
        status: normalizedStatus,
      },
      "Runtime status registered",
    ),
  );
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
      .select({
        requestId: 1,
        caseInfos: 1,
        lotNumber: 1,
        // 제조사 수동 좌표계 전처리 모드(canonical: "보정"|"무보정"|"구성정보")도 함께 로드한다.
        "rnd.manufacturerHexRotation": 1,
      })
      .lean();
  }

  if (!request && filePath) {
    const normalized = normalizeFilePath(filePath);
    const all = await Request.find({ manufacturerStage: { $ne: "취소" } })
      .select({
        requestId: 1,
        caseInfos: 1,
        lotNumber: 1,
        // filePath 기반 조회 fallback에서도 동일하게 전처리 모드값을 내려주기 위해 포함한다.
        "rnd.manufacturerHexRotation": 1,
      })
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
  const cadConstructionMeta = buildCadConstructionMeta(ci);
  // 제조사 수동 좌표계 전처리 모드는 request-meta에서 canonical 값으로 전달한다.
  // canonical: "보정" | "무보정" | "구성정보"
  // request-meta에서 명시적으로 내려주어 add-in이 파일명/추정 로직 없이 SSOT를 직접 사용하게 한다.
  const manufacturerHexRotationRaw = String(
    request?.rnd?.manufacturerHexRotation || "",
  ).trim();
  const manufacturerHexRotationFromRequest = parseManufacturerHexRotationModeOrNull(
    manufacturerHexRotationRaw,
  );
  const hasCadCompanionFiles =
    Array.isArray(ci?.cadCompanionFiles) && ci.cadCompanionFiles.length > 0;
  const hasManualManufacturerPick = Boolean(
    request?.rnd?.manufacturerHexRotationUpdatedAt,
  );
  const manufacturerHexRotationMode =
    hasCadCompanionFiles && !hasManualManufacturerPick
      ? "구성정보"
      : manufacturerHexRotationFromRequest || "보정";
  const normalizedFinishLine = normalizeFinishLineWithZExtrema(ci?.finishLine);
  const finishLinePoints = Array.isArray(normalizedFinishLine?.points)
    ? normalizedFinishLine.points
    : null;
  if (Array.isArray(finishLinePoints) && finishLinePoints.length >= 2) {
    console.log(
      `[BG] getRequestMeta: finishLine points available requestId=${request.requestId} count=${finishLinePoints.length} max_z=${normalizedFinishLine?.max_z} min_z=${normalizedFinishLine?.min_z}`,
    );
  }
  // PRC 파일명: DB에 저장된 값 우선, 없으면 임플란트 정보로 동적 계산
  // NC 재생성 경로에서도 esprit-addin이 PRC 파일명을 필요로 하므로 여기서 보장
  let resolvedPrcFiles = {
    faceHolePrcFileName: ci.faceHolePrcFileName || "",
    connectionPrcFileName: ci.connectionPrcFileName || "",
  };
  if (
    !resolvedPrcFiles.faceHolePrcFileName ||
    !resolvedPrcFiles.connectionPrcFileName
  ) {
    try {
      resolvedPrcFiles = await resolvePrcFileNames(ci);
    } catch (e) {
      console.warn(
        `[BG] getRequestMeta: PRC 동적 계산 실패 requestId=${request.requestId}`,
        e?.message,
      );
    }
  }
  const connectionTargetDiameter = await resolveConnectionTargetDiameter(ci, {
    connectionPrcFileName: resolvedPrcFiles.connectionPrcFileName,
  });
  if (connectionTargetDiameter != null) {
    console.log(
      `[BG] getRequestMeta: connectionTargetDiameter=${connectionTargetDiameter}mm requestId=${request.requestId} brand=${ci.implantManufacturer}/${ci.implantBrand}/${ci.implantFamily}/${ci.implantType}`,
    );
  } else {
    console.warn(
      `[BG] getRequestMeta: connectionTargetDiameter가 null입니다. requestId=${request.requestId} brand=${ci.implantManufacturer}/${ci.implantBrand}/${ci.implantFamily}/${ci.implantType} prcFile=${resolvedPrcFiles.connectionPrcFileName}`,
    );
  }
  const lotValue = request?.lotNumber?.value || "";
  const serialCode = lotValue.length >= 3 ? lotValue.slice(-3) : "";
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
          implantBrand: ci.implantBrand || "",
          implantFamily: ci.implantFamily || "",
          implantType: ci.implantType || "",
          maxDiameter: ci.maxDiameter || 0,
          connectionDiameter: ci.connectionDiameter || 0,
          connectionTargetDiameter,
          workType: ci.workType || "",
          // 유지홈 옵션(2단계: 없음/있음) — legacy shallow는 none으로 정규화.
          // esprit-addin이 5axisComposite_A.prc의 StepIncrement 값을 결정할 때 사용.
          retentionGroove: normalizeRetentionGroove(ci.retentionGroove),
          lotNumber: lotValue,
          // esprit-addin에서 공정 PRC를 선택하기 위한 의뢰별 설정
          // PRC 파일명이 DB에 저장된 경우 그대로 사용, 없으면 임플란트 정보로 동적 계산.
          // NC 재생성 경로(request-meta 직접 조회)에서도 PRC 파일명이 필요하므로 여기서 보장.
          faceHolePrcFileName: resolvedPrcFiles.faceHolePrcFileName,
          connectionPrcFileName: resolvedPrcFiles.connectionPrcFileName,
          // 제조사 수동 좌표계 전처리 모드(canonical: "보정"|"무보정"|"구성정보").
          // 보정 모드에서 add-in이 appliedDeg를 Esprit 부호계로 반전 해석해 +30에 합산한다.
          manufacturerHexRotation: manufacturerHexRotationMode,
          // 요청 시 업로드된 CAD 구성 보조파일 메타정보 (S3 key 포함)
          cadCompanionFiles: Array.isArray(ci?.cadCompanionFiles)
            ? ci.cadCompanionFiles
                .map((f) => ({
                  originalName: String(f?.originalName || "").trim(),
                  fileType: String(f?.fileType || "").trim(),
                  fileSize: Number(f?.fileSize || 0),
                  filePath: String(f?.filePath || "").trim(),
                  s3Key: String(f?.s3Key || "").trim(),
                }))
                .filter((f) => f.originalName || f.s3Key)
            : [],
          // "구성정보" 모드에서 CAD별 좌표 구성파일 탐지/예상 파일명을 함께 내려준다.
          // - exocad: .constructionInfo (선택: .dentalProject)
          // - 3shape: .pts (대체: .cln, .3shapeOrder)
          cadConstruction: {
            modeEnabled: manufacturerHexRotationMode === "구성정보",
            ...cadConstructionMeta,
          },
          // Rhino 정렬 telemetry(헥스 회전각).
          // Esprit가 보정(legacy 0) 모드에서 appliedDeg를 부호 반전 해석해 +30에 합산할 때 사용한다.
          hexRotation:
            ci?.hexRotation && typeof ci.hexRotation === "object"
              ? ci.hexRotation
              : null,
          finishLine:
            Array.isArray(finishLinePoints) && finishLinePoints.length >= 2
              ? {
                points: finishLinePoints,
                max_z: normalizedFinishLine?.max_z,
                min_z: normalizedFinishLine?.min_z,
                max_z_point: normalizedFinishLine?.max_z_point,
                min_z_point: normalizedFinishLine?.min_z_point,
              }
            : null,
        },
      },
      "Request meta",
    ),
  );
});

// Rhino 서버 재기동 시 backend pending-stl SSOT를 기준으로 입력 STL 캐시를 복구하기 위한 API
// GET /api/bg/pending-stl
// 조건: 요청이 취소가 아니고, caseInfos.file은 있으나 camFile이 없는 건
export const listPendingStl = asyncHandler(async (req, res) => {
  const requests = await Request.find({
    manufacturerStage: { $ne: "취소" },
    // "승인한 것만" BG가 처리하도록 제한
    // rhino-server는 startup 시 이 목록만 읽어 로컬 입력 캐시를 복구하므로,
    // 승인/명령되지 않은 건이 섞이면 안 된다.
    "caseInfos.reviewByStage.request.status": "APPROVED",
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

export const listPendingNc = asyncHandler(async (_req, res) => {
  const requests = await Request.find({
    manufacturerStage: { $ne: "취소" },
    // endpoint는 유지하지만, 현재 esprit-addin startup path는 pending-nc 복구를 사용하지 않는다.
    // 그래도 수동/진단 용도로 호출될 수 있으므로 승인된 건만 내려야 한다.
    "caseInfos.reviewByStage.request.status": "APPROVED",
    "caseInfos.camFile.filePath": { $exists: true, $ne: null },
    $or: [
      { "caseInfos.ncFile": { $exists: false } },
      { "caseInfos.ncFile.s3Key": { $exists: false } },
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
        const f = ci.camFile || {};
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
    .json(new ApiResponse(200, { items }, "Pending NC list"));
});

export const downloadSourceFile = asyncHandler(async (req, res) => {
  const { sourceStep, requestId, filePath } = req.query;
  const step = String(sourceStep || "").trim();
  if (!step) {
    throw new ApiError(400, "sourceStep is required");
  }
  if (!requestId && !filePath) {
    throw new ApiError(400, "requestId or filePath is required");
  }

  if (step !== "2-filled") {
    throw new ApiError(400, "unsupported sourceStep");
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
      const stored = [
        ci?.camFile?.originalName,
        ci?.camFile?.filePath,
        ci?.file?.originalName,
        ci?.file?.filePath,
      ].filter(Boolean);
      const hit = stored.some((n) => normalizeFilePath(n) === normalized);
      if (hit) {
        requestDoc = r;
        break;
      }
    }
  }

  const f = requestDoc?.caseInfos?.camFile;
  if (!f) {
    throw new ApiError(404, "Source file not found");
  }

  const targetName = selectStoredCaseFileName(f) || "file.stl";

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
        `[BG-Source] S3 download failed step=${step} key=${f.s3Key} err=${err?.message}`,
      );
    }
  }

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
        `[BG-Source] URL download failed step=${step} url=${f.s3Url} err=${err?.message}`,
      );
    }
  }

  throw new ApiError(404, "Source file not accessible");
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
  const stage = String(matched.manufacturerStage || "").trim();
  const isClosed = stage === "취소";
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

// STL 메타데이터 등록 (rhino-server에서 호출)
export const registerStlMetadata = asyncHandler(async (req, res) => {
  const {
    requestId,
    requestMongoId,
    maxDiameter,
    connectionDiameter,
    totalLength,
    l1,
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide,
    hexRotation,
    coordinateError,
  } = req.body;
  const metadataUpdatedAt = new Date();

  if (!requestId && !requestMongoId) {
    throw new ApiError(400, "requestId or requestMongoId required");
  }

  const query = requestMongoId ? { _id: requestMongoId } : { requestId };
  const request = await Request.findOne(query);

  if (!request) {
    throw new ApiError(404, "Request not found");
  }

  // caseInfos에 메타데이터 저장
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.maxDiameter = maxDiameter;
  request.caseInfos.connectionDiameter = connectionDiameter;
  request.caseInfos.totalLength = totalLength;
  request.caseInfos.stlMetadataUpdatedAt = metadataUpdatedAt;
  request.caseInfos.l1 = l1;
  request.caseInfos.taperAngle = taperAngle;
  request.caseInfos.tiltAxisVector = tiltAxisVector;
  request.caseInfos.frontPoint = frontPoint;

  if (hexRotation && typeof hexRotation === "object") {
    request.caseInfos.hexRotation = hexRotation;
  }

  // taperGuide는 필요시 별도 필드로 저장 (선택적)
  if (taperGuide) {
    request.caseInfos.taperGuide = taperGuide;
  }

  // 좌표계 에러가 있으면 저장
  if (coordinateError) {
    request.caseInfos.coordinateError = coordinateError;
    console.log(
      `[registerStlMetadata] ⚠️  COORDINATE ERROR for requestId=${request.requestId}: ${coordinateError}`,
    );
  } else {
    // 에러가 없으면 기존 에러 제거
    request.caseInfos.coordinateError = null;
  }

  await request.save();

  const normalizedUpdatedRequest = await normalizeRequestForResponse(request);
  const eventMetadata = {
    maxDiameter,
    connectionDiameter,
    totalLength,
    updatedAt: metadataUpdatedAt,
    l1,
    taperAngle,
    tiltAxisVector,
    frontPoint,
    taperGuide: request.caseInfos?.taperGuide,
    hexRotation: request.caseInfos?.hexRotation,
    // finishline 높이 메타데이터는 max_z/min_z SSOT로만 전달
    finishLine: request.caseInfos?.finishLine || null,
  };

  try {
    emitAppEventToRoles(
      ["manufacturer", "admin"],
      "request:stl-metadata-updated",
      {
        source: "register-stl-metadata",
        requestId: request.requestId,
        requestMongoId: String(request._id || "").trim() || null,
        metadata: eventMetadata,
        request: normalizedUpdatedRequest,
      },
    );
  } catch (eventError) {
    console.warn(
      `[registerStlMetadata] failed to emit metadata update event for requestId=${request.requestId}:`,
      eventError?.message || eventError,
    );
  }

  console.log(
    `[registerStlMetadata] requestId=${request.requestId} ` +
      `maxDiameter=${maxDiameter?.toFixed(2)}mm ` +
      `connectionDiameter=${connectionDiameter?.toFixed(2)}mm ` +
      `totalLength=${totalLength?.toFixed(2)}mm ` +
      `l1=${l1?.toFixed(2)}mm ` +
      `taperAngle=${taperAngle?.toFixed(2)}°` +
      (coordinateError ? ` [COORD_ERROR]` : ``),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        requestId: request.requestId,
        metadata: {
          maxDiameter,
          connectionDiameter,
          totalLength,
          updatedAt: metadataUpdatedAt,
          l1,
          taperAngle,
          tiltAxisVector,
          frontPoint,
          hexRotation: request.caseInfos?.hexRotation,
          finishLine: request.caseInfos?.finishLine || null,
        },
      },
      "STL metadata registered",
    ),
  );
});

// STL 메타데이터 조회 (프론트에서 호출)
export const getStlMetadata = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  console.log(`[getStlMetadata] Called with requestId=${requestId}`);

  const request = await Request.findOne({ requestId });

  if (!request) {
    console.log(`[getStlMetadata] Request not found: ${requestId}`);
    throw new ApiError(404, "Request not found");
  }

  const l2 = await resolveConnectionL2FromCaseInfos(request.caseInfos);
  const metadata = {
    maxDiameter: request.caseInfos?.maxDiameter,
    connectionDiameter: request.caseInfos?.connectionDiameter,
    totalLength: request.caseInfos?.totalLength,
    updatedAt: request.caseInfos?.stlMetadataUpdatedAt,
    l1: request.caseInfos?.l1,
    l2,
    taperAngle: request.caseInfos?.taperAngle,
    tiltAxisVector: request.caseInfos?.tiltAxisVector,
    frontPoint: request.caseInfos?.frontPoint,
    taperGuide: request.caseInfos?.taperGuide,
    hexRotation: request.caseInfos?.hexRotation,
    // PreviewModal(useStlMetadata)에서 finishline extrema를 바로 사용하도록 포함
    finishLine: request.caseInfos?.finishLine || null,
  };

  console.log(
    `[getStlMetadata] requestId=${requestId} ` +
      `cached=${!!(metadata.maxDiameter && metadata.connectionDiameter)} ` +
      `maxDiameter=${metadata.maxDiameter} ` +
      `connectionDiameter=${metadata.connectionDiameter} ` +
      `totalLength=${metadata.totalLength} ` +
      `l1=${metadata.l1} ` +
      `l2=${metadata.l2} ` +
      `taperAngle=${metadata.taperAngle} ` +
      `finishLine.max_z=${metadata.finishLine?.max_z} ` +
      `finishLine.min_z=${metadata.finishLine?.min_z}`,
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        requestId: request.requestId,
        metadata,
        cached: !!(metadata.maxDiameter && metadata.connectionDiameter),
      },
      "STL metadata",
    ),
  );
});

// STL 메타데이터 재계산 요청 (제조사/관리자가 프론트에서 호출)
export const recalculateStlMetadata = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await Request.findOne({ requestId });

  if (!request) {
    throw new ApiError(404, "Request not found");
  }

  // Rhino-server에 재계산 요청
  const rhinoBaseUrl = process.env.RHINO_COMPUTE_BASE_URL;
  if (!rhinoBaseUrl) {
    throw new ApiError(500, "RHINO_COMPUTE_BASE_URL not configured");
  }

  try {
    const axios = (await import("axios")).default;
    const connectionTargetDiameter = await resolveConnectionTargetDiameter(
      request.caseInfos,
    );

    const response = await axios.post(
      `${rhinoBaseUrl}/recalculate-metadata`,
      {
        requestId: request.requestId,
        requestMongoId: request._id.toString(),
        connectionTargetDiameter,
      },
      {
        headers: withBridgeHeaders(),
        timeout: 30000,
      },
    );

    console.log(
      `[recalculateStlMetadata] requestId=${requestId} triggered rhino-server recalculation`,
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requestId,
          status: "recalculating",
          message: "Metadata recalculation triggered",
        },
        "Recalculation started",
      ),
    );
  } catch (error) {
    console.error(`[recalculateStlMetadata] Error:`, error.message);
    throw new ApiError(
      500,
      `Failed to trigger recalculation: ${error.message}`,
    );
  }
});
