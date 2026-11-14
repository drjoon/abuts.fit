// 치과 커스텀어벗 디자인 프리뷰의 AI 대화. 말로 받은 수정 요청을 디자인 조정값으로 바꿔 돌려준다.
// 형상은 프론트가 이 조정값으로 다시 만든다. 범위는 프론트 customAbutmentDesignParams.ts와 같아야 한다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/modules/ai/ai.routes.js
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
  marginFilletRadiusMm: { label: "마진 라운드 숄더 반경(볼 공구 R 이상)", unit: "mm", min: 0.5, max: 0.8 },
  marginDepthMm: { label: "순측 치은연 아래 마진 깊이(설측·인접은 비례)", unit: "mm", min: 0, max: 1.5 },
  marginSizeScale: { label: "마진 단면 크기 배율", unit: "배", min: 0.85, max: 1.2 },
  crownContactMm: { label: "예측 크라운 접촉량", unit: "mm", min: 0, max: 0.2 },
  minCrownThicknessMm: { label: "크라운 최소 두께(포스트 컷백)", unit: "mm", min: 0.5, max: 1.5 },
  axisToOpposing: { label: "삽입축 대합치 중심 반영(0=악궁 교합 방향, 1=대합치 중심)", unit: "", min: 0, max: 1 },
  axisMaxDeg: { label: "픽스쳐 장축 대비 삽입축 최대 각도", unit: "°", min: 0, max: 25 },
  axisShiftLabialMm: { label: "포스트 윗면 순측(+)/설측(-) 이동", unit: "mm", min: -2, max: 2 },
  axisShiftMesialMm: { label: "포스트 윗면 근심(+)/원심(-) 이동", unit: "mm", min: -2, max: 2 },
};

const PARAM_KEYS = Object.keys(PARAM_SPECS);
const TOOTH_RE = /^[1-4][1-8]$/;

const toFiniteOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
    const params = {};
    for (const key of PARAM_KEYS) {
      const v = toFiniteOrNull(row?.params?.[key]);
      if (v == null) continue;
      const spec = PARAM_SPECS[key];
      params[key] = Math.min(spec.max, Math.max(spec.min, v));
    }
    if (Object.keys(params).length === 0) continue;
    for (const t of targets) out.push({ toothNumber: t, params });
  }
  return out;
}

function buildPrompt({ message, history, teeth, selectedTooth }) {
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
    "- 「마진 더 깊게」는 marginDepthMm을 키운다.\n" +
    "- 바꿀 필요가 없거나 질문이면 changes는 빈 배열이다.\n" +
    "- reply는 한국어 1~3문장. 무엇을 얼마로 바꿨는지 쓴다. 숫자는 단위와 함께.\n" +
    "\n" +
    "반환(JSON만, 설명 금지):\n" +
    '{ "reply": string, "changes": [ { "toothNumber": string, "params": { "<키>": number } } ] }\n' +
    "\n" +
    "현재 디자인(params는 현재 값, metrics는 측정값):\n" +
    JSON.stringify({ selectedTooth: selectedTooth || null, teeth }) +
    "\n\n대화 기록:\n" +
    JSON.stringify(history) +
    "\n\n사용자 요청:\n" +
    message
  );
}

/**
 * @route POST /api/ai/custom-abutment-design-chat
 * body: { message, history?, teeth: [{ toothNumber, params, metrics }], selectedTooth? }
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

    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const result = await model.generateContent(
      buildPrompt({ message, history, teeth, selectedTooth }),
    );
    const parsed = parseJsonObject(result?.response?.text?.() || "");
    if (!parsed || typeof parsed !== "object") {
      return res.json({
        success: true,
        data: { reply: "요청을 이해하지 못했습니다. 다시 말씀해 주세요.", changes: [], model: MODEL },
      });
    }

    const changes = sanitizeChanges(parsed.changes, teeth);
    const reply =
      String(parsed.reply || "").trim().slice(0, 600) ||
      (changes.length > 0 ? "디자인 값을 바꿨습니다." : "바꿀 내용이 없습니다.");
    return res.json({ success: true, data: { reply, changes, model: MODEL } });
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

export default { customAbutmentDesignChat };
