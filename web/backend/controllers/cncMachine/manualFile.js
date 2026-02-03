import {
  BRIDGE_BASE,
  MANUAL_SLOT_NOW,
  MANUAL_SLOT_NEXT,
  callBridgeJson,
  getDbBridgeQueueSnapshot,
  saveBridgeQueueSnapshot,
  saveManualCardStatus,
  makeSafeFileStem,
  manualCardUploadMulter,
  normalizeOriginalFilename,
  runMulter,
  CncMachine,
  Machine,
} from "./shared.js";

import path from "path";

async function loadManualCardQueue(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return { items: [], updatedAt: null };

  const snap = await getDbBridgeQueueSnapshot(mid);
  const jobs = Array.isArray(snap.jobs) ? snap.jobs : [];
  const manualJobs = jobs.filter(
    (j) => String(j?.kind || "") === "manual_file",
  );
  const items = manualJobs
    .map((j) => {
      const id = String(j?.id || "").trim();
      if (!id) return null;
      const bridgePath = String(j?.bridgePath || "").trim();
      const originalFilename = String(
        j?.originalFileName || j?.fileName || j?.programName || "",
      ).trim();
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
            createdAtUtc: it.createdAtUtc
              ? new Date(it.createdAtUtc)
              : new Date(),
          };
        })
        .filter(Boolean)
    : [];

  const snap = await getDbBridgeQueueSnapshot(mid);
  const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
  const rest = jobs0.filter((j) => String(j?.kind || "") !== "manual_file");
  const manualJobs = safeItems.map((it) => {
    const originalFilename = String(
      it?.originalFilename || it?.fileName || "",
    ).trim();
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
        json?.message ||
          json?.error ||
          `manual preload(O${MANUAL_SLOT_NOW}) failed`,
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
        json?.message ||
          json?.error ||
          `manual preload(O${MANUAL_SLOT_NEXT}) failed`,
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

export async function startManualFileJobForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";

    // 수동 카드 큐에서 현재 가공 중인 파일 조회
    const { items } = await loadManualCardQueue(mid);
    const startedItem = items.find((it) => String(it?.id || "") === jobId);

    if (startedItem) {
      // 현재 가공 중인 파일을 "Now Playing"으로 저장
      await saveManualCardStatus(mid, {
        lastPlay: {
          fileName: startedItem.fileName,
          bridgePath: startedItem.bridgePath,
          slotNo: null,
          startedAt: new Date(),
          error: null,
        },
      });

      // 다음 파일을 "Next Up"으로 preload
      try {
        await preloadManualCardTop2(mid);
      } catch (e) {
        // preload 실패는 무시
        console.warn("preloadManualCardTop2 failed:", e?.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        jobId: jobId || null,
      },
    });
  } catch (error) {
    console.error("Error in startManualFileJobForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "manual-file 시작 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
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
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    await runMulter(manualCardUploadMulter.single("file"), req, res);

    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "file is required" });
    }

    const originalFilenameFromClient = String(
      req.body?.originalFileName || "",
    ).trim();
    const originalFilename =
      originalFilenameFromClient ||
      normalizeOriginalFilename(file.originalname);
    if (!originalFilename) {
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

    const requestedPath = String(req.body?.filePath || "").trim();

    let bridgePath = requestedPath;
    if (!bridgePath) {
      const extMatch = path.basename(originalFilename).match(/\.(nc|txt)$/i);
      const ext = extMatch ? String(extMatch[0]).toLowerCase() : ".nc";
      const stem0 = makeSafeFileStem(originalFilename);
      const rand = Math.random().toString(36).slice(2, 10);
      const base = stem0
        ? `${mid}_${stem0}_${rand}`
        : `${mid}_${Date.now()}_${rand}`;
      bridgePath = `${base}${ext}`;
    }

    const filePath = path.basename(bridgePath).replace(/\.(nc|txt)$/i, "");

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
      return res
        .status(storeResp.status)
        .json({ success: false, message: msg });
    }

    const savedPath = String(storeBody?.path || bridgePath);

    try {
      await CncMachine.updateOne(
        { machineId: mid },
        {
          $push: {
            "manualCard.fileNameMap": {
              originalName: originalFilename,
              storedName: path.basename(savedPath),
              storedPath: savedPath,
              createdAt: new Date(),
            },
          },
          $set: {
            "manualCard.updatedAt": new Date(),
          },
        },
        { upsert: false },
      );
    } catch {
      // no-op
    }

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
      console.warn("preloadManualCardTop2 failed after upload:", msg);
      // preload 실패는 로그만 하고 계속 진행 (업로드는 성공)
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
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    // 요청 body에서 itemId 추출 (선택된 파일 식별)
    const itemId = String(req.body?.itemId || "").trim();
    if (!itemId) {
      return res
        .status(400)
        .json({ success: false, message: "itemId is required" });
    }

    // 수동 카드 큐에서 선택된 파일의 bridgePath 조회
    const { items } = await loadManualCardQueue(mid);
    const selectedItem = items.find((it) => String(it?.id || "") === itemId);
    if (!selectedItem || !selectedItem.bridgePath) {
      return res
        .status(404)
        .json({ success: false, message: "selected file not found in queue" });
    }

    const base = BRIDGE_BASE.replace(/\/$/, "");

    const uploadUrl = `${base}/api/cnc/machines/${encodeURIComponent(mid)}/smart/upload`;
    const { resp: uploadResp, json: uploadJson } = await callBridgeJson({
      url: uploadUrl,
      method: "POST",
      body: { headType: 1, path: selectedItem.bridgePath, isNew: true },
    });
    if (!uploadResp.ok || uploadJson?.success === false) {
      const msg = String(
        uploadJson?.message || uploadJson?.error || "smart upload failed",
      );
      await saveManualCardStatus(mid, {
        lastPlay: {
          fileName: selectedItem.fileName,
          bridgePath: selectedItem.bridgePath,
          slotNo: null,
          startedAt: new Date(),
          error: msg,
        },
      });
      return res
        .status(uploadResp.status)
        .json({ success: false, message: msg });
    }

    const replaceUrl = `${base}/api/cnc/machines/${encodeURIComponent(mid)}/smart/replace`;
    const { resp: replaceResp, json: replaceJson } = await callBridgeJson({
      url: replaceUrl,
      method: "POST",
      body: { headType: 1, paths: [selectedItem.bridgePath] },
    });
    if (!replaceResp.ok || replaceJson?.success === false) {
      const msg = String(
        replaceJson?.message ||
          replaceJson?.error ||
          "smart queue replace failed",
      );
      await saveManualCardStatus(mid, {
        lastPlay: {
          fileName: selectedItem.fileName,
          bridgePath: selectedItem.bridgePath,
          slotNo: null,
          startedAt: new Date(),
          error: msg,
        },
      });
      return res
        .status(replaceResp.status)
        .json({ success: false, message: msg });
    }

    const startUrl = `${base}/api/cnc/machines/${encodeURIComponent(mid)}/smart/start`;
    const { resp: startResp, json: startJson } = await callBridgeJson({
      url: startUrl,
      method: "POST",
      body: {},
    });
    if (!startResp.ok || startJson?.success === false) {
      const msg = String(
        startJson?.message || startJson?.error || "smart start failed",
      );
      await saveManualCardStatus(mid, {
        lastPlay: {
          fileName: selectedItem.fileName,
          bridgePath: selectedItem.bridgePath,
          slotNo:
            Number(uploadJson?.slotNo ?? uploadJson?.data?.slotNo ?? null) ||
            null,
          startedAt: new Date(),
          error: msg,
        },
      });
      return res
        .status(startResp.status)
        .json({ success: false, message: msg });
    }

    const slotNo = Number(
      uploadJson?.slotNo ?? uploadJson?.data?.slotNo ?? null,
    );
    await saveManualCardStatus(mid, {
      lastPlay: {
        fileName: selectedItem.fileName,
        bridgePath: selectedItem.bridgePath,
        slotNo: Number.isFinite(slotNo) ? slotNo : null,
        startedAt: new Date(),
        error: null,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        itemId,
        bridgePath: selectedItem.bridgePath,
        slotNo: Number.isFinite(slotNo) ? slotNo : null,
        upload: uploadJson,
        start: startJson,
      },
    });
  } catch (error) {
    console.error("Error in manualFilePlay:", error);
    return res.status(500).json({
      success: false,
      message: "장비카드 Play 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
