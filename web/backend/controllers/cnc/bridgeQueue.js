import {
  BRIDGE_BASE,
  withBridgeHeaders,
  getDbBridgeQueueSnapshot,
  saveBridgeQueueSnapshot,
  rollbackRequestToCamByRequestId,
  fetchBridgeQueueFromBridge,
} from "./shared.js";

export async function getBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);

    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs : [];

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 장비 페이지 조회 시 의뢰건 항목 자동 필터:
    // requestId가 있는 항목은 의뢰건 자동 가공 항목으로, 장비 페이지 예약목록에
    // 포함되면 안 된다. 오염된 항목이 있으면 DB 스냅샷도 즉시 정리한다.
    // ──────────────────────────────────────────────────────────────────────────
    const cleanJobs = jobs0.filter((j) => {
      const rid = String(j?.requestId || "").trim();
      return !rid;
    });
    if (cleanJobs.length < jobs0.length) {
      // 오염된 항목이 발견됨 → 비동기로 스냅샷 정리 (응답 지연 없이)
      saveBridgeQueueSnapshot(mid, cleanJobs).catch((e) => {
        console.error(
          `[bridge:queue:get] failed to auto-clean request_auto items for ${mid}:`,
          e?.message,
        );
      });
      console.warn(
        `[bridge:queue:get] auto-removed ${jobs0.length - cleanJobs.length} request_auto items from snapshot for ${mid} (policy 4.8.2)`,
      );
    }

    const equipment = [];
    const machining = [];
    for (const j of cleanJobs) {
      const p = typeof j?.priority === "number" ? j.priority : 2;
      if (p === 1) equipment.push(j);
      else machining.push(j);
    }
    const ordered = equipment.concat(machining);

    return res.status(200).json({
      success: true,
      data: ordered,
      uiSnapshot: snap.uiSnapshot || null,
      meta: {
        source: "db",
        updatedAt: snap.updatedAt ? snap.updatedAt.toISOString() : null,
        syncedAt: snap.syncedAt ? snap.syncedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Error in getBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function consumeBridgeQueueJobForBridge(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const loadFromDb = async () => {
      const snap = await getDbBridgeQueueSnapshot(mid);
      const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
      const removedJob = jobs.find((j) => String(j?.id || "") === jid) || null;
      return { snap, jobs, removedJob };
    };

    let { jobs, removedJob } = await loadFromDb();

    // 브리지에서 먼저 큐가 갱신됐는데 백엔드 DB 스냅샷이 늦게 반영되면 404가 발생할 수 있다.
    // 1회만 브리지에서 큐를 재조회하여 스냅샷을 동기화한 뒤 재시도한다.
    if (!removedJob) {
      try {
        const q = await fetchBridgeQueueFromBridge(mid);
        if (q.ok) {
          await saveBridgeQueueSnapshot(mid, q.jobs);
          const after = await loadFromDb();
          jobs = after.jobs;
          removedJob = after.removedJob;
        }
      } catch {
        // ignore
      }
    }

    if (!removedJob) {
      return res.status(200).json({
        success: true,
        data: { removedJob: null },
        meta: { skipped: true, reason: "job not found" },
      });
    }

    const nextJobs = jobs.filter((j) => String(j?.id || "") !== jid);
    await saveBridgeQueueSnapshot(mid, nextJobs);

    return res.status(200).json({
      success: true,
      data: {
        removedJob,
      },
    });
  } catch (error) {
    console.error("Error in consumeBridgeQueueJobForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 큐 소비 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getDbBridgeQueueSnapshotForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);

    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs : [];

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 브리지 서버 큐 스냅샷 조회 시 의뢰건 항목 필터:
    // requestId가 있는 항목은 의뢰건 자동 가공 항목이다.
    // 브리지 서버가 이 항목을 읽어 직접 실행하면 수동 파일 우선 정책이 깨지므로
    // 브리지 서버에는 수동 파일 항목만 반환한다.
    // ──────────────────────────────────────────────────────────────────────────
    const cleanJobs = jobs0.filter((j) => {
      const rid = String(j?.requestId || "").trim();
      return !rid;
    });
    if (cleanJobs.length < jobs0.length) {
      saveBridgeQueueSnapshot(mid, cleanJobs).catch((e) => {
        console.error(
          `[bridge:queue:snapshot-for-bridge] failed to auto-clean for ${mid}:`,
          e?.message,
        );
      });
      console.warn(
        `[bridge:queue:snapshot-for-bridge] auto-removed ${jobs0.length - cleanJobs.length} request_auto items for ${mid} (policy 4.8.2)`,
      );
    }

    const equipment = [];
    const machining = [];
    for (const j of cleanJobs) {
      const p = typeof j?.priority === "number" ? j.priority : 2;
      if (p === 1) equipment.push(j);
      else machining.push(j);
    }
    const ordered = equipment.concat(machining);
    return res.status(200).json({
      success: true,
      data: ordered,
      meta: {
        source: "db",
        updatedAt: snap.updatedAt ? snap.updatedAt.toISOString() : null,
        syncedAt: snap.syncedAt ? snap.syncedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Error in getDbBridgeQueueSnapshotForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "DB 예약 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function reorderBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const orderRaw = req.body?.order;
    const order = Array.isArray(orderRaw)
      ? orderRaw.map((v) => String(v || "").trim()).filter((v) => !!v)
      : [];

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const idOrder =
      order.length > 0 ? order : jobs.map((j) => j?.id).filter(Boolean);

    const jobById = new Map();
    for (const j of jobs) {
      if (j?.id) jobById.set(String(j.id), j);
    }

    const reordered = [];
    for (const id of idOrder) {
      const j = jobById.get(id);
      if (j) reordered.push(j);
    }
    for (const j of jobs) {
      if (!j?.id) continue;
      if (!idOrder.includes(String(j.id))) reordered.push(j);
    }

    await saveBridgeQueueSnapshot(mid, reordered);

    try {
      const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/reorder`;
      await fetch(url, {
        method: "POST",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          machineId: mid,
          order: reordered.map((j) => j.id),
        }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: reordered });
  } catch (error) {
    console.error("Error in reorderBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 재정렬 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateBridgeQueueJobQty(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const qty = Math.max(1, Number(req.body?.qty ?? 1) || 1);

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const nextJobs = jobs.map((j) => {
      if (!j?.id) return j;
      return String(j.id) === jid ? { ...j, qty } : j;
    });

    await saveBridgeQueueSnapshot(mid, nextJobs);

    try {
      const url = `${BRIDGE_BASE.replace(
        /\/$/,
        "",
      )}/api/bridge/queue/${encodeURIComponent(mid)}/${encodeURIComponent(jid)}/qty`;
      await fetch(url, {
        method: "PATCH",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ qty }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: { jobId: jid, qty } });
  } catch (error) {
    console.error("Error in updateBridgeQueueJobQty:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 수량 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateBridgeQueueJobPause(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const paused = req.body?.paused === true;
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const nextJobs = jobs.map((j) => {
      if (!j?.id) return j;
      return String(j.id) === jid ? { ...j, paused } : j;
    });
    await saveBridgeQueueSnapshot(mid, nextJobs);

    try {
      const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
        mid,
      )}/${encodeURIComponent(jid)}/pause`;
      await fetch(url, {
        method: "PATCH",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ paused }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: { paused } });
  } catch (error) {
    console.error("Error in updateBridgeQueueJobPause:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 일시정지 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function applyBridgeQueueBatchForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const clear = req.body?.clear === true;
    const orderRaw = req.body?.order;
    const order = Array.isArray(orderRaw)
      ? orderRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : null;

    const qtyRaw = req.body?.qtyUpdates;
    const qtyUpdates = Array.isArray(qtyRaw)
      ? qtyRaw
          .map((u) => {
            if (!u) return null;
            const jobId = String(u.jobId || u.id || "").trim();
            if (!jobId) return null;
            const qty = Math.max(1, Number(u.qty ?? 1) || 1);
            return { jobId, qty };
          })
          .filter(Boolean)
      : [];

    const delRaw = req.body?.deleteJobIds;
    const deleteJobIds = Array.isArray(delRaw)
      ? delRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    const pauseRaw = req.body?.pauseUpdates;
    const pauseUpdates = Array.isArray(pauseRaw)
      ? pauseRaw
          .map((u) => {
            if (!u) return null;
            const jobId = String(u.jobId || u.id || "").trim();
            if (!jobId) return null;
            const paused = u.paused === true;
            return { jobId, paused };
          })
          .filter(Boolean)
      : [];

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];

    let jobs = clear ? [] : jobs0;

    let removedJobs = [];
    if (!clear && deleteJobIds.length > 0) {
      const delSet = new Set(deleteJobIds);
      removedJobs = jobs.filter((j) => delSet.has(String(j?.id || "")));
      jobs = jobs.filter((j) => !delSet.has(String(j?.id || "")));
    }

    if (!clear && qtyUpdates.length > 0) {
      const qtyMap = new Map(qtyUpdates.map((u) => [u.jobId, u.qty]));
      jobs = jobs.map((j) => {
        const id = String(j?.id || "");
        if (!id) return j;
        if (!qtyMap.has(id)) return j;
        return { ...j, qty: qtyMap.get(id) };
      });
    }

    if (!clear && pauseUpdates.length > 0) {
      const pauseMap = new Map(pauseUpdates.map((u) => [u.jobId, u.paused]));
      jobs = jobs.map((j) => {
        const id = String(j?.id || "");
        if (!id) return j;
        if (!pauseMap.has(id)) return j;
        return { ...j, paused: pauseMap.get(id) };
      });
    }

    if (!clear && order && order.length > 0) {
      const jobById = new Map();
      for (const j of jobs) {
        if (j?.id) jobById.set(String(j.id), j);
      }

      const reordered = [];
      for (const id of order) {
        const j = jobById.get(id);
        if (j) reordered.push(j);
      }
      for (const j of jobs) {
        if (!j?.id) continue;
        if (!order.includes(String(j.id))) reordered.push(j);
      }
      jobs = reordered;
    }

    await saveBridgeQueueSnapshot(mid, jobs);

    try {
      if (clear) {
        const clearUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/clear`;
        await fetch(clearUrl, {
          method: "POST",
          headers: withBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ machineId: mid }),
        });
      } else {
        if (order && order.length > 0) {
          const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/reorder`;
          await fetch(url, {
            method: "POST",
            headers: withBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ machineId: mid, order }),
          });
        }

        for (const u of qtyUpdates) {
          try {
            const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
              mid,
            )}/${encodeURIComponent(u.jobId)}/qty`;
            await fetch(url, {
              method: "PATCH",
              headers: withBridgeHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ qty: u.qty }),
            });
          } catch {
            // ignore
          }
        }

        for (const u of pauseUpdates) {
          try {
            const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
              mid,
            )}/${encodeURIComponent(u.jobId)}/pause`;
            await fetch(url, {
              method: "PATCH",
              headers: withBridgeHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ paused: u.paused }),
            });
          } catch {
            // ignore
          }
        }

        for (const jid of deleteJobIds) {
          try {
            const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
              mid,
            )}/${encodeURIComponent(jid)}`;
            await fetch(url, {
              method: "DELETE",
              headers: withBridgeHeaders(),
            });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    const uniqueRequestIds = new Set();
    for (const r of removedJobs) {
      const rid = String(r?.requestId || "").trim();
      if (rid) uniqueRequestIds.add(rid);
    }
    const rolledBack = [];
    for (const rid of uniqueRequestIds) {
      const rr = await rollbackRequestToCamByRequestId(rid);
      if (rr?._id) rolledBack.push(String(rr._id));
    }

    return res.status(200).json({
      success: true,
      data: {
        jobs,
        rolledBackRequestIds: rolledBack,
      },
    });
  } catch (error) {
    console.error("Error in applyBridgeQueueBatchForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 배치 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteBridgeQueueJob(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();

    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const removedJob = jobs.find((j) => String(j?.id || "") === jid) || null;
    const nextJobs = jobs.filter((j) => String(j?.id || "") !== jid);

    await saveBridgeQueueSnapshot(mid, nextJobs);

    try {
      const url = `${BRIDGE_BASE.replace(
        /\/$/,
        "",
      )}/api/bridge/queue/${encodeURIComponent(mid)}/${encodeURIComponent(jid)}`;
      await fetch(url, {
        method: "DELETE",
        headers: withBridgeHeaders(),
      });
    } catch {
      // ignore
    }

    let rolledBackRequest = null;
    const reqIdRaw = removedJob?.requestId;
    if (reqIdRaw) {
      rolledBackRequest = await rollbackRequestToCamByRequestId(reqIdRaw);
    }

    return res.status(200).json({
      success: true,
      data: {
        removedJob,
        rolledBackRequestId: rolledBackRequest?._id || null,
      },
    });
  } catch (error) {
    console.error("Error in deleteBridgeQueueJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 작업 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function clearBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs : [];

    await saveBridgeQueueSnapshot(mid, []);

    try {
      const clearUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/clear`;
      await fetch(clearUrl, {
        method: "POST",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ machineId: mid }),
      });
    } catch {
      // ignore
    }

    const uniqueRequestIds = new Set();
    for (const job of jobs) {
      const rid = String(job?.requestId || "").trim();
      if (!rid) continue;
      uniqueRequestIds.add(rid);
    }

    const rolledBack = [];
    for (const rid of uniqueRequestIds) {
      const r = await rollbackRequestToCamByRequestId(rid);
      if (r?._id) {
        rolledBack.push(String(r._id));
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        clearedMachineId: mid,
        rolledBackRequestIds: rolledBack,
      },
    });
  } catch (error) {
    console.error("Error in clearBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 전체 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// [정책 4.8.5] 브리지 큐 스냅샷 정리 (reconcile):
// DB 스냅샷에서 requestId가 있는 항목(의뢰건 자동 가공)을 모두 제거한다.
// 장비 페이지 예약목록에는 수동 업로드 파일(requestId 없음)만 남아야 한다.
// 기존에 오염된 스냅샷을 수동으로 정리할 때 사용한다.
// ──────────────────────────────────────────────────────────────────────────
export async function reconcileBridgeQueueSnapshot(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);
    const before = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];

    // requestId가 있는 항목(의뢰건 자동 가공)을 제거하고 수동 파일만 남긴다
    const after = before.filter((j) => {
      const rid = String(j?.requestId || "").trim();
      return !rid;
    });

    const removedCount = before.length - after.length;
    if (removedCount > 0) {
      await saveBridgeQueueSnapshot(mid, after);
      console.log(
        "[bridge:reconcile] request_auto items removed from snapshot",
        JSON.stringify({
          machineId: mid,
          before: before.length,
          after: after.length,
        }),
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        before: before.length,
        after: after.length,
        removedCount,
        remainingJobs: after,
      },
    });
  } catch (error) {
    console.error("Error in reconcileBridgeQueueSnapshot:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 큐 스냅샷 정리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function refreshBridgeQueueSnapshotFromBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const q = await fetchBridgeQueueFromBridge(mid);
    if (!q.ok) {
      return res.status(q.status).json({ success: false, message: q.error });
    }

    await saveBridgeQueueSnapshot(mid, q.jobs);
    return res.status(200).json({ success: true, data: q.jobs });
  } catch (error) {
    console.error("Error in refreshBridgeQueueSnapshotFromBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 큐 동기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
