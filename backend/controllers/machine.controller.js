import { config } from "dotenv";
config(); // .env 로드

import Machine from "../models/machine.model.js";

const CNC_BRIDGE_BASE = process.env.CNC_BRIDGE_URL || "http://localhost:4005";

// GET /api/machines - 현재 사용자(제조사/관리자)의 장비 목록
export async function getMachines(req, res) {
  try {
    const query = {};
    // 개발 단계에서는 인증 미들웨어를 끈 상태일 수 있으므로 req.user 존재 여부를 체크
    if (req.user && req.user.role === "manufacturer") {
      query.manufacturer = req.user._id;
    }
    const machines = await Machine.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: machines });
  } catch (error) {
    console.error("getMachines error", error);
    res.status(500).json({
      success: false,
      message: "장비 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// hi-link 브리지 프록시: 상태 조회
export async function getMachineStatusProxy(req, res) {
  const { uid } = req.params;
  try {
    const response = await fetch(
      `${CNC_BRIDGE_BASE}/machines/${encodeURIComponent(uid)}/status`
    );
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("getMachineStatusProxy error", error);
    res.status(500).json({
      result: -1,
      message: "status proxy failed",
    });
  }
}

async function sendControl(uid, action, res) {
  try {
    const response = await fetch(
      `${CNC_BRIDGE_BASE}/machines/${encodeURIComponent(uid)}/${action}`,
      { method: "POST" }
    );
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`control proxy ${action} error`, error);
    res.status(500).json({
      result: -1,
      message: `${action} proxy failed`,
    });
  }
}

export async function startMachineProxy(req, res) {
  await sendControl(req.params.uid, "start", res);
}

export async function stopMachineProxy(req, res) {
  await sendControl(req.params.uid, "stop", res);
}

export async function resetMachineProxy(req, res) {
  await sendControl(req.params.uid, "reset", res);
}

// hi-link 브리지 범용 RAW 프록시: DLL의 모든 CollectDataType 호출을 지원
export async function callRawProxy(req, res) {
  const { uid } = req.params;
  try {
    const payload = {
      ...(req.body || {}),
      uid: req.body?.uid ?? uid,
    };
    const response = await fetch(`${CNC_BRIDGE_BASE}/raw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("callRawProxy error", error);
    res.status(500).json({
      success: false,
      message: "raw proxy failed",
    });
  }
}

// POST /api/machines/pause-all - 모든 장비 일시중단 프록시
export async function pauseAllProxy(_req, res) {
  try {
    const response = await fetch(`${CNC_BRIDGE_BASE}/pause-all`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("pauseAllProxy error", error);
    res.status(500).json({
      success: false,
      message: "pause all proxy failed",
    });
  }
}

// POST /api/machines/resume-all - 모든 장비 재시작 프록시
export async function resumeAllProxy(_req, res) {
  try {
    const response = await fetch(`${CNC_BRIDGE_BASE}/resume-all`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("resumeAllProxy error", error);
    res.status(500).json({
      success: false,
      message: "resume all proxy failed",
    });
  }
}

// POST /api/machines - 장비 등록/수정
export async function upsertMachine(req, res) {
  try {
    const { uid, serial, ip, port, name, hiLinkUid } = req.body;
    // hiLinkUid가 없으면 (구버전 클라이언트 호환) uid를 hiLinkUid로 사용
    const effectiveHiLinkUid = hiLinkUid || uid;
    const displayName = name || uid;

    if (!effectiveHiLinkUid) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Hi-Link UID(hiLinkUid)는 필수입니다.",
        });
    }

    const update = {
      // uid/name 는 사람이 읽는 장비 이름, hiLinkUid는 Hi-Link 내부 UID
      uid: displayName,
      hiLinkUid: effectiveHiLinkUid,
      serial,
      ip,
      port,
      name: displayName,
      // 개발 단계에서는 인증이 없을 수 있으므로 manufacturer는 선택적으로 저장
      ...(req.user && { manufacturer: req.user._id }),
    };

    const machine = await Machine.findOneAndUpdate(
      { hiLinkUid: effectiveHiLinkUid },
      { $set: update },
      { new: true, upsert: true }
    );
    // hi-link 브리지에도 장비 정보를 등록 시도 (실패하더라도 DB 저장 결과는 그대로 반환)
    if (ip && port) {
      try {
        const bridgeResponse = await fetch(`${CNC_BRIDGE_BASE}/machines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: effectiveHiLinkUid, ip, port }),
        });
        const bridgeData = await bridgeResponse.json().catch(() => null);
        if (!bridgeResponse.ok || !bridgeData || bridgeData.result !== 0) {
          console.warn("hi-link addMachine warning", {
            status: bridgeResponse.status,
            body: bridgeData,
          });
        }
      } catch (bridgeError) {
        console.error("hi-link addMachine error", bridgeError);
      }
    }

    res.status(201).json({ success: true, data: machine });
  } catch (error) {
    console.error("upsertMachine error", error);
    res.status(500).json({
      success: false,
      message: "장비 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// DELETE /api/machines/:uid - 장비 삭제
export async function deleteMachine(req, res) {
  try {
    const { uid } = req.params;
    const baseCondition = { $or: [{ uid }, { hiLinkUid: uid }] };
    const query =
      req.user && req.user.role === "manufacturer"
        ? { ...baseCondition, manufacturer: req.user._id }
        : baseCondition;

    const result = await Machine.findOneAndDelete(query);
    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "장비를 찾을 수 없습니다." });
    }

    res.json({ success: true, message: "장비가 삭제되었습니다." });
  } catch (error) {
    console.error("deleteMachine error", error);
    res.status(500).json({
      success: false,
      message: "장비 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
