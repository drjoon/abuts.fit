import {
  getPresignedGetUrl,
  getPresignedPutUrl,
  sanitizeS3KeySegment,
  BRIDGE_BASE,
  withBridgeHeaders,
  getDbBridgeQueueSnapshot,
  saveBridgeQueueSnapshot,
} from "./shared.js";

export async function createCncDirectUploadPresign(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const rawName = String(req.body?.fileName || "").trim();
    const fileName = rawName;
    if (!fileName) {
      return res
        .status(400)
        .json({ success: false, message: "fileName is required" });
    }

    const contentType = String(
      req.body?.contentType || "application/octet-stream",
    ).trim();
    const fileSize = Number(req.body?.fileSize || 0);

    const safeName = sanitizeS3KeySegment(fileName);
    const key = `bg/3-direct/${mid}/${safeName}`;
    const presign = await getPresignedPutUrl(key, contentType, 3600);

    return res.status(200).json({
      success: true,
      data: {
        uploadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        fileName,
        contentType,
        fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectUploadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function createCncDirectDownloadPresign(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const s3Key = String(req.query?.s3Key || req.body?.s3Key || "").trim();
    if (!s3Key) {
      return res
        .status(400)
        .json({ success: false, message: "s3Key is required" });
    }

    const expiresIn = Math.max(
      60,
      Math.min(3600, Number(req.query?.expiresIn || 300)),
    );
    const presign = await getPresignedGetUrl(s3Key, expiresIn);

    return res.status(200).json({
      success: true,
      data: {
        downloadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        expiresIn,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectDownloadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function createCncDirectDownloadPresignForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const s3Key = String(req.query?.s3Key || req.body?.s3Key || "").trim();
    if (!s3Key) {
      return res
        .status(400)
        .json({ success: false, message: "s3Key is required" });
    }

    const expiresIn = Math.max(
      60,
      Math.min(3600, Number(req.query?.expiresIn || 300)),
    );
    const presign = await getPresignedGetUrl(s3Key, expiresIn);

    return res.status(200).json({
      success: true,
      data: {
        downloadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        expiresIn,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectDownloadPresignForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function enqueueCncDirectToDb(req, res) {
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
    const contentType = String(req.body?.contentType || "").trim();
    const fileSize = Number(req.body?.fileSize || 0);
    const qty = Math.max(1, Number(req.body?.qty ?? 1) || 1);
    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";
    const allowAutoStart = Boolean(req.body?.allowAutoStart);

    if (!fileName || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileName and s3Key are required",
      });
    }

    const now = new Date();
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const jobId = `${mid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

    jobs.push({
      id: jobId,
      kind: "requested_file",
      fileName,
      originalFileName: fileName,
      bridgePath: `${mid}/${fileName}`,
      s3Key,
      s3Bucket: s3Bucket || process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
      fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
      contentType: contentType || "application/octet-stream",
      requestId: requestId || "",
      programNo: null,
      programName: "",
      qty,
      createdAtUtc: now,
      source: "manual_upload",
      paused: !allowAutoStart,
      allowAutoStart,
    });

    await saveBridgeQueueSnapshot(mid, jobs);

    return res.status(200).json({
      success: true,
      data: { jobId, fileName },
    });
  } catch (error) {
    console.error("Error in enqueueCncDirectToDb:", error);
    return res.status(500).json({
      success: false,
      message: "DB 예약목록 등록 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function refreshCncDirectFromBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(mid)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return res
        .status(resp.status)
        .json({ success: false, message: body?.message || body?.error });
    }
    const list = Array.isArray(body?.data) ? body.data : body?.data || [];
    const jobs = Array.isArray(list) ? list : [];
    await saveBridgeQueueSnapshot(mid, jobs);
    return res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    console.error("Error in refreshCncDirectFromBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 큐 동기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
