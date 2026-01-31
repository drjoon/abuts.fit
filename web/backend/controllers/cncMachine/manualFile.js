import {
  BRIDGE_BASE,
  MANUAL_SLOT_NOW,
  MANUAL_SLOT_NEXT,
  callBridgeJson,
  getDbBridgeQueueSnapshot,
  saveBridgeQueueSnapshot,
  saveManualCardStatus,
  makeManualCardFilePath,
  manualCardUploadMulter,
  normalizeOriginalFilename,
  runMulter,
  CncMachine,
  Machine,
} from "./shared.js";

async function loadManualCardQueue(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return { items: [], updatedAt: null };

  const snap = await getDbBridgeQueueSnapshot(mid);
  const jobs = Array.isArray(snap.jobs) ? snap.jobs : [];
  const manualJobs = jobs.filter((j) => String(j?.kind || "") === "manual_file");
  const items = manualJobs
    .map((j) => {
      const id = String(j?.id || "").trim();
      if (!id) return null;
      const bridgePath = String(j?.bridgePath || "").trim();
      const originalFilename = String(j?.fileName || j?.programName || "").trim();
      const filePath = String(j?.requestId || "").trim();
      return {
        id,
        fileName: originalFilename,
        filePath,
        originalFilename,
        bridgePath,
        createdAtUtc: j?.createdAtUtc ? new Date(j.createdAtUtc) : new Date(),
      };
    })
    .filter(Boolean);

  return { items, updatedAt: snap.updatedAt };
}

async function setManualCardQueue(machineId, items) {
  const mid = String(machineId || "").trim();
  if (!mid) return;
  const safeItems = Array.isArray(items)
    ? items
        .map((it) => {
          if (!it || typeof it !== "object") return null;
          const id = String(it.id || "").trim();
          const fileName = String(it.fileName || "").trim();
          const filePath = String(it.filePath || "").trim();
          const originalFilename = String(it.originalFilename || "").trim();
          const bridgePath = String(it.bridgePath || "").trim();
          if (!id || !bridgePath) return null;
          return {
            id,
            fileName,
            filePath,
            originalFilename,
            bridgePath,
            createdAtUtc: it.createdAtUtc ? new Date(it.createdAtUtc) : new Date(),
          };
        })
        .filter(Boolean)
    : [];

  const snap = await getDbBridgeQueueSnapshot(mid);
  const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
  const rest = jobs0.filter((j) => String(j?.kind || "") !== "manual_file");
  const manualJobs = safeItems.map((it) => {
    const originalFilename = String(it?.originalFilename || it?.fileName || "").trim();
    const filePath = String(it?.filePath || "").trim();
    return {
      id: String(it.id),
      kind: "manual_file",
      fileName: originalFilename,
      bridgePath: String(it.bridgePath || ""),
      s3Key: "",
      s3Bucket: "",
      fileSize: null,
      contentType: "",
      requestId: filePath,
      programNo: null,
      programName: originalFilename,
      qty: 1,
      createdAtUtc: it.createdAtUtc ? new Date(it.createdAtUtc) : new Date(),
      source: "manual_insert",
      paused: true,
    };
  });

  await saveBridgeQueueSnapshot(mid, [...manualJobs, ...rest]);
}

async function preloadManualCardTop2(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return;

  const { items } = await loadManualCardQueue(mid);
  const head = items[0] || null;
  const next = items[1] || null;

  const base = BRIDGE_BASE.replace(/\/$/, "");

  if (head?.bridgePath) {
    const url = `${base}/api/cnc/machines/${encodeURIComponent(mid)}/manual/preload`;
    const { resp, json } = await callBridgeJson({
      url,
      method: "POST",
      body: { path: head.bridgePath, slotNo: MANUAL_SLOT_NOW },
    });
    if (!resp.ok || json?.success === false) {
      throw new Error(
        json?.message || json?.error || `manual preload(O${MANUAL_SLOT_NOW}) failed`,
      );
    }
  }

  if (next?.bridgePath) {
    const url = `${base}/api/cnc/machines/${encodeURIComponent(mid)}/manual/preload`;
    const { resp, json } = await callBridgeJson({
      url,
      method: "POST",
      body: { path: next.bridgePath, slotNo: MANUAL_SLOT_NEXT },
    });
    if (!resp.ok || json?.success === false) {
      throw new Error(
        json?.message || json?.error || `manual preload(O${MANUAL_SLOT_NEXT}) failed`,
      );
    }
  }

  try {
    await CncMachine.updateOne(
      { machineId: mid },
      {
        $set: {
          "manualCard.preload.nowItemId": head?.id ? String(head.id) : null,
          "manualCard.preload.nextItemId": next?.id ? String(next.id) : null,
          "manualCard.preload.updatedAt": new Date(),
          "manualCard.updatedAt": new Date(),
        },
      },
      { upsert: false },
    );
  } catch {
    // ignore
  }
}

export async function completeManualFileJobForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const q0 = await loadManualCardQueue(mid);
    const items0 = Array.isArray(q0.items) ? q0.items : [];
    const popped = items0.length > 0 ? items0[0] : null;
    const nextItems = items0.slice(1);

    await setManualCardQueue(mid, nextItems);

    await preloadManualCardTop2(mid);

    let autoStarted = false;
    try {
      const machine = await Machine.findOne({ uid: mid }).select(
        "allowAutoMachining",
      );
      const allowAuto = Boolean(machine?.allowAutoMachining);
      if (allowAuto) {
        const playUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
          mid,
        )}/manual/play`;
        const { resp, json } = await callBridgeJson({
          url: playUrl,
          method: "POST",
          body: { slotNo: MANUAL_SLOT_NOW },
        });
        if (resp.ok && json?.success !== false) {
          autoStarted = true;
        }
      }
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      data: {
        poppedId: popped?.id || null,
        nextSize: nextItems.length,
        autoStarted,
      },
    });
  } catch (error) {
    console.error("Error in completeManualFileJobForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "manual-file 완료 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function manualFileUploadAndPreload(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({ success: false, message: "machineId is required" });
    }

    await runMulter(manualCardUploadMulter.single("file"), req, res);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "file is required" });
    }

    const originalFilename = normalizeOriginalFilename(file.originalname);
    if (!originalFilename) {
      return res.status(400).json({ success: false, message: "invalid file name" });
    }

    const content = Buffer.isBuffer(file.buffer)
      ? file.buffer.toString("utf8")
      : Buffer.from(file.buffer || "").toString("utf8");
    if (!content) {
      return res.status(400).json({ success: false, message: "empty file" });
    }

    const requestedPath = String(req.body?.filePath || "").trim();
    const filePath =
      requestedPath ||
      makeManualCardFilePath({
        machineId: mid,
        originalFilename,
      });
    const bridgePath = `${filePath}.nc`;

    const storeUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge-store/upload`;
    const { resp: storeResp, json: storeBody } = await callBridgeJson({
      url: storeUrl,
      method: "POST",
      body: { path: bridgePath, content, normalizeName: false },
    });
    if (!storeResp.ok || storeBody?.success === false) {
      const msg = String(
        storeBody?.message || storeBody?.error || "bridge-store upload failed",
      );
      await saveManualCardStatus(mid, {
        lastUpload: {
          fileName: originalFilename,
          bridgePath,
          slotNo: null,
          nextSlotNo: null,
          uploadedAt: new Date(),
          error: msg,
        },
      });
      return res.status(storeResp.status).json({ success: false, message: msg });
    }

    const savedPath = String(storeBody?.path || bridgePath);

    const q0 = await loadManualCardQueue(mid);
    const items0 = Array.isArray(q0.items) ? q0.items.slice() : [];
    const itemId = `${mid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    items0.push({
      id: itemId,
      fileName: originalFilename,
      filePath,
      originalFilename,
      bridgePath: savedPath,
      createdAtUtc: new Date(),
    });
    await setManualCardQueue(mid, items0);

    try {
      await preloadManualCardTop2(mid);
    } catch (e) {
      const msg = String(e?.message || e);
      await saveManualCardStatus(mid, {
        lastUpload: {
          fileName: originalFilename,
          bridgePath: savedPath,
          slotNo: null,
          nextSlotNo: null,
          uploadedAt: new Date(),
          error: msg,
        },
      });
      return res.status(500).json({ success: false, message: msg });
    }

    await saveManualCardStatus(mid, {
      lastUpload: {
        fileName: originalFilename,
        bridgePath: savedPath,
        slotNo: MANUAL_SLOT_NOW,
        nextSlotNo: MANUAL_SLOT_NEXT,
        uploadedAt: new Date(),
        error: null,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        id: itemId,
        filePath,
        originalFilename,
        fileName: originalFilename,
        bridgePath: savedPath,
        slotNo: MANUAL_SLOT_NOW,
        nextSlotNo: MANUAL_SLOT_NEXT,
        queueSize: items0.length,
      },
    });
  } catch (error) {
    console.error("Error in manualFileUploadAndPreload:", error);
    return res.status(500).json({
      success: false,
      message: "장비카드 업로드 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function manualFilePlay(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({ success: false, message: "machineId is required" });
    }

    const playUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/manual/play`;

    const { resp, json } = await callBridgeJson({
      url: playUrl,
      method: "POST",
      body: { slotNo: MANUAL_SLOT_NOW },
    });
    if (!resp.ok || json?.success === false) {
      const msg = String(json?.message || json?.error || "manual play failed");
      await saveManualCardStatus(mid, {
        lastPlay: {
          slotNo: null,
          startedAt: new Date(),
          error: msg,
        },
      });
      return res.status(resp.status).json({ success: false, message: msg });
    }

    const slotNo = Number(json?.slotNo ?? json?.data?.slotNo ?? null);
    await saveManualCardStatus(mid, {
      lastPlay: {
        slotNo: Number.isFinite(slotNo) ? slotNo : null,
        startedAt: new Date(),
        error: null,
      },
    });

    return res.status(200).json({ success: true, data: json?.data ?? json });
  } catch (error) {
    console.error("Error in manualFilePlay:", error);
    return res.status(500).json({
      success: false,
      message: "장비카드 Play 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
