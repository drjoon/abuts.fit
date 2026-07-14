import axios from "axios";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { emitBgRuntimeStatus } from "../bg/bgRuntimeEvents.js";
import { emitAppEventToRoles } from "../../socket.js";
import Request from "../../models/request.model.js";
import { resolveConnectionTargetDiameter } from "../requests/prcMapping.utils.js";
import { normalizeRequestForResponse } from "../requests/utils.js";

const RHINO_COMPUTE_BASE_URL = String(
  process.env.RHINO_COMPUTE_BASE_URL || "http://127.0.0.1:8000",
).replace(/\/+$/, "");

const RHINO_SHARED_SECRET = String(
  process.env.RHINO_SHARED_SECRET || "",
).trim();

const rhinoAuthHeaders = () => {
  if (!RHINO_SHARED_SECRET) return {};
  return { "X-Bridge-Secret": RHINO_SHARED_SECRET };
};

// [추가] 과도한 병렬 요청 방지를 위한 세마포어/큐 관리
const MAX_CONCURRENT_FILLHOLE = 1; // Rhino가 1대이므로 1개씩 순차 처리
let activeRequests = 0;
const requestQueue = [];

const processQueue = async () => {
  if (activeRequests >= MAX_CONCURRENT_FILLHOLE || requestQueue.length === 0)
    return;

  const { resolve: qResolve, reject: qReject, task } = requestQueue.shift();
  activeRequests++;

  try {
    const result = await task();
    qResolve(result);
  } catch (err) {
    qReject(err);
  } finally {
    activeRequests--;
    processQueue();
  }
};

const enqueueTask = (task) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, task });
    processQueue();
  });
};

const sanitizeStlName = (name) => {
  const base =
    String(name || "input.stl")
      .split(/[\\/]/)
      .pop() || "input.stl";
  const cleaned = base.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
  return cleaned.toLowerCase().endsWith(".stl") ? cleaned : `${cleaned}.stl`;
};

const normalizeFinishLinePayload = (finishLine) => {
  const pointsRaw = Array.isArray(finishLine?.points) ? finishLine.points : [];
  const points = pointsRaw
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));

  if (points.length < 3) return null;

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

// [정책] uploadBufferToRhino / ensureStlOnRhinoStore 제거
// 백엔드가 rhino-server에 직접 파일을 전송하던 방식 삭제.
// rhino-server의 /api/rhino/process-file 호출 시 파일이 없으면
// rhino-server가 /bg/original-file → S3에서 직접 다운로드함.

export const processFileByName = asyncHandler(async (req, res) => {
  const rawName = req.body?.filePath || req.body?.fileName || req.body?.name;
  if (!rawName) {
    throw new ApiError(400, "fileName is required");
  }

  const safeName = sanitizeStlName(String(rawName));
  const requestId = req.body?.requestId || null;
  const force = Boolean(req.body?.force);

  // requestId가 있으면 Request 조회하여 requestMongoId 확보
  let requestMongoId = null;
  if (requestId) {
    try {
      const request = await Request.findOne({ requestId })
        .select({ _id: 1 })
        .lean();
      if (request) {
        requestMongoId = String(request._id);
      }
    } catch {
      // ignore
    }
  }

  // Rhino 재생성 시작 시 런타임 상태 발행 (경과 시간 표시용)
  if (requestId) {
    emitBgRuntimeStatus({
      requestId,
      requestMongoId,
      source: "rhino-server",
      stage: "request",
      status: "processing",
      label: "Filled STL 생성 중",
      tone: "blue",
      startedAt: new Date().toISOString(),
      elapsedSeconds: 0,
    });
  }

  try {
    // [정책] rhino-server가 파일 없으면 /bg/original-file로 S3에서 직접 다운로드
    const resp = await enqueueTask(() =>
      axios.post(
        `${RHINO_COMPUTE_BASE_URL}/api/rhino/process-file`,
        { filePath: safeName, fileName: safeName, requestId, force },
        {
          timeout: 1000 * 60 * 3,
          headers: rhinoAuthHeaders(),
        },
      ),
    );

    // 성공 시 런타임 상태 클리어 (bg.controller의 registerProcessedFile에서 완료 이벤트 발행)
    if (requestId) {
      emitBgRuntimeStatus({
        requestId,
        requestMongoId,
        source: "rhino-server",
        stage: "request",
        status: "completed",
        label: "Filled STL 생성 완료",
        tone: "blue",
        clear: true,
      });
    }

    return res.status(200).json({
      success: true,
      data: resp.data,
    });
  } catch (error) {
    // 실패 시 런타임 상태 클리어
    if (requestId) {
      emitBgRuntimeStatus({
        requestId,
        requestMongoId,
        source: "rhino-server",
        stage: "request",
        status: "failed",
        label: "Filled STL 생성 실패",
        tone: "rose",
        clear: true,
      });
    }

    const status = Number(error?.response?.status || 0);
    if (status === 403) {
      throw new ApiError(
        503,
        "Rhino 서버에서 요청을 거부했습니다. RHINO_ALLOW_IPS 설정을 확인해주세요.",
      );
    }
    if (status === 401) {
      throw new ApiError(
        503,
        "Rhino 서버 인증에 실패했습니다. RHINO_SHARED_SECRET 설정을 확인해주세요.",
      );
    }

    throw error;
  }
});



export const saveManualFinishLine = asyncHandler(async (req, res) => {
  const requestId = String(req.body?.requestId || "").trim();
  const filePath = String(req.body?.filePath || req.body?.fileName || "").trim();
  const finishLineRaw =
    req.body?.finishLine && typeof req.body.finishLine === "object"
      ? req.body.finishLine
      : null;

  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }
  if (!filePath) {
    throw new ApiError(400, "filePath is required");
  }
  if (!finishLineRaw) {
    throw new ApiError(400, "finishLine is required");
  }

  const normalized = normalizeFinishLinePayload(finishLineRaw);
  if (!normalized) {
    throw new ApiError(400, "finishLine.points must have at least 3 valid xyz points");
  }

  const request = await Request.findOne({ requestId });
  if (!request) {
    throw new ApiError(404, "Request not found");
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.finishLine = {
    ...normalized,
    updatedAt: new Date(),
    strategyUsed: normalized.strategyUsed || "FRONTEND_GUIDED_SMOOTH",
    source: "frontend-manual",
  };
  await request.save();

  let normalizedUpdatedRequest = null;
  try {
    normalizedUpdatedRequest = await normalizeRequestForResponse(request);
  } catch {
    normalizedUpdatedRequest = null;
  }

  emitAppEventToRoles(["manufacturer", "admin"], "request:stl-metadata-updated", {
    source: "manual-finish-line",
    requestId: request.requestId,
    requestMongoId: String(request._id || "").trim() || null,
    metadata: {
      finishLine: request.caseInfos.finishLine,
    },
    request: normalizedUpdatedRequest,
  });

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      filePath,
      finishLine: request.caseInfos.finishLine,
    },
  });
});

export const fillholeFromUpload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new ApiError(400, "file is required");
  }

  const originalName =
    typeof file.originalname === "string" ? file.originalname : "input.stl";
  let safeName;
  try {
    safeName = sanitizeStlName(originalName.normalize("NFC"));
  } catch {
    safeName = sanitizeStlName(originalName);
  }

  fs.mkdirSync(RHINO_STORE_IN_DIR, { recursive: true });
  const inPath = resolve(RHINO_STORE_IN_DIR, safeName);

  const buf = file.buffer;
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new ApiError(400, "empty file");
  }

  fs.writeFileSync(inPath, buf);

  // [변경] Rhino Compute 서버로의 요청을 큐에 넣어 순차 처리하도록 보장
  const resp = await enqueueTask(() =>
    axios.post(
      `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
      { name: safeName },
      {
        responseType: "arraybuffer",
        timeout: 1000 * 60 * 5,
        headers: rhinoAuthHeaders(),
      },
    ),
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});

/**
 * 새 의뢰 생성 후 rhino-server에 STL 처리(filled.stl 생성)를 트리거하기 위한 헬퍼.
 *
 * [정책]
 *  - 의뢰 생성 흐름은 rhino HTTP 응답을 기다리지 않는다 (fire-and-forget).
 *  - rhino의 /api/rhino/process-file 는 enqueue 직후 즉시 200 으로 응답하므로 빠르지만,
 *    네트워크 단절/일시 오류로 실패하더라도 의뢰 생성 자체는 영향 받지 않아야 한다.
 *  - 실패해도 안전망: rhino-server 재기동 시 /bg/pending-stl SSOT에서 다시 끌어와 처리한다.
 *
 * 호출 위치: createRequest / createRequestsBulk / createRequestsFromDraft 가 의뢰를 저장한 직후.
 */
export const triggerRhinoProcessFileForRequest = ({
  requestId,
  filePath,
  fileName,
}) => {
  const targetName = String(filePath || fileName || "").trim();
  if (!targetName) return;
  const url = `${RHINO_COMPUTE_BASE_URL}/api/rhino/process-file`;
  axios
    .post(
      url,
      {
        filePath: targetName,
        fileName: targetName,
        requestId: requestId || null,
        force: false,
      },
      {
        timeout: 1000 * 30,
        headers: rhinoAuthHeaders(),
      },
    )
    .then((resp) => {
      const status = resp?.data?.data?.status || resp?.data?.status || "ok";
      console.log(
        `[rhino-trigger] requestId=${requestId || "-"} file=${targetName} status=${status}`,
      );
    })
    .catch((err) => {
      console.warn(
        `[rhino-trigger] failed requestId=${requestId || "-"} file=${targetName}: ${
          err?.response?.status || ""
        } ${err?.message || err}`,
      );
    });
};

export const fillholeFromStoreName = asyncHandler(async (req, res) => {
  const rawName = req.body?.name;
  if (!rawName) {
    throw new ApiError(400, "name is required");
  }

  const safeName = sanitizeStlName(String(rawName));
  const requestId = req.body?.requestId || null;

  // requestId 가 있으면 DB에서 커넥션 직경 조회
  let connectionTargetDiameter = null;
  if (requestId) {
    try {
      const request = await Request.findOne({ requestId })
        .select({ caseInfos: 1 })
        .lean();
      if (request?.caseInfos) {
        connectionTargetDiameter = await resolveConnectionTargetDiameter(
          request.caseInfos,
        );
      }
    } catch (e) {
      console.warn(
        `[fillholeFromStoreName] connectionTargetDiameter lookup failed for requestId=${requestId}:`,
        e?.message,
      );
    }
  }

  // [변경] Rhino Compute 서버로의 요청을 큐에 넣어 순차 처리하도록 보장
  const resp = await enqueueTask(() =>
    axios.post(
      `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
      {
        name: safeName,
        ...(requestId ? { requestId } : {}),
        ...(connectionTargetDiameter != null
          ? { connectionTargetDiameter }
          : {}),
      },
      {
        responseType: "arraybuffer",
        timeout: 1000 * 60 * 5,
        headers: rhinoAuthHeaders(),
      },
    ),
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});
