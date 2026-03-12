import { withEspritHeaders } from "./common.review.helpers.js";
import {
  chooseMachineForCamMachining,
  inferDiameterGroupFromDiameter,
} from "./common.review.machine.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

// Trigger Esprit for NC generation
export async function triggerEspritForNc({ request, force = false }) {
  if (!request) {
    throw new Error("request is required to trigger Esprit");
  }

  const existingNc =
    request?.caseInfos?.ncFile?.fileName || request?.caseInfos?.ncFile?.s3Key;
  if (existingNc && !force) {
    console.log("[ESPRIT] skip trigger (existing NC, not forced)", {
      requestId: request?.requestId,
      existingNc,
    });
    return;
  }

  const camFileName = request?.caseInfos?.camFile?.filePath;
  if (!camFileName) {
    const err = new Error("CAM 파일이 없어 NC 생성을 시작할 수 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const ncFileName = String(camFileName).replace(/\.stl$/i, ".nc");
  const controller = new AbortController();
  const timeoutMs = Number(process.env.BG_TRIGGER_TIMEOUT_MS || 2500);
  const timeoutRef = setTimeout(() => controller.abort(), timeoutMs);
  const espritUrl = `${ESPRIT_BASE.replace(/\/+$/, "")}/`;
  console.log("[ESPRIT] prepare trigger", {
    requestId: request?.requestId,
    camFileName,
    ncFileName,
    force,
    stage: request?.manufacturerStage,
    schedule: request?.productionSchedule,
  });

  // MaterialDiameter/Group 계산: schedule.diameter → 장비 사전선택 → maxDiameter 천장값
  const schedule = request?.productionSchedule || {};
  let matDia = Number(schedule?.diameter);
  if (!Number.isFinite(matDia) || matDia <= 0) {
    try {
      const pre = await chooseMachineForCamMachining({
        request,
        ignoreAllowAssign: true,
      });
      if (Number.isFinite(pre?.diameter)) matDia = pre.diameter;
    } catch {
      // ignore
    }
  }
  if (!Number.isFinite(matDia) || matDia <= 0) {
    const maxD = Number(request?.caseInfos?.maxDiameter);
    if (Number.isFinite(maxD) && maxD > 0) {
      matDia = maxD <= 6 ? 6 : maxD <= 8 ? 8 : maxD <= 10 ? 10 : 12;
    }
  }
  const matGroup =
    String(schedule?.diameterGroup || "").trim() ||
    (Number.isFinite(matDia) && matDia > 0
      ? inferDiameterGroupFromDiameter(matDia) || ""
      : "");
  console.log("[ESPRIT] resolved material for trigger", {
    requestId: request?.requestId,
    maxDiameter: request?.caseInfos?.maxDiameter,
    scheduleDiameter: schedule?.diameter,
    scheduleGroup: schedule?.diameterGroup,
    resolvedDiameter: matDia,
    resolvedGroup: matGroup,
  });

  let resp;
  try {
    const payload = {
      RequestId: String(request.requestId || ""),
      StlPath: camFileName,
      NcOutputPath: ncFileName,
      Force: Boolean(force),
      ClinicName: request?.caseInfos?.clinicName || "",
      PatientName: request?.caseInfos?.patientName || "",
      Tooth: request?.caseInfos?.tooth || "",
      ImplantManufacturer: request?.caseInfos?.implantManufacturer || "",
      ImplantBrand: request?.caseInfos?.implantBrand || "",
      ImplantFamily: request?.caseInfos?.implantFamily || "",
      ImplantType: request?.caseInfos?.implantType || "",
      MaxDiameter: Number(request?.caseInfos?.maxDiameter || 0),
      ConnectionDiameter: Number(request?.caseInfos?.connectionDiameter || 0),
      MaterialDiameter: Number(matDia || 0),
      MaterialDiameterGroup: String(matGroup || ""),
      WorkType: request?.caseInfos?.workType || "",
      LotNumber: request?.lotNumber?.value || "",
    };
    console.log("[ESPRIT] POST / payload", {
      RequestId: payload.RequestId,
      MaxDiameter: payload.MaxDiameter,
      MaterialDiameter: payload.MaterialDiameter,
      MaterialDiameterGroup: payload.MaterialDiameterGroup,
    });
    resp = await fetch(espritUrl, {
      method: "POST",
      headers: withEspritHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const err = new Error(
      "Esprit 서버에 연결할 수 없습니다. Esprit 서버(8001)를 실행한 후 다시 시도해주세요.",
    );
    err.statusCode = 503;
    err.cause = error;
    throw err;
  } finally {
    clearTimeout(timeoutRef);
  }

  if (!resp?.ok) {
    const text = await resp.text().catch(() => "");
    console.warn("[ESPRIT] trigger failed", {
      requestId: request?.requestId,
      status: resp?.status,
      text,
    });
    const err = new Error(
      `Esprit 트리거 실패 (${resp?.status ?? "unknown"}): ${text}`.trim(),
    );
    err.statusCode = 503;
    throw err;
  } else {
    console.log("[ESPRIT] trigger accepted", {
      requestId: request?.requestId,
      status: resp?.status,
    });
  }
}
