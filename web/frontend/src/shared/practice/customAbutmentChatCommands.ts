// 커스텀어벗 디자인 대화에서 정형 명령(「마진 0.5mm 얕게」「#23 포스트 낮춰」「#24」)을 AI 없이 해석한다.
// 다 알아들은 문장만 처리하고, 남는 말이 있으면 null을 돌려 AI(서버)로 넘긴다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js

import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  CUSTOM_ABUTMENT_PREFERENCE_KEYS,
  type CustomAbutmentDesignParams,
  type CustomAbutmentParamKey,
  type CustomAbutmentPreferenceScope,
} from "@/shared/practice/customAbutmentDesignParams";

export type LocalDesignChange = {
  toothNumber: string;
  params: Partial<CustomAbutmentDesignParams>;
};

export type LocalDesignCommand =
  | { kind: "select"; toothNumber: string | null }
  | { kind: "reply"; text: string }
  | { kind: "reset"; teeth: string[] }
  | { kind: "regenerate"; teeth: string[] }
  | {
      kind: "apply";
      changes: LocalDesignChange[];
      preference: {
        scope: CustomAbutmentPreferenceScope;
        params: Partial<CustomAbutmentDesignParams>;
        note: string;
      } | null;
    };

export type LocalDesignContext = {
  teeth: ReadonlyArray<{
    toothNumber: string;
    params: CustomAbutmentDesignParams;
    hasOpposing: boolean;
  }>;
  selectedTooth: string | null;
};

type Delta = { key: CustomAbutmentParamKey; mode: "set" | "add"; value: number };

type Rule = {
  /** 이 절을 맡는지. 맡으면 남는 말을 지울 패턴과 바꿀 값을 돌려준다. */
  match: (clause: string, num: number | null, amount: number, ctx: { hasOpposing: boolean }) =>
    | { strip: RegExp[]; deltas: Delta[] }
    | null;
};

const NUM_RE = /(\d+(?:\.\d+)?)\s*(mm|㎜|미리|밀리|°|도|%|퍼센트)?/;
const TOOTH_RE = /#\s*([1-4][1-8])(?!\d)|(?<!\d)([1-4][1-8])\s*번/g;
const PREFERENCE_RE = /(앞으로|항상|매번|기본\s*값?으로|기본으로|우리\s*(?:치과|병원)|다음\s*(?:케이스|환자)|이후로)/;
const FILLER_RE =
  /(조금만?|좀\s*더|좀|살짝|약간|많이|훨씬|더|정도로?|만큼|쯤|씩|해\s*주세요|해\s*줘요?|해줘요?|주세요|줘요?|부탁(?:해요|드려요|합니다)?|해요|하게|하자|할게|해|으로|로|을|를|은|는|이|가|도|에서?|요|게|만|전부|모두|전체|다|치아|에도|으로도|좀더|하기|시켜|해봐|봐)/g;

const has = (s: string, re: RegExp) => re.test(s);

const RULES: Rule[] = [
  // 「치은 연하 0.5~1.0」, 「치은 연하 -1.5~-2.0」, 「치은 연상 1.5~2.0」은 구간, 숫자 하나는 얕은 끝.
  {
    match: (c, num) => {
      const isSupra = has(c, /치은\s*연상/);
      if (!has(c, /치은\s*연하/) && !isSupra) return null;
      const strip = [/치은\s*연[하상]/g, /마진/g, /(깊|얕)[게이]?/g];
      const range = /(-?\d+(?:\.\d+)?)\s*[~～]\s*(-?\d+(?:\.\d+)?)/.exec(c) ||
        (!c.includes("-") || /-\d+(?:\.\d+)?\s*-\s*-\d+/.test(c)
          ? /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/.exec(c)
          : null);
      if (range) {
        const rawA = Number(range[1]);
        const rawB = Number(range[2]);
        const a = isSupra && rawA > 0 ? -rawA : rawA;
        const b = isSupra && rawB > 0 ? -rawB : rawB;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return {
          strip: [...strip, /(-?\d+(?:\.\d+)?)\s*[~～\-]\s*(-?\d+(?:\.\d+)?)/g],
          deltas: [
            { key: "marginSubgMinMm", mode: "set", value: lo },
            { key: "marginSubgMaxMm", mode: "set", value: hi },
            { key: "marginDepthMm", mode: "set", value: lo },
          ],
        };
      }
      const signedMatch = /(-?\d+(?:\.\d+)?)/.exec(c);
      const signedNum = signedMatch ? Number(signedMatch[1]) : num;
      if (signedNum != null && Number.isFinite(signedNum)) {
        const v = isSupra && signedNum > 0 ? -signedNum : signedNum;
        return { strip: [...strip, /-/g], deltas: [{ key: "marginDepthMm", mode: "set", value: v }] };
      }
      return null;
    },
  },
  // 피니시라인 깊이: 깊게/얕게, 「치은 하방 0.8」
  {
    match: (c, num, amount) => {
      if (!has(c, /(마진|피니[시쉬]\s*라인|피니[시쉬]라인)/)) return null;
      if (has(c, /(폭|넓|좁|크|작|키워|줄여)/)) return null;
      if (has(c, /(스캘럽|스칼럽|scallop|근원심|근·원심|근심|원심|인접|치관|(?:치은|잇몸)\s*(?:라인|선))/i)) return null;
      const strip = [/(마진|피니[시쉬]\s*라인)/g, /(치은|잇몸)\s*(하방|아래|밑)/g, /(깊|얕)[게이]?/g, /하방/g];
      if (has(c, /(치은|잇몸)?\s*(하방|아래|밑)/) && num != null && !has(c, /(깊|얕)/)) {
        return { strip, deltas: [{ key: "marginDepthMm", mode: "set", value: num }] };
      }
      if (has(c, /깊/)) return { strip, deltas: [{ key: "marginDepthMm", mode: "add", value: num ?? 0.2 * amount }] };
      if (has(c, /얕/)) return { strip, deltas: [{ key: "marginDepthMm", mode: "add", value: -(num ?? 0.2 * amount) }] };
      if (num != null && has(c, /깊이/)) {
        return { strip: [...strip, /깊이/g], deltas: [{ key: "marginDepthMm", mode: "set", value: num }] };
      }
      return null;
    },
  },
  // 근·원심 스캘럽 마진(치관측 상승 / 치은 라인 추종)
  {
    match: (c, num, amount) => {
      const hasScallopWord = has(c, /(스캘럽|스칼럽|scallop)/i);
      const hasProxMargin =
        has(c, /(마진|피니[시쉬]\s*라인|피니[시쉬]라인)/) &&
        (has(c, /(근원심|근·원심|근심|원심|인접\s*면?)/) || has(c, /(치은|잇몸)\s*(라인|선)/));
      if (!hasScallopWord && !hasProxMargin) return null;
      const strip = [
        /(마진|피니[시쉬]\s*라인|피니[시쉬]라인)/g,
        /(스캘럽|스칼럽|scallop)\s*(패턴|형태|모양)?/gi,
        /(근원심|근·원심|근심|원심|인접\s*면?)/g,
        /치관\s*(쪽|측|방향)?/g,
        /(치은|잇몸)\s*(라인|선)/g,
        /따라\s*(가도록|가게|서)?/g,
        /잡아/g,
        /(올라가[는게도록]*|올려|높여|높게|깊게|뚜렷[하게히]*|강하게|키워|늘려|평평[하게히]*|완만[하게히]*|줄여|낮춰|낮게|내려|없[게이])/g,
      ];
      if (has(c, /(평평|없[게이])/)) {
        return {
          strip,
          deltas: [{ key: "marginScallopMm", mode: num != null ? "set" : "set", value: num ?? 0 }],
        };
      }
      if (has(c, /(완만|줄여|낮춰|낮게|내려)/)) {
        return {
          strip,
          deltas: [{ key: "marginScallopMm", mode: "add", value: -(num ?? 0.25 * amount) }],
        };
      }
      if (
        num != null &&
        !has(c, /(올라|올려|높여|높게|깊게|뚜렷|강하|키워|늘려|더)/)
      ) {
        return { strip, deltas: [{ key: "marginScallopMm", mode: "set", value: num }] };
      }
      return {
        strip,
        deltas: [{ key: "marginScallopMm", mode: "add", value: num ?? 0.3 * amount }],
      };
    },
  },
  // 마진 평평·완만 요청(스캘럽 축소)
  {
    match: (c, num, amount) => {
      if (!has(c, /(마진|피니[시쉬]\s*라인|피니[시쉬]라인)/) || !has(c, /(평평|완만)/)) return null;
      const strip = [
        /(마진|피니[시쉬]\s*라인|피니[시쉬]라인)/g,
        /(평평|완만)[하게히]*/g,
      ];
      if (has(c, /평평/)) {
        return { strip, deltas: [{ key: "marginScallopMm", mode: "set", value: num ?? 0 }] };
      }
      return {
        strip,
        deltas: [{ key: "marginScallopMm", mode: "add", value: -(num ?? 0.25 * amount) }],
      };
    },
  },
  // 마진(챔퍼) 폭
  {
    match: (c, num, amount) => {
      if (!has(c, /(마진|챔퍼)/) || !has(c, /(폭|넓|좁)/)) return null;
      const strip = [/(마진|챔퍼)/g, /폭/g, /(넓|좁)[게혀히]*/g];
      if (num != null && !has(c, /(넓|좁)/)) return { strip, deltas: [{ key: "marginShoulderMm", mode: "set", value: num }] };
      const v = num ?? 0.1 * amount;
      return { strip, deltas: [{ key: "marginShoulderMm", mode: "add", value: has(c, /좁/) ? -v : v }] };
    },
  },
  // 마진 크기
  {
    match: (c, _num, amount) => {
      if (!has(c, /마진/) || !has(c, /(크게|작게|키워|줄여)/)) return null;
      return {
        strip: [/마진/g, /(크게|작게|키워|줄여)/g],
        deltas: [{ key: "marginSizeScale", mode: "add", value: (has(c, /(작게|줄여)/) ? -0.04 : 0.04) * amount }],
      };
    },
  },
  // 대합 간격
  {
    match: (c, num, amount) => {
      if (!has(c, /(대합|교합)\s*(치\s*)?(간격|거리|클리어런스|공간|여유)/)) return null;
      const strip = [/(대합|교합)\s*(치\s*)?(간격|거리|클리어런스|공간|여유)/g, /(넓|늘|키|좁|줄)[여혀게]*/g];
      if (num != null && !has(c, /(넓|늘|키|좁|줄)/)) {
        return { strip, deltas: [{ key: "occlusalClearanceMm", mode: "set", value: num }] };
      }
      const v = num ?? 0.2 * amount;
      if (has(c, /(좁|줄)/)) return { strip, deltas: [{ key: "occlusalClearanceMm", mode: "add", value: -v }] };
      if (has(c, /(넓|늘|키)/)) return { strip, deltas: [{ key: "occlusalClearanceMm", mode: "add", value: v }] };
      return null;
    },
  },
  // 포스트 높이
  {
    match: (c, num, amount, { hasOpposing }) => {
      if (!has(c, /(포스트|기둥|어벗|높이)/) || !has(c, /(낮|짧|높[게여이]|길게|늘려)/)) return null;
      const strip = [/(포스트|기둥|어벗)/g, /높이/g, /(낮|짧|높|길|늘)[춰추게여이혀려]*/g];
      const v = num ?? 0.5 * amount;
      if (has(c, /(낮|짧)/)) return { strip, deltas: [{ key: "postHeightOffsetMm", mode: "add", value: -v }] };
      // 대합치가 있으면 높이는 대합 간격으로 정해진다. 간격을 줄여 올린다.
      if (hasOpposing) return { strip, deltas: [{ key: "occlusalClearanceMm", mode: "add", value: -v }] };
      return { strip, deltas: [{ key: "postHeightOffsetMm", mode: "add", value: v }] };
    },
  },
  // 전치부 설측 사면 길이(절단에서 떨어진 거리, mm — 각도 아님)
  {
    match: (c, num, amount) => {
      if (!has(c, /(설측|구개측|싱귤럼)\s*(사면|경사|베벨|길이)/)) return null;
      const strip = [
        /(설측|구개측|싱귤럼)\s*(사면|경사|베벨|길이)/g,
        /절단(연)?(에서|부터)?\s*(떨어진\s*)?(거리)?/g,
        /(길|늘|키|크|짧|줄|작|자동)[게여혀려]*/g,
        /mm|밀리/gi,
      ];
      if (has(c, /자동/)) return { strip, deltas: [{ key: "postLingualBevelMm", mode: "set", value: -1 }] };
      if (num != null && !has(c, /(줄|늘|키|크|작|길|짧)/)) {
        return { strip, deltas: [{ key: "postLingualBevelMm", mode: "set", value: num }] };
      }
      const v = num ?? 0.5 * amount;
      if (has(c, /(짧|줄|작)/)) return { strip, deltas: [{ key: "postLingualBevelMm", mode: "add", value: -v }] };
      if (has(c, /(길|늘|키|크)/)) return { strip, deltas: [{ key: "postLingualBevelMm", mode: "add", value: v }] };
      return null;
    },
  },
  // 테이퍼
  {
    match: (c, num, amount) => {
      if (has(c, /테이퍼/)) {
        const strip = [/테이퍼/g, /(줄|늘|키|크|작)[여게혀]*/g];
        if (num != null && !has(c, /(줄|늘|키|크|작)/)) return { strip, deltas: [{ key: "postTaperDeg", mode: "set", value: num }] };
        const v = num ?? 0.5 * amount;
        if (has(c, /(줄|작)/)) return { strip, deltas: [{ key: "postTaperDeg", mode: "add", value: -v }] };
        if (has(c, /(늘|키|크)/)) return { strip, deltas: [{ key: "postTaperDeg", mode: "add", value: v }] };
        return null;
      }
      if (has(c, /(포스트|기둥|벽)?.*수직/)) {
        return {
          strip: [/(포스트|기둥|벽)/g, /수직[으로]*/g],
          deltas: [{ key: "postTaperDeg", mode: "add", value: -(num ?? 0.5 * amount) }],
        };
      }
      return null;
    },
  },
  // 포스트 굵기
  {
    match: (c, num, amount) => {
      if (!has(c, /(포스트|기둥|어벗)/) || !has(c, /(얇|가늘|두껍|굵|두툼)/)) return null;
      const pct = num != null ? num / 100 : 0.05 * amount;
      const thin = has(c, /(얇|가늘)/);
      return {
        strip: [/(포스트|기둥|어벗)/g, /(얇|가늘|두껍|굵|두툼)[게하]*/g],
        deltas: [{ key: "postWidthScale", mode: "add", value: thin ? -pct : pct }],
      };
    },
  },
  // 크라운 두께
  {
    match: (c, num, amount) => {
      if (!has(c, /(크라운|보철)\s*(두께|공간)/)) return null;
      const strip = [/(크라운|보철)\s*(두께|공간)/g, /(두껍|늘|확보|키|얇|줄)[게여혀]*/g];
      if (num != null && !has(c, /(두껍|늘|확보|키|얇|줄)/)) {
        return { strip, deltas: [{ key: "minCrownThicknessMm", mode: "set", value: num }] };
      }
      const v = num ?? 0.2 * amount;
      if (has(c, /(얇|줄)/)) return { strip, deltas: [{ key: "minCrownThicknessMm", mode: "add", value: -v }] };
      return { strip, deltas: [{ key: "minCrownThicknessMm", mode: "add", value: v }] };
    },
  },
  // 포스트 수평 회전(악궁·중심구 정렬 / 시계·반시계 각도 회전)
  {
    match: (c, num, amount) => {
      if (!has(c, /(회전|돌려|평행)/)) return null;
      if (has(c, /(순측|협측|설측|구개측|근심|원심)/) && !has(c, /(시계|악궁|중심구|central\s*groove)/i)) {
        return null;
      }
      const strip = [
        /(포스트|기둥|어벗)/g,
        /(악궁|치열|중심구|central\s*groove)\s*(선|라인|방향)?[에과와]*/gi,
        /(평행|나란)[하게히]*/g,
        /(반\s*시계|시계\s*반대|시계)\s*(방향)?/g,
        /(회전|돌려|배치)[시켜해줘여겨기]*/g,
      ];
      if (has(c, /(악궁|치열|중심구|central\s*groove)/i) && num == null && !has(c, /(반\s*시계|시계)/)) {
        return { strip, deltas: [{ key: "postYawDeg", mode: "set", value: 0 }] };
      }
      const deg = num ?? 5 * amount;
      if (has(c, /(반\s*시계|시계\s*반대)/)) {
        return { strip, deltas: [{ key: "postYawDeg", mode: "add", value: deg }] };
      }
      if (has(c, /시계/)) {
        return { strip, deltas: [{ key: "postYawDeg", mode: "add", value: -deg }] };
      }
      if (num != null && has(c, /(회전|돌려)/)) {
        const signed = has(c, /-\s*\d/) ? -deg : deg;
        return { strip: [...strip, /-/g], deltas: [{ key: "postYawDeg", mode: "add", value: signed }] };
      }
      return null;
    },
  },
  // 윗면(삽입축) 이동
  {
    match: (c, num, amount) => {
      if (!has(c, /(기울|옮|이동|보내|돌려)/)) return null;
      const v = num ?? 0.5 * amount;
      const strip = [/(순측|협측|설측|구개측|근심|원심)[쪽으로]*/g, /(기울|옮|이동|보내|돌려)[여겨기]*/g, /(삽입축|축|윗면|포스트|상단)/g];
      if (has(c, /(순측|협측)/)) return { strip, deltas: [{ key: "axisShiftLabialMm", mode: "add", value: v }] };
      if (has(c, /(설측|구개측)/)) return { strip, deltas: [{ key: "axisShiftLabialMm", mode: "add", value: -v }] };
      if (has(c, /근심/)) return { strip, deltas: [{ key: "axisShiftMesialMm", mode: "add", value: v }] };
      if (has(c, /원심/)) return { strip, deltas: [{ key: "axisShiftMesialMm", mode: "add", value: -v }] };
      return null;
    },
  },
  // 공구 R
  {
    match: (c, num) => {
      if (!has(c, /(공구|툴)\s*(r|R|알)?/) || num == null) return null;
      return {
        strip: [/(공구|툴)\s*(r|R|알)?/g, /반경/g],
        deltas: [{ key: "marginFilletRadiusMm", mode: "set", value: num }],
      };
    },
  },
];

const SCOPE_LABEL: Record<CustomAbutmentPreferenceScope, string> = {
  all: "전체",
  anterior: "전치",
  posterior: "구치",
};

function amountOf(clause: string): number {
  if (/(조금|살짝|약간|좀)/.test(clause)) return 0.6;
  if (/(많이|훨씬|크게\s*더)/.test(clause)) return 2;
  return 1;
}

function leftoverChars(clause: string, strips: RegExp[]): number {
  let s = clause.replace(TOOTH_RE, " ").replace(new RegExp(NUM_RE.source, "g"), " ");
  for (const re of strips) s = s.replace(re, " ");
  s = s.replace(PREFERENCE_RE, " ").replace(/(전치|앞니|송곳니|구치|어금니|소구치|대구치)[는은도]?/g, " ");
  s = s.replace(FILLER_RE, " ");
  return s.replace(/[\s.,!?~·…"'()]+/g, "").length;
}

function clampParam(key: CustomAbutmentParamKey, v: number) {
  const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
  if (key === "postLingualBevelMm") {
    if (v < 0) return -1;
    const snapped = Math.round(v / spec.step) * spec.step;
    return Math.min(spec.max, Math.max(0.5, Number(snapped.toFixed(1))));
  }
  const step = spec.step;
  const snapped = Math.round(v / step) * step;
  return Math.min(spec.max, Math.max(spec.min, Number(snapped.toFixed(4))));
}

function formatValue(key: CustomAbutmentParamKey, v: number) {
  if (key === "postLingualBevelMm" && v < 0) return "자동";
  const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
  const text = Number(v.toFixed(spec.step >= 0.5 ? 1 : 2)).toString();
  return spec.unit === "배" ? `×${text}` : `${text}${spec.unit}`;
}

/**
 * 정형 명령을 AI 없이 해석한다. 못 알아들은 말이 있으면 null.
 * 숫자는 「얕게 0.3mm」처럼 바꿀 양, 「치은 하방 0.8mm」「테이퍼 3도」처럼 값 자체 둘 다 받는다.
 */
export function parseLocalDesignCommand(
  rawText: string,
  ctx: LocalDesignContext,
): LocalDesignCommand | null {
  const text = rawText.trim();
  if (!text || text.length > 160) return null;

  const designed = new Set(ctx.teeth.map((t) => t.toothNumber));
  const mentioned: string[] = [];
  for (const m of text.matchAll(TOOTH_RE)) {
    const tooth = m[1] || m[2];
    if (tooth && !mentioned.includes(tooth)) mentioned.push(tooth);
  }
  const unknown = mentioned.filter((t) => !designed.has(t));
  if (unknown.length > 0) {
    return {
      kind: "reply",
      text: `이 케이스 디자인 대상이 아닙니다: ${unknown.map((t) => `#${t}`).join(", ")}`,
    };
  }

  const withoutTeeth = text.replace(TOOTH_RE, " ").replace(/(선택|골라\s*줘?|보여\s*줘?|만\s*볼게)/g, " ");
  if (mentioned.length > 0 && withoutTeeth.replace(/[\s.,!?~·]+/g, "").length === 0) {
    if (mentioned.length > 1) return { kind: "reply", text: "치아는 하나씩 고를 수 있습니다." };
    return { kind: "select", toothNumber: mentioned[0]! };
  }
  if (/^(전체|모두|전부)(\s*(선택|보기))?$/.test(text)) return { kind: "select", toothNumber: null };

  const wantsPreference = PREFERENCE_RE.test(text);
  const scope: CustomAbutmentPreferenceScope = /(전치|앞니|송곳니)/.test(text)
    ? "anterior"
    : /(구치|어금니|소구치|대구치)/.test(text)
      ? "posterior"
      : "all";

  let targets: string[];
  if (mentioned.length > 0) targets = mentioned;
  else if (scope !== "all") {
    targets = ctx.teeth
      .filter((t) => (scope === "anterior") === /^[1-4][1-3]$/.test(t.toothNumber))
      .map((t) => t.toothNumber);
  } else if (ctx.selectedTooth && !wantsPreference) targets = [ctx.selectedTooth];
  else targets = ctx.teeth.map((t) => t.toothNumber);

  if (/^(원래대로|초기화|되돌려|처음\s*디자인으로)/.test(withoutTeeth.trim())) {
    return { kind: "reset", teeth: targets };
  }

  const bare = withoutTeeth
    .replace(FILLER_RE, " ")
    .replace(/커스텀\s*어벗|어벗/g, " ")
    .replace(/[\s.,!?~·]+/g, "");
  if (/^(재생성|다시만들기|다시그리기|다시디자인|다시생성)$/.test(bare)) {
    return { kind: "regenerate", teeth: targets };
  }

  const clauses = withoutTeeth
    .split(/[,，;]|그리고|하고\s|또\s|및|(?<=[가-힣])고\s+(?=[가-힣#])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length === 0) return null;

  const deltas: Delta[] = [];
  const anyOpposing = targets.some((t) => ctx.teeth.find((x) => x.toothNumber === t)?.hasOpposing);
  for (const clause of clauses) {
    const numMatch = NUM_RE.exec(clause);
    const num = numMatch ? Number(numMatch[1]) : null;
    const amount = amountOf(clause);
    let hit: { strip: RegExp[]; deltas: Delta[] } | null = null;
    for (const rule of RULES) {
      hit = rule.match(clause, num, amount, { hasOpposing: anyOpposing });
      if (hit) break;
    }
    if (!hit) return null;
    if (leftoverChars(clause, hit.strip) > 2) return null;
    deltas.push(...hit.deltas);
  }
  if (deltas.length === 0) return null;

  const changes: LocalDesignChange[] = [];
  for (const tooth of targets) {
    const cur = ctx.teeth.find((t) => t.toothNumber === tooth);
    if (!cur) continue;
    const params: Partial<CustomAbutmentDesignParams> = {};
    for (const d of deltas) {
      let base = params[d.key] ?? cur.params[d.key];
      if (d.key === "postLingualBevelMm" && d.mode === "add" && base < 0) {
        const isCanine = /^[1-4]3$/.test(tooth);
        base = isCanine ? 2.5 : 4.0;
      }
      params[d.key] = clampParam(d.key, d.mode === "set" ? d.value : base + d.value);
    }
    if (
      params.marginDepthMm != null ||
      params.marginSubgMinMm != null ||
      params.marginSubgMaxMm != null
    ) {
      const prevMin = Number(cur.params.marginSubgMinMm);
      const prevMax = Number(cur.params.marginSubgMaxMm);
      const min0 = Number.isFinite(prevMin) ? prevMin : 0.5;
      const max0 = Number.isFinite(prevMax) ? prevMax : 1;
      let minV = params.marginSubgMinMm ?? min0;
      let maxV = params.marginSubgMaxMm ?? max0;
      if (
        params.marginDepthMm != null &&
        params.marginSubgMinMm == null &&
        params.marginSubgMaxMm == null
      ) {
        const width = Math.max(0, max0 - min0);
        minV = params.marginDepthMm;
        maxV = minV + width;
      }
      minV = clampParam("marginSubgMinMm", Math.min(minV, maxV));
      maxV = clampParam("marginSubgMaxMm", Math.max(minV, maxV));
      params.marginSubgMinMm = minV;
      params.marginSubgMaxMm = maxV;
      params.marginDepthMm = minV;
    }
    changes.push({ toothNumber: tooth, params });
  }
  if (changes.length === 0) return null;

  let preference: Extract<LocalDesignCommand, { kind: "apply" }>["preference"] = null;
  if (wantsPreference) {
    const first = changes[0]!.params;
    const params: Partial<CustomAbutmentDesignParams> = {};
    for (const key of CUSTOM_ABUTMENT_PREFERENCE_KEYS) {
      if (first[key] != null) params[key] = first[key];
    }
    const keys = Object.keys(params) as CustomAbutmentParamKey[];
    if (keys.length > 0) {
      const items = keys.map((k) => `${CUSTOM_ABUTMENT_PARAM_SPECS[k].label} ${formatValue(k, params[k]!)}`);
      preference = {
        scope,
        params,
        note: `${SCOPE_LABEL[scope]} ${items.join(", ")}`.slice(0, 60),
      };
    }
  }
  return { kind: "apply", changes, preference };
}
