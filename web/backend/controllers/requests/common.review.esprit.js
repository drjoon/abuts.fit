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
// 2026-06-08: Two-Phase is now default, One-Phase is explicit opt-in
export async function triggerEspritForNc({
  request,
  force = false,
  onePhase = false,
}) {
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

  const camBaseName = String(camFileName || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  const camNcName = String(camBaseName || "")
    .replace(/\.stl$/i, ".nc")
    .trim();
  // 샘플/복사 의뢰와 원본 의뢰가 동일 camFile 경로를 공유할 수 있으므로,
  // NC 출력 경로는 항상 requestId 단위로 분리한다. (rules.md §18.8 분리 정책)
  const ncFileName = request?.requestId
    ? `3-nc/${String(request.requestId).trim()}/${camNcName || `${String(request.requestId).trim()}.nc`}`
    : String(camFileName).replace(/\.stl$/i, ".nc");
  const controller = new AbortController();
  // Esprit HTTP 서버는 요청 수신 시 런타임 상태 전송(backend callback)을 먼저 수행한 뒤
  // 응답을 반환할 수 있어 2.5초 기본값으로는 간헐적 abort가 발생한다.
  // abort가 나면 ReviewApprovalQueue가 재시도하면서 체감 지연(수십 초)로 보일 수 있으므로,
  // 기본 타임아웃을 충분히 늘리고(12초) 환경변수값도 하한/상한으로 안전하게 클램프한다.
  const configuredTimeoutMs = Number(process.env.BG_TRIGGER_TIMEOUT_MS || 12000);
  const timeoutMs = Number.isFinite(configuredTimeoutMs)
    ? Math.min(30000, Math.max(3000, Math.floor(configuredTimeoutMs)))
    : 12000;
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
      // add-in 구현/버전에 따라 key casing 차이를 허용하기 위해 소문자 키도 함께 전달
      requestId: String(request.requestId || ""),
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
      MaterialDiameter: Number(matDia || 0),
      MaterialDiameterGroup: String(matGroup || ""),
      WorkType: request?.caseInfos?.workType || "",
      LotNumber: request?.lotNumber?.value || "",
      // STL 프리뷰 온레이용 메타데이터도 add-in으로 전달 (rhino-server 계산 후 백엔드에 저장된 값)
      MaxDiameter: Number(request?.caseInfos?.maxDiameter || 0),
      ConnectionDiameter: Number(request?.caseInfos?.connectionDiameter || 0),
      TotalLength: Number(request?.caseInfos?.totalLength || 0),
      TaperAngle: Number(request?.caseInfos?.taperAngle || 0),
      TiltAxisVector: request?.caseInfos?.tiltAxisVector || null,
      FrontPoint: request?.caseInfos?.frontPoint || null,
      // One-Phase 제어 플래그 (2026-06-08): Two-Phase가 기본값, One-Phase는 명시적 요청
      OnePhase: Boolean(onePhase),
    };
    const headers = withEspritHeaders({ "Content-Type": "application/json" });
    console.log("[ESPRIT] POST / payload", {
      RequestId: payload.RequestId,
      MaxDiameter: payload.MaxDiameter,
      MaterialDiameter: payload.MaterialDiameter,
      MaterialDiameterGroup: payload.MaterialDiameterGroup,
      OnePhase: payload.OnePhase,
    });
    console.log("[ESPRIT] request headers", {
      url: espritUrl,
      headers: Object.keys(headers),
      hasXEspritSecret: !!headers["X-Esprit-Secret"],
      timeoutMs,
    });
    resp = await fetch(espritUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort =
      String(error?.name || "").trim() === "AbortError" ||
      /abort/i.test(String(error?.message || ""));
    const err = new Error(
      isAbort
        ? `Esprit 트리거 응답 대기시간(${timeoutMs}ms)을 초과했습니다. Esprit 서버 상태/네트워크를 확인해주세요.`
        : "Esprit 서버에 연결할 수 없습니다. Esprit 서버(8001)를 실행한 후 다시 시도해주세요.",
    );
    err.statusCode = 503;
    err.cause = error;
    console.warn("[ESPRIT] trigger request error", {
      requestId: request?.requestId,
      isAbort,
      timeoutMs,
      errorName: error?.name,
      errorMessage: error?.message,
    });
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

    const status = Number(resp?.status || 0);
    const message =
      status === 403
        ? "Esprit 서버에서 요청 IP를 차단했습니다. ESPRIT_ALLOW_IPS 설정을 확인해주세요."
        : status === 401
          ? "Esprit 서버 인증에 실패했습니다. ESPRIT_SHARED_SECRET 설정을 확인해주세요."
          : `Esprit 트리거 실패 (${resp?.status ?? "unknown"}): ${text}`.trim();

    const err = new Error(message);
    err.statusCode = 503;
    throw err;
  } else {
    console.log("[ESPRIT] trigger accepted", {
      requestId: request?.requestId,
      status: resp?.status,
    });
  }
}
