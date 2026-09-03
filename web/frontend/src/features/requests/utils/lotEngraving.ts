// change-log:
// - 2026-09-04: 글자 위=STL +Z, 좌우 LTR 비미러 한 번에 고정. CNC X 직경/2 SSOT 유지.
// - 2026-09-04: 좌우만 재교정(BFX LTR·비미러). 상하·HEX depth·X직경/2 SSOT 유지.
// - 2026-09-04: 글자 면내 180° 교정(뒤집힘). CNC X 직경→반경(/2) SSOT 주석·헬퍼.
// - 2026-09-04: BFX(Y반전·비미러), depth=HEX X/2·HEX Z, 글자 소형화.
// - 2026-09-04: 우하단=CNC시작·V−Y로 좌측 진행, 반경(X) 부호 반전, charW≈pitch로 실물 자간.
// - 2026-09-04: CNC X=#521 STOCK DIA 직경모드 → 반경 X/2. 글자 축소·면 방향 교정. surfaceLift 제거.
// - 2026-09-04: StlFileProcessor STL↔Esprit↔CNC 역산 SSOT로 각인 좌표 변환.
// - 2026-09-04: A–Z 단획 스트로크(M98P0001=A … P0026=Z). 헥스 면 중앙 소각인용.
// related:
// - bg/pc1/esprit-addin/StlFileProcessor.cs (Rotate90Degrees, RotateByWAxisDegrees, FinishLine 변환)
// - bg/pc1/esprit-addin/Helpers/NcFileGenerator.cs (M98P0001=A … M98P0026=Z, Serial C, #521 STOCK DIA)
// - bg/pc1/esprit-addin/AcroDent/2_Connection/*.prc (Serial / HEX2.485 블록)
// - bg/pc1/esprit-addin/Config.cs (#523 DefaultStlShift)
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx

/**
 * CNC 선반 X → 프리뷰/Esprit 반경.
 *
 * SSOT (다른 부위 각인에도 동일):
 * - NC X는 직경 모드 (#521 = STOCK DIA). 우리 좌표 반경 = X / 2.
 *   예: G1 X3.43 → radius 1.715, G1 X3.0 → 1.5
 * - X가 작을수록 축에 가깝 = 더 깊게 파냄.
 *   Serial 절삭 X3.43(r=1.715) vs HEX 면 X2.485(r=1.2425):
 *   3.43 > 2.485 이므로 Serial 팁은 HEX 면보다 얕은(바깥) 깊이.
 * - 헥스 면 위에 스트로크를 붙일 때는 면의 있는 HEX X/2를 쓰고,
 *   OD·다른 피처에 각인할 때는 해당 공정의 절삭 X/2를 쓴다.
 */
export function cncDiameterXToRadius(diameterX: number): number {
  const x = Number(diameterX);
  if (!Number.isFinite(x)) return 0;
  return Math.abs(x) / 2;
}

/** PRC Serial / NC 헤더 기본값. */
export const LOT_ENGRAVING_DEFAULTS = {
  startY: 0.525,
  charPitchY: -0.35,
  zOffset: 1.6,
  /**
   * Serial G1 X…F500 — 툴 팁 절삭 깊이(직경).
   * 반경 = cncDiameterXToRadius(3.43)≈1.715 (HEX 면 r≈1.242보다 바깥/얕음).
   */
  cutDiameterX: 3.43,
  /**
   * (HEX2.485) 헥스 플랫 직경. 면 위 미리뷰 depth = cncDiameterXToRadius(hexDiameterX).
   */
  hexDiameterX: 2.485,
  /** HEX Z[#520+#523+…] — 헥스 면 축 위치. */
  hexZOffset: 2.1,
  /** #523 — Config.DefaultStlShift */
  stlShift: 0.05,
  /** StlFileProcessor.DefaultWAxisRotationDegrees */
  wAxisBaseDeg: 30,
  /** 글자 박스(mm). pitch 0.35 · 헥스 면폭에 맞춤. */
  charHeight: 0.36,
  charWidth: 0.22,
  surfaceLift: 0,
} as const;

export type LotEngravingNcParams = {
  startY: number;
  charPitchY: number;
  /** Serial 블록 Z offset (폴백). */
  zOffset: number;
  /** 헥스 면 각인에 쓰는 Z offset (HEX 블록 우선). */
  hexZOffset: number;
  /** Serial 블록 C축(도). */
  cAxisDeg: number;
  cutDiameterX: number;
  /** 헥스 플랫 직경 (depth = /2). */
  hexDiameterX: number;
};

type Stroke = Array<[number, number]>;

/**
 * M98P0001=A … M98P0026=Z 미리뷰용 단획.
 * 유닛 박스 [0,1]×[0,1], (0,0)=좌하, (1,1)=우상.
 */
const LETTER_STROKES: Record<string, Stroke[]> = {
  A: [
    [
      [0.05, 0],
      [0.5, 1],
      [0.95, 0],
    ],
    [
      [0.22, 0.35],
      [0.78, 0.35],
    ],
  ],
  B: [
    [
      [0.1, 0],
      [0.1, 1],
      [0.65, 1],
      [0.85, 0.85],
      [0.85, 0.6],
      [0.65, 0.5],
      [0.1, 0.5],
    ],
    [
      [0.65, 0.5],
      [0.9, 0.35],
      [0.9, 0.15],
      [0.65, 0],
      [0.1, 0],
    ],
  ],
  C: [
    [
      [0.9, 0.85],
      [0.7, 1],
      [0.3, 1],
      [0.1, 0.8],
      [0.1, 0.2],
      [0.3, 0],
      [0.7, 0],
      [0.9, 0.15],
    ],
  ],
  D: [
    [
      [0.1, 0],
      [0.1, 1],
      [0.55, 1],
      [0.85, 0.75],
      [0.85, 0.25],
      [0.55, 0],
      [0.1, 0],
    ],
  ],
  E: [
    [
      [0.85, 1],
      [0.15, 1],
      [0.15, 0],
      [0.85, 0],
    ],
    [
      [0.15, 0.5],
      [0.7, 0.5],
    ],
  ],
  F: [
    [
      [0.15, 0],
      [0.15, 1],
      [0.85, 1],
    ],
    [
      [0.15, 0.5],
      [0.7, 0.5],
    ],
  ],
  G: [
    [
      [0.85, 0.8],
      [0.65, 1],
      [0.3, 1],
      [0.1, 0.75],
      [0.1, 0.25],
      [0.3, 0],
      [0.7, 0],
      [0.9, 0.2],
      [0.9, 0.45],
      [0.55, 0.45],
    ],
  ],
  H: [
    [
      [0.15, 0],
      [0.15, 1],
    ],
    [
      [0.85, 0],
      [0.85, 1],
    ],
    [
      [0.15, 0.5],
      [0.85, 0.5],
    ],
  ],
  I: [
    [
      [0.2, 1],
      [0.8, 1],
    ],
    [
      [0.5, 1],
      [0.5, 0],
    ],
    [
      [0.2, 0],
      [0.8, 0],
    ],
  ],
  J: [
    [
      [0.2, 1],
      [0.85, 1],
    ],
    [
      [0.65, 1],
      [0.65, 0.25],
      [0.5, 0],
      [0.25, 0],
      [0.1, 0.2],
    ],
  ],
  K: [
    [
      [0.15, 0],
      [0.15, 1],
    ],
    [
      [0.85, 1],
      [0.15, 0.5],
      [0.85, 0],
    ],
  ],
  L: [
    [
      [0.15, 1],
      [0.15, 0],
      [0.85, 0],
    ],
  ],
  M: [
    [
      [0.08, 0],
      [0.08, 1],
      [0.5, 0.45],
      [0.92, 1],
      [0.92, 0],
    ],
  ],
  N: [
    [
      [0.15, 0],
      [0.15, 1],
      [0.85, 0],
      [0.85, 1],
    ],
  ],
  O: [
    [
      [0.3, 0],
      [0.7, 0],
      [0.9, 0.25],
      [0.9, 0.75],
      [0.7, 1],
      [0.3, 1],
      [0.1, 0.75],
      [0.1, 0.25],
      [0.3, 0],
    ],
  ],
  P: [
    [
      [0.15, 0],
      [0.15, 1],
      [0.7, 1],
      [0.9, 0.8],
      [0.9, 0.55],
      [0.7, 0.4],
      [0.15, 0.4],
    ],
  ],
  Q: [
    [
      [0.3, 0.1],
      [0.7, 0.1],
      [0.9, 0.3],
      [0.9, 0.75],
      [0.7, 1],
      [0.3, 1],
      [0.1, 0.75],
      [0.1, 0.3],
      [0.3, 0.1],
    ],
    [
      [0.55, 0.35],
      [0.9, 0],
    ],
  ],
  R: [
    [
      [0.15, 0],
      [0.15, 1],
      [0.65, 1],
      [0.85, 0.85],
      [0.85, 0.6],
      [0.65, 0.45],
      [0.15, 0.45],
    ],
    [
      [0.5, 0.45],
      [0.85, 0],
    ],
  ],
  S: [
    [
      [0.85, 0.85],
      [0.7, 1],
      [0.3, 1],
      [0.15, 0.85],
      [0.15, 0.65],
      [0.3, 0.55],
      [0.7, 0.45],
      [0.85, 0.35],
      [0.85, 0.15],
      [0.7, 0],
      [0.3, 0],
      [0.15, 0.15],
    ],
  ],
  T: [
    [
      [0.1, 1],
      [0.9, 1],
    ],
    [
      [0.5, 1],
      [0.5, 0],
    ],
  ],
  U: [
    [
      [0.15, 1],
      [0.15, 0.25],
      [0.3, 0],
      [0.7, 0],
      [0.85, 0.25],
      [0.85, 1],
    ],
  ],
  V: [
    [
      [0.08, 1],
      [0.5, 0],
      [0.92, 1],
    ],
  ],
  W: [
    [
      [0.05, 1],
      [0.25, 0],
      [0.5, 0.55],
      [0.75, 0],
      [0.95, 1],
    ],
  ],
  X: [
    [
      [0.1, 1],
      [0.9, 0],
    ],
    [
      [0.9, 1],
      [0.1, 0],
    ],
  ],
  Y: [
    [
      [0.1, 1],
      [0.5, 0.45],
      [0.9, 1],
    ],
    [
      [0.5, 0.45],
      [0.5, 0],
    ],
  ],
  Z: [
    [
      [0.1, 1],
      [0.9, 1],
      [0.1, 0],
      [0.9, 0],
    ],
  ],
};

export function normalizeLotSerialCode(raw: unknown): string {
  const letters = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (letters.length >= 3) return letters.slice(0, 3);
  return "";
}

export function lotSerialFromLotNumberValue(lotValue: unknown): string {
  const cleaned = String(lotValue || "")
    .replace(/^CA(P)?/i, "")
    .trim()
    .toUpperCase();
  return normalizeLotSerialCode(cleaned.slice(-3));
}

export function getLotLetterStrokes(letter: string): Stroke[] {
  const ch = String(letter || "")
    .trim()
    .toUpperCase()
    .slice(0, 1);
  return LETTER_STROKES[ch] || LETTER_STROKES.A;
}

/**
 * StlFileProcessor 순방향 (source STL → Esprit, MoveSTL 전):
 * 1) Y축 -90°: (sx,sy,sz) → (-sz, sy, sx)
 * 2) X축 +wDeg: wDeg = 30 + (-appliedDeg)
 *
 * 이 함수는 그 역변환 (Esprit → source STL).
 */
export function espritPreMoveToStl(
  ex: number,
  ey: number,
  ez: number,
  wAxisDeg: number,
): { x: number; y: number; z: number } {
  const w = (wAxisDeg * Math.PI) / 180;
  const c = Math.cos(w);
  const s = Math.sin(w);
  // Inverse of: ey = sy*c - sx*s, ez = sy*s + sx*c, ex = -sz
  const sy = c * ey + s * ez;
  const sx = -s * ey + c * ez;
  const sz = -ex;
  return { x: sx, y: sy, z: sz };
}

/**
 * CNC Serial 점 → Esprit (MoveSTL 전).
 *
 * radius 인자는 이미 cncDiameterXToRadius(X)로 환산된 반경.
 * C=0: 반경 → Esprit +Y(외면), CNC Y → Esprit Z, CNC Z → Esprit X.
 */
export function cncSerialToEspritPreMove(opts: {
  /** cncDiameterXToRadius(CNC_X) — 직경이 아님 */
  radius: number;
  yCnc: number;
  /** Z[#520+#523+offset] 의 offset. ex = #523 + offset */
  zOffset: number;
  cAxisDeg: number;
  stlShift?: number;
}): { x: number; y: number; z: number } {
  const shift = opts.stlShift ?? LOT_ENGRAVING_DEFAULTS.stlShift;
  const c = (opts.cAxisDeg * Math.PI) / 180;
  const cosC = Math.cos(c);
  const sinC = Math.sin(c);
  const r = opts.radius;
  const y = opts.yCnc;
  return {
    x: shift + opts.zOffset,
    y: r * cosC - y * sinC,
    z: r * sinC + y * cosC,
  };
}

/** CNC Serial 점 → source STL (프리뷰 메시 좌표). */
export function cncSerialToStl(
  opts: {
    radius: number;
    yCnc: number;
    zOffset: number;
    cAxisDeg: number;
    /** Rhino hexRotation.appliedDeg (부호 반전해 W에 넣음) */
    hexAppliedDeg?: number | null;
    stlShift?: number;
    wAxisBaseDeg?: number;
    surfaceLift?: number;
  },
): { x: number; y: number; z: number } {
  const applied = Number(opts.hexAppliedDeg);
  const hexTelemetry = Number.isFinite(applied) ? -applied : 0;
  const wAxisDeg =
    (opts.wAxisBaseDeg ?? LOT_ENGRAVING_DEFAULTS.wAxisBaseDeg) + hexTelemetry;
  const lift = opts.surfaceLift ?? LOT_ENGRAVING_DEFAULTS.surfaceLift;
  const esprit = cncSerialToEspritPreMove({
    radius: opts.radius + lift,
    yCnc: opts.yCnc,
    zOffset: opts.zOffset,
    cAxisDeg: opts.cAxisDeg,
    stlShift: opts.stlShift,
  });
  return espritPreMoveToStl(esprit.x, esprit.y, esprit.z, wAxisDeg);
}

/**
 * Serial T0909 C축 목표각.
 * NcFileGenerator: STL모델대로 → 0 / 헥스30·헥스X → totalDeg(=30+minor).
 */
export function resolveSerialCAxisDeg(opts: {
  manufacturerHexRotationMode?: string | null;
  hexAppliedDeg?: number | null;
  ncParsedCDeg?: number | null;
}): number {
  const mode = String(opts.manufacturerHexRotationMode || "").trim();
  // STL모델대로: NC에 예전 헥스모드 C30이 남아 있어도 C0 (W축만으로 면 정렬)
  if (!mode || mode === "STL모델대로" || mode === "STL모델+") {
    return 0;
  }
  // 헥스30 / 헥스X: NC 후처리 C를 우선, 없으면 모드·applied로 계산
  if (
    opts.ncParsedCDeg != null &&
    Number.isFinite(opts.ncParsedCDeg) &&
    Math.abs(opts.ncParsedCDeg) > 0.0001
  ) {
    return opts.ncParsedCDeg;
  }
  const applied = Number(opts.hexAppliedDeg);
  const minor = Number.isFinite(applied) ? applied : 0;
  if (mode === "헥스30도회전" || mode === "헥스30+") {
    return 30 + minor;
  }
  const m = mode.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (m) {
    const total = Number(m[1]);
    if (Number.isFinite(total)) return total;
  }
  return 0;
}

export function parseLotEngravingFromNc(ncText: unknown): LotEngravingNcParams | null {
  const text = String(ncText || "");
  if (!text) return null;

  const serialIdx = text.search(/\(Serial\)/i);
  if (serialIdx < 0) return null;
  const block = text.slice(serialIdx, serialIdx + 800);

  const startLine =
    block.match(
      /G98\s*G0\s+[^\n]*Y\s*([+-]?\d+(?:\.\d+)?)[^\n]*C\s*([+-]?\d+(?:\.\d+)?)/i,
    ) ||
    block.match(
      /G0\s+[^\n]*Y\s*([+-]?\d+(?:\.\d+)?)[^\n]*C\s*([+-]?\d+(?:\.\d+)?)/i,
    );
  if (!startLine) return null;

  const startY = Number(startLine[1]);
  const cAxisDeg = Number(startLine[2]);
  if (!Number.isFinite(startY) || !Number.isFinite(cAxisDeg)) return null;

  const zExpr = block.match(
    /Z\s*\[\s*#520\s*\+\s*#523\s*\+\s*([+-]?\d+(?:\.\d+)?)\s*\]/i,
  );
  const zOffsetRaw = zExpr ? Number(zExpr[1]) : LOT_ENGRAVING_DEFAULTS.zOffset;

  const cutMatches = [
    ...block.matchAll(/G1\s*X\s*([+-]?\d+(?:\.\d+)?)\s*F\s*500/gi),
  ];
  const cutRaw = cutMatches.length
    ? Number(cutMatches[cutMatches.length - 1][1])
    : LOT_ENGRAVING_DEFAULTS.cutDiameterX;

  const pitchMatch = block.match(/G1\s*V\s*([+-]?\d+(?:\.\d+)?)/i);
  const pitchRaw = pitchMatch
    ? Number(pitchMatch[1])
    : LOT_ENGRAVING_DEFAULTS.charPitchY;

  // 헥스 면 depth/축: (HEX2.485) 또는 HEX 블록 G1 X… F3000 / Z[+n]
  const hexLabel = text.match(/\(HEX\s*([+-]?\d+(?:\.\d+)?)/i);
  const hexBlockIdx = text.search(/\(HEX/i);
  const hexBlock =
    hexBlockIdx >= 0 ? text.slice(hexBlockIdx, hexBlockIdx + 600) : "";
  const hexCut =
    hexBlock.match(/G98\s*G1\s*X\s*([+-]?\d+(?:\.\d+)?)/i) ||
    hexBlock.match(/G1\s*X\s*([+-]?\d+(?:\.\d+)?)\s*F\s*3000/i);
  const hexZ = hexBlock.match(
    /Z\s*\[\s*#520\s*\+\s*#523\s*\+\s*([+-]?\d+(?:\.\d+)?)\s*\]/i,
  );
  const hexDiaRaw = hexLabel
    ? Number(hexLabel[1])
    : hexCut
      ? Number(hexCut[1])
      : LOT_ENGRAVING_DEFAULTS.hexDiameterX;
  const hexZRaw = hexZ ? Number(hexZ[1]) : LOT_ENGRAVING_DEFAULTS.hexZOffset;

  return {
    startY,
    charPitchY: Number.isFinite(pitchRaw)
      ? pitchRaw
      : LOT_ENGRAVING_DEFAULTS.charPitchY,
    zOffset: Number.isFinite(zOffsetRaw)
      ? zOffsetRaw
      : LOT_ENGRAVING_DEFAULTS.zOffset,
    hexZOffset: Number.isFinite(hexZRaw)
      ? hexZRaw
      : LOT_ENGRAVING_DEFAULTS.hexZOffset,
    cAxisDeg,
    cutDiameterX: Number.isFinite(cutRaw)
      ? cutRaw
      : LOT_ENGRAVING_DEFAULTS.cutDiameterX,
    hexDiameterX: Number.isFinite(hexDiaRaw)
      ? hexDiaRaw
      : LOT_ENGRAVING_DEFAULTS.hexDiameterX,
  };
}

export function resolveLotEngravingNcParams(opts: {
  ncText?: string | null;
  manufacturerHexRotationMode?: string | null;
  hexAppliedDeg?: number | null;
}): LotEngravingNcParams {
  const parsed = parseLotEngravingFromNc(opts.ncText);
  const cAxisDeg = resolveSerialCAxisDeg({
    manufacturerHexRotationMode: opts.manufacturerHexRotationMode,
    hexAppliedDeg: opts.hexAppliedDeg,
    ncParsedCDeg: parsed?.cAxisDeg ?? null,
  });
  return {
    startY: parsed?.startY ?? LOT_ENGRAVING_DEFAULTS.startY,
    charPitchY: parsed?.charPitchY ?? LOT_ENGRAVING_DEFAULTS.charPitchY,
    zOffset: parsed?.zOffset ?? LOT_ENGRAVING_DEFAULTS.zOffset,
    hexZOffset: parsed?.hexZOffset ?? LOT_ENGRAVING_DEFAULTS.hexZOffset,
    cAxisDeg,
    cutDiameterX: parsed?.cutDiameterX ?? LOT_ENGRAVING_DEFAULTS.cutDiameterX,
    hexDiameterX: parsed?.hexDiameterX ?? LOT_ENGRAVING_DEFAULTS.hexDiameterX,
  };
}

/**
 * 각인 3글자 스트로크를 source STL 좌표 polyline으로 변환.
 *
 * Depth: 헥스 면 → hexDiameterX/2 (cncDiameterXToRadius).
 *   Serial cutDiameterX/2는 툴 팁 깊이(HEX보다 얕음) — OD·타 부위 각인 시 사용.
 *
 * 면 위 방향 (바깥에서 면 볼 때, 글자 위 = STL +Z):
 * - 글자 높이 v: tip/크라운 = STL +Z ← CNC zOff 감소 (sz = -ex)
 * - 글자 폭 u·pitch: CNC Y. 첫 글자 @ Y0.525, V-0.35
 * - 우하단 원점, 왼쪽(−Y)·위(+Z)로 박스 → 바깥 LTR 비미러 BFX
 */
export function buildLotEngravingStlPolylines(opts: {
  serialCode: string;
  ncParams: LotEngravingNcParams;
  hexAppliedDeg?: number | null;
}): Array<Array<{ x: number; y: number; z: number }>> {
  const serial = normalizeLotSerialCode(opts.serialCode);
  if (!serial) return [];

  const { ncParams } = opts;
  const radius = Math.max(cncDiameterXToRadius(ncParams.hexDiameterX), 0.4);
  const charW = LOT_ENGRAVING_DEFAULTS.charWidth;
  const charH = LOT_ENGRAVING_DEFAULTS.charHeight;
  // 글자 하단 기준 CNC Z. 위로(+Z) 갈수록 zOff 감소
  const zBottom = ncParams.hexZOffset;
  const out: Array<Array<{ x: number; y: number; z: number }>> = [];

  for (let i = 0; i < serial.length; i += 1) {
    const ch = serial[i];
    // CNC 절대 Y = 이 글자 박스 우측 (우하단 원점의 Y)
    const originY = ncParams.startY + ncParams.charPitchY * i;
    const strokes = getLotLetterStrokes(ch);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const poly: Array<{ x: number; y: number; z: number }> = [];
      for (const [u, v] of stroke) {
        // 가로: 미러 해제 — u=0 좌(획 시작)가 화면 왼쪽. originY=글자 우측
        const yCnc = originY - u * charW;
        // 세로: v=1 상 = STL +Z (zOff↓)
        const zOff = zBottom - v * charH;
        poly.push(
          cncSerialToStl({
            radius,
            yCnc,
            zOffset: zOff,
            cAxisDeg: ncParams.cAxisDeg,
            hexAppliedDeg: opts.hexAppliedDeg,
          }),
        );
      }
      out.push(poly);
    }
  }
  return out;
}
