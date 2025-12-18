import "../bootstrap/env.js";

// 브리지 서비스 기본 URL 및 Hi-Link CNC 엔드포인트
const BRIDGE_BASE = process.env.BRIDGE_BASE || "http://1.217.31.227:4005";
const CNC_BRIDGE_BASE = process.env.CNC_BRIDGE_BASE || `${BRIDGE_BASE}/api/cnc`;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
const CONTROL_COOLDOWN_MS = 5000;
const lastControlCall = new Map();
const lastRawReadCall = new Map();

console.log("BRIDGE_BASE", BRIDGE_BASE);

import Machine from "../models/machine.model.js";

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

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

// POST /api/machines/sync-bridge - DB 기준으로 Hi-Link 브리지에 장비 재등록
export async function syncBridgeMachines(_req, res) {
  try {
    const machines = await Machine.find({
      ip: { $ne: null },
      port: { $ne: null },
    });
    if (!machines || machines.length === 0) {
      return res.json({
        success: true,
        synced: 0,
        failed: 0,
        message: "동기화할 장비가 없습니다.",
      });
    }

    let synced = 0;
    let failed = 0;

    for (const m of machines) {
      if (!m.uid || !m.ip || !m.port) continue;
      try {
        const resp = await fetch(`${CNC_BRIDGE_BASE}/machines`, {
          method: "POST",
          headers: withBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ uid: m.uid, ip: m.ip, port: m.port }),
        });
        const body = await resp.json().catch(() => ({}));
        if (resp.ok && body && body.success !== false) {
          synced++;
        } else {
          failed++;
          console.warn("syncBridgeMachines: AddMachine 실패", m.uid, body);
        }
      } catch (e) {
        failed++;
        console.error("syncBridgeMachines: AddMachine 예외", m.uid, e);
      }
    }

    res.json({ success: true, synced, failed, total: machines.length });
  } catch (error) {
    console.error("syncBridgeMachines error", error);
    res.status(500).json({
      success: false,
      message: "브리지 동기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// hi-link 브리지 프록시: 상태 조회
export async function getMachineStatusProxy(req, res) {
  const { uid } = req.params;
  try {
    const response = await fetch(
      `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/status`,
      { headers: withBridgeHeaders() }
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
    // 장비 설정에서 가공 시작이 차단된 경우, reset 이외의 제어 명령은 실행하지 않는다.
    const machine = await Machine.findOne({ uid }).lean();
    if (machine && machine.allowJobStart === false && action !== "reset") {
      return res.status(403).json({
        result: -1,
        message: "이 장비는 가공 시작이 차단되어 있습니다.",
      });
    }
  } catch (e) {
    console.warn("sendControl allowJobStart check failed", e);
    // 체크에 실패해도 제어 명령 자체는 계속 진행한다.
  }
  const key = `${uid}:${action}`;
  const now = Date.now();
  const last = lastControlCall.get(key) || 0;
  if (now - last < CONTROL_COOLDOWN_MS) {
    return res.status(429).json({
      result: -1,
      message: "control command is temporarily rate-limited",
    });
  }
  lastControlCall.set(key, now);

  try {
    const response = await fetch(
      `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/${action}`,
      { method: "POST", headers: withBridgeHeaders() }
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

export async function resetMachineProxy(req, res) {
  await sendControl(req.params.uid, "reset", res);
}

// POST /api/machines/:uid/start - 가공 시작 제어 명령 프록시
export async function startMachineProxy(req, res) {
  await sendControl(req.params.uid, "start", res);
}

// hi-link 브리지 범용 RAW 프록시: DLL의 모든 CollectDataType 호출을 지원
export async function callRawProxy(req, res) {
  const { uid } = req.params;
  try {
    const dataType = req.body?.dataType;
    const READ_TYPES = [
      "GetOPStatus",
      "GetProgListInfo",
      "GetActivateProgInfo",
      "GetMotorTemperature",
      "GetToolLifeInfo",
      "GetProgDataInfo",
      "GetMachineList",
    ];

    if (typeof dataType === "string" && READ_TYPES.includes(dataType)) {
      const key = `${uid || ""}:${dataType}`;
      const now = Date.now();
      const last = lastRawReadCall.get(key) || 0;
      if (now - last < CONTROL_COOLDOWN_MS) {
        // 과도 호출 추적을 위해 uid/dataType 및 payload 일부를 로깅한다.
        try {
          const payloadPreview = req.body?.payload
            ? JSON.stringify(req.body.payload).slice(0, 200)
            : null;
          console.warn(
            "[machine.callRawProxy] rate-limited READ",
            JSON.stringify({
              uid: uid || null,
              dataType,
              payload: payloadPreview,
            })
          );
        } catch (e) {
          console.warn(
            "[machine.callRawProxy] rate-limited READ (log error)",
            uid || null,
            dataType,
            e
          );
        }

        return res.status(429).json({
          success: false,
          message: "raw read request is temporarily rate-limited",
        });
      }
      lastRawReadCall.set(key, now);
    }

    const payload = {
      ...(req.body || {}),
      uid: req.body?.uid ?? uid,
    };
    const response = await fetch(`${BRIDGE_BASE}/api/cnc/raw`, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
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

// POST /api/machines - 장비 등록/수정
export async function upsertMachine(req, res) {
  try {
    const { uid, serial, ip, port, name, allowJobStart, allowProgramDelete } =
      req.body;
    const finalUid = uid;
    const displayName = name || finalUid;

    if (!finalUid) {
      return res.status(400).json({
        success: false,
        message: "장비 UID(uid)는 필수입니다.",
      });
    }

    const update = {
      // uid: 앱에서 사용하는 논리 UID, hiLinkUid: Hi-Link DLL에 전달되는 실제 UID
      uid: finalUid,
      hiLinkUid: finalUid,
      serial,
      ip,
      port,
      name: displayName,
      ...(typeof allowJobStart === "boolean" && { allowJobStart }),
      ...(typeof allowProgramDelete === "boolean" && { allowProgramDelete }),
      // 개발 단계에서는 인증이 없을 수 있으므로 manufacturer는 선택적으로 저장
      ...(req.user && { manufacturer: req.user._id }),
    };

    // uid가 같은 기존 레코드가 있으면 그것을 업데이트하고, 없으면 새로 생성한다.
    const machine = await Machine.findOneAndUpdate(
      { uid: finalUid },
      { $set: update },
      { new: true, upsert: true }
    );

    // hi-link 브리지에도 장비 정보를 등록 시도 (실패하더라도 DB 저장 결과는 그대로 반환)
    let hiLinkResult = null;
    if (ip && port) {
      try {
        const bridgeResponse = await fetch(`${BRIDGE_BASE}/api/cnc/machines`, {
          method: "POST",
          headers: withBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ uid: finalUid, ip, port }),
        });
        const bridgeData = await bridgeResponse.json().catch(() => null);
        hiLinkResult = {
          status: bridgeResponse.status,
          ...(bridgeData || {}),
        };
        if (!bridgeResponse.ok || !bridgeData || bridgeData.success === false) {
          console.warn("hi-link addMachine warning", hiLinkResult);
        }
      } catch (bridgeError) {
        console.error("hi-link addMachine error", bridgeError);
        hiLinkResult = {
          success: false,
          message: "Hi-Link AddMachine 호출 중 오류가 발생했습니다.",
          error: String(bridgeError?.message || bridgeError),
        };
      }

      // bridge-node 로컬 machines.json (MachinesConfigStore) 도 함께 업데이트
      try {
        await fetch(
          `${BRIDGE_BASE}/api/bridge-config/machines/${encodeURIComponent(
            finalUid
          )}`,
          {
            method: "PUT",
            headers: withBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ uid: finalUid, ip, port }),
          }
        );
      } catch (cfgError) {
        console.warn("bridge-node config upsert error", cfgError);
      }
    }

    res
      .status(201)
      .json({ success: true, data: machine, hiLink: hiLinkResult });
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
    const baseCondition = { uid };
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

    // bridge-node 로컬 machines.json 에서도 제거 시도 (실패해도 무시)
    try {
      await fetch(
        `${BRIDGE_BASE}/api/bridge-config/machines/${encodeURIComponent(uid)}`,
        { method: "DELETE", headers: withBridgeHeaders() }
      );
    } catch (cfgError) {
      console.warn("bridge-node config delete error", cfgError);
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
