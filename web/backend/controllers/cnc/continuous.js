import {
  BRIDGE_BASE,
  withBridgeHeaders,
  saveBridgeQueueSnapshot,
  fetchBridgeQueueFromBridge,
  getDbBridgeQueueSnapshot,
  Request,
  callBridgeJson,
  runMulter,
  cncUploadMulter,
  normalizeOriginalFilename,
  makeCncUploadFilePath,
  sanitizeS3KeySegment,
} from "./shared.js";
import { uploadFileToS3 } from "../../utils/s3.utils.js";

const REQUEST_ID_REGEX = /(\d{8}-[A-Z0-9]{6,10})/i;

function buildStoredNcS3Key(requestId, fileName) {
  const rid = String(requestId || "").trim();
  const safeName =
    sanitizeS3KeySegment(String(fileName || "").trim()) || "program.nc";
  return `requests/${rid}/3-nc/${safeName}`;
}

function buildRequestNcBridgePath(fileName) {
  const safeName =
    sanitizeS3KeySegment(String(fileName || "").trim()) || "program.nc";
  return `3-nc/${safeName}`;
}

function buildDirectBridgePath({ machineId, originalFileName }) {
  const base = makeCncUploadFilePath({
    machineId,
    originalFilename: originalFileName,
  });
  const extMatch = String(originalFileName).match(/\.(nc|txt)$/i);
  const ext = extMatch ? String(extMatch[0]).toLowerCase() : ".nc";
  return `3-direct/${base}${ext}`;
}

function resolveRequestNcBridgePath({ currentPath, requestedPath, fileName }) {
  const current = String(currentPath || "").trim();
  const requested = String(requestedPath || "").trim();
  if (/^3-nc\//i.test(current)) return current;
  if (/^3-nc\//i.test(requested)) return requested;
  return buildRequestNcBridgePath(fileName);
}

async function uploadNcContentToBridgeStore({ bridgePath, content }) {
  const storeUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge-store/upload`;
  const { resp, json } = await callBridgeJson({
    url: storeUrl,
    method: "POST",
    body: { path: bridgePath, content },
  });
  if (!resp.ok || json?.success === false) {
    throw new Error(
      String(json?.message || json?.error || "bridge-store upload failed"),
    );
  }
  return String(json?.path || bridgePath || "").trim();
}

async function uploadNcContentToBridgeStoreBestEffort({ bridgePath, content }) {
  try {
    const savedPath = await uploadNcContentToBridgeStore({
      bridgePath,
      content,
    });
    return {
      ok: true,
      bridgePath: savedPath,
      error: null,
    };
  } catch (error) {
    console.warn("uploadNcContentToBridgeStoreBestEffort failed", {
      bridgePath,
      error: error?.message || String(error),
    });
    return {
      ok: false,
      bridgePath: String(bridgePath || "").trim(),
      error: error?.message || "bridge-store upload failed",
    };
  }
}

function normalizeBridgePath(p) {
  return String(p || "")
    .trim()
    .replace(/^nc\//i, "")
    .replace(/\.(nc|stl)$/i, "");
}

export async function uploadAndEnqueueContinuousForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    await runMulter(cncUploadMulter.single("file"), req, res);
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "file is required" });
    }

    const originalFilenameFromClient = String(
      req.body?.originalFileName || "",
    ).trim();
    const originalFileName =
      originalFilenameFromClient ||
      normalizeOriginalFilename(file.originalname);
    if (!originalFileName) {
      return res
        .status(400)
        .json({ success: false, message: "invalid file name" });
    }

    const content = Buffer.isBuffer(file.buffer)
      ? file.buffer.toString("utf8")
      : Buffer.from(file.buffer || "").toString("utf8");
    if (!content) {
      return res.status(400).json({ success: false, message: "empty file" });
    }

    const bridgePath = buildDirectBridgePath({
      machineId: mid,
      originalFileName,
    });

    const storeUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge-store/upload`;
    const { resp: storeResp, json: storeBody } = await callBridgeJson({
      url: storeUrl,
      method: "POST",
      body: { path: bridgePath, content },
    });
    if (!storeResp.ok || storeBody?.success === false) {
      const msg = String(
        storeBody?.message || storeBody?.error || "bridge-store upload failed",
      );
      return res
        .status(storeResp.status)
        .json({ success: false, message: msg });
    }

    const savedPath = String(storeBody?.path || bridgePath).trim();

    const enqueueUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;
    const enqueuePayload = {
      fileName: savedPath.split(/[\/\\]/).pop(),
      originalFileName,
      requestId: null,
      bridgePath: savedPath,
      enqueueFront: false,
      paused: true,
      allowAutoStart: false,
    };
    const enqueueResp = await fetch(enqueueUrl, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(enqueuePayload),
    });
    const enqueueBody = await enqueueResp.json().catch(() => ({}));
    if (!enqueueResp.ok || enqueueBody?.success === false) {
      const msg = String(
        enqueueBody?.message || enqueueBody?.error || "failed to enqueue job",
      );
      return res
        .status(enqueueResp.status)
        .json({ success: false, message: msg });
    }

    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        jobId: enqueueBody?.jobId || null,
        bridgePath: savedPath,
        originalFileName,
      },
    });
  } catch (error) {
    console.error("uploadAndEnqueueContinuousForMachine error", error);
    return res.status(500).json({
      success: false,
      message: "continuous 업로드 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveJobProgramCode(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const requestId = String(req.body?.requestId || "").trim();
    const code = String(req.body?.code ?? "");
    const originalFileName = normalizeOriginalFilename(
      String(req.body?.originalFileName || req.body?.fileName || "program.nc"),
    );
    const requestedBridgePath = String(req.body?.bridgePath || "").trim();
    const requestedS3Key = String(req.body?.s3Key || "").trim();

    if (!requestId) {
      return res
        .status(400)
        .json({ success: false, message: "requestId is required" });
    }
    if (!code.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "code is required" });
    }

    const request = await Request.findOne({ requestId });
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "request not found" });
    }

    const currentNc = request?.caseInfos?.ncFile || {};
    const fileName =
      String(currentNc?.fileName || "").trim() ||
      (requestedBridgePath ? requestedBridgePath.split(/[\/\\]/).pop() : "") ||
      (String(currentNc?.filePath || "").trim()
        ? String(currentNc?.filePath || "")
            .trim()
            .split(/[\/\\]/)
            .pop()
        : "") ||
      originalFileName ||
      "program.nc";
    const filePath = resolveRequestNcBridgePath({
      currentPath: currentNc?.filePath,
      requestedPath: requestedBridgePath,
      fileName,
    });
    const resolvedOriginalFileName =
      originalFileName ||
      String(currentNc?.originalName || "").trim() ||
      fileName;
    const s3Key =
      requestedS3Key ||
      currentNc?.s3Key ||
      buildStoredNcS3Key(requestId, fileName);
    const contentBuffer = Buffer.from(code, "utf8");

    const uploaded = await uploadFileToS3(
      contentBuffer,
      s3Key,
      "application/octet-stream",
    );

    const bridgeStoreResult = await uploadNcContentToBridgeStoreBestEffort({
      bridgePath: filePath,
      content: code,
    });
    const savedBridgePath = String(
      bridgeStoreResult?.bridgePath || filePath || "",
    ).trim();

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.ncFile = {
      ...(request.caseInfos.ncFile || {}),
      fileName,
      filePath: savedBridgePath,
      originalName: resolvedOriginalFileName,
      s3Key: uploaded.key,
      s3Url: uploaded.location,
      fileSize: contentBuffer.length,
      uploadedAt: new Date(),
    };
    await request.save();

    const snapshot = await getDbBridgeQueueSnapshot(mid);
    const jobs = (Array.isArray(snapshot?.jobs) ? snapshot.jobs : []).map(
      (job) => {
        if (String(job?.requestId || "").trim() !== requestId) return job;
        return {
          ...job,
          fileName,
          originalFileName: resolvedOriginalFileName,
          bridgePath: savedBridgePath,
          s3Key: uploaded.key,
          s3Bucket:
            String(job?.s3Bucket || "").trim() ||
            process.env.AWS_S3_BUCKET_NAME ||
            "abuts-fit",
          fileSize: contentBuffer.length,
          contentType: "application/octet-stream",
          paused: false,
        };
      },
    );
    await saveBridgeQueueSnapshot(mid, jobs);

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        requestId,
        fileName,
        bridgePath: savedBridgePath,
        s3Key: uploaded.key,
        s3Url: uploaded.location,
        fileSize: contentBuffer.length,
        bridgeStoreSynced: bridgeStoreResult.ok,
        bridgeStoreError: bridgeStoreResult.ok
          ? null
          : String(bridgeStoreResult.error || ""),
      },
    });
  } catch (error) {
    console.error("saveJobProgramCode error", error);
    return res.status(500).json({
      success: false,
      message: "작업 프로그램 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

function extractRequestIdFromPath(p) {
  const s = normalizeBridgePath(p);
  const m = s.match(REQUEST_ID_REGEX);
  return m?.[1] ? String(m[1]).toUpperCase() : "";
}

function buildBridgeQueueJobsFromPaths(paths, source) {
  const list = Array.isArray(paths) ? paths : [];
  return list
    .map((rawPath, idx) => {
      const bridgePath = normalizeBridgePath(rawPath);
      if (!bridgePath) return null;
      const requestId = extractRequestIdFromPath(bridgePath);
      const fileName = bridgePath.split("/").pop() || bridgePath;
      const id = requestId || bridgePath || String(idx);
      return {
        id,
        kind: "file",
        fileName,
        bridgePath,
        requestId,
        qty: 1,
        source: source || "smart",
      };
    })
    .filter(Boolean);
}

export async function smartUpload(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const payload = {
      headType: typeof req.body?.headType === "number" ? req.body.headType : 1,
      path: String(req.body?.path || "").trim(),
      isNew: req.body?.isNew !== false,
    };
    if (!payload.path) {
      return res
        .status(400)
        .json({ success: false, message: "path is required" });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/upload`;
    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));

    // 이중 응답 방식: 202 Accepted면 jobId 반환
    if (resp.status === 202 && body?.jobId) {
      return res.status(202).json({
        success: true,
        message: "Smart upload job accepted",
        jobId: body.jobId,
        machineId: mid,
      });
    }

    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartUpload error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart upload failed" });
  }
}

export async function getJobResult(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId and jobId are required" });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/jobs/${encodeURIComponent(jid)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));
    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("getJobResult error", error);
    return res
      .status(500)
      .json({ success: false, message: "get job result failed" });
  }
}

export async function enqueueBridgeContinuousJob(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";
    const bridgePathRaw = req.body?.bridgePath;
    const bridgePath =
      bridgePathRaw != null ? String(bridgePathRaw).trim() : "";
    const originalFileNameRaw = req.body?.originalFileName;
    const originalFileName = originalFileNameRaw
      ? String(originalFileNameRaw).trim()
      : "";
    const enqueueFront = req.body?.enqueueFront === true;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "fileName is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      originalFileName: originalFileName || fileName,
      requestId: requestId || null,
      bridgePath: bridgePath || null,
      enqueueFront,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      });
    }

    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: body?.data ?? body });
  } catch (error) {
    console.error("Error in enqueueBridgeContinuousJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function enqueueBridgeContinuousJobFromDb(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "requestId is required",
      });
    }

    const reqDoc = await Request.findOne({ requestId })
      .select("requestId caseInfos.ncFile")
      .lean();
    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: "request not found",
      });
    }

    const bridgePath = String(reqDoc?.caseInfos?.ncFile?.filePath || "").trim();
    const rawFileName = String(
      reqDoc?.caseInfos?.ncFile?.fileName || "",
    ).trim();
    const originalFileName = String(
      reqDoc?.caseInfos?.ncFile?.originalName || "",
    ).trim();
    const derivedFileName = bridgePath
      ? String(bridgePath).split(/[/\\]/).pop()
      : "";
    const fileName = rawFileName || derivedFileName;

    if (!fileName || !bridgePath) {
      return res.status(400).json({
        success: false,
        message:
          "NC 파일 정보(fileName/filePath)가 없어 enqueue 할 수 없습니다.",
      });
    }

    try {
      await Request.updateOne(
        { requestId },
        {
          $set: {
            "productionSchedule.ncPreload": {
              status: "UPLOADING",
              machineId: mid,
              bridgePath,
              updatedAt: new Date(),
              error: null,
            },
          },
        },
      );
    } catch (e) {
      console.warn("enqueue-from-db ncPreload UPLOADING update failed", e);
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      requestId,
      bridgePath,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      try {
        await Request.updateOne(
          { requestId },
          {
            $set: {
              "productionSchedule.ncPreload": {
                status: "FAILED",
                machineId: mid,
                bridgePath,
                updatedAt: new Date(),
                error:
                  body?.message ||
                  body?.error ||
                  `bridge enqueue failed (status=${resp.status})`,
              },
            },
          },
        );
      } catch (e2) {
        console.warn("enqueue-from-db ncPreload FAILED update failed", e2);
      }

      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      });
    }

    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      data: {
        requestId,
        fileName,
        bridgePath,
        bridge: body?.data ?? body,
      },
    });
  } catch (error) {
    console.error("Error in enqueueBridgeContinuousJobFromDb:", error);
    return res.status(500).json({
      success: false,
      message: "DB 기반 브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getBridgeContinuousState(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}`;

    try {
      const resp = await fetch(
        `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/continuous/state?machines=${encodeURIComponent(mid)}`,
        {
          method: "GET",
          headers: withBridgeHeaders(),
        },
      );
      const body = await resp.json().catch(() => ({}));
      if (resp.ok && body?.success !== false) {
        const resultItem = Array.isArray(body?.results)
          ? body.results.find(
              (item) => String(item?.machineId || "").trim() === mid,
            )
          : null;
        const resultData = resultItem?.data ?? null;
        return res
          .status(200)
          .json({ success: true, data: resultData ?? body?.data ?? body });
      }
    } catch (bridgeErr) {
      console.warn(
        "Bridge continuous state fetch failed, returning empty state:",
        bridgeErr.message,
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        currentSlot: 3000,
        nextSlot: 3001,
        isRunning: false,
        currentJob: null,
        nextJob: null,
        elapsedSeconds: 0,
      },
    });
  } catch (error) {
    console.error("Error in getBridgeContinuousState:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 연속 가공 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
