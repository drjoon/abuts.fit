// AI 디자인 채팅 — 규칙 기반 1차 명령 해석(자연어 → 수정값·화면 이동).
// related files:
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/practice/labProsthesisModify.ts

import {
  CLEARANCE_RANGE_MM,
  adjustMarginOffset,
  type MarginReview,
  type RefineTab,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

export type LabAiChatAction =
  | { kind: "patchRefine"; tooth: string; patch: Partial<ToothDesignEdit["refine"]> }
  | { kind: "adjustMarginOffset"; tooth: string; deltaMm: number }
  | { kind: "confirmMargin"; tooth: string }
  | { kind: "autoDetectMargin"; tooth: string }
  | { kind: "generate"; teeth: string[] }
  | { kind: "navigate"; target: "prepareMargin" | "designRefine" | "designAdapt" | "designInner" }
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
};

export type LabAiChatInterpretResult = {
  actions: LabAiChatAction[];
  reply: string;
};

const HELP_REPLY = [
  "예시 명령입니다.",
  "· 마진 확인 / EPL 확인",
  "· 마진 검출",
  "· 마진 수축 0.1 / 마진 확장",
  "· 교합 간격 0.2 / 인접 간격 0.15",
  "· 교합 절삭 켜 / 교합 맞춤 켜",
  "· 인접 절삭 켜 / 삽입 블록아웃 켜",
  "· 크기 105% / 스케일 1.05",
  "· 최소 두께 보상",
  "· 준비 마진 / 형상 맞춤",
  "· 보철 생성",
].join("\n");

function normalize(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
  const explicit = text.match(/(-?\d+(?:\.\d+)?)\s*(?:mm|밀리|㎜)/);
  if (explicit) {
    const n = Number(explicit[1]);
    return Number.isFinite(n) ? n : fallback;
  }
  return firstNumber(text) ?? fallback;
}

function parseScale(text: string): number | null {
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n) ? clampScale(n / 100) : null;
  }
  if (/크기|스케일|scale/.test(text)) {
    const n = firstNumber(text);
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

function toothOrFail(
  ctx: LabAiChatInterpretContext,
  replyNeed: string,
): { tooth: string } | { fail: string } {
  const tooth = ctx.activeToothNumber;
  if (!tooth) return { fail: "치아를 먼저 고릅니다." };
  return { tooth };
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

  const actions: LabAiChatAction[] = [];

  if (/^(보철\s*)?생성|만들어/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    return {
      actions: [{ kind: "generate", teeth: [need.tooth] }],
      reply: `#${need.tooth} 보철 생성을 시도합니다.`,
    };
  }

  if (/마진\s*확인|epl\s*확인|확인\s*마진/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const review = ctx.marginReview[need.tooth] ?? "none";
    if (review !== "detected") {
      return {
        actions: [],
        reply:
          review === "confirmed"
            ? "이미 마진을 확인했습니다."
            : "마진을 검출하거나 그린 뒤 확인할 수 있습니다.",
      };
    }
    actions.push({ kind: "confirmMargin", tooth: need.tooth });
    return { actions, reply: `#${need.tooth} 마진을 확인했습니다.` };
  }

  if (/마진\s*(검출|자동|잡)/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    actions.push({ kind: "autoDetectMargin", tooth: need.tooth });
    return { actions, reply: `#${need.tooth} 마진을 자동 검출합니다.` };
  }

  if (/마진\s*수축|수축\s*마진/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const step = parseMm(text, 0.1) ?? 0.1;
    actions.push({ kind: "adjustMarginOffset", tooth: need.tooth, deltaMm: -step });
    return { actions, reply: `#${need.tooth} 마진을 ${step.toFixed(2)} mm 수축합니다.` };
  }

  if (/마진\s*확장|확장\s*마진/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const step = parseMm(text, 0.1) ?? 0.1;
    actions.push({ kind: "adjustMarginOffset", tooth: need.tooth, deltaMm: step });
    return { actions, reply: `#${need.tooth} 마진을 ${step.toFixed(2)} mm 확장합니다.` };
  }

  if (/교합\s*간격|오클루전|occlusal/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "교합 간격(mm) 숫자를 넣어 주세요." };
    const value = clampClearance(mm);
    actions.push({ kind: "patchRefine", tooth: need.tooth, patch: { occlusalClearanceMm: value } });
    return { actions, reply: `#${need.tooth} 교합 간격을 ${value.toFixed(2)} mm로 맞췄습니다.` };
  }

  if (/인접\s*간격|proximal/.test(text)) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "인접 간격(mm) 숫자를 넣어 주세요." };
    const value = clampClearance(mm);
    actions.push({ kind: "patchRefine", tooth: need.tooth, patch: { proximalClearanceMm: value } });
    return { actions, reply: `#${need.tooth} 인접 간격을 ${value.toFixed(2)} mm로 맞췄습니다.` };
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
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    const on = parseOnOff(text) ?? true;
    actions.push({ kind: "toggleRefine", tooth: need.tooth, field: rule.field, on });
    return {
      actions,
      reply: `#${need.tooth} ${rule.label}을 ${on ? "켰" : "껐"}습니다.`,
    };
  }

  const scale = parseScale(text);
  if (scale != null) {
    const need = toothOrFail(ctx, "");
    if ("fail" in need) return { actions: [], reply: need.fail };
    actions.push({ kind: "patchRefine", tooth: need.tooth, patch: { scale } });
    return {
      actions,
      reply: `#${need.tooth} 크기를 ${Math.round(scale * 100)}%로 맞췄습니다.`,
    };
  }

  if (/준비\s*마진|마진\s*열/.test(text) || (text.includes("준비") && text.includes("마진"))) {
    actions.push({ kind: "navigate", target: "prepareMargin" });
    return { actions, reply: "준비 단계에서 마진을 엽니다." };
  }

  if (/형상|refine/.test(text) && !/맞춤|adapt/.test(text)) {
    actions.push({ kind: "navigate", target: "designRefine" });
    return { actions, reply: "디자인 › 형상을 엽니다." };
  }

  if (/맞춤|adapt|교합\s*맞/.test(text)) {
    actions.push({ kind: "navigate", target: "designAdapt" });
    return { actions, reply: "디자인 › 형상 › 맞춤을 엽니다." };
  }

  if (/내면|inner/.test(text)) {
    actions.push({ kind: "navigate", target: "designInner" });
    return { actions, reply: "디자인 › 내면을 엽니다." };
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
