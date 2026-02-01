import "../bootstrap/env.js";

// 브리지 서비스 기본 URL 및 Hi-Link CNC 엔드포인트
const BRIDGE_BASE = process.env.BRIDGE_BASE;
const CNC_BRIDGE_BASE =
  process.env.CNC_BRIDGE_BASE ||
  (BRIDGE_BASE ? `${BRIDGE_BASE}/api/cnc` : null);
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
const CONTROL_COOLDOWN_MS = 5000;
const lastControlCall = new Map();
const lastRawReadCall = new Map();

import Machine from "../models/machine.model.js";
import Request from "../models/request.model.js";

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

function ensureBridgeConfigured(res) {
  if (!BRIDGE_BASE) {
    res.status(500).json({
      success: false,
      message: "BRIDGE_BASE is not configured",
    });
    return false;
  }
  return true;
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

// hi-link 브리지 프록시: 전체 장비 상태 일괄 조회
export async function getAllMachineStatusProxy(req, res) {
  try {
    if (!ensureBridgeConfigured(res)) return;
    const includeAlarms = String(req.query?.includeAlarms || "").trim() === "1";
    const response = await fetch(`${BRIDGE_BASE}/api/cnc/machines/status`, {
      headers: withBridgeHeaders(),
    });
    const data = await response.json().catch(() => ({}));

    if (!includeAlarms || !response.ok || data?.success === false) {
      res.status(response.status).json(data);
      return;
    }

    const list = Array.isArray(data?.machines) ? data.machines : [];

    const fetchAlarms = async (uid) => {
      try {
        const callAlarm = async (headType) => {
          const alarmResp = await fetch(`${BRIDGE_BASE}/api/cnc/raw`, {
            method: "POST",
            headers: withBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              uid,
              dataType: "GetMachineAlarmInfo",
              payload: { headType },
            }),
          });
          const alarmBody = await alarmResp.json().catch(() => ({}));
          const unwrap = (x) => (x && x.data != null ? x.data : x);
          const l1 = unwrap(alarmBody);
          const l2 = unwrap(l1);
          const alarms =
            (Array.isArray(l2?.alarms) ? l2.alarms : null) ||
            (Array.isArray(l1?.alarms) ? l1.alarms : null) ||
            (Array.isArray(alarmBody?.alarms) ? alarmBody.alarms : null) ||
            [];
          return alarms;
        };

        const [a0, a1] = await Promise.all([callAlarm(0), callAlarm(1)]);
        const merged = [];
        for (const a of [...a0, ...a1]) {
          if (!a) continue;
          const key = `${a.type ?? "?"}-${a.no ?? "?"}`;
          if (merged.some((x) => `${x.type ?? "?"}-${x.no ?? "?"}` === key)) {
            continue;
          }
          merged.push(a);
        }
        return merged;
      } catch {
        return [];
      }
    };

    const enriched = await Promise.all(
      list.map(async (m) => {
        const uid = String(m?.uid || "").trim();
        if (!uid) return m;
        const alarms = await fetchAlarms(uid);
        const hasAlarm = Array.isArray(alarms) && alarms.length > 0;
        return {
          ...m,
          status: hasAlarm ? "ALARM" : m?.status,
          alarms,
        };
      }),
    );

    res.status(response.status).json({
      ...data,
      machines: enriched,
    });
  } catch (error) {
    console.error("getAllMachineStatusProxy error", error);
    res.status(500).json({
      success: false,
      message: "status proxy failed",
    });
  }
}

// POST /api/machines/sync-bridge - DB 기준으로 Hi-Link 브리지에 장비 재등록
export async function syncBridgeMachines(_req, res) {
  try {
    if (!ensureBridgeConfigured(res)) return;
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
    if (!ensureBridgeConfigured(res)) return;
    const response = await fetch(
      `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/status`,
      { headers: withBridgeHeaders() },
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

// POST /api/machines/:uid/alarm - 알람 조회 프록시
export async function getMachineAlarmProxy(req, res) {
  const { uid } = req.params;
  try {
    if (!ensureBridgeConfigured(res)) return;
    // 브리지에 /machines/:uid/alarm 엔드포인트가 없을 수 있으므로
    // 공통 raw 엔드포인트를 통해 GetMachineAlarmInfo를 호출한다.
    const response = await fetch(`${BRIDGE_BASE}/api/cnc/raw`, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        uid,
        dataType: "GetMachineAlarmInfo",
        payload: req.body?.payload ?? { headType: req.body?.headType ?? 0 },
      }),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("getMachineAlarmProxy error", error);
    res.status(500).json({
      success: false,
      message: "alarm proxy failed",
    });
  }
}

async function sendControl(uid, action, res) {
  if (!ensureBridgeConfigured(res)) return;
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
    const isStart = action === "start";
    const isStop = action === "stop";
    const shouldSendBody = isStart || isStop;

    const ioUidDefault = isStart ? 61 : isStop ? 62 : null;
    const panelTypeDefault = 0;
    const statusDefault = 1;

    const bodyForBridge = shouldSendBody
      ? {
          ioUid:
            typeof res.req?.body?.ioUid === "number"
              ? res.req.body.ioUid
              : ioUidDefault,
          panelType:
            typeof res.req?.body?.panelType === "number"
              ? res.req.body.panelType
              : panelTypeDefault,
          status:
            typeof res.req?.body?.status === "number"
              ? res.req.body.status
              : statusDefault,
        }
      : null;

    const response = await fetch(
      `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/${action}`,
      {
        method: "POST",
        headers: withBridgeHeaders(
          shouldSendBody ? { "Content-Type": "application/json" } : {},
        ),
        body: shouldSendBody ? JSON.stringify(bodyForBridge) : undefined,
      },
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

// POST /api/machines/:uid/alarm/clear - 알람 해제(Reset 기반) 프록시
export async function clearMachineAlarmProxy(req, res) {
  await sendControl(req.params.uid, "reset", res);
}

// POST /api/machines/:uid/start - 가공 시작 제어 명령 프록시
export async function startMachineProxy(req, res) {
  await sendControl(req.params.uid, "start", res);
}

// POST /api/machines/:uid/stop - 가공 중단 제어 명령 프록시
export async function stopMachineProxy(req, res) {
  await sendControl(req.params.uid, "stop", res);
}

export async function callRawProxy(req, res) {
  const { uid } = req.params;
  try {
    if (!ensureBridgeConfigured(res)) return;
    const dataType = req.body?.dataType;
    const READ_TYPES = [
      "GetOPStatus",
      "GetProgListInfo",
      "GetActivateProgInfo",
      "GetMotorTemperature",
      "GetToolLifeInfo",
      "GetProgDataInfo",
      "GetMachineList",
      "GetMachineAlarmInfo",
    ];

    const bypassCooldown = req.body?.bypassCooldown === true;

    if (
      !bypassCooldown &&
      typeof dataType === "string" &&
      READ_TYPES.includes(dataType)
    ) {
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
            }),
          );
        } catch (e) {
          console.warn(
            "[machine.callRawProxy] rate-limited READ (log error)",
            uid || null,
            dataType,
            e,
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
    const {
      uid,
      serial,
      ip,
      port,
      name,
      allowJobStart,
      allowProgramDelete,
      allowAutoMachining,
    } = req.body;
    const finalUid = uid;
    const displayName = name || finalUid;

    if (!finalUid) {
      return res.status(400).json({
        success: false,
        message: "장비 UID(uid)는 필수입니다.",
      });
    }

    const normalizeBool = (v, fallback) => {
      if (v === true || v === "true") return true;
      if (v === false || v === "false") return false;
      return fallback;
    };

    // 기존 값이 있다면, 전달되지 않은 필드는 기존 값을 유지한다.
    const existing = await Machine.findOne({ uid: finalUid }).lean();
    const prevAuto = existing?.allowAutoMachining === true;
    const update = {
      // uid: 앱에서 사용하는 논리 UID, hiLinkUid: Hi-Link DLL에 전달되는 실제 UID
      uid: finalUid,
      hiLinkUid: finalUid,
      serial,
      ip,
      port,
      name: displayName,
      allowJobStart: normalizeBool(
        allowJobStart,
        existing?.allowJobStart ?? true,
      ),
      allowProgramDelete: normalizeBool(
        allowProgramDelete,
        existing?.allowProgramDelete ?? false,
      ),
      allowAutoMachining: normalizeBool(
        allowAutoMachining,
        existing?.allowAutoMachining ?? false,
      ),
      // 개발 단계에서는 인증이 없을 수 있으므로 manufacturer는 선택적으로 저장
      ...(req.user && { manufacturer: req.user._id }),
    };

    // uid가 같은 기존 레코드가 있으면 그것을 업데이트하고, 없으면 새로 생성한다.
    const machine = await Machine.findOneAndUpdate(
      { uid: finalUid },
      { $set: update },
      { new: true, upsert: true },
    );

    // OFF -> ON 전환 시, 해당 장비에 할당된 대기(CAM 승인 이후) 의뢰를 브리지로 트리거한다.
    // - 브리지는 매번 DB를 조회하지 않으므로, 백엔드에서 process-file 호출을 해줘야 자동 가공이 시작될 수 있다.
    // - 실패하더라도 장비 설정 저장 자체는 성공으로 반환한다.
    const nextAuto = machine?.allowAutoMachining === true;
    let autoMachiningTrigger = null;
    if (!prevAuto && nextAuto && BRIDGE_BASE) {
      try {
        const pending = await Request.find({
          status: { $in: ["CAM", "가공", "생산"] },
          "productionSchedule.assignedMachine": finalUid,
        })
          .sort({ "productionSchedule.queuePosition": 1, updatedAt: 1 })
          .limit(1)
          .lean();

        const req0 = Array.isArray(pending) ? pending[0] : null;
        const requestId = String(req0?.requestId || "").trim();
        const bridgePath = String(
          req0?.caseInfos?.ncFile?.filePath || "",
        ).trim();
        const rawFileName = String(
          req0?.caseInfos?.ncFile?.fileName || "",
        ).trim();
        const derivedFileName = bridgePath
          ? String(bridgePath).split(/[/\\]/).pop()
          : "";
        const fileName = rawFileName || derivedFileName;

        autoMachiningTrigger = {
          attempted: false,
          requestId: requestId || null,
          machineId: finalUid,
          fileName: fileName || null,
          bridgePath: bridgePath || null,
          error: null,
        };

        if (requestId && bridgePath) {
          // DB에 선업로드 진행 상태 기록 (UI에서 표시 가능)
          try {
            await Request.updateOne(
              { requestId },
              {
                $set: {
                  "productionSchedule.ncPreload": {
                    status: "UPLOADING",
                    machineId: finalUid,
                    bridgePath: bridgePath || null,
                    updatedAt: new Date(),
                    error: null,
                  },
                },
              },
            );
          } catch (e) {
            console.warn("autoMachining ncPreload UPLOADING update failed", e);
          }

          const base =
            process.env.BRIDGE_NODE_URL ||
            process.env.BRIDGE_PROCESS_BASE ||
            process.env.CNC_BRIDGE_BASE ||
            process.env.BRIDGE_BASE ||
            "http://localhost:8002";
          try {
            await fetch(
              `${String(base).replace(/\/$/, "")}/api/bridge/process-file`,
              {
                method: "POST",
                headers: withBridgeHeaders({
                  "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                  fileName: fileName || null,
                  requestId,
                  machineId: finalUid,
                  bridgePath: bridgePath || null,
                }),
              },
            );

            autoMachiningTrigger.attempted = true;
          } catch (e) {
            autoMachiningTrigger.error = String(e?.message || e);
            console.warn("autoMachining trigger bridge call failed", e);
            try {
              await Request.updateOne(
                { requestId },
                {
                  $set: {
                    "productionSchedule.ncPreload": {
                      status: "FAILED",
                      machineId: finalUid,
                      bridgePath: bridgePath || null,
                      updatedAt: new Date(),
                      error: autoMachiningTrigger.error,
                    },
                  },
                },
              );
            } catch (e2) {
              console.warn("autoMachining ncPreload FAILED update failed", e2);
            }
          }
        }
      } catch (e) {
        console.warn("autoMachining trigger on toggle failed", e);
      }
    }

    // hi-link 브리지에도 장비 정보를 등록 시도 (실패하더라도 DB 저장 결과는 그대로 반환)
    let hiLinkResult = null;
    if (ip && port && BRIDGE_BASE) {
      try {
        // .env의 BRIDGE_BASE (http://1.217.31.227:8002)를 사용하여 직접 호출
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
          `${BRIDGE_BASE}/api/machines-config/${encodeURIComponent(finalUid)}`,
          {
            method: "PUT",
            headers: withBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ uid: finalUid, ip, port }),
          },
        );
      } catch (cfgError) {
        console.warn("bridge-node config upsert error", cfgError);
      }
    } else if (ip && port && !BRIDGE_BASE) {
      hiLinkResult = {
        success: false,
        message: "BRIDGE_BASE is not configured",
      };
    }

    res.status(201).json({
      success: true,
      data: machine,
      hiLink: hiLinkResult,
      autoMachiningTrigger,
    });
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
    if (BRIDGE_BASE) {
      try {
        await fetch(
          `${BRIDGE_BASE}/api/bridge-config/machines/${encodeURIComponent(
            uid,
          )}`,
          { method: "DELETE", headers: withBridgeHeaders() },
        );
      } catch (cfgError) {
        console.warn("bridge-node config delete error", cfgError);
      }
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
