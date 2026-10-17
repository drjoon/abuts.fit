// AI 디자인 채팅 — 규칙 기반 1차 명령 해석(자연어 → 수정값·화면 이동).
// related files:
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/practice/labProsthesisModify.ts

import {
  INNER_FIELDS,
  type InnerNumberKey,
  type InnerParams,
} from "@/shared/practice/labDesignPresets";
import {
  CLEARANCE_RANGE_MM,
  adjustMarginOffset,
  type MarginReview,
  type RefineTab,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

export type LabAiChatAction =
  | { kind: "selectTooth"; tooth: string }
  | { kind: "patchRefine"; tooth: string; patch: Partial<ToothDesignEdit["refine"]> }
  | { kind: "patchInner"; tooth: string; patch: Partial<Pick<InnerParams, InnerNumberKey>> }
  | { kind: "adjustMarginOffset"; tooth: string; deltaMm: number }
  | { kind: "confirmMargin"; tooth: string }
  | { kind: "confirmMarginBulk"; teeth: string[] }
  | { kind: "autoDetectMargin"; tooth: string }
  | { kind: "autoDetectMarginBulk"; teeth: string[] }
  | { kind: "generate"; teeth: string[] }
  | { kind: "navigate"; target: "prepareMargin" | "designRefine" | "designAdapt" | "designInner" | "designOcclusal" }
  | {
      kind: "toggleRefine";
      tooth: string;
      field:
        | "proximalBlockOut"
        | "occlusalTrim"
        | "occlusalFit"
        | "proximalTrim"
        | "proximalFit"
        | "compensate";
      on: boolean;
    };

export type LabAiChatInterpretContext = {
  activeToothNumber: string | null;
  marginReview: Readonly<Record<string, MarginReview>>;
  edits: Readonly<Record<string, ToothDesignEdit>>;
  /** 케이스 designable 치아 번호(FDI). */
  planTeeth?: readonly string[];
  /** 현재 고른 치아의 브리지 스팬. */
  bridgeSpanTeeth?: readonly string[];
  /** 아직 생성하지 않은 브리지 스팬 치아. */
  bridgePendingGenerate?: readonly string[];
};

export type LabAiChatInterpretResult = {
  actions: LabAiChatAction[];
  reply: string;
};

const HELP_REPLY = [
  "예시 명령입니다.",
  "· #16 선택 / 16번 마진 확인",
  "· 마진 모두 확인 / 브리지 마진 검출",
  "· 마진 수축 0.1 / 마진 확장",
  "· 교합 간격 0.2 / 인접 간격 0.15",
  "· 시멘트 갭 0.05 / 최소 두께 0.8",
  "· 교합 절삭 켜 / 삽입 블록아웃 켜",
  "· 크기 105% / 보철 생성 / 브리지 생성",
  "· 준비 마진 / 형상 맞춤",
].join("\n");

function normalize(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** 명령 숫자 파싱용. 치아 번호(FDI) 토큰은 제거한다. */
function stripToothTokens(text: string) {
  return text.replace(/#?\s*([1-4][1-8])\s*(?:번|호|i\b|i$)?/g, " ");
}

function clampClearance(value: number) {
  return Math.min(CLEARANCE_RANGE_MM.max, Math.max(CLEARANCE_RANGE_MM.min, value));
}

function clampScale(value: number) {
  return Math.min(1.35, Math.max(0.75, value));
}

function firstNumber(text: string): number | null {
  const hit = text.match(/(-?\d+(?:\.\d+)?)/);
  if (!hit) return null;
  const n = Number(hit[1]);
  return Number.isFinite(n) ? n : null;
}

function parseMm(text: string, fallback: number | null = null) {
  const body = stripToothTokens(text);
  const explicit = body.match(/(-?\d+(?:\.\d+)?)\s*(?:mm|밀리|㎜)/);
  if (explicit) {
    const n = Number(explicit[1]);
    return Number.isFinite(n) ? n : fallback;
  }
  return firstNumber(body) ?? fallback;
}

function parseScale(text: string): number | null {
  const body = stripToothTokens(text);
  const pct = body.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n) ? clampScale(n / 100) : null;
  }
  if (/크기|스케일|scale/.test(body)) {
    const n = firstNumber(body);
    if (n == null) return null;
    return clampScale(n > 3 ? n / 100 : n);
  }
  return null;
}

function parseOnOff(text: string): boolean | null {
  if (/(켜|on|활성|시작)/.test(text)) return true;
  if (/(끄|off|해제|중지)/.test(text)) return false;
  return null;
}

export function parseExplicitTooth(text: string): string | null {
  const m = text.match(/#?\s*([1-4][1-8])\s*(?:번|호|i\b|i$)?/);
  return m?.[1] ?? null;
}

function spanTeeth(ctx: LabAiChatInterpretContext): string[] {
  if (ctx.bridgeSpanTeeth && ctx.bridgeSpanTeeth.length > 0) {
    return [...ctx.bridgeSpanTeeth];
  }
  return ctx.activeToothNumber ? [ctx.activeToothNumber] : [];
}

function resolveTooth(
  text: string,
  ctx: LabAiChatInterpretContext,
): { tooth: string } | { fail: string } {
  const explicit = parseExplicitTooth(text);
  if (explicit) {
    if (ctx.planTeeth && ctx.planTeeth.length > 0 && !ctx.planTeeth.includes(explicit)) {
      return { fail: `#${explicit}은 이 케이스에 없습니다.` };
    }
    return { tooth: explicit };
  }
  if (!ctx.activeToothNumber) {
    return { fail: "치아를 고르거나 #16처럼 번호를 넣어 주세요." };
  }
  return { tooth: ctx.activeToothNumber };
}

function withSelect(
  tooth: string,
  ctx: LabAiChatInterpretContext,
  actions: LabAiChatAction[],
): LabAiChatAction[] {
  if (ctx.activeToothNumber && ctx.activeToothNumber !== tooth) {
    return [{ kind: "selectTooth", tooth }, ...actions];
  }
  if (!ctx.activeToothNumber) {
    return [{ kind: "selectTooth", tooth }, ...actions];
  }
  return actions;
}

function clampInner(key: InnerNumberKey, value: number) {
  const field = INNER_FIELDS.find((row) => row.key === key);
  if (!field) return value;
  return Math.min(field.max, Math.max(field.min, value));
}

export function interpretLabProsthesisAiChat(
  rawText: string,
  ctx: LabAiChatInterpretContext,
): LabAiChatInterpretResult {
  const text = normalize(rawText);
  if (!text) return { actions: [], reply: "명령을 입력해 주세요." };

  if (
    text === "help" ||
    text === "?" ||
    text === "도움" ||
    text === "도움말" ||
    text === "명령"
  ) {
    return { actions: [], reply: HELP_REPLY };
  }

  if (/페인트/.test(text) && text.length < 24) {
    return {
      actions: [],
      reply: "페인트 표시는 저장했습니다.\n나중에 AI가 참고할 수 있습니다.",
    };
  }

  const explicitOnly = parseExplicitTooth(text);
  if (
    explicitOnly &&
    /(?:선택|고르|바꿔|열어|지정)/.test(text) &&
    !/마진|교합|인접|생성|갭|두께|확인|검출/.test(text)
  ) {
    return {
      actions: [{ kind: "selectTooth", tooth: explicitOnly }],
      reply: `#${explicitOnly}를 고릅니다.`,
    };
  }

  if (/(브리지|스팬)/.test(text) && /(생성|만들)/.test(text)) {
    const pending = [...(ctx.bridgePendingGenerate ?? [])];
    if (pending.length === 0) {
      return { actions: [], reply: "생성할 브리지 치아가 없습니다." };
    }
    return {
      actions: [{ kind: "generate", teeth: pending }],
      reply: `브리지 ${pending.map((n) => `#${n}`).join(", ")} 보철 생성을 시도합니다.`,
    };
  }

  if (/마진.*(모두|전부)|브리지.*마진.*확인|epl.*(모두|전부)/.test(text)) {
    const teeth = spanTeeth(ctx);
    const detected = teeth.filter((tooth) => (ctx.marginReview[tooth] ?? "none") === "detected");
    if (detected.length === 0) {
      return { actions: [], reply: "검출된 마진이 없어 확인할 치아가 없습니다." };
    }
    return {
      actions: [{ kind: "confirmMarginBulk", teeth: detected }],
      reply: `${detected.map((n) => `#${n}`).join(", ")} 마진을 확인했습니다.`,
    };
  }

  if (/마진.*(모두|전부).*(검출|자동|잡)|브리지.*마진.*(검출|자동)/.test(text)) {
    const teeth = spanTeeth(ctx);
    if (teeth.length === 0) {
      return { actions: [], reply: "치아를 고르거나 브리지 스팬을 선택해 주세요." };
    }
    return {
      actions: [{ kind: "autoDetectMarginBulk", teeth }],
      reply: `${teeth.map((n) => `#${n}`).join(", ")} 마진을 자동 검출합니다.`,
    };
  }

  if (/^(보철\s*)?생성|만들어/.test(text) || (/(생성|만들)/.test(text) && !/(브리지|스팬)/.test(text))) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    return {
      actions: withSelect(need.tooth, ctx, [{ kind: "generate", teeth: [need.tooth] }]),
      reply: `#${need.tooth} 보철 생성을 시도합니다.`,
    };
  }

  if (/마진\s*확인|epl\s*확인|확인\s*마진/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const review = ctx.marginReview[need.tooth] ?? "none";
    if (review !== "detected") {
      return {
        actions: [],
        reply:
          review === "confirmed"
            ? `#${need.tooth} 마진은 이미 확인했습니다.`
            : `#${need.tooth} 마진을 검출하거나 그린 뒤 확인할 수 있습니다.`,
      };
    }
    return {
      actions: withSelect(need.tooth, ctx, [{ kind: "confirmMargin", tooth: need.tooth }]),
      reply: `#${need.tooth} 마진을 확인했습니다.`,
    };
  }

  if (/마진\s*(검출|자동|잡)/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    return {
      actions: withSelect(need.tooth, ctx, [{ kind: "autoDetectMargin", tooth: need.tooth }]),
      reply: `#${need.tooth} 마진을 자동 검출합니다.`,
    };
  }

  if (/마진\s*수축|수축\s*마진/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const step = parseMm(text, 0.1) ?? 0.1;
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "adjustMarginOffset", tooth: need.tooth, deltaMm: -step },
      ]),
      reply: `#${need.tooth} 마진을 ${step.toFixed(2)} mm 수축합니다.`,
    };
  }

  if (/마진\s*확장|확장\s*마진/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const step = parseMm(text, 0.1) ?? 0.1;
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "adjustMarginOffset", tooth: need.tooth, deltaMm: step },
      ]),
      reply: `#${need.tooth} 마진을 ${step.toFixed(2)} mm 확장합니다.`,
    };
  }

  const innerRules: Array<{ re: RegExp; key: InnerNumberKey; label: string }> = [
    { re: /시멘트\s*(갭|간격)?|cement/, key: "cementGapMm", label: "시멘트 갭" },
    { re: /추가\s*갭/, key: "extraGapMm", label: "추가 갭" },
    { re: /최소\s*두께(?!.*보상)/, key: "minThicknessMm", label: "최소 두께" },
    { re: /마진\s*실\s*갭/, key: "sealGapMm", label: "마진 실 갭" },
  ];
  for (const rule of innerRules) {
    if (!rule.re.test(text)) continue;
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: `${rule.label}(mm) 숫자를 넣어 주세요.` };
    const value = clampInner(rule.key, mm);
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchInner", tooth: need.tooth, patch: { [rule.key]: value } },
      ]),
      reply: `#${need.tooth} ${rule.label}을 ${value.toFixed(3)} mm로 맞췄습니다.`,
    };
  }

  if (/교합\s*간격|오클루전|occlusal/.test(text) && !/절삭|맞춤|닿/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "교합 간격(mm) 숫자를 넣어 주세요." };
    const value = clampClearance(mm);
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { occlusalClearanceMm: value } },
      ]),
      reply: `#${need.tooth} 교합 간격을 ${value.toFixed(2)} mm로 맞췄습니다.`,
    };
  }

  if (/인접\s*간격|proximal/.test(text) && !/절삭|맞춤|닿|블록/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "인접 간격(mm) 숫자를 넣어 주세요." };
    const value = clampClearance(mm);
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { proximalClearanceMm: value } },
      ]),
      reply: `#${need.tooth} 인접 간격을 ${value.toFixed(2)} mm로 맞췄습니다.`,
    };
  }

  type ToggleField = Extract<LabAiChatAction, { kind: "toggleRefine" }>["field"];

  const toggles: Array<{ re: RegExp; field: ToggleField; label: string }> = [
    { re: /교합\s*(절삭|깎)/, field: "occlusalTrim", label: "교합 절삭" },
    { re: /교합\s*(맞춤|닿)/, field: "occlusalFit", label: "교합 맞춤" },
    { re: /인접\s*(절삭|깎)/, field: "proximalTrim", label: "인접 절삭" },
    { re: /인접\s*(맞춤|닿)/, field: "proximalFit", label: "인접 맞춤" },
    { re: /(삽입\s*)?블록\s*아웃|block\s*out/, field: "proximalBlockOut", label: "삽입 블록아웃" },
    { re: /(최소\s*)?두께\s*보상|보상\s*켜/, field: "compensate", label: "최소 두께 보상" },
  ];

  for (const rule of toggles) {
    if (!rule.re.test(text)) continue;
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const on = parseOnOff(text) ?? true;
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "toggleRefine", tooth: need.tooth, field: rule.field, on },
      ]),
      reply: `#${need.tooth} ${rule.label}을 ${on ? "켰" : "껐"}습니다.`,
    };
  }

  const scale = parseScale(text);
  if (scale != null) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { scale } },
      ]),
      reply: `#${need.tooth} 크기를 ${Math.round(scale * 100)}%로 맞췄습니다.`,
    };
  }

  if (/준비\s*마진|마진\s*열/.test(text) || (text.includes("준비") && text.includes("마진"))) {
    return { actions: [{ kind: "navigate", target: "prepareMargin" }], reply: "준비 단계에서 마진을 엽니다." };
  }

  if (/교합\s*(표시|맵|색)/.test(text)) {
    return { actions: [{ kind: "navigate", target: "designOcclusal" }], reply: "디자인 › 교합을 엽니다." };
  }

  if (/형상|refine/.test(text) && !/맞춤|adapt/.test(text)) {
    return { actions: [{ kind: "navigate", target: "designRefine" }], reply: "디자인 › 형상을 엽니다." };
  }

  if (/맞춤|adapt/.test(text)) {
    return { actions: [{ kind: "navigate", target: "designAdapt" }], reply: "디자인 › 형상 › 맞춤을 엽니다." };
  }

  if (/내면|inner/.test(text)) {
    return { actions: [{ kind: "navigate", target: "designInner" }], reply: "디자인 › 내면을 엽니다." };
  }

  return {
    actions: [],
    reply: `이해하지 못했습니다.\n${HELP_REPLY}`,
  };
}

export function applyLabAiChatPatchRefine(
  edit: ToothDesignEdit,
  patch: Partial<ToothDesignEdit["refine"]>,
): ToothDesignEdit {
  const refine = { ...edit.refine, ...patch };
  if (patch.scale != null) refine.scale = clampScale(patch.scale);
  if (patch.occlusalClearanceMm != null) {
    refine.occlusalClearanceMm = clampClearance(patch.occlusalClearanceMm);
  }
  if (patch.proximalClearanceMm != null) {
    refine.proximalClearanceMm = clampClearance(patch.proximalClearanceMm);
  }
  return { ...edit, refine };
}

export function applyLabAiChatMarginOffset(
  edit: ToothDesignEdit,
  deltaMm: number,
): ToothDesignEdit {
  return adjustMarginOffset(edit, deltaMm);
}

export function refineTabForNavigate(
  target: Extract<LabAiChatAction, { kind: "navigate" }>["target"],
): RefineTab | null {
  if (target === "designAdapt") return "adapt";
  if (target === "designRefine") return "transform";
  return null;
}
