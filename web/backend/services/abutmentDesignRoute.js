// 커스텀어벗 가공 원본은 한 경로만 가진다.
// intake ptx: 기공의뢰. designRoute platform=치과 확정, lab=수행 기공소 수작업 STL.
// intake lab: 커스텀어벗 의뢰하기. designRoute direct.
// designRoute=lab 은 접수 이름 lab 이 아니다.
// 플랫폼 확정을 기공소 STL로 바꾸는 것은 explicitPlatformToLab 일 때만.
// 다른 경로의 파일을 같은 Request·같은 S3 키에 두지 않는다.
// related files:
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/services/abutmentStl/jsPrimary.service.js
import { randomBytes } from "crypto";
import { resolveFilledStlFile } from "../utils/filledStlFile.js";
import { addKoreanBusinessDays, toKstYmd } from "../utils/krBusinessDays.js";

function nextWeekdayYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  let cursor = new Date(Date.UTC(y, m - 1, d, 12));
  for (let i = 0; i < 7; i += 1) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getUTCDate()).padStart(2, "0");
    return `${cursor.getUTCFullYear()}-${mm}-${dd}`;
  }
  return "";
}

/** 확정 시각의 다음 영업일 끝(KST). 기공소 확인·의뢰자 취소는 여기까지다. */
export async function abutmentLabCheckDeadline(from = new Date()) {
  const ymd = toKstYmd(from);
  let nextYmd = "";
  if (ymd) {
    try {
      nextYmd = await addKoreanBusinessDays({ startYmd: ymd, days: 1 });
    } catch {
      nextYmd = "";
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nextYmd || ""))) {
    nextYmd = nextWeekdayYmd(ymd);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nextYmd || ""))) {
    throw new Error("abutment cancel deadline");
  }
  return new Date(`${nextYmd}T23:59:59.999+09:00`);
}

/** 확정(platform) 건의 취소가 이미 닫혔으면 안내 문구. 아니면 빈 문자열. */
export function abutmentCancelClosedMessage(production, now = new Date()) {
  if (String(production?.abutmentFeeRoute || "") !== "platform") return "";
  if (production?.labDesignConfirmedAt) {
    return "기공소가 확인한 뒤에는 취소할 수 없습니다.";
  }
  const raw = production?.abutmentCancelDeadlineAt;
  if (!raw) return "";
  const deadline = new Date(raw);
  if (!Number.isNaN(deadline.getTime()) && now.getTime() > deadline.getTime()) {
    return "확정 후 1영업일이 지나 취소할 수 없습니다.";
  }
  return "";
}

export const DESIGN_ROUTE_PLATFORM = "platform";
export const DESIGN_ROUTE_LAB = "lab";
export const DESIGN_ROUTE_DIRECT = "direct";

/** 접수. ptx=기공의뢰, lab=커스텀어벗 의뢰하기. designRoute 와 별개다. */
export const INTAKE_PTX = "ptx";
export const INTAKE_LAB = "lab";

const ROUTES = new Set([
  DESIGN_ROUTE_PLATFORM,
  DESIGN_ROUTE_LAB,
  DESIGN_ROUTE_DIRECT,
]);

export function isPlatformPreviewKey(s3Key) {
  return String(s3Key || "").includes("/custom-abutment-preview/");
}

export function isPlatformProductionKey(s3Key) {
  return String(s3Key || "").includes("/1-stl/platform/");
}

export function newDesignGeneration() {
  return randomBytes(6).toString("hex");
}

export function platformProductionKey(requestId, generation) {
  const id = String(requestId || "").trim();
  const gen = String(generation || "").trim();
  return `requests/${id}/1-stl/platform/${gen}.stl`;
}

export function filledStlS3Key(requestId, outName, generation) {
  const id = String(requestId || "").trim();
  const name = String(outName || "").trim();
  const gen = String(generation || "").trim();
  if (!gen) return `requests/${id}/2-filled/${name}`;
  return `requests/${id}/2-filled/${gen}/${name}`;
}

function explicitRoute(request) {
  const route = String(request?.caseInfos?.designRoute || "").trim();
  return ROUTES.has(route) ? route : "";
}

/** 저장된 접수. 없으면 PTX 연결·direct 경로로만 추정한다. */
export function resolveAbutmentIntake(request) {
  const explicit = String(request?.caseInfos?.intake || "").trim();
  if (explicit === INTAKE_PTX || explicit === INTAKE_LAB) return explicit;
  if (request?.partnerBilling?.relatedPracticeTransferId) return INTAKE_PTX;
  const route = explicitRoute(request);
  if (route === DESIGN_ROUTE_DIRECT) return INTAKE_LAB;
  if (route === DESIGN_ROUTE_PLATFORM || route === DESIGN_ROUTE_LAB) return INTAKE_PTX;
  return "";
}

/**
 * 저장된 경로. 없으면 완료된 파일로만 추정한다.
 * 디자인 파일이 없는 PTX 대기 건은 비어 있다.
 */
export function currentDesignRoute(request) {
  const explicit = explicitRoute(request);
  if (explicit) return explicit;
  if (request?.partnerBilling?.practiceConfirmedAiDesign === true) {
    return DESIGN_ROUTE_PLATFORM;
  }
  const completed = Boolean(request?.designCompletedAt);
  const fileKey = String(request?.caseInfos?.file?.s3Key || "").trim();
  if (!completed || !fileKey) return "";
  if (isPlatformPreviewKey(fileKey) || isPlatformProductionKey(fileKey)) {
    return DESIGN_ROUTE_PLATFORM;
  }
  if (request?.partnerBilling?.relatedPracticeTransferId) {
    return DESIGN_ROUTE_LAB;
  }
  return DESIGN_ROUTE_DIRECT;
}

/**
 * 다른 경로가 이미 가공 원본이면 빈 문자열이 아닌 거절 문구.
 * explicitPlatformToLab: 수행 기공소가 PTX 확정본을 수작업 STL로 바꾸겠다고 명시한 경우만 통과.
 */
export function designRouteBlockMessage(request, incoming, options = {}) {
  const next = String(incoming || "").trim();
  if (!ROUTES.has(next)) return "디자인 경로를 확인하지 못했습니다.";
  const current = currentDesignRoute(request);
  if (!current || current === next) return "";
  const explicitPlatformToLab = Boolean(options?.explicitPlatformToLab);
  if (
    explicitPlatformToLab &&
    next === DESIGN_ROUTE_LAB &&
    current === DESIGN_ROUTE_PLATFORM &&
    resolveAbutmentIntake(request) === INTAKE_PTX
  ) {
    return "";
  }
  if (next === DESIGN_ROUTE_PLATFORM && current === DESIGN_ROUTE_LAB) {
    return "기공소가 올린 디자인입니다. 플랫폼 디자인으로 바꾸지 않습니다.";
  }
  if (next === DESIGN_ROUTE_PLATFORM && current === DESIGN_ROUTE_DIRECT) {
    return "커스텀어벗 의뢰하기에서 접수된 건입니다. 플랫폼 디자인으로 바꾸지 않습니다.";
  }
  if (next === DESIGN_ROUTE_LAB && current === DESIGN_ROUTE_PLATFORM) {
    return "의뢰자가 확정한 디자인입니다. 수작업으로 다시 디자인할 때만 기공소 파일로 바꿉니다.";
  }
  if (next === DESIGN_ROUTE_LAB && current === DESIGN_ROUTE_DIRECT) {
    return "커스텀어벗 의뢰하기에서 접수된 건입니다. 기공소 파일로 바꾸지 않습니다.";
  }
  return "다른 경로의 디자인이 있어 파일을 바꾸지 않습니다.";
}

/** 구강스캔만 남긴다. 플랫폼 프리뷰·확정본·방금 교체된 어벗 STL은 빼다. */
export function oralSourcesOnly(rows, excludeKeys) {
  const exclude = excludeKeys instanceof Set ? excludeKeys : new Set(excludeKeys || []);
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.s3Key || "").trim();
    if (!key || exclude.has(key) || seen.has(key)) continue;
    if (isPlatformPreviewKey(key) || isPlatformProductionKey(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function bindMachiningSource(caseInfos, { route, sourceS3Key }) {
  if (!caseInfos || typeof caseInfos !== "object") return "";
  const generation = newDesignGeneration();
  caseInfos.designRoute = route;
  caseInfos.designGeneration = generation;
  caseInfos.machiningSourceS3Key = String(sourceS3Key || "").trim();
  return generation;
}

export function clearMachiningBind(request) {
  if (!request) return;
  if (!request.productionSchedule || typeof request.productionSchedule !== "object") {
    request.productionSchedule = {};
  }
  request.productionSchedule.ncBind = { generation: "", filledS3Key: "" };
  if (typeof request.markModified === "function") {
    request.markModified("productionSchedule");
  }
}

/** 커스텀어벗 의뢰하기 접수. PTX 연동 건은 여기서 경로를 정하지 않는다. */
export function stampDirectDesignRoute(request) {
  if (!request?.caseInfos) return;
  const mode = String(request.caseInfos.productMode || "").trim();
  if (mode !== "custom_abutment") return;
  if (request.partnerBilling?.relatedPracticeTransferId) {
    if (!request.caseInfos.intake) request.caseInfos.intake = INTAKE_PTX;
    return;
  }
  if (!request.caseInfos.intake) request.caseInfos.intake = INTAKE_LAB;
  if (explicitRoute(request)) return;
  request.caseInfos.designRoute = DESIGN_ROUTE_DIRECT;
  const sourceKey = String(request.caseInfos.file?.s3Key || "").trim();
  if (sourceKey && !String(request.caseInfos.designGeneration || "").trim()) {
    request.caseInfos.designGeneration = newDesignGeneration();
    request.caseInfos.machiningSourceS3Key = sourceKey;
  }
}

export function ncMatchesCurrentDesign(caseInfos) {
  const hasNc = Boolean(caseInfos?.ncFile?.s3Key || caseInfos?.ncFile?.filePath);
  if (!hasNc) return false;
  const gen = String(caseInfos?.designGeneration || "").trim();
  if (!gen) return true;
  if (String(caseInfos?.ncFile?.designGeneration || "").trim() !== gen) return false;
  const filledKey = String(resolveFilledStlFile(caseInfos)?.s3Key || "").trim();
  const ncFilled = String(caseInfos?.ncFile?.filledS3Key || "").trim();
  if (filledKey && ncFilled && ncFilled !== filledKey) return false;
  return true;
}

/** 세대가 있는 의뢰는 그 세대의 filled 콜백만 받는다. */
export function acceptFilledCallback(request, incomingGeneration) {
  const current = String(request?.caseInfos?.designGeneration || "").trim();
  if (!current) return true;
  return String(incomingGeneration || "").trim() === current;
}

/**
 * 세대가 있는 의뢰의 NC는, 그 세대의 filled를 보고 트리거한 작업만 저장한다.
 * 디자인 교체 뒤 도착한 이전 NC는 버린다.
 */
export function acceptNcCallback(request) {
  const gen = String(request?.caseInfos?.designGeneration || "").trim();
  if (!gen) return true;
  const bind = request?.productionSchedule?.ncBind;
  if (!bind || String(bind.generation || "").trim() !== gen) return false;
  const filledKey = String(resolveFilledStlFile(request?.caseInfos)?.s3Key || "").trim();
  if (!filledKey || String(bind.filledS3Key || "").trim() !== filledKey) return false;
  return true;
}
