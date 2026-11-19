// 치과 커스텀어벗 디자인 프리뷰의 AI 대화. 말로 받은 수정 요청을 디자인 조정값으로 바꿔 돌려준다.
// 형상은 프론트가 이 조정값으로 다시 만든다. 범위는 프론트 customAbutmentDesignParams.ts와 같아야 한다.
// 1회성이 아닌 요청(「항상」「우리는」, 치종 전반 규칙 등)은 의뢰 치과 사업자의 디자인 취향으로 저장해
// 다음 케이스 기본값으로 쓴다. 저장은 의뢰 치과 본인 계정의 대화만 한다.
// 비용: 「마진 0.5mm 얕게」처럼 정형 명령은 프론트(customAbutmentChatCommands.ts)가 AI 없이 처리하고,
// 취향 저장도 PUT으로 바로 한다. 여기는 해석이 필요한 말·그림만 오고 gemini-3.5-flash-lite + 짧은 프롬프트를 쓴다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/modules/ai/ai.routes.js
// - web/backend/models/businessAnchor.model.js (customAbutmentDesignPreference)
// - web/backend/services/aiDesignChatUsage.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import { getGenAI } from "../../services/businessLicenseOcr.service.js";
import { recordAiDesignChatUsage } from "../../services/aiDesignChatUsage.service.js";
import { quoteAiDesignChatUsage } from "../../services/aiDesignChatUsageCost.js";
import AiDesignGap from "../../models/aiDesignGap.model.js";
import {
  findAiDesignGap,
  recordAiDesignGap,
  setAiDesignGapChoice,
} from "../../services/aiDesignGap.service.js";
import { postPracticeTransferSystemChatMessage } from "../../services/chatSystemMessage.service.js";
import {
  claimAbutmentDesignHandoffLock,
  ensureAbutmentRequestsForHandoff,
  releaseAbutmentDesignHandoffLock,
  stampPracticeTransferFileBatch,
} from "../../services/practiceTransferProduction.service.js";
import { scheduleRequestReadyBadgeEmit } from "../../services/adminCommBadge.service.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import { clearFilledStlFileOnCaseInfos } from "../../utils/filledStlFile.js";
import { copyObjectInS3, getPresignedPutUrl, headObjectSizeInS3 } from "../../utils/s3.utils.js";
import {
  DESIGN_ROUTE_PLATFORM,
  abutmentLabCheckDeadline,
  clearMachiningBind,
  currentDesignRoute,
  designRouteBlockMessage,
  oralSourcesOnly,
  platformProductionKey,
  newDesignGeneration,
} from "../../services/abutmentDesignRoute.js";
import { syncPracticeTransferAbutmentFeeRoute } from "../../services/practiceTransferBilling.service.js";
import {
  quoteCustomAbutmentRouteFees,
  resolveLabFeeScheduleSource,
} from "../../utils/labFeeSchedule.js";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";
import {
  assertWorkFilePaintSize,
  sanitizeWorkFilePaintShapes,
  sanitizeWorkFilePaintView,
} from "../../utils/workFilePaint.js";
import { resolvePrcFileNames } from "../requests/prcMapping.utils.js";
import { ensureLotNumberOnReadyEnter } from "../requests/utils.js";
import { triggerRhinoProcessFileForRequest } from "../rhino/rhino.controller.js";

const MODEL = "gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS = 600;
const HISTORY_TURNS = 6;
/** AI에 넘기는 측정값. 나머지는 답에 쓰지 않아 토큰만 든다. */
const METRIC_KEYS = ["postHeightMm", "angulationDeg", "occlusalClearanceMm", "maxDiameterMm"];
/** 화면 그림(JPEG/PNG data URL) 최대 길이. 프론트는 긴 변 1024px JPEG로 보낸다. */
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const PARAM_SPECS = {
  occlusalClearanceMm: { label: "포스트 최정점 → 대합 거리(기본 1.5mm, 최소 0.7mm)", unit: "mm", min: 0.7, max: Infinity },
  postTaperDeg: { label: "포스트 축벽 편측 테이퍼(작은 면적 2°, 큰 면적·다지대치 브리지는 조금 더, 싱글 최대 3.8°·브리지 최대 4.2°)", unit: "°", min: 2, max: 4.2 },
  postTaperLink: { label: "포스트 높이·테이퍼 접착력 연결(1=연결, 0=해제)", unit: "", min: 0, max: 1 },
  postLingualBevelMm: { label: "전치부(절치·견치) 포스트 설측 사면 길이(절단에서 떨어진 거리, -1=자동, 0.5~11.5mm, 포스트 높이 미만)", unit: "mm", min: -1, max: 11.5 },
  postYawDeg: {
    label: "포스트 수평 회전 보정(교합면 시점 +=반시계, -=시계, 기본 0=악궁·중심구 평행)",
    unit: "°",
    min: -30,
    max: 30,
  },
  postHeightOffsetMm: {
    label: "포스트 높이 보정",
    unit: "mm",
    min: -6,
    max: 6,
  },
  postWidthScale: { label: "포스트 굵기 배율", unit: "배", min: 0.7, max: 1.3 },
  marginFilletRadiusMm: { label: "마진 챔퍼 R(0.1mm 단위, 최소 0.5, 기본 0.6)", unit: "mm", min: 0.5, max: 1.0 },
  marginShoulderMm: { label: "마진 챔퍼 폭(피니시라인에서 축벽까지, 구치 기본 0.5·전치 기본 0.4)", unit: "mm", min: 0.2, max: 0.9 },
  marginDepthMm: { label: "피니시라인 치은 하방 깊이(협·설 기준, 치은 연하 얕은 끝)", unit: "mm", min: -2.5, max: 2.5 },
  marginSubgMinMm: { label: "치은 연하 마진 얕은 끝(기본 0.5, 음수는 치은 연상)", unit: "mm", min: -2.5, max: 2.5 },
  marginSubgMaxMm: { label: "치은 연하 마진 깊은 끝(기본 1.0, 음수는 치은 연상)", unit: "mm", min: -2.5, max: 2.5 },
  marginScallopMm: { label: "근·원심 마진 스캘럽(치관측 상승·치은 라인 추종, 전치 기본 0.75·구치 기본 0.55)", unit: "mm", min: 0, max: 1.6 },
  marginSizeScale: { label: "마진 단면 크기 배율", unit: "배", min: 0.7, max: 1.4 },
  crownContactMm: { label: "예측 크라운 접촉량", unit: "mm", min: 0, max: 0.2 },
  minCrownThicknessMm: { label: "크라운 두께(포스트 컷백, 기본 1.0, 공간 없으면 0.7까지 자동)", unit: "mm", min: 0.7, max: 2.5 },
  axisToOpposing: { label: "삽입축 대합치 중심 반영(0=악궁 교합 방향, 1=대합치 중심)", unit: "", min: 0, max: 1 },
  axisMaxDeg: { label: "픽스쳐 장축 대비 삽입축 최대 각도", unit: "°", min: 0, max: 32 },
  axisTargetDeg: { label: "삽입축 각도(-1=자동)", unit: "°", min: -1, max: 32 },
  axisSourceCode: { label: "삽입축 기준(-1=자동, 0=악궁, 1=대합치, 2=인접 평행)", unit: "", min: -1, max: 2 },
  axisShiftLabialMm: { label: "포스트 윗면 순측(+)/설측(-) 이동", unit: "mm", min: -2, max: 2 },
  axisShiftMesialMm: { label: "포스트 윗면 근심(+)/원심(-) 이동", unit: "mm", min: -2, max: 2 },
};

const PARAM_KEYS = Object.keys(PARAM_SPECS);
/** 케이스마다 다른 윗면 이동·수평 회전·연결 토글은 취향으로 저장하지 않는다. */
const PREFERENCE_KEYS = PARAM_KEYS.filter(
  (k) =>
    k !== "axisShiftLabialMm" &&
    k !== "axisShiftMesialMm" &&
    k !== "postYawDeg" &&
    k !== "postTaperLink",
);
const SCOPES = ["all", "anterior", "posterior"];
const TOOTH_RE = /^[1-4][1-8]$/;
const MAX_NOTES = 20;

const toFiniteOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clampParam = (key, v) => {
  const spec = PARAM_SPECS[key];
  if (key === "postLingualBevelMm") {
    if (v < 0) return -1;
    return Math.round(Math.min(spec.max, Math.max(0.5, v)) * 10) / 10;
  }
  const clamped = Math.min(spec.max, Math.max(spec.min, v));
  if (key === "marginFilletRadiusMm") return Math.round(clamped * 10) / 10;
  if (key === "postTaperLink") return clamped >= 0.5 ? 1 : 0;
  return clamped;
};

function sanitizeParamMap(raw, keys) {
  const out = {};
  for (const key of keys) {
    const v = toFiniteOrNull(raw?.[key]);
    if (v != null) out[key] = clampParam(key, v);
  }
  return out;
}

function sanitizeTeeth(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, 16)) {
    const toothNumber = String(row?.toothNumber || "").trim();
    if (!TOOTH_RE.test(toothNumber)) continue;
    const params = {};
    for (const key of PARAM_KEYS) {
      const v = toFiniteOrNull(row?.params?.[key]);
      if (v != null) params[key] = Math.round(v * 100) / 100;
    }
    const metrics = {};
    for (const key of METRIC_KEYS) {
      const value = row?.metrics?.[key];
      if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
    }
    out.push({ toothNumber, params, metrics });
  }
  return out;
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-HISTORY_TURNS)
    .map((row) => ({
      role: row?.role === "assistant" ? "assistant" : "user",
      text: String(row?.text || "").trim().slice(0, 300),
    }))
    .filter((row) => row.text);
}

const SNAPSHOT_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SNAPSHOT_B64_MAX = 4_000_000;

function snapshotBuffer(raw) {
  const text = String(raw || "");
  if (!text || text.length > SNAPSHOT_B64_MAX || !SNAPSHOT_B64_RE.test(text)) return "";
  return text;
}

function snapshotChat(raw) {
  if (!Array.isArray(raw)) return [];
  const turns = [];
  for (const row of raw.slice(-40)) {
    const role = row?.role === "assistant" ? "assistant" : row?.role === "user" ? "user" : "";
    const text = String(row?.text || "").trim().slice(0, 2000);
    if (!role || !text) continue;
    const turn = { role, text };
    const offer = row?.offer;
    if (offer && offer.kind === "manual-design") {
      const gapId = String(offer.gapId || "").trim();
      if (gapId) {
        const choice = offer.choice === "yes" || offer.choice === "no" ? offer.choice : undefined;
        turn.offer = choice
          ? { kind: "manual-design", gapId, choice }
          : { kind: "manual-design", gapId };
      }
    }
    turns.push(turn);
  }
  return turns;
}

const PREVIEW_STL_MAX = 32 * 1024 * 1024;
const MARGIN_B64_MAX = 400_000;

function previewStlKey(transferId, toothNumber, kind) {
  return `practice-transfers/${transferId}/custom-abutment-preview/${toothNumber}-${kind}.stl`;
}

function snapshotMargin(raw) {
  const text = String(raw || "");
  if (!text || text.length > MARGIN_B64_MAX || !SNAPSHOT_B64_RE.test(text)) return "";
  return text;
}

function snapshotTeeth(raw, transferId) {
  if (!Array.isArray(raw) || !transferId) return [];
  const teeth = [];
  for (const row of raw.slice(0, 16)) {
    const toothNumber = String(row?.toothNumber || "").trim();
    if (!TOOTH_RE.test(toothNumber)) continue;
    const fixture = row?.fixture && typeof row.fixture === "object" ? row.fixture : null;
    if (!fixture) continue;
    const base = {
      toothNumber,
      fileName: String(row?.fileName || "").trim().slice(0, 180),
      fixture,
      overrides: row?.overrides && typeof row.overrides === "object" ? row.overrides : {},
      params: row?.params && typeof row.params === "object" ? row.params : {},
      metrics: row?.metrics && typeof row.metrics === "object" ? row.metrics : {},
      ...(row?.gumballEdit && typeof row.gumballEdit === "object"
        ? { gumballEdit: row.gumballEdit }
        : {}),
      ...(row?.gumballBaseParams && typeof row.gumballBaseParams === "object"
        ? { gumballBaseParams: row.gumballBaseParams }
        : {}),
      ...(row?.gumballBaseMetrics && typeof row.gumballBaseMetrics === "object"
        ? { gumballBaseMetrics: row.gumballBaseMetrics }
        : {}),
    };
    const s3Key = String(row?.s3Key || "").trim();
    const crownS3Key = String(row?.crownS3Key || "").trim();
    if (s3Key === previewStlKey(transferId, toothNumber, "abutment")) {
      const enameloplastyLocal = snapshotMargin(row?.enameloplastyLocal);
      teeth.push({
        ...base,
        s3Key,
        crownS3Key: crownS3Key === previewStlKey(transferId, toothNumber, "crown") ? crownS3Key : "",
        size: Number(row?.size) || 0,
        marginLoopLocal: snapshotMargin(row?.marginLoopLocal),
        ...(enameloplastyLocal ? { enameloplastyLocal } : {}),
      });
      continue;
    }
    const localPositions = snapshotBuffer(row?.localPositions);
    const crownLocalPositions = snapshotBuffer(row?.crownLocalPositions);
    const marginLoopLocal = snapshotBuffer(row?.marginLoopLocal);
    const enameloplastyLocal = snapshotMargin(row?.enameloplastyLocal);
    if (!localPositions || !crownLocalPositions || !marginLoopLocal) continue;
    teeth.push({
      ...base,
      localPositions,
      crownLocalPositions,
      marginLoopLocal,
      ...(enameloplastyLocal ? { enameloplastyLocal } : {}),
    });
  }
  return teeth;
}

function gapChatTurns(rows) {
  const turns = [];
  for (const row of rows) {
    const message = String(row?.message || "").trim();
    const reply = String(row?.reply || "").trim();
    const gapId = row?._id ? String(row._id) : "";
    const choice = row?.manualChoice === "yes" || row?.manualChoice === "no" ? row.manualChoice : undefined;
    if (message) turns.push({ role: "user", text: message });
    if (reply) {
      const turn = { role: "assistant", text: reply };
      if (gapId) {
        turn.offer = choice
          ? { kind: "manual-design", gapId, choice }
          : { kind: "manual-design", gapId };
      }
      turns.push(turn);
    }
  }
  return turns;
}

function sanitizeImage(raw) {
  const s = String(raw || "");
  if (!s || s.length > MAX_IMAGE_CHARS) return null;
  const m = IMAGE_RE.exec(s);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

function parseJsonObject(text) {
  let s = String(text || "").trim();
  if (s.startsWith("```")) {
    const first = s.indexOf("\n");
    const last = s.lastIndexOf("```");
    if (first !== -1 && last > first) s = s.slice(first + 1, last).trim();
  }
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a === -1 || b <= a) return null;
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/** AI가 고른 값만 남기고 범위 안으로 자른다. 대상 치아가 아니면 버린다. */
function sanitizeChanges(raw, teeth) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(teeth.map((t) => t.toothNumber));
  const out = [];
  for (const row of raw.slice(0, 16)) {
    const tooth = String(row?.toothNumber || "").trim();
    const targets = tooth === "all" ? [...allowed] : allowed.has(tooth) ? [tooth] : [];
    if (targets.length === 0) continue;
    const params = sanitizeParamMap(row?.params, PARAM_KEYS);
    if (Object.keys(params).length === 0) continue;
    for (const t of targets) out.push({ toothNumber: t, params });
  }
  return out;
}

function sanitizePreferenceUpdate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scope = SCOPES.includes(raw.scope) ? raw.scope : "all";
  const params = sanitizeParamMap(raw.params, PREFERENCE_KEYS);
  if (Object.keys(params).length === 0) return null;
  const note = String(raw.note || "").trim().slice(0, 120);
  return { scope, params, note };
}

function preferenceView(stored) {
  const scopes = {};
  for (const scope of SCOPES) {
    const values = sanitizeParamMap(stored?.scopes?.[scope], PREFERENCE_KEYS);
    if (Object.keys(values).length > 0) scopes[scope] = values;
  }
  return {
    scopes,
    notes: Array.isArray(stored?.notes) ? stored.notes.slice(-MAX_NOTES) : [],
    updatedAt: stored?.updatedAt ?? null,
  };
}

/**
 * 취향을 둘 치과 사업자. 의뢰(transferId)가 있으면 그 의뢰의 치과, 없으면 로그인 사업자.
 * canSave: 의뢰 치과 본인 계정일 때만 대화 내용을 취향으로 저장한다(기공소 대화는 읽기만).
 */
async function findTransferForDesignChat(raw) {
  const id = String(raw || "").trim();
  if (!id) return null;
  const select = {
    transferId: 1,
    practiceBusinessAnchorId: 1,
    targetLabAnchorId: 1,
    assigneeLabAnchorId: 1,
  };
  if (Types.ObjectId.isValid(id)) {
    const byId = await PracticeTransfer.findById(id).select(select).lean();
    if (byId?.practiceBusinessAnchorId) return byId;
  }
  return PracticeTransfer.findOne({ transferId: id }).select(select).lean();
}

async function resolvePreferenceAnchor(req, rawTransferId) {
  const own = String(req.user?.businessAnchorId || "").trim();
  const transferId = String(rawTransferId || "").trim();
  const t = await findTransferForDesignChat(transferId);
  if (t?.practiceBusinessAnchorId) {
    const practiceId = String(t.practiceBusinessAnchorId);
    const parties = [practiceId, String(t.targetLabAnchorId || ""), String(t.assigneeLabAnchorId || "")];
    const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
    if (parties.includes(own) || privileged) {
      const labIds = [String(t.targetLabAnchorId || ""), String(t.assigneeLabAnchorId || "")].filter(
        Boolean,
      );
      return {
        anchorId: practiceId,
        canSave: own === practiceId,
        canEditShared: labIds.includes(own),
        transferId: String(t.transferId || transferId),
      };
    }
  }
  if (Types.ObjectId.isValid(own)) return { anchorId: own, canSave: true, canEditShared: false, transferId };
  return { anchorId: null, canSave: false, canEditShared: false, transferId };
}

async function loadPreference(anchorId) {
  if (!anchorId) return preferenceView(null);
  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ customAbutmentDesignPreference: 1 })
    .lean();
  return preferenceView(anchor?.customAbutmentDesignPreference);
}

async function savePreferenceUpdate(anchorId, update) {
  const set = { "customAbutmentDesignPreference.updatedAt": new Date() };
  const unset = {};
  for (const [key, value] of Object.entries(update.params)) {
    set[`customAbutmentDesignPreference.scopes.${update.scope}.${key}`] = value;
    // 전체에 정한 값은 전치·구치 개별 값보다 나중 말이므로 개별 값을 지운다.
    if (update.scope === "all") {
      unset[`customAbutmentDesignPreference.scopes.anterior.${key}`] = "";
      unset[`customAbutmentDesignPreference.scopes.posterior.${key}`] = "";
    }
  }
  const ops = { $set: set };
  if (Object.keys(unset).length > 0) ops.$unset = unset;
  await BusinessAnchor.updateOne({ _id: anchorId }, ops);
  if (update.note) {
    await BusinessAnchor.updateOne(
      { _id: anchorId },
      {
        $push: {
          "customAbutmentDesignPreference.notes": { $each: [update.note], $slice: -MAX_NOTES },
        },
      },
    );
  }
  return loadPreference(anchorId);
}

function isUnsupportedDesignRequest(parsed, changes, reply) {
  if (changes.length > 0) return false;
  if (parsed?.unsupported === true) return true;
  return /지원하지 않|조정값만 변경|조정값만 바꿀|바꿀 수 없|변경할 수 없/.test(String(reply || ""));
}

function buildPrompt({ message, history, teeth, selectedTooth, preference, hasImage }) {
  const specLines = PARAM_KEYS.map((key) => {
    const s = PARAM_SPECS[key];
    const rangeLabel = Number.isFinite(s.max) ? `${s.min}~${s.max}${s.unit}` : `${s.min}${s.unit} 이상`;
    return `${key}: ${s.label} ${rangeLabel}`;
  }).join("\n");
  return (
    "커스텀어벗 디자인 조정값만 바꾸는 도우미. 조정값 밖 요청(재질·색·납기)은 못 한다고 짧게 답한다.\n" +
    "조정값:\n" +
    specLines +
    "\n규칙:\n" +
    "- 치아를 안 말하면 selectedTooth, 없으면 toothNumber \"all\".\n" +
    "- 「조금」 범위 10~15%, 「많이」 25~35%. 숫자가 있으면 그 값.\n" +
    "- 포스트 낮춰=postHeightOffsetMm 음수. 얇게=postWidthScale↓. 더 수직=postTaperDeg↓. 전치부 설측 사면 길이(절단에서 떨어진 거리)=postLingualBevelMm(0.5~11.5mm, 포스트 높이 미만, -1=자동). 포스트 회전/돌려=postYawDeg(교합면 시점 반시계 +, 시계 -, 그림 선이 있으면 현재 포스트에서 목표 선까지 각도만큼 보정).\n" +
    "- 마진 깊게/치은 하방=marginDepthMm(얕은 끝). 치은 연하 구간=marginSubgMinMm~marginSubgMaxMm(기본 0.5~1.0). 근원심 마진 치관쪽 상승·스캘럽(scallop)·치은 라인 추종=marginScallopMm↑(평평·완만=↓). 마진 넓게/좁게=marginShoulderMm.\n" +
    "- 질문이거나 바꿀 게 없으면 changes [].\n" +
    "- 조정값으로 바꿀 수 없는 요청이면 unsupported true와 changes []. 질문·이미 그 값이면 unsupported false.\n" +
    (hasImage
      ? "- 첨부 그림은 현재 화면에 사용자가 빨간 펜으로 표시한 것이다. 표시 위치와 #번호 라벨로 치아·부위를 읽는다.\n"
      : "") +
    "- 앞으로도 적용할 규칙(「항상」「앞으로」「우리 치과는」, 번호 없는 수치, 전치/구치 전반)이면 preference," +
    " 1회성(상대 수정·특정 치아·「이번만」)이면 null.\n" +
    "- preference.params는 절대값, scope는 all|anterior|posterior, note는 30자 안 한 문장. 지금 케이스 changes에도 넣는다.\n" +
    "- reply 한국어 1~2문장.\n" +
    'JSON만: {"reply":string,"unsupported":boolean,"changes":[{"toothNumber":string,"params":{}}],' +
    '"preference":null|{"scope":string,"params":{},"note":string}}\n' +
    "취향:" +
    JSON.stringify(preference.scopes) +
    "\n디자인:" +
    JSON.stringify({ selectedTooth: selectedTooth || null, teeth }) +
    "\n기록:" +
    JSON.stringify(history) +
    "\n요청:" +
    message
  );
}

/**
 * @route GET /api/ai/custom-abutment-design-preference?transferId=
 */
export async function getCustomAbutmentDesignPreference(req, res) {
  try {
    const { anchorId, canSave } = await resolvePreferenceAnchor(req, req.query?.transferId);
    const preference = await loadPreference(anchorId);
    return res.json({ success: true, data: { preference, canSave } });
  } catch (error) {
    console.error("[AI] getCustomAbutmentDesignPreference error", error);
    return res.status(500).json({ success: false, message: "디자인 취향을 불러오지 못했습니다." });
  }
}

/**
 * 프론트가 AI 없이 알아들은 「앞으로 …」 규칙을 바로 저장한다.
 * @route PUT /api/ai/custom-abutment-design-preference
 * body: { transferId?, scope, params, note }
 */
export async function saveCustomAbutmentDesignPreference(req, res) {
  try {
    const update = sanitizePreferenceUpdate(req.body);
    if (!update) {
      return res.status(400).json({ success: false, message: "저장할 값이 없습니다." });
    }
    const { anchorId, canSave } = await resolvePreferenceAnchor(req, req.body?.transferId);
    if (!anchorId || !canSave) {
      return res.status(403).json({ success: false, message: "의뢰 치과만 저장할 수 있습니다." });
    }
    const preference = await savePreferenceUpdate(anchorId, update);
    return res.json({ success: true, data: { preference, preferenceSaved: update, canSave } });
  } catch (error) {
    console.error("[AI] saveCustomAbutmentDesignPreference error", error);
    return res.status(500).json({ success: false, message: "디자인 취향을 저장하지 못했습니다." });
  }
}

/**
 * @route DELETE /api/ai/custom-abutment-design-preference?transferId=
 */
export async function clearCustomAbutmentDesignPreference(req, res) {
  try {
    const { anchorId, canSave } = await resolvePreferenceAnchor(req, req.query?.transferId);
    if (!anchorId || !canSave) {
      return res.status(403).json({ success: false, message: "의뢰 치과만 지울 수 있습니다." });
    }
    await BusinessAnchor.updateOne(
      { _id: anchorId },
      { $unset: { customAbutmentDesignPreference: "" } },
    );
    return res.json({ success: true, data: { preference: preferenceView(null), canSave } });
  } catch (error) {
    console.error("[AI] clearCustomAbutmentDesignPreference error", error);
    return res.status(500).json({ success: false, message: "디자인 취향을 지우지 못했습니다." });
  }
}

/**
 * @route POST /api/ai/custom-abutment-design-chat
 * body: { message, history?, teeth: [{ toothNumber, params, metrics }], selectedTooth?, transferId?, image? }
 * image: 화면 + 사용자가 그린 표시(data URL). 있으면 같이 본다.
 */
/**
 * 어벗 STL을 S3에 올리기 위한 주소. 키는 서버가 정한다.
 * @route POST /api/ai/custom-abutment-design-snapshot/file
 */
export async function presignCustomAbutmentDesignSnapshot(req, res) {
  try {
    const { canSave, canEditShared, transferId } = await resolvePreferenceAnchor(req, req.body?.transferId);
    if (!transferId || (!canSave && !canEditShared)) {
      return res.status(403).json({ success: false, message: "이 디자인을 저장할 수 없습니다." });
    }
    const toothNumber = String(req.body?.toothNumber || "").trim();
    const kind = req.body?.kind === "crown" ? "crown" : req.body?.kind === "abutment" ? "abutment" : "";
    const size = Math.floor(Number(req.body?.size) || 0);
    if (!TOOTH_RE.test(toothNumber) || !kind || size < 84 || size > PREVIEW_STL_MAX) {
      return res.status(400).json({ success: false, message: "올릴 STL을 확인해 주세요." });
    }
    const s3Key = previewStlKey(transferId, toothNumber, kind);
    const signed = await getPresignedPutUrl(s3Key, "model/stl", 900);
    return res.json({ success: true, data: { uploadUrl: signed.url, s3Key } });
  } catch (error) {
    console.error("[AI] presignCustomAbutmentDesignSnapshot error", error);
    return res.status(500).json({ success: false, message: "STL 업로드 주소를 만들지 못했습니다." });
  }
}

/**
 * 의뢰자에 저장된 커스텀어벗 형상·대화.
 * 형상 파일은 S3, 여기에는 키·위치·대화만 있다.
 * @route GET /api/ai/custom-abutment-design-snapshot?transferId=
 */
export async function getCustomAbutmentDesignSnapshot(req, res) {
  try {
    const { anchorId, transferId } = await resolvePreferenceAnchor(req, req.query?.transferId);
    if (!transferId) {
      return res.status(400).json({ success: false, message: "의뢰를 확인해 주세요." });
    }
    if (!anchorId && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "이 의뢰를 볼 수 없습니다." });
    }
    const transfer = await PracticeTransfer.findOne({ transferId })
      .select({
        "production.customAbutmentPreview": 1,
        "production.customAbutmentManualDesign": 1,
        "production.practiceDesignConfirmedAt": 1,
        "production.abutmentFeeRoute": 1,
        "production.abutmentCancelDeadlineAt": 1,
        "production.labDesignConfirmedAt": 1,
        toothWorks: 1,
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
        "billing.lines": 1,
      })
      .lean();
    const stored = transfer?.production?.customAbutmentPreview;
    const manualDesign = transfer?.production?.customAbutmentManualDesign || null;
    const gaps = await AiDesignGap.find({ transferId })
      .sort({ createdAt: 1 })
      .select({ message: 1, reply: 1, manualChoice: 1 })
      .lean();
    const fromGaps = gapChatTurns(gaps);
    const storedChat = snapshotChat(stored?.chat);
    const chat = storedChat.length >= fromGaps.length ? storedChat : fromGaps;
    const teeth = snapshotTeeth(stored?.teeth, transferId);
    const rawPaint = stored?.paint && typeof stored.paint === "object" ? stored.paint : null;
    const paint = rawPaint
      ? {
          shapes: sanitizeWorkFilePaintShapes(rawPaint.shapes),
          view: sanitizeWorkFilePaintView(rawPaint.view),
          updatedAt: rawPaint.updatedAt || null,
          updatedSide: rawPaint.updatedSide || null,
        }
      : null;
    const mode = stored?.confirmedAt
      ? "confirmed"
      : manualDesign
        ? "manual"
        : null;
    const design =
      teeth.length > 0
        ? {
            version: Number(stored?.version) || 0,
            fitVersion: Number(stored?.fitVersion) || 0,
            savedAt: Number(stored?.savedAt) || 0,
            chat,
            teeth,
          }
        : null;
    const billedLines = Array.isArray(transfer?.billing?.lines) ? transfer.billing.lines : [];
    const lineTeeth = billedLines
      .filter((line) => Math.round(Number(line?.labAbutmentFee || 0)) > 0)
      .map((line) => ({
        toothNumber: String(line?.toothNumber || "").trim(),
        feeName: String(line?.prosthesisType || "").trim(),
        unit: Math.round(Number(line.labAbutmentFee || 0)),
      }))
      .filter((line) => /^[1-4][1-8]$/.test(line.toothNumber));
    let feeGuide = null;
    if (lineTeeth.length > 0) {
      feeGuide = {
        platformUnit: quoteCustomAbutmentRouteFees({ toothWorks: [] }).platformUnit,
        labTeeth: lineTeeth,
      };
    } else {
      const labId = String(transfer?.assigneeLabAnchorId || transfer?.targetLabAnchorId || "").trim();
      let schedule = null;
      if (labId && Types.ObjectId.isValid(labId)) {
        const lab = await BusinessAnchor.findById(labId).select({ labFeeSchedule: 1 }).lean();
        if (lab?.labFeeSchedule) schedule = resolveLabFeeScheduleSource(lab.labFeeSchedule);
      }
      feeGuide = schedule
        ? quoteCustomAbutmentRouteFees({
            toothWorks: transfer?.toothWorks,
            labFeeSchedule: schedule,
          })
        : quoteCustomAbutmentRouteFees({ toothWorks: [] });
    }
    const choice = {
      cancelDeadlineAt: transfer?.production?.abutmentCancelDeadlineAt || null,
      labCheckedAt: transfer?.production?.labDesignConfirmedAt || null,
    };
    return res.json({
      success: true,
      data: { design, chat, paint, mode, manualDesign, feeGuide, choice },
    });
  } catch (error) {
    console.error("[AI] getCustomAbutmentDesignSnapshot error", error);
    return res.status(500).json({ success: false, message: "저장된 디자인을 불러오지 못했습니다." });
  }
}

/**
 * 의뢰자 프리뷰 저장. 치과 본인만 쓴다.
 * @route PUT /api/ai/custom-abutment-design-snapshot
 */
export async function saveCustomAbutmentDesignSnapshot(req, res) {
  try {
    const { anchorId, canSave, canEditShared, transferId } = await resolvePreferenceAnchor(
      req,
      req.body?.transferId,
    );
    if (!transferId || !anchorId || (!canSave && !canEditShared)) {
      return res.status(403).json({ success: false, message: "이 디자인을 저장할 수 없습니다." });
    }
    const chat = snapshotChat(req.body?.chat);
    const incoming = snapshotTeeth(req.body?.teeth, transferId);
    const validated = await Promise.all(
      incoming.map(async (row) => {
        if (!row.s3Key) return row;
        const size = await headObjectSizeInS3(row.s3Key);
        if (!size || size > PREVIEW_STL_MAX) return null;
        let crownS3Key = "";
        if (row.crownS3Key) {
          const crownSize = await headObjectSizeInS3(row.crownS3Key);
          if (crownSize && crownSize <= PREVIEW_STL_MAX) crownS3Key = row.crownS3Key;
        }
        return { ...row, size, crownS3Key };
      }),
    );
    const teeth = validated.filter(Boolean);
    const transfer = await PracticeTransfer.findOne({ transferId })
      .select({ "production.customAbutmentPreview": 1 })
      .lean();
    const prev = transfer?.production?.customAbutmentPreview || {};
    const next = {
      ...prev,
      savedAt: Date.now(),
      chat: chat.length > 0 ? chat : snapshotChat(prev.chat),
    };
    if (req.body?.paint && typeof req.body.paint === "object") {
      const shapes = sanitizeWorkFilePaintShapes(req.body.paint.shapes);
      const view = sanitizeWorkFilePaintView(req.body.paint.view);
      assertWorkFilePaintSize({ shapes, view });
      next.paint = {
        shapes,
        view: view || null,
        updatedAt: new Date(),
        updatedBy: req.user?._id || null,
        updatedSide: "practice",
      };
    }
    if (teeth.length > 0) {
      next.version = Number(req.body?.version) || 0;
      next.fitVersion = Number(req.body?.fitVersion) || 0;
      next.teeth = teeth;
    }
    await PracticeTransfer.updateOne(
      { transferId },
      { $set: { "production.customAbutmentPreview": next } },
    );
    return res.json({ success: true, data: { saved: true } });
  } catch (error) {
    console.error("[AI] saveCustomAbutmentDesignSnapshot error", error);
    return res.status(500).json({ success: false, message: "디자인을 저장하지 못했습니다." });
  }
}

async function emitCustomAbutmentTransferEvent(transferDoc, action) {
  if (!transferDoc?._id) return;
  const anchorIds = [
    String(transferDoc.practiceBusinessAnchorId || "").trim(),
    String(transferDoc.targetLabAnchorId || "").trim(),
    String(transferDoc.assigneeLabAnchorId || "").trim(),
  ].filter((id) => Types.ObjectId.isValid(id));
  const userIdSet = new Set();
  if (transferDoc.practiceUserId && Types.ObjectId.isValid(String(transferDoc.practiceUserId))) {
    userIdSet.add(String(transferDoc.practiceUserId));
  }
  if (anchorIds.length > 0) {
    const peers = await User.find({
      businessAnchorId: { $in: anchorIds.map((id) => new Types.ObjectId(id)) },
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    for (const peer of peers) {
      if (peer?._id) userIdSet.add(String(peer._id));
    }
  }
  const payload = {
    action,
    transferId: String(transferDoc.transferId || "").trim(),
    transferMongoId: String(transferDoc._id),
    updatedAt: new Date(),
  };
  for (const uid of userIdSet) {
    emitAppEventToUser(uid, "practice:transfer-updated", payload);
  }
}

/**
 * 커스텀어벗 디자인 뷰어 3D 페인트 저장(치과·기공소 공유).
 * @route PUT /api/ai/custom-abutment-design-paint
 * body: { transferId, shapes, view? }
 */
export async function saveCustomAbutmentDesignPaint(req, res) {
  try {
    const { anchorId, canSave, transferId } = await resolvePreferenceAnchor(req, req.body?.transferId);
    const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
    if (!transferId || (!anchorId && !privileged)) {
      return res.status(403).json({ success: false, message: "이 의뢰에 표시를 남길 수 없습니다." });
    }
    const shapes = sanitizeWorkFilePaintShapes(req.body?.shapes);
    const view = sanitizeWorkFilePaintView(req.body?.view);
    try {
      assertWorkFilePaintSize({ shapes, view });
    } catch (err) {
      if (err?.code === "too_large") {
        return res.status(413).json({ success: false, message: err.message });
      }
      throw err;
    }
    const side = canSave ? "practice" : "lab";
    const paint = {
      shapes,
      view: view || null,
      updatedAt: new Date(),
      updatedBy: req.user?._id || null,
      updatedSide: side,
    };
    const transferDoc = await PracticeTransfer.findOneAndUpdate(
      { transferId },
      { $set: { "production.customAbutmentPreview.paint": paint } },
      {
        new: true,
        projection: {
          transferId: 1,
          practiceUserId: 1,
          practiceBusinessAnchorId: 1,
          targetLabAnchorId: 1,
          assigneeLabAnchorId: 1,
        },
      },
    ).lean();
    res.json({ success: true, data: { paint } });
    void (async () => {
      if (!transferDoc?._id) return;
      const anchorIds = [
        String(transferDoc.practiceBusinessAnchorId || "").trim(),
        String(transferDoc.targetLabAnchorId || "").trim(),
        String(transferDoc.assigneeLabAnchorId || "").trim(),
      ].filter((id) => Types.ObjectId.isValid(id));
      const userIdSet = new Set();
      if (
        transferDoc.practiceUserId &&
        Types.ObjectId.isValid(String(transferDoc.practiceUserId))
      ) {
        userIdSet.add(String(transferDoc.practiceUserId));
      }
      if (anchorIds.length > 0) {
        const peers = await User.find({
          businessAnchorId: { $in: anchorIds.map((id) => new Types.ObjectId(id)) },
          active: true,
        })
          .select({ _id: 1 })
          .lean();
        for (const peer of peers) {
          if (peer?._id) userIdSet.add(String(peer._id));
        }
      }
      const payload = {
        transferId: String(transferDoc.transferId || "").trim(),
        shapes,
        view: view || null,
        updatedBy: req.user?._id ? String(req.user._id) : "",
        updatedSide: side,
      };
      for (const uid of userIdSet) {
        emitAppEventToUser(uid, "practice:custom-abutment-paint", payload);
      }
    })().catch((err) => console.warn("[AI] paint event emit failed", err));
  } catch (error) {
    console.error("[AI] saveCustomAbutmentDesignPaint error", error);
    return res.status(500).json({ success: false, message: "페인트 표시를 저장하지 못했습니다." });
  }
}

function buildConfirmedRhinoFileName(requestDoc) {
  const requestId = String(requestDoc?.requestId || "").trim();
  const ci = requestDoc?.caseInfos || {};
  const original = String(ci?.file?.filePath || ci?.file?.originalName || "").trim();
  const ext = original.includes(".")
    ? `.${original.split(".").pop()?.toLowerCase() || "stl"}`
    : ".stl";
  if (!requestId) return original || "";
  return `${requestId}-${String(ci.clinicName || "").trim()}-${String(ci.patientName || "").trim()}-${String(ci.tooth || "").trim()}${ext}`;
}

/**
 * 치과 「확정 & 의뢰」: 현재 커스텀어벗 디자인 STL을 확정하여
 * 제조사 준비 큐(Request)를 즉시 등록하고 기공소 PTX(designFiles)에 미러한다.
 * (과금/정산 hold는 유예)
 * @route POST /api/ai/custom-abutment-design-confirm
 */
export async function confirmCustomAbutmentDesign(req, res) {
  try {
    const { anchorId, canSave, canEditShared, transferId } = await resolvePreferenceAnchor(
      req,
      req.body?.transferId,
    );
    const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
    const labRevision = Boolean(canEditShared) && !canSave && !privileged;
    if (!transferId || (!canSave && !privileged && !labRevision) || !anchorId) {
      return res.status(403).json({ success: false, message: "의뢰 치과만 확정할 수 있습니다." });
    }
    const userId = String(req.user?._id || "").trim();
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const incoming = snapshotTeeth(req.body?.teeth, transferId);
    if (incoming.length === 0) {
      return res.status(400).json({ success: false, message: "확정할 커스텀어벗 디자인이 없습니다." });
    }

    const checkedTeeth = await Promise.all(
      incoming.map(async (row) => {
        if (!row.s3Key) return null;
        const size = await headObjectSizeInS3(row.s3Key);
        if (!size || size > PREVIEW_STL_MAX) return null;
        let crownS3Key = "";
        if (row.crownS3Key) {
          const crownSize = await headObjectSizeInS3(row.crownS3Key);
          if (crownSize && crownSize <= PREVIEW_STL_MAX) crownS3Key = row.crownS3Key;
        }
        return { ...row, size, crownS3Key };
      }),
    );
    const validTeeth = checkedTeeth.filter(Boolean);
    if (validTeeth.length === 0) {
      return res.status(400).json({
        success: false,
        message: "커스텀어벗 STL 파일을 확인하지 못했습니다. 다시 시도해 주세요.",
      });
    }

    const transferDoc = await PracticeTransfer.findOne({ transferId });
    if (!transferDoc) {
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const now = new Date();
    const userOid = new Types.ObjectId(userId);
    const updatedRequests = [];
    let cancelDeadlineAt = null;

    await claimAbutmentDesignHandoffLock(transferDoc._id);
    try {
      const ensure = await ensureAbutmentRequestsForHandoff({
        transferDoc,
        actorUserId: userId,
        allowPracticeConfirmed: true,
      });
      const relatedIds = (Array.isArray(ensure?.requestIds) ? ensure.requestIds : [])
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const requestDocs =
        relatedIds.length > 0 ? await Request.find({ _id: { $in: relatedIds } }) : [];

      const productionTargets = [];
      for (const toothRow of validTeeth) {
        const reqDoc = requestDocs.find(
          (doc) => String(doc?.caseInfos?.tooth || "").trim() === toothRow.toothNumber,
        );
        if (!reqDoc) continue;
        const blocked = designRouteBlockMessage(reqDoc, DESIGN_ROUTE_PLATFORM);
        if (blocked) {
          return res.status(409).json({ success: false, message: blocked });
        }
        if (labRevision && currentDesignRoute(reqDoc) !== DESIGN_ROUTE_PLATFORM) {
          return res.status(409).json({
            success: false,
            message: "의뢰자가 확정한 디자인만 수정할 수 있습니다.",
          });
        }
        productionTargets.push({ toothRow, reqDoc });
      }

      const productionTeeth = [];
      for (const { toothRow, reqDoc } of productionTargets) {
        const generation = newDesignGeneration();
        const destKey = platformProductionKey(reqDoc.requestId, generation);
        await copyObjectInS3(toothRow.s3Key, destKey);
        productionTeeth.push({
          toothRow,
          reqDoc,
          generation,
          destKey,
        });
      }

      for (const { toothRow, reqDoc, generation, destKey } of productionTeeth) {
        if (!reqDoc.caseInfos) reqDoc.caseInfos = {};
        if (!reqDoc.rnd) reqDoc.rnd = {};

        const prevPrimaryKey = String(reqDoc.caseInfos.file?.s3Key || "").trim();
        const prevSources = Array.isArray(reqDoc.caseInfos.designSourceFiles)
          ? reqDoc.caseInfos.designSourceFiles
          : [];
        const sourceFiles = oralSourcesOnly(prevSources, [prevPrimaryKey, toothRow.s3Key, destKey]);
        const fileName = toothRow.fileName || `custom_abutment_${toothRow.toothNumber}.stl`;
        reqDoc.caseInfos.designSourceFiles = sourceFiles;
        reqDoc.caseInfos.files = sourceFiles;
        reqDoc.caseInfos.file = {
          originalName: fileName,
          fileType: "model/stl",
          fileSize: toothRow.size,
          s3Key: destKey,
        };
        reqDoc.caseInfos.designGeneration = generation;
        reqDoc.caseInfos.designRoute = DESIGN_ROUTE_PLATFORM;
        reqDoc.caseInfos.machiningSourceS3Key = destKey;
        reqDoc.caseInfos.productMode = "custom_abutment";
        if (!String(reqDoc.caseInfos.designSoftware || "").trim()) {
          reqDoc.caseInfos.designSoftware = "3Shape";
        }
        reqDoc.caseInfos.requestorHexRotation = "STL모델대로";
        reqDoc.caseInfos.manufacturerHexRotation = "STL모델대로";
        reqDoc.caseInfos.finalHexRotation = "STL모델대로";
        reqDoc.caseInfos.hexRotation = { mode: "STL모델대로" };
        reqDoc.rnd.manufacturerHexRotation = "STL모델대로";

        const maxD = Number(toothRow.metrics?.maxDiameterMm);
        if (Number.isFinite(maxD) && maxD > 0) {
          reqDoc.caseInfos.maxDiameter = maxD;
        }
        clearFilledStlFileOnCaseInfos(reqDoc.caseInfos);
        reqDoc.caseInfos.ncFile = undefined;

        const rhinoName = buildConfirmedRhinoFileName(reqDoc);
        if (rhinoName && reqDoc.caseInfos.file) {
          reqDoc.caseInfos.file.filePath = rhinoName;
        }

        reqDoc.designCompletedBy = userOid;
        reqDoc.designCompletedAt = now;
        reqDoc.manufacturerStage = "준비";
        reqDoc.partnerBilling = {
          ...(reqDoc.partnerBilling && typeof reqDoc.partnerBilling === "object"
            ? reqDoc.partnerBilling.toObject?.() || reqDoc.partnerBilling
            : {}),
          practiceConfirmedAiDesign: true,
          billingDeferred: true,
        };
        await ensureLotNumberOnReadyEnter(reqDoc);
        if (rhinoName) {
          if (!reqDoc.productionSchedule) reqDoc.productionSchedule = {};
          reqDoc.productionSchedule.stlPreload = {
            status: "GENERATING",
            updatedAt: now,
          };
        }
        clearMachiningBind(reqDoc);
        await reqDoc.save();
        updatedRequests.push({ reqDoc, rhinoName });
      }

      const prevDesignFiles = Array.isArray(transferDoc.production?.designFiles)
        ? transferDoc.production.designFiles
        : [];
      const confirmedToothSet = new Set(validTeeth.map((t) => t.toothNumber));
      const keptDesignFiles = prevDesignFiles.filter(
        (entry) => !confirmedToothSet.has(String(entry?.tooth || "").trim()),
      );
      const patientName = String(req.body?.patientName || "").trim();
      const newMirrored = stampPracticeTransferFileBatch(
        productionTeeth.map(({ toothRow, destKey }) => ({
          patientName,
          tooth: toothRow.toothNumber,
          file: {
            originalName: toothRow.fileName || `custom_abutment_${toothRow.toothNumber}.stl`,
            mimetype: "model/stl",
            size: toothRow.size,
            s3Key: destKey,
          },
        })),
        { uploadedAt: now, force: true },
      );
      const mergedDesignFiles = [...keptDesignFiles, ...newMirrored];
      const prevPreview =
        transferDoc.production?.customAbutmentPreview &&
        typeof transferDoc.production.customAbutmentPreview === "object"
          ? transferDoc.production.customAbutmentPreview
          : {};
      const nextPreview = {
        ...prevPreview,
        version: Number(req.body?.version) || Number(prevPreview.version) || 0,
        fitVersion: Number(req.body?.fitVersion) || Number(prevPreview.fitVersion) || 0,
        savedAt: Date.now(),
        confirmedAt: now,
        confirmedBy: userOid,
        teeth: validTeeth,
      };

      const feeRevision = labRevision
        ? Math.max(0, Math.floor(Number(transferDoc.production?.abutmentFeeRouteRevision || 0)))
        : Math.max(0, Math.floor(Number(transferDoc.production?.abutmentFeeRouteRevision || 0))) + 1;
      cancelDeadlineAt = transferDoc.production?.abutmentCancelDeadlineAt || null;
      if (!labRevision && !cancelDeadlineAt) {
        cancelDeadlineAt = await abutmentLabCheckDeadline(now);
      }
      const productionSet = {
        "production.designFiles": mergedDesignFiles,
        "production.designReadyAt": now,
        "production.practiceDesignConfirmedAt": now,
        "production.practiceDesignConfirmedBy": userOid,
        "production.confirmedAt": now,
        "production.confirmedBy": userOid,
        "production.customAbutmentPreview": nextPreview,
      };
      if (!labRevision) {
        productionSet["production.abutmentFeeRoute"] = "platform";
        productionSet["production.abutmentFeeRouteRevision"] = feeRevision;
        if (cancelDeadlineAt) {
          productionSet["production.abutmentCancelDeadlineAt"] = cancelDeadlineAt;
        }
      }
      await PracticeTransfer.updateOne(
        { _id: transferDoc._id },
        {
          $set: productionSet,
          $unset: {
            "production.customAbutmentManualDesign": "",
          },
        },
      );
      if (!transferDoc.production) transferDoc.production = {};
      if (!labRevision) {
        transferDoc.production.abutmentFeeRoute = "platform";
        transferDoc.production.abutmentFeeRouteRevision = feeRevision;
        if (cancelDeadlineAt) {
          transferDoc.production.abutmentCancelDeadlineAt = cancelDeadlineAt;
        }
      }
    } finally {
      await releaseAbutmentDesignHandoffLock(transferDoc._id);
    }
    if (!labRevision) {
      await syncPracticeTransferAbutmentFeeRoute({
        transfer: transferDoc,
        actorUserId: userId,
      });
    }

    res.json({
      success: true,
      data: {
        confirmed: true,
        transferId,
        requestCount: updatedRequests.length,
        teeth: validTeeth.map((t) => t.toothNumber),
        cancelDeadlineAt: cancelDeadlineAt
          ? new Date(cancelDeadlineAt).toISOString()
          : null,
      },
    });

    void (async () => {
      for (const { reqDoc, rhinoName } of updatedRequests) {
        try {
          const prc = await resolvePrcFileNames(reqDoc.caseInfos);
          const $set = {};
          if (prc.faceHolePrcFileName) {
            $set["caseInfos.faceHolePrcFileName"] = prc.faceHolePrcFileName;
          }
          if (prc.connectionPrcFileName) {
            $set["caseInfos.connectionPrcFileName"] = prc.connectionPrcFileName;
          }
          if (Object.keys($set).length > 0) {
            await Request.updateOne({ _id: reqDoc._id }, { $set });
          }
          if (rhinoName) {
            triggerRhinoProcessFileForRequest({
              requestId: reqDoc.requestId,
              filePath: rhinoName,
              fileName: rhinoName,
            });
          }
        } catch (err) {
          console.warn("[AI] confirm rhino trigger failed", err?.message || err);
        }
      }
      if (updatedRequests.length > 0) {
        try {
          scheduleRequestReadyBadgeEmit();
          emitAppEventToRoles(["manufacturer", "admin"], "worksheet:updated", {
            source: "practice-confirm-custom-abutment",
            transferId,
          });
        } catch (err) {
          console.warn("[AI] confirm worksheet emit failed", err?.message || err);
        }
      }
      const toothListText = validTeeth.map((t) => `#${t.toothNumber}`).join(", ");
      void postPracticeTransferSystemChatMessage({
        transferMongoId: transferDoc._id,
        senderUserId: req.user?._id,
        content: `치과가 커스텀어벗 디자인(${toothListText})을 확정하여 생산을 의뢰했습니다.`,
        systemEvent: "custom_abutment_confirmed",
      }).catch((err) => console.warn("[AI] confirm system chat failed", err));
      void emitCustomAbutmentTransferEvent(transferDoc, "abutment-design-confirmed").catch(
        (err) => console.warn("[AI] confirm transfer emit failed", err),
      );
    })();
  } catch (error) {
    console.error("[AI] confirmCustomAbutmentDesign error", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "커스텀어벗 확정 처리 중 오류가 발생했습니다.",
    });
  }
}

/**
 * 치과 「수작업 의뢰」: 기공사 수작업 디자인으로 넘기고, 프리뷰 형상·3D 페인트를 공유한다.
 * @route POST /api/ai/custom-abutment-design-manual-request
 */
export async function requestManualCustomAbutmentDesign(req, res) {
  try {
    const { anchorId, canSave, transferId } = await resolvePreferenceAnchor(req, req.body?.transferId);
    const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
    if (!transferId || (!canSave && !privileged) || !anchorId) {
      return res.status(403).json({ success: false, message: "의뢰 치과만 요청할 수 있습니다." });
    }
    const transferDoc = await PracticeTransfer.findOne({ transferId });
    if (!transferDoc) {
      return res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }
    const relatedIds = (Array.isArray(transferDoc.production?.relatedRequestIds)
      ? transferDoc.production.relatedRequestIds
      : []
    )
      .map((id) => String(id || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));
    if (relatedIds.length > 0) {
      const related = await Request.find({
        _id: { $in: relatedIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({
          "caseInfos.designRoute": 1,
          "caseInfos.file.s3Key": 1,
          designCompletedAt: 1,
          "partnerBilling.practiceConfirmedAiDesign": 1,
          "partnerBilling.relatedPracticeTransferId": 1,
        })
        .lean();
      if (related.some((row) => currentDesignRoute(row) === DESIGN_ROUTE_PLATFORM)) {
        return res.status(409).json({
          success: false,
          message: "의뢰자가 확정한 디자인입니다. 수작업으로 바꾸지 않습니다.",
        });
      }
    }

    const now = new Date();
    const message = String(req.body?.message || "").trim().slice(0, 1000);
    const shapes = sanitizeWorkFilePaintShapes(req.body?.paint?.shapes);
    const view = sanitizeWorkFilePaintView(req.body?.paint?.view);
    assertWorkFilePaintSize({ shapes, view });

    const incoming = snapshotTeeth(req.body?.teeth, transferId);
    const checked = await Promise.all(
      incoming.map(async (row) => {
        if (!row.s3Key) return row;
        const size = await headObjectSizeInS3(row.s3Key);
        if (!size || size > PREVIEW_STL_MAX) return null;
        let crownS3Key = "";
        if (row.crownS3Key) {
          const crownSize = await headObjectSizeInS3(row.crownS3Key);
          if (crownSize && crownSize <= PREVIEW_STL_MAX) crownS3Key = row.crownS3Key;
        }
        return { ...row, size, crownS3Key };
      }),
    );
    const validTeeth = checked.filter(Boolean);

    const prevPreview =
      transferDoc.production?.customAbutmentPreview &&
      typeof transferDoc.production.customAbutmentPreview === "object"
        ? transferDoc.production.customAbutmentPreview
        : {};
    const nextPreview = {
      ...prevPreview,
      savedAt: Date.now(),
      confirmedAt: null,
      confirmedBy: null,
      ...(validTeeth.length > 0
        ? {
            version: Number(req.body?.version) || Number(prevPreview.version) || 0,
            fitVersion: Number(req.body?.fitVersion) || Number(prevPreview.fitVersion) || 0,
            teeth: validTeeth,
          }
        : {}),
      ...(req.body?.paint
        ? {
            paint: {
              shapes,
              view: view || null,
              updatedAt: now,
              updatedBy: req.user?._id || null,
              updatedSide: "practice",
            },
          }
        : {}),
    };
    const manualDesign = {
      at: now,
      by: req.user?._id || null,
      message,
      hasPaint: shapes.length > 0,
    };

    const feeRevision =
      Math.max(0, Math.floor(Number(transferDoc.production?.abutmentFeeRouteRevision || 0))) + 1;
    await PracticeTransfer.updateOne(
      { _id: transferDoc._id },
      {
        $set: {
          "production.customAbutmentManualDesign": manualDesign,
          "production.customAbutmentPreview": nextPreview,
          "production.abutmentFeeRoute": "lab",
          "production.abutmentFeeRouteRevision": feeRevision,
        },
        $unset: {
          "production.abutmentCancelDeadlineAt": "",
        },
      },
    );
    if (!transferDoc.production) transferDoc.production = {};
    transferDoc.production.abutmentFeeRoute = "lab";
    transferDoc.production.abutmentFeeRouteRevision = feeRevision;
    transferDoc.production.abutmentCancelDeadlineAt = null;
    await syncPracticeTransferAbutmentFeeRoute({
      transfer: transferDoc,
      actorUserId: req.user?._id,
    });

    res.json({
      success: true,
      data: { manualDesign, transferId },
    });

    const chatSentDirectly = Boolean(req.body?.chatSentDirectly);
    void (async () => {
      if (!chatSentDirectly) {
        const lines = [
          "치과가 커스텀어벗 수작업 디자인을 의뢰했습니다.",
          message ? `요청: ${message}` : "",
          shapes.length > 0 ? "디자인 화면에 페인트 표시가 있습니다." : "",
        ].filter(Boolean);
        await postPracticeTransferSystemChatMessage({
          transferMongoId: transferDoc._id,
          senderUserId: req.user?._id,
          content: lines.join("\n"),
          systemEvent: "custom_abutment_manual_design",
        }).catch((err) => console.warn("[AI] manual request chat failed", err));
      }
      await emitCustomAbutmentTransferEvent(
        transferDoc,
        "custom-abutment-manual-requested",
      ).catch((err) => console.warn("[AI] manual request emit failed", err));
    })();
  } catch (error) {
    console.error("[AI] requestManualCustomAbutmentDesign error", error);
    return res.status(500).json({
      success: false,
      message: "수작업 의뢰를 저장하지 못했습니다.",
    });
  }
}

export async function customAbutmentDesignChat(req, res) {
  try {
    const message = String(req.body?.message || "").trim().slice(0, 1000);
    const teeth = sanitizeTeeth(req.body?.teeth);
    const history = sanitizeHistory(req.body?.history);
    const selectedRaw = String(req.body?.selectedTooth || "").trim();
    const selectedTooth = TOOTH_RE.test(selectedRaw) ? selectedRaw : null;

    if (!message) {
      return res.status(400).json({ success: false, message: "요청 내용을 입력해 주세요." });
    }
    if (teeth.length === 0) {
      return res.status(400).json({ success: false, message: "디자인된 치아가 없습니다." });
    }

    const genAI = getGenAI();
    if (!genAI) {
      return res.status(503).json({
        success: false,
        message: "AI 서비스가 구성되지 않았습니다.",
      });
    }

    const guard = shouldBlockExternalCall(
      `gemini-customAbutmentDesignChat:${String(req.user?._id || req.ip || "unknown")}`,
    );
    if (guard?.blocked) {
      return res.status(429).json({
        success: false,
        message: "AI 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    const { anchorId, canSave, transferId } = await resolvePreferenceAnchor(req, req.body?.transferId);
    let preference = await loadPreference(anchorId);

    const image = sanitizeImage(req.body?.image);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    const prompt = buildPrompt({
      message,
      history,
      teeth,
      selectedTooth,
      preference,
      hasImage: Boolean(image),
    });
    const result = await model.generateContent(
      image ? [{ text: prompt }, { inlineData: image }] : prompt,
    );
    const usage = quoteAiDesignChatUsage(result?.response?.usageMetadata);
    const usageView = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    };
    void recordAiDesignChatUsage({
      ...usage,
      practiceBusinessAnchorId: anchorId,
      userId: req.user?._id,
      transferId,
      model: MODEL,
    }).catch((err) => console.warn("[AI] design chat usage write failed", err));
    const parsed = parseJsonObject(result?.response?.text?.() || "");
    if (!parsed || typeof parsed !== "object") {
      return res.json({
        success: true,
        data: {
          reply: "요청을 이해하지 못했습니다. 다시 말씀해 주세요.",
          changes: [],
          preference,
          preferenceSaved: null,
          model: MODEL,
          usage: usageView,
        },
      });
    }

    const changes = sanitizeChanges(parsed.changes, teeth);
    const update = sanitizePreferenceUpdate(parsed.preference);
    let preferenceSaved = null;
    if (update && anchorId && canSave) {
      preference = await savePreferenceUpdate(anchorId, update);
      preferenceSaved = update;
    }
    const reply =
      String(parsed.reply || "").trim().slice(0, 600) ||
      (changes.length > 0 ? "디자인 값을 바꿨습니다." : "바꿀 내용이 없습니다.");
    const unsupported = isUnsupportedDesignRequest(parsed, changes, reply);
    let gapId = null;
    if (unsupported) {
      try {
        const gap = await recordAiDesignGap({
          practiceBusinessAnchorId: anchorId,
          userId: req.user?._id,
          transferId,
          patientName: req.body?.patientName,
          toothNumber: selectedTooth,
          message,
          reply,
        });
        gapId = gap?._id ? String(gap._id) : null;
      } catch (err) {
        console.warn("[AI] design gap write failed", err);
      }
    }
    return res.json({
      success: true,
      data: {
        reply,
        changes,
        preference,
        preferenceSaved,
        model: MODEL,
        usage: usageView,
        unsupported,
        gapId,
      },
    });
  } catch (error) {
    console.error("[AI] customAbutmentDesignChat error", error);
    if (error?.status === 402) {
      return res.status(503).json({
        success: false,
        message: "AI 사용 크레딧이 소진되었습니다. 관리자에게 문의해 주세요.",
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        success: false,
        message: "AI 사용량이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "AI 응답 중 오류가 발생했습니다.",
    });
  }
}

/**
 * 미지원 요청에 대해 기공사 수작업으로 바꿀지 답을 저장한다.
 * @route POST /api/ai/custom-abutment-design-manual
 * body: { gapId, choice: "yes"|"no" }
 */
export async function chooseCustomAbutmentManualDesign(req, res) {
  try {
    const choice = req.body?.choice === "yes" ? "yes" : req.body?.choice === "no" ? "no" : null;
    if (!choice) {
      return res.status(400).json({ success: false, message: "선택을 확인해 주세요." });
    }
    const found = await findAiDesignGap(req.body?.gapId);
    if (!found) {
      return res.status(404).json({ success: false, message: "요청 기록을 찾지 못했습니다." });
    }
    const transfer = found.transferId ? await findTransferForDesignChat(found.transferId) : null;
    if (found.transferId) {
      const own = String(req.user?.businessAnchorId || "").trim();
      const parties = [
        String(transfer?.practiceBusinessAnchorId || ""),
        String(transfer?.targetLabAnchorId || ""),
        String(transfer?.assigneeLabAnchorId || ""),
      ];
      const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
      if (!transfer || (!parties.includes(own) && !privileged)) {
        return res.status(403).json({ success: false, message: "이 의뢰를 바꿀 수 없습니다." });
      }
    }
    const already = found.manualChoice === "yes" || found.manualChoice === "no";
    if (!already && choice === "yes" && transfer) {
      const tooth = String(found.toothNumber || "").trim();
      const asked = String(found.message || "").trim();
      await PracticeTransfer.updateOne(
        { _id: transfer._id },
        {
          $set: {
            "production.customAbutmentManualDesign": {
              at: new Date(),
              by: req.user?._id || null,
              toothNumber: tooth,
              message: asked,
            },
          },
        },
      );
      const content = [
        "치과가 커스텀어벗을 기공사 수작업으로 바꿨습니다.",
        tooth ? `치아 #${tooth}` : "",
        asked ? `요청: ${asked}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      void postPracticeTransferSystemChatMessage({
        transferMongoId: transfer._id,
        senderUserId: req.user?._id,
        content,
        systemEvent: "custom_abutment_manual_design",
      }).catch((err) => console.warn("[AI] manual design chat failed", err));
    }
    const { gap } = await setAiDesignGapChoice(found, choice);
    const saved = gap?.manualChoice === "yes" || gap?.manualChoice === "no" ? gap.manualChoice : choice;
    return res.json({
      success: true,
      data: { choice: saved, switched: saved === "yes" && Boolean(transfer) },
    });
  } catch (error) {
    console.error("[AI] chooseCustomAbutmentManualDesign error", error);
    return res.status(500).json({ success: false, message: "수작업 전환을 저장하지 못했습니다." });
  }
}

export default {
  customAbutmentDesignChat,
  getCustomAbutmentDesignPreference,
  saveCustomAbutmentDesignPreference,
  clearCustomAbutmentDesignPreference,
  chooseCustomAbutmentManualDesign,
};
