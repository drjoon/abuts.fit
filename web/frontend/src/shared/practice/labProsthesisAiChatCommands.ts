// AI 디자인 채팅 — 규칙 기반 1차 명령 해석(자연어 → 수정값·화면 이동).
// related files:
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/practice/labProsthesisModify.ts

import {
  INNER_FIELDS,
  type InnerMaterial,
  type InnerMethod,
  type InnerParams,
} from "@/shared/practice/labDesignPresets";
import {
  CLEARANCE_RANGE_MM,
  GINGIVAL_RANGE_MM,
  adjustMarginOffset,
  applyRefineTransform,
  type MarginReview,
  type RefineTab,
  type RefineTransform,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";

export type LabAiChatAction =
  | { kind: "selectTooth"; tooth: string }
  | { kind: "patchRefine"; tooth: string; patch: Partial<ToothDesignEdit["refine"]> }
  | { kind: "patchInner"; tooth: string; patch: Partial<InnerParams> }
  | { kind: "adjustMarginOffset"; tooth: string; deltaMm: number }
  | { kind: "confirmMargin"; tooth: string }
  | { kind: "confirmMarginBulk"; teeth: string[] }
  | { kind: "autoDetectMargin"; tooth: string }
  | { kind: "autoDetectMarginBulk"; teeth: string[] }
  | { kind: "generate"; teeth: string[] }
  | {
      kind: "navigate";
      target:
        | "prepareMargin"
        | "designRefine"
        | "designOuter"
        | "designAdapt"
        | "designInner"
        | "designOcclusal";
    }
  | {
      kind: "toggleRefine";
      tooth: string;
      field:
        | "proximalBlockOut"
        | "occlusalTrim"
        | "occlusalFit"
        | "proximalTrim"
        | "proximalFit"
        | "gingivalFit"
        | "compensate";
      on: boolean;
    }
  | { kind: "undo" }
  | { kind: "redo" };

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
  /** 아직 생성하지 않은 designable 치아. */
  pendingGenerate?: readonly string[];
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
  "· 시멘트 갭 0.05 / 최소 두께 0.8 / 지르코니아",
  "· 치은 간격 0.3 / 회전 15 / 가로 110%",
  "· 교두 0.2 / 교합 절삭 켜 / 삽입 블록아웃 켜",
  "· 크기 110% / 보철 생성 / 모두 생성",
  "· 오프셋 초기화 / 실행 취소 / 준비 마진",
].join("\n");

function normalize(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * 측정값에서 치아 번호만 뺀다.
 * `#16`, `16번`, `16i`, 문장 맨 앞 `16`만 치아다. `110%`·`회전 15`의 숫자는 남긴다.
 */
function stripToothTokens(text: string) {
  return text
    .replace(/#\s*([1-4][1-8])(?!\d)/g, " ")
    .replace(/\b([1-4][1-8])(?!\d)\s*(?:번|호|i\b)/g, " ")
    .replace(/^([1-4][1-8])(?!\d)(?=\s)/, " ");
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
  if (/(가로|세로|높이|회전)/.test(text)) return null;
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
  const marked = text.match(/#\s*([1-4][1-8])(?!\d)|\b([1-4][1-8])(?!\d)\s*(?:번|호|i\b)/);
  if (marked) return marked[1] ?? marked[2] ?? null;
  const leading = text.match(/^([1-4][1-8])(?!\d)(?=\s)/);
  return leading?.[1] ?? null;
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

function clampInner(key: keyof InnerParams, value: number) {
  const field = INNER_FIELDS.find((row) => row.key === key);
  if (!field) return value;
  return Math.min(field.max, Math.max(field.min, value));
}

function clampSpan(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const SHAPE_KEYS = [
  "occlusalTable",
  "cusp",
  "ridge",
  "groove",
  "buccalCusp",
  "lingualCusp",
  "mesialRidge",
  "distalRidge",
] as const satisfies ReadonlyArray<keyof ToothDesignEdit["refine"]>;

function parseRatio(text: string): number | null {
  const body = stripToothTokens(text);
  const pct = body.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = firstNumber(body);
  if (n == null) return null;
  return Math.abs(n) > 3 ? n / 100 : n;
}

function parseBipolar(text: string): number | null {
  const body = stripToothTokens(text);
  const pct = body.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n) ? clampSpan(n / 100, -1, 1) : null;
  }
  const n = firstNumber(body);
  if (n == null) return null;
  return clampSpan(Math.abs(n) > 1 ? n / 100 : n, -1, 1);
}

function generateBlocked(
  tooth: string,
  ctx: LabAiChatInterpretContext,
): string | null {
  const edit = ctx.edits[tooth];
  if (edit?.pontic.on) return null;
  if (edit?.implant.on && !(edit.implant.libraryId && edit.implant.aligned)) {
    return `#${tooth} 스캔바디를 맞춘 뒤 생성할 수 있습니다.`;
  }
  const review = ctx.marginReview[tooth] ?? "none";
  if (review === "confirmed") return null;
  return review === "detected"
    ? `#${tooth} 마진을 확인한 뒤 생성할 수 있습니다.`
    : `#${tooth} 마진을 검출하고 확인한 뒤 생성할 수 있습니다.`;
}

function isSingleGenerate(text: string) {
  if (!/(생성|만들)/.test(text)) return false;
  if (/(브리지|스팬|모두|전부|전체)/.test(text)) return false;
  if (
    /(마진|교합|인접|갭|두께|회전|가로|세로|높이|치은|블록|절삭|맞춤|검출|확인|수축|확장|간격)/.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

function generateMany(
  teeth: readonly string[],
  ctx: LabAiChatInterpretContext,
  label: string,
): LabAiChatInterpretResult {
  const pending = [...teeth];
  if (pending.length === 0) {
    return {
      actions: [],
      reply: label === "브리지" ? "생성할 브리지 치아가 없습니다." : "생성할 치아가 없습니다.",
    };
  }
  const ready = pending.filter((tooth) => generateBlocked(tooth, ctx) == null);
  if (ready.length === 0) {
    return {
      actions: [],
      reply: generateBlocked(pending[0]!, ctx) ?? "생성할 치아가 없습니다.",
    };
  }
  const names = ready.map((n) => `#${n}`).join(", ");
  const skipped = pending.length - ready.length;
  const lead = label === "브리지" ? `브리지 ${names}` : names;
  return {
    actions: [{ kind: "generate", teeth: ready }],
    reply:
      skipped > 0
        ? `${lead} 보철 생성을 시도합니다.\n마진이 확인되지 않은 ${skipped}개는 빠집니다.`
        : `${lead} 보철 생성을 시도합니다.`,
  };
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

  if (/^(?:다시\s*실행|redo)$/.test(text)) {
    return { actions: [{ kind: "redo" }], reply: "다시 실행합니다." };
  }
  if (/^(?:실행\s*취소|되돌리기|undo)$/.test(text)) {
    return { actions: [{ kind: "undo" }], reply: "실행 취소합니다." };
  }

  if (/페인트/.test(text) && text.length < 24) {
    return {
      actions: [],
      reply: "페인트는 화면에서 칠합니다.\n채팅은 페인트 위치를 바꾸지 않습니다.",
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
    return generateMany(ctx.bridgePendingGenerate ?? [], ctx, "브리지");
  }

  if (/(모두|전부|전체)/.test(text) && /(생성|만들)/.test(text)) {
    return generateMany(ctx.pendingGenerate ?? [], ctx, "남은 치아");
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

  if (
    /(마진|epl).*(모두|전부).*(확인)|(?:모두|전부).*(마진|epl).*확인|브리지.*마진.*확인/.test(
      text,
    )
  ) {
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

  if (isSingleGenerate(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const blocked = generateBlocked(need.tooth, ctx);
    if (blocked) return { actions: [], reply: blocked };
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

  if (/오프셋\s*초기화/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const offset = ctx.edits[need.tooth]?.margin.offsetMm ?? 0;
    if (Math.abs(offset) < 0.001) {
      return { actions: [], reply: `#${need.tooth} 마진 오프셋은 이미 0입니다.` };
    }
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "adjustMarginOffset", tooth: need.tooth, deltaMm: -offset },
      ]),
      reply: `#${need.tooth} 마진 오프셋을 0으로 맞춥니다.`,
    };
  }

  if (/(?:변형|크기|회전)\s*초기화/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    return {
      actions: withSelect(need.tooth, ctx, [
        {
          kind: "patchRefine",
          tooth: need.tooth,
          patch: { scale: 1, stretch: [1, 1, 1], offsetMm: [0, 0], rotateDeg: 0 },
        },
      ]),
      reply: `#${need.tooth} 변형을 초기화합니다.`,
    };
  }

  const stretchAxis = (
    [
      ["가로", 0],
      ["높이", 1],
      ["세로", 2],
    ] as const
  ).find(([label]) => text.includes(label));
  if (stretchAxis && /%|배율/.test(text) && !/이동|mm|밀리|㎜/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const ratio = parseRatio(text);
    if (ratio == null) return { actions: [], reply: `${stretchAxis[0]} 배율 숫자를 넣어 주세요.` };
    const base = ctx.edits[need.tooth]?.refine.stretch ?? [1, 1, 1];
    const stretch = [...base] as [number, number, number];
    stretch[stretchAxis[1]] = ratio;
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { stretch } },
      ]),
      reply: `#${need.tooth} ${stretchAxis[0]}를 ${Math.round(ratio * 100)}%로 맞춥니다.`,
    };
  }

  if (/(가로|세로)\s*이동|(가로|세로).*(?:mm|밀리|㎜)/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "이동 거리(mm) 숫자를 넣어 주세요." };
    const axis = text.includes("세로") ? 1 : 0;
    const base = ctx.edits[need.tooth]?.refine.offsetMm ?? [0, 0];
    const offsetMm: [number, number] = [base[0], base[1]];
    offsetMm[axis] = mm;
    const label = axis === 1 ? "세로" : "가로";
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { offsetMm } },
      ]),
      reply: `#${need.tooth} ${label} 이동을 ${mm.toFixed(2)} mm로 맞춥니다.`,
    };
  }

  if (/회전/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const deg = firstNumber(stripToothTokens(text));
    if (deg == null) return { actions: [], reply: "회전 각도 숫자를 넣어 주세요." };
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { rotateDeg: deg } },
      ]),
      reply: `#${need.tooth} 회전을 ${Math.round(deg)}°로 맞춥니다.`,
    };
  }

  const shapeRules: Array<{
    re: RegExp;
    key: (typeof SHAPE_KEYS)[number];
    label: string;
  }> = [
    { re: /교합면\s*(폭|너비)/, key: "occlusalTable", label: "교합면 폭" },
    { re: /협측\s*교두/, key: "buccalCusp", label: "협측 교두" },
    { re: /설측\s*교두/, key: "lingualCusp", label: "설측 교두" },
    { re: /근심\s*(?:변연\s*)?융선/, key: "mesialRidge", label: "근심 변연융선" },
    { re: /원심\s*(?:변연\s*)?융선/, key: "distalRidge", label: "원심 변연융선" },
    { re: /구\s*깊이|중심\s*구/, key: "groove", label: "구 깊이" },
    { re: /융선/, key: "ridge", label: "융선" },
    { re: /교두/, key: "cusp", label: "교두" },
  ];
  for (const rule of shapeRules) {
    if (!rule.re.test(text)) continue;
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const value = parseBipolar(text);
    if (value == null) return { actions: [], reply: `${rule.label} 숫자를 넣어 주세요. -1~1입니다.` };
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { [rule.key]: value } },
      ]),
      reply: `#${need.tooth} ${rule.label}을 ${value.toFixed(2)}로 맞춥니다.`,
    };
  }

  if (/치은\s*간격/.test(text) && !/맞춤|띄/.test(text)) {
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    if (mm == null) return { actions: [], reply: "치은 간격(mm) 숫자를 넣어 주세요." };
    const value = clampSpan(mm, GINGIVAL_RANGE_MM.min, GINGIVAL_RANGE_MM.max);
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchRefine", tooth: need.tooth, patch: { gingivalMm: value } },
      ]),
      reply: `#${need.tooth} 치은 간격을 ${value.toFixed(2)} mm로 맞춥니다.`,
    };
  }

  const innerRules: Array<{
    re: RegExp;
    key: (typeof INNER_FIELDS)[number]["key"];
    label: string;
  }> = [
    { re: /툴\s*반지름|버\s*반지름/, key: "toolRadiusMm", label: "툴 반지름" },
    { re: /마진\s*실\s*높이/, key: "sealHeightMm", label: "마진 실 높이" },
    { re: /마진\s*폭/, key: "marginWidthMm", label: "마진 폭" },
    { re: /마진\s*각도/, key: "marginAngleDeg", label: "마진 각도" },
    { re: /시멘트\s*(?:갭|간격)|cement/, key: "cementGapMm", label: "시멘트 갭" },
    { re: /추가\s*갭/, key: "extraGapMm", label: "추가 갭" },
    { re: /최소\s*두께(?!.*보상)/, key: "minThicknessMm", label: "최소 두께" },
    { re: /마진\s*실\s*갭/, key: "sealGapMm", label: "마진 실 갭" },
  ];
  for (const rule of innerRules) {
    if (!rule.re.test(text)) continue;
    const need = resolveTooth(text, ctx);
    if ("fail" in need) return { actions: [], reply: need.fail };
    const mm = parseMm(text);
    const field = INNER_FIELDS.find((row) => row.key === rule.key);
    if (mm == null) {
      return { actions: [], reply: `${rule.label}(${field?.unit ?? "mm"}) 숫자를 넣어 주세요.` };
    }
    const value = clampInner(rule.key, mm);
    const digits = field?.digits ?? 3;
    const unit = field?.unit === "°" ? "°" : "mm";
    return {
      actions: withSelect(need.tooth, ctx, [
        { kind: "patchInner", tooth: need.tooth, patch: { [rule.key]: value } },
      ]),
      reply: `#${need.tooth} ${rule.label}을 ${value.toFixed(digits)} ${unit}로 맞춥니다.`,
    };
  }

  if (!/갭|두께|반지름|폭|각도|높이|간격/.test(text)) {
    const materials: Array<{ re: RegExp; material: InnerMaterial; method: InnerMethod; label: string }> = [
      { re: /지르코니아|zirconia/, material: "zirconia", method: "milling", label: "지르코니아" },
      { re: /글라스|glass/, material: "glass", method: "milling", label: "글라스 세라믹" },
      { re: /pmma/, material: "pmma", method: "milling", label: "PMMA" },
      { re: /레진|resin/, material: "resin", method: "print", label: "프린트 레진" },
    ];
    for (const rule of materials) {
      if (!rule.re.test(text)) continue;
      const need = resolveTooth(text, ctx);
      if ("fail" in need) return { actions: [], reply: need.fail };
      return {
        actions: withSelect(need.tooth, ctx, [
          {
            kind: "patchInner",
            tooth: need.tooth,
            patch: { material: rule.material, method: rule.method },
          },
        ]),
        reply: `#${need.tooth} 재료를 ${rule.label}로 맞춥니다.`,
      };
    }
    if (/밀링/.test(text)) {
      const need = resolveTooth(text, ctx);
      if ("fail" in need) return { actions: [], reply: need.fail };
      const material = ctx.edits[need.tooth]?.inner.material;
      const patch: Partial<InnerParams> =
        material === "resin" ? { method: "milling", material: "zirconia" } : { method: "milling" };
      return {
        actions: withSelect(need.tooth, ctx, [
          { kind: "patchInner", tooth: need.tooth, patch },
        ]),
        reply: `#${need.tooth} 가공을 밀링으로 맞춥니다.`,
      };
    }
    if (/3d\s*프린트|프린트/.test(text)) {
      const need = resolveTooth(text, ctx);
      if ("fail" in need) return { actions: [], reply: need.fail };
      const material = ctx.edits[need.tooth]?.inner.material;
      const patch: Partial<InnerParams> =
        material !== "resin" ? { method: "print", material: "resin" } : { method: "print" };
      return {
        actions: withSelect(need.tooth, ctx, [
          { kind: "patchInner", tooth: need.tooth, patch },
        ]),
        reply: `#${need.tooth} 가공을 3D 프린트로 맞춥니다.`,
      };
    }
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
    { re: /치은\s*(맞춤|띄)|경부\s*(띄|맞춤)|치조정\s*맞춤/, field: "gingivalFit", label: "치은 맞춤" },
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

  if (/스마트\s*편집|외면/.test(text)) {
    return { actions: [{ kind: "navigate", target: "designOuter" }], reply: "디자인 › 형상 › 외면을 엽니다." };
  }

  if (/변형|형상|refine/.test(text) && !/맞춤|adapt|초기화|외면/.test(text)) {
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
  const transform: Partial<RefineTransform> = {};
  if (patch.scale != null) transform.scale = patch.scale;
  if (patch.stretch) transform.stretch = patch.stretch;
  if (patch.offsetMm) transform.offsetMm = patch.offsetMm;
  if (patch.rotateDeg != null) transform.rotateDeg = patch.rotateDeg;
  let next =
    Object.keys(transform).length > 0 ? applyRefineTransform(edit, transform) : edit;

  const refine = { ...next.refine };
  if (patch.occlusalClearanceMm != null) {
    refine.occlusalClearanceMm = clampClearance(patch.occlusalClearanceMm);
  }
  if (patch.proximalClearanceMm != null) {
    refine.proximalClearanceMm = clampClearance(patch.proximalClearanceMm);
  }
  if (patch.gingivalMm != null) {
    refine.gingivalMm = clampSpan(patch.gingivalMm, GINGIVAL_RANGE_MM.min, GINGIVAL_RANGE_MM.max);
  }
  for (const key of SHAPE_KEYS) {
    const value = patch[key];
    if (value != null) refine[key] = clampSpan(value, -1, 1);
  }
  next = { ...next, refine };
  return next;
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
  if (target === "designOuter") return "outer";
  if (target === "designRefine") return "transform";
  return null;
}
