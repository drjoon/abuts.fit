import {
  BRIDGE_BASE,
  withBridgeHeaders,
  saveBridgeQueueSnapshot,
  fetchBridgeQueueFromBridge,
  getDbBridgeQueueSnapshot,
  Request,
} from "./shared.js";

const REQUEST_ID_REGEX = /(\d{8}-[A-Z0-9]{6,10})/i;

function normalizeBridgePath(p) {
  return String(p || "")
    .trim()
    .replace(/^nc\//i, "")
    .replace(/\.(nc|stl)$/i, "");
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

export async function smartEnqueue(req, res) {
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
      paths: Array.isArray(req.body?.paths) ? req.body.paths : [],
      maxWaitSeconds:
        typeof req.body?.maxWaitSeconds === "number"
          ? req.body.maxWaitSeconds
          : undefined,
    };
    if (!payload.paths || payload.paths.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "paths is required" });
    }

    try {
      const jobs = buildBridgeQueueJobsFromPaths(
        payload.paths,
        "smart_enqueue",
      );
      await saveBridgeQueueSnapshot(mid, jobs);
    } catch (e) {
      console.error("smartEnqueue snapshot save failed", e);
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/enqueue`;
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
        message: "Smart enqueue job accepted",
        jobId: body.jobId,
        machineId: mid,
      });
    }

    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartEnqueue error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart enqueue failed" });
  }
}

export async function smartDequeue(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const payload = {
      jobId: String(req.body?.jobId || "").trim() || undefined,
    };

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/dequeue`;
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
        message: "Smart dequeue job accepted",
        jobId: body.jobId,
        machineId: mid,
      });
    }

    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartDequeue error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart dequeue failed" });
  }
}

export async function smartReplace(req, res) {
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
      paths: Array.isArray(req.body?.paths) ? req.body.paths : [],
    };
    if (!payload.paths || payload.paths.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "paths is required" });
    }

    // 브리지 서버가 machining complete 이후 다음 작업을 이어가기 위해서는
    // DB bridgeQueueSnapshot이 남은 큐를 들고 있어야 한다.
    try {
      const jobs = buildBridgeQueueJobsFromPaths(
        payload.paths,
        "smart_replace",
      );
      await saveBridgeQueueSnapshot(mid, jobs);
    } catch (e) {
      console.error("smartReplace snapshot save failed", e);
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/replace`;
    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));

    if (resp.status === 202 && body?.jobId) {
      return res.status(202).json({
        success: true,
        message: "Smart replace job accepted",
        jobId: body.jobId,
        machineId: mid,
      });
    }

    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartReplace error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart replace failed" });
  }
}

export async function smartStart(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/start`;
    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    const body = await resp.json().catch(() => ({}));

    // 이중 응답 방식: 202 Accepted면 jobId 반환
    // 브리지 서버에서 가공 완료 후 백엔드에 콜백하므로 폴링 불필요
    if (resp.status === 202 && body?.jobId) {
      return res.status(202).json({
        success: true,
        message: "Smart start job accepted",
        jobId: body.jobId,
        machineId: mid,
      });
    }

    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartStart error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart start failed" });
  }
}

export async function smartStatus(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(mid)}/smart/status`;
    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));
    return res.status(resp.status).json(body);
  } catch (error) {
    console.error("smartStatus error", error);
    return res
      .status(500)
      .json({ success: false, message: "smart status failed" });
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
    )}/continuous/state`;

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: withBridgeHeaders(),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.ok && body?.success !== false) {
        return res
          .status(200)
          .json({ success: true, data: body?.data ?? body });
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

export async function enqueueBridgeManualInsertJob(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const s3Key = String(req.body?.s3Key || "").trim();
    const s3Bucket = String(req.body?.s3Bucket || "").trim();
    if (!fileName || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileName and s3Key are required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      requestId: null,
      bridgePath: null,
      s3Key,
      s3Bucket: s3Bucket || null,
      enqueueFront: true,
    };

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const rest = jobs0.filter(
      (j) => String(j?.source || "") !== "manual_insert",
    );
    const jobId = `${mid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const manualJob = {
      id: jobId,
      kind: "requested_file",
      fileName,
      bridgePath: "",
      s3Key,
      s3Bucket: s3Bucket || "",
      fileSize: null,
      contentType: "",
      requestId: "",
      programNo: null,
      programName: "",
      qty: 1,
      createdAtUtc: new Date(),
      source: "manual_insert",
      paused: true,
    };
    await saveBridgeQueueSnapshot(mid, [manualJob, ...rest]);

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
          "브리지 수동 끼워넣기 enqueue 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        jobId,
        machineId: mid,
        fileName,
        s3Key,
        s3Bucket: s3Bucket || null,
      },
    });
  } catch (error) {
    console.error("Error in enqueueBridgeManualInsertJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 수동 끼워넣기 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
