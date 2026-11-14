// 치과 커스텀어벗 디자인 프리뷰의 AI 대화. 말로 받은 수정 요청을 디자인 조정값으로 바꿔 돌려준다.
// 형상은 프론트가 이 조정값으로 다시 만든다. 범위는 프론트 customAbutmentDesignParams.ts와 같아야 한다.
// 1회성이 아닌 요청(「항상」「우리는」, 치종 전반 규칙 등)은 의뢰 치과 사업자의 디자인 취향으로 저장해
// 다음 케이스 기본값으로 쓴다. 저장은 의뢰 치과 본인 계정의 대화만 한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/modules/ai/ai.routes.js
// - web/backend/models/businessAnchor.model.js (customAbutmentDesignPreference)
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { getGenAI } from "../../services/businessLicenseOcr.service.js";
import { shouldBlockExternalCall } from "../../utils/rateGuard.js";

const MODEL = "gemini-2.5-flash";

const PARAM_SPECS = {
  occlusalClearanceMm: { label: "포스트 최정점 → 대합치 거리", unit: "mm", min: 0.8, max: 2.5 },
  postTaperDeg: { label: "포스트 축벽 편측 테이퍼", unit: "°", min: 1, max: 8 },
  postHeightOffsetMm: {
    label: "포스트 높이 보정(대합치가 있으면 음수만 효과)",
    unit: "mm",
    min: -2,
    max: 2,
  },
  postWidthScale: { label: "포스트 굵기 배율", unit: "배", min: 0.8, max: 1.15 },
  marginFilletRadiusMm: { label: "가공 공구 R(마진 챔퍼 최소 곡률)", unit: "mm", min: 0.5, max: 0.8 },
  marginShoulderMm: { label: "마진 챔퍼 폭(피니시라인에서 축벽까지)", unit: "mm", min: 0.3, max: 0.8 },
  marginDepthMm: { label: "피니시라인 치은 하방 깊이(둘레 전체)", unit: "mm", min: 0, max: 1.5 },
  marginSizeScale: { label: "마진 단면 크기 배율", unit: "배", min: 0.85, max: 1.2 },
  crownContactMm: { label: "예측 크라운 접촉량", unit: "mm", min: 0, max: 0.2 },
  minCrownThicknessMm: { label: "크라운 두께(포스트 컷백, 공간 없으면 0.65까지 자동)", unit: "mm", min: 0.65, max: 1.5 },
  axisToOpposing: { label: "삽입축 대합치 중심 반영(0=악궁 교합 방향, 1=대합치 중심)", unit: "", min: 0, max: 1 },
  axisMaxDeg: { label: "픽스쳐 장축 대비 삽입축 최대 각도", unit: "°", min: 0, max: 25 },
  axisShiftLabialMm: { label: "포스트 윗면 순측(+)/설측(-) 이동", unit: "mm", min: -2, max: 2 },
  axisShiftMesialMm: { label: "포스트 윗면 근심(+)/원심(-) 이동", unit: "mm", min: -2, max: 2 },
};

const PARAM_KEYS = Object.keys(PARAM_SPECS);
/** 케이스마다 다른 윗면 이동은 취향으로 저장하지 않는다. */
const PREFERENCE_KEYS = PARAM_KEYS.filter(
  (k) => k !== "axisShiftLabialMm" && k !== "axisShiftMesialMm",
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
  return Math.min(spec.max, Math.max(spec.min, v));
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
      if (v != null) params[key] = v;
    }
    const metrics = {};
    for (const [key, value] of Object.entries(row?.metrics || {})) {
      if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
      else if (value == null || typeof value === "string") metrics[key] = value ?? null;
    }
    out.push({ toothNumber, params, metrics });
  }
  return out;
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .map((row) => ({
      role: row?.role === "assistant" ? "assistant" : "user",
      text: String(row?.text || "").trim().slice(0, 800),
    }))
    .filter((row) => row.text);
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
async function resolvePreferenceAnchor(req, rawTransferId) {
  const own = String(req.user?.businessAnchorId || "").trim();
  const transferId = String(rawTransferId || "").trim();
  if (Types.ObjectId.isValid(transferId)) {
    const t = await PracticeTransfer.findById(transferId)
      .select({ practiceBusinessAnchorId: 1, targetLabAnchorId: 1, assigneeLabAnchorId: 1 })
      .lean();
    if (t?.practiceBusinessAnchorId) {
      const practiceId = String(t.practiceBusinessAnchorId);
      const parties = [practiceId, String(t.targetLabAnchorId || ""), String(t.assigneeLabAnchorId || "")];
      const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
      if (parties.includes(own) || privileged) {
        return { anchorId: practiceId, canSave: own === practiceId };
      }
    }
  }
  if (Types.ObjectId.isValid(own)) return { anchorId: own, canSave: true };
  return { anchorId: null, canSave: false };
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

function buildPrompt({ message, history, teeth, selectedTooth, preference }) {
  const specLines = PARAM_KEYS.map((key) => {
    const s = PARAM_SPECS[key];
    return `- ${key}: ${s.label} (${s.min}~${s.max}${s.unit})`;
  }).join("\n");
  return (
    "너는 치과 기공 커스텀어벗(임플란트 어벗먼트) 디자인 도우미다.\n" +
    "치과 사용자가 미리보기 화면에서 말로 수정을 요청하면, 아래 조정값만 바꿔 디자인을 다시 만들게 한다.\n" +
    "형상을 직접 그리지 않는다. 조정값 밖의 요청(예: 재질, 색, 납기)은 바꿀 수 없다고 짧게 답한다.\n" +
    "\n" +
    "조정값(키: 의미, 범위):\n" +
    specLines +
    "\n\n" +
    "규칙:\n" +
    "- 사용자가 치아를 말하지 않으면 selectedTooth, 그것도 없으면 모든 치아(toothNumber: \"all\")에 적용한다.\n" +
    "- 「조금」은 범위의 10~15%, 「많이」는 25~35% 정도로 현재 값에서 바꾼다. 숫자를 주면 그 숫자를 쓴다.\n" +
    "- 「낮춰」「짧게」(포스트)는 occlusalClearanceMm을 키우거나 postHeightOffsetMm을 음수로 한다.\n" +
    "- 「얇게」「가늘게」(포스트)는 postWidthScale을 줄이거나 minCrownThicknessMm을 키운다.\n" +
    "- 「더 수직으로」는 postTaperDeg를 줄인다. 「기울기 줄여」는 axisMaxDeg를 줄이거나 axisToOpposing을 낮춘다.\n" +
    "- 「마진 더 깊게」「치은 하방 0.8mm」는 marginDepthMm. 「마진 넓게/좁게」는 marginShoulderMm.\n" +
    "- 바꿀 필요가 없거나 질문이면 changes는 빈 배열이다.\n" +
    "\n" +
    "치과 취향(preference):\n" +
    "- 요청이 이 케이스만이 아니라 앞으로도 그렇게 해 달라는 뜻이면 preference에 넣는다.\n" +
    "  예: 「항상」「앞으로」「우리 치과는」「보통」「~로 해 주세요」처럼 규칙으로 말할 때,\n" +
    "  치아 번호 없이 수치를 정할 때(「마진은 치은 하방 0.8mm」「테이퍼 3도」),\n" +
    "  치종 전반을 말할 때(「전치는 …」 → anterior, 「어금니/구치는 …」 → posterior).\n" +
    "- 1회성이면 preference는 null이다.\n" +
    "  예: 화면을 보고 상대적으로 고치는 말(「조금 낮춰」「23번 더 얇게」), 특정 치아만 말할 때,\n" +
    "  「이번만」「이 케이스」.\n" +
    "- preference.params는 절대값이다(현재 값에서 바꾼 결과). scope는 all, anterior, posterior 중 하나.\n" +
    "- preference.note는 취향을 한국어 한 문장(30자 안)으로 쓴다.\n" +
    "- preference가 있으면 지금 케이스에도 같은 값을 changes에 넣는다(scope에 맞는 치아만).\n" +
    "- reply는 한국어 1~3문장. 무엇을 얼마로 바꿨는지, 취향으로 저장했으면 「다음 케이스부터 기본값으로 씁니다」를 쓴다.\n" +
    "\n" +
    "반환(JSON만, 설명 금지):\n" +
    '{ "reply": string, "changes": [ { "toothNumber": string, "params": { "<키>": number } } ],' +
    ' "preference": null | { "scope": "all"|"anterior"|"posterior", "params": { "<키>": number }, "note": string } }\n' +
    "\n" +
    "현재 치과 취향:\n" +
    JSON.stringify(preference) +
    "\n\n현재 디자인(params는 현재 값, metrics는 측정값):\n" +
    JSON.stringify({ selectedTooth: selectedTooth || null, teeth }) +
    "\n\n대화 기록:\n" +
    JSON.stringify(history) +
    "\n\n사용자 요청:\n" +
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
 * body: { message, history?, teeth: [{ toothNumber, params, metrics }], selectedTooth?, transferId? }
 */
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

    const { anchorId, canSave } = await resolvePreferenceAnchor(req, req.body?.transferId);
    let preference = await loadPreference(anchorId);

    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const result = await model.generateContent(
      buildPrompt({ message, history, teeth, selectedTooth, preference }),
    );
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
    return res.json({
      success: true,
      data: { reply, changes, preference, preferenceSaved, model: MODEL },
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

export default {
  customAbutmentDesignChat,
  getCustomAbutmentDesignPreference,
  clearCustomAbutmentDesignPreference,
};
