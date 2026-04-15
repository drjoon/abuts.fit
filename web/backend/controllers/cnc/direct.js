import {
  getPresignedGetUrl,
  getPresignedPutUrl,
  sanitizeS3KeySegment,
  BRIDGE_BASE,
  withBridgeHeaders,
  getDbBridgeQueueSnapshot,
  saveBridgeQueueSnapshot,
} from "./shared.js";

/**
 * [정책 §4.8] Lab(의뢰건) 업로드 전용 — S3 presign URL 발급
 *
 * 경로: POST /api/cnc-machines/:machineId/lab/presign
 * 호출자: useLabUpload (작업-가공 페이지)
 * 흐름: 프론트가 이 URL로 S3에 직접 PUT 업로드 → 완료 후 /lab/enqueue 호출
 *
 * lab = laboratory(기공소)에서 접수된 의뢰건 자동가공 전용
 * requestId가 항상 포함됨 / 수동 업로드(useManUpload /man/upload)와 완전 분리
 */
export async function createCncLabUploadPresign(req, res) {
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
    // Lab(의뢰건) NC 파일 S3 저장 경로: bg/3-lab/:machineId/:fileName
    // Man(수동) 업로드 경로 bg/3-man/ 과 S3에서도 분리됨
    const key = `bg/3-lab/${mid}/${safeName}`;
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
    console.error("Error in createCncLabUploadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * [정책 §4.8] Lab(의뢰건) 업로드 전용 — S3 다운로드 presign 발급 (제조사/관리자용)
 *
 * 경로: GET /api/cnc-machines/:machineId/lab/presign-download
 */
export async function createCncLabDownloadPresign(req, res) {
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
    console.error("Error in createCncLabDownloadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * [정책 §4.8] Lab(의뢰건) S3 다운로드 presign 발급 — bridge-server 전용
 *
 * 경로: GET /api/cnc-machines/bridge/cnc-direct/presign-download/:machineId
 * 호출자: bridge-server CncContinuousMachining.TryDownloadAndCacheFromS3()
 * bridge가 가공 명령 시 S3에서 실시간 NC 파일을 내려받기 위해 사용
 */
export async function createCncLabDownloadPresignForBridge(req, res) {
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
    console.error("Error in createCncLabDownloadPresignForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * [정책 §4.8] Lab(의뢰건) 업로드 전용 — DB 생산 큐(bridgeQueueSnapshot) 등록
 *
 * 경로: POST /api/cnc-machines/:machineId/lab/enqueue
 * 호출자: useLabUpload — S3 presign 업로드 완료 후 호출
 * 흐름: S3 업로드 완료 → 이 엔드포인트로 DB에 메타데이터 등록 →
 *       bridge가 가공 명령 시 S3에서 실시간 다운로드
 *
 * source = "request_auto" (수동 업로드 "manual_upload" 와 구분)
 * requestId가 항상 포함됨
 */
export async function enqueueCncLabToDb(req, res) {
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
      source: "request_auto",
      paused: true,
      allowAutoStart: false,
    });

    await saveBridgeQueueSnapshot(mid, jobs);

    return res.status(200).json({
      success: true,
      data: { jobId, fileName },
    });
  } catch (error) {
    console.error("Error in enqueueCncLabToDb:", error);
    return res.status(500).json({
      success: false,
      message: "DB 예약목록 등록 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * [내부] bridge 큐 스냅샷을 강제로 재동기화 (디버그/관리 목적)
 */
export async function refreshCncLabFromBridge(req, res) {
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
    console.error("Error in refreshCncLabFromBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 큐 동기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
