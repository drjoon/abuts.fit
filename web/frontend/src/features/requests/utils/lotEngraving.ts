// change-log:
// - 2026-09-04: 포스트 측면 — 글자마다 C(θ) 고정 수직평면. 곡면 래핑(점별 레이캐스트) 폐기.
// - 2026-09-04: 각인 target hex|post 이중 경로. 기본 헥스면, 포스트면은 옵트인.
// - 2026-09-04: 프리뷰=Z축 방위 원통 배치(한글자 θ). 시안 가이드 제거. 표면 r(θ,z).
// - 2026-09-04: 헥스면 → 포스트 측면. 하위 10% 경사각·FL minZ 사이트, FL+1mm, C축 한글자.
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
// - bg/pc1/rhino-server/stl-metadata/index.js (multiDirectionGuides)
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
  /** 헥스면 첫 글자 CNC Y (우하단 원점). 포스트 측면은 Y0. */
  startY: 0.525,
  /** 헥스면 V피치 — 포스트 측면은 C축(호 길이)으로 대체. */
  charPitchY: -0.35,
  zOffset: 1.6,
  cutDiameterX: 3.43,
  hexDiameterX: 2.485,
  hexZOffset: 2.1,
  /** #523 — Config.DefaultStlShift */
  stlShift: 0.05,
  /** StlFileProcessor.DefaultWAxisRotationDegrees */
  wAxisBaseDeg: 30,
  charHeight: 0.42,
  charWidth: 0.28,
  /** 표면 바깥으로 아주 살짝 — 가시성. 가공 깊이 계산과 별개. */
  surfaceLift: 0.04,
  /** 피니시라인 직상방 각인 높이(mm). 글자 하단 기준. */
  aboveFinishLineMm: 1,
  /** 글자 간 원주 호 길이(mm). CNC H = arc/r (프리뷰 Z축 방위). */
  charPitchArcMm: 0.45,
  /** 각인 깊이(반경 방향, mm). cutDiameterX = 2*(radius - depth). */
  engraveDepthMm: 0.12,
  /** 경사각 |taper| 하위 비율(가장 완만한 쪽). */
  taperBottomFraction: 0.1,
} as const;

export type LotEngravingNcParams = {
  startY: number;
  charPitchY: number;
  /** Serial 블록 Z offset = 피니시라인Z+1 (포스트 측면). */
  zOffset: number;
  /** @deprecated 헥스면 폴백용 */
  hexZOffset: number;
  /** 첫 글자 C축(도). 이후 글자는 H(증분 C)로 진행. */
  cAxisDeg: number;
  cutDiameterX: number;
  hexDiameterX: number;
  /** 글자 간 C축 증분(도). + = CCW. */
  charPitchCDeg?: number;
  /** 선택 방위( STL XY, deg ). */
  siteAngleDeg?: number;
  finishLineZ?: number;
  radius?: number;
};

export type TaperDirectionGuide = {
  angle: number;
  taperAngle: number;
  dirFinishLineZ?: number;
  slope?: number;
  intercept?: number;
};

export type PostLotEngravingSite = {
  angleDeg: number;
  finishLineZ: number;
  engraveZ: number;
  radius: number;
  taperAbs: number;
  /** 첫 글자 CNC C (W축 보정 포함). */
  cAxisDeg: number;
  /** 글자 간 C 증분(도). */
  charPitchCDeg: number;
  cutDiameterX: number;
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

export function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * STL XY 방위角 → CNC C.
 * C=0,y=0,W → STL azimuth ≈ 90+W (cncSerialToStl 역산).
 * ⇒ C = 90 + W − θ
 */
export function stlAzimuthToCncCDeg(opts: {
  angleDeg: number;
  hexAppliedDeg?: number | null;
  wAxisBaseDeg?: number;
}): number {
  const applied = Number(opts.hexAppliedDeg);
  const hexTelemetry = Number.isFinite(applied) ? -applied : 0;
  const wAxisDeg =
    (opts.wAxisBaseDeg ?? LOT_ENGRAVING_DEFAULTS.wAxisBaseDeg) + hexTelemetry;
  return normalizeAngleDeg(90 + wAxisDeg - Number(opts.angleDeg));
}

/**
 * 포스트 측면 각인 위치.
 * 경사각 |taper| 하위 10% 후보 중, 직하방 피니시라인 Z가 가장 작은 방향.
 * dirFinishLineZ 없으면 finishLinePoints/minZ 로 폴백.
 */
export function pickPostSideLotEngravingSite(opts: {
  guides: TaperDirectionGuide[] | null | undefined;
  hexAppliedDeg?: number | null;
  wAxisBaseDeg?: number;
  centerRadiusFallback?: number;
  finishLinePoints?: number[][] | null;
  finishLineMinZ?: number | null;
  center?: { x: number; y: number } | null;
}): PostLotEngravingSite | null {
  const guides = Array.isArray(opts.guides) ? opts.guides : [];
  const cx = Number(opts.center?.x) || 0;
  const cy = Number(opts.center?.y) || 0;
  const flPoints = Array.isArray(opts.finishLinePoints)
    ? opts.finishLinePoints
    : [];
  const globalFlMin = Number(opts.finishLineMinZ);

  const flZAtAngle = (angleDeg: number): number | null => {
    if (flPoints.length === 0) {
      return Number.isFinite(globalFlMin) ? globalFlMin : null;
    }
    let bestZ: number | null = null;
    let bestDiff = Infinity;
    for (const p of flPoints) {
      if (!Array.isArray(p) || p.length < 3) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      const z = Number(p[2]);
      if (![x, y, z].every(Number.isFinite)) continue;
      let ptDeg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
      if (ptDeg < 0) ptDeg += 360;
      let diff = Math.abs(ptDeg - angleDeg);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestZ = z;
      }
    }
    if (bestZ != null) return bestZ;
    return Number.isFinite(globalFlMin) ? globalFlMin : null;
  };

  const scored = guides
    .map((g) => {
      const angle = Number(g.angle);
      const taperAbs = Math.abs(Number(g.taperAngle));
      let flZ = Number(g.dirFinishLineZ);
      if (!Number.isFinite(flZ)) {
        const fb = flZAtAngle(angle);
        flZ = fb == null ? Number.NaN : fb;
      }
      const slope = Number(g.slope);
      const intercept = Number(g.intercept);
      if (!Number.isFinite(angle) || !Number.isFinite(taperAbs)) return null;
      if (!Number.isFinite(flZ)) return null;
      return { angle, taperAbs, flZ, slope, intercept };
    })
    .filter(Boolean) as Array<{
    angle: number;
    taperAbs: number;
    flZ: number;
    slope: number;
    intercept: number;
  }>;

  // 가이드 없으면 FL min 방위로 폴백
  if (scored.length === 0) {
    let minPt: { x: number; y: number; z: number } | null = null;
    for (const p of flPoints) {
      if (!Array.isArray(p) || p.length < 3) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      const z = Number(p[2]);
      if (![x, y, z].every(Number.isFinite)) continue;
      if (!minPt || z < minPt.z) minPt = { x, y, z };
    }
    if (!minPt && Number.isFinite(globalFlMin)) {
      minPt = { x: cx + 2, y: cy, z: globalFlMin };
    }
    if (!minPt) return null;
    let angle = (Math.atan2(minPt.y - cy, minPt.x - cx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    const flZ = minPt.z;
    const engraveZ = flZ + LOT_ENGRAVING_DEFAULTS.aboveFinishLineMm;
    const flR = Math.hypot(minPt.x - cx, minPt.y - cy);
    const fallback = Number(opts.centerRadiusFallback);
    const radius =
      flR > 0.4
        ? flR
        : Number.isFinite(fallback) && fallback > 0.4
          ? fallback
          : 2.0;
    const pitchArc = LOT_ENGRAVING_DEFAULTS.charPitchArcMm;
    const charPitchCDeg = (pitchArc / radius) * (180 / Math.PI);
    return {
      angleDeg: angle,
      finishLineZ: flZ,
      engraveZ,
      radius,
      taperAbs: 0,
      cAxisDeg: stlAzimuthToCncCDeg({
        angleDeg: angle,
        hexAppliedDeg: opts.hexAppliedDeg,
        wAxisBaseDeg: opts.wAxisBaseDeg,
      }),
      charPitchCDeg,
      cutDiameterX: Math.max(
        2 * (radius - LOT_ENGRAVING_DEFAULTS.engraveDepthMm),
        1.0,
      ),
    };
  }

  const sortedByTilt = [...scored].sort((a, b) => a.taperAbs - b.taperAbs);
  const keep = Math.max(
    1,
    Math.ceil(sortedByTilt.length * LOT_ENGRAVING_DEFAULTS.taperBottomFraction),
  );
  const bottom = sortedByTilt.slice(0, keep);
  bottom.sort((a, b) => {
    if (a.flZ !== b.flZ) return a.flZ - b.flZ;
    return a.taperAbs - b.taperAbs;
  });
  const best = bottom[0];
  if (!best) return null;

  const engraveZ = best.flZ + LOT_ENGRAVING_DEFAULTS.aboveFinishLineMm;
  let radius = Number.NaN;
  if (Number.isFinite(best.slope) && Number.isFinite(best.intercept)) {
    radius = best.slope * engraveZ + best.intercept;
  }
  // FL 링 반경으로 가드 (회귀 외삽이 빗나가면 FL 반경 사용)
  const flRingR = (() => {
    const zTarget = best.flZ;
    let bestR = -Infinity;
    for (const p of flPoints) {
      if (!Array.isArray(p) || p.length < 3) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      const z = Number(p[2]);
      if (![x, y, z].every(Number.isFinite)) continue;
      if (Math.abs(z - zTarget) > 0.35) continue;
      let ptDeg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
      if (ptDeg < 0) ptDeg += 360;
      let diff = Math.abs(ptDeg - best.angle);
      if (diff > 180) diff = 360 - diff;
      if (diff > 25) continue;
      const rr = Math.hypot(x - cx, y - cy);
      if (rr > bestR) bestR = rr;
    }
    return bestR;
  })();
  if (!Number.isFinite(radius) || radius < 0.4) {
    const fallback = Number(opts.centerRadiusFallback);
    radius =
      flRingR > 0.4
        ? flRingR
        : Number.isFinite(fallback) && fallback > 0.4
          ? fallback
          : 2.0;
  } else if (flRingR > 0.4 && Math.abs(radius - flRingR) > 1.5) {
    // 외삽이 FL 링과 크게 어긋나면 FL 링 우선 (포스트 하단 OD)
    radius = flRingR;
  }

  const pitchArc = LOT_ENGRAVING_DEFAULTS.charPitchArcMm;
  const charPitchCDeg = (pitchArc / radius) * (180 / Math.PI);
  const cAxisDeg = stlAzimuthToCncCDeg({
    angleDeg: best.angle,
    hexAppliedDeg: opts.hexAppliedDeg,
    wAxisBaseDeg: opts.wAxisBaseDeg,
  });
  const depth = LOT_ENGRAVING_DEFAULTS.engraveDepthMm;
  const cutDiameterX = Math.max(2 * (radius - depth), 1.0);

  return {
    angleDeg: best.angle,
    finishLineZ: best.flZ,
    engraveZ,
    radius,
    taperAbs: best.taperAbs,
    cAxisDeg,
    charPitchCDeg,
    cutDiameterX,
  };
}

/**
 * Serial 첫 글자 C — 포스트 측면 사이트 우선, NC 파싱 폴백.
 * (헥스모드 totalDeg는 T0606 전용. T0909 Serial은 사이트 방위를 쓴다.)
 */
export function resolveSerialCAxisDeg(opts: {
  manufacturerHexRotationMode?: string | null;
  hexAppliedDeg?: number | null;
  ncParsedCDeg?: number | null;
  siteCAxisDeg?: number | null;
}): number {
  if (
    opts.siteCAxisDeg != null &&
    Number.isFinite(opts.siteCAxisDeg)
  ) {
    return normalizeAngleDeg(Number(opts.siteCAxisDeg));
  }
  if (
    opts.ncParsedCDeg != null &&
    Number.isFinite(opts.ncParsedCDeg)
  ) {
    return normalizeAngleDeg(Number(opts.ncParsedCDeg));
  }
  return 0;
}

export function parseLotEngravingFromNc(ncText: unknown): LotEngravingNcParams | null {
  const text = String(ncText || "");
  if (!text) return null;

  const serialIdx = text.search(/\(Serial\)/i);
  if (serialIdx < 0) return null;
  const block = text.slice(serialIdx, serialIdx + 900);

  const startYMatch = block.match(/Y\s*([+-]?\d+(?:\.\d+)?)/i);
  const startCMatch = block.match(/C\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!startYMatch || !startCMatch) return null;
  const startY = Number(startYMatch[1]);
  const cAxisDeg = Number(startCMatch[1]);
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

  const pitchCMatch =
    block.match(/G0\s*H\s*([+-]?\d+(?:\.\d+)?)/i) ||
    block.match(/G1\s*H\s*([+-]?\d+(?:\.\d+)?)/i);
  const pitchYMatch = block.match(/G1\s*V\s*([+-]?\d+(?:\.\d+)?)/i);
  const pitchCRaw = pitchCMatch ? Number(pitchCMatch[1]) : null;
  const pitchYRaw = pitchYMatch
    ? Number(pitchYMatch[1])
    : LOT_ENGRAVING_DEFAULTS.charPitchY;

  return {
    startY,
    charPitchY: Number.isFinite(pitchYRaw)
      ? pitchYRaw
      : LOT_ENGRAVING_DEFAULTS.charPitchY,
    zOffset: Number.isFinite(zOffsetRaw)
      ? zOffsetRaw
      : LOT_ENGRAVING_DEFAULTS.zOffset,
    hexZOffset: LOT_ENGRAVING_DEFAULTS.hexZOffset,
    cAxisDeg,
    cutDiameterX: Number.isFinite(cutRaw)
      ? cutRaw
      : LOT_ENGRAVING_DEFAULTS.cutDiameterX,
    hexDiameterX: LOT_ENGRAVING_DEFAULTS.hexDiameterX,
    charPitchCDeg:
      pitchCRaw != null && Number.isFinite(pitchCRaw) ? pitchCRaw : undefined,
  };
}

export function resolveLotEngravingNcParams(opts: {
  ncText?: string | null;
  manufacturerHexRotationMode?: string | null;
  hexAppliedDeg?: number | null;
  site?: PostLotEngravingSite | null;
}): LotEngravingNcParams {
  const parsed = parseLotEngravingFromNc(opts.ncText);
  const site = opts.site || null;
  const cAxisDeg = resolveSerialCAxisDeg({
    manufacturerHexRotationMode: opts.manufacturerHexRotationMode,
    hexAppliedDeg: opts.hexAppliedDeg,
    ncParsedCDeg: parsed?.cAxisDeg ?? null,
    siteCAxisDeg: site?.cAxisDeg ?? null,
  });
  return {
    startY: parsed?.startY ?? LOT_ENGRAVING_DEFAULTS.startY,
    charPitchY: parsed?.charPitchY ?? LOT_ENGRAVING_DEFAULTS.charPitchY,
    zOffset:
      site?.engraveZ ??
      parsed?.zOffset ??
      LOT_ENGRAVING_DEFAULTS.zOffset,
    hexZOffset: parsed?.hexZOffset ?? LOT_ENGRAVING_DEFAULTS.hexZOffset,
    cAxisDeg,
    cutDiameterX:
      site?.cutDiameterX ??
      parsed?.cutDiameterX ??
      LOT_ENGRAVING_DEFAULTS.cutDiameterX,
    hexDiameterX: parsed?.hexDiameterX ?? LOT_ENGRAVING_DEFAULTS.hexDiameterX,
    charPitchCDeg:
      site?.charPitchCDeg ?? parsed?.charPitchCDeg ?? undefined,
    siteAngleDeg: site?.angleDeg,
    finishLineZ: site?.finishLineZ,
    radius: site?.radius,
  };
}

/**
 * 헥스면 각인 스트로크 (source STL 좌표).
 *
 * Depth: 헥스 면 → hexDiameterX/2 (cncDiameterXToRadius).
 * 면 위 방향 (바깥에서 면 볼 때, 글자 위 = STL +Z):
 * - 글자 높이 v: tip/크라운 = STL +Z ← CNC zOff 감소
 * - 글자 폭 u·pitch: CNC Y. startY + charPitchY * i
 */
export function buildHexFaceLotEngravingStlPolylines(opts: {
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

/**
 * 포스트 측면 각인 스트로크 (source STL 좌표).
 *
 * CNC와 동일: 글자마다 C(θ) 고정 → 수직 평면 위 Y/Z 절삭 (곡면 래핑 없음).
 * - 글자 i: θ_i = site.angleDeg + (i−mid)·pitch (CNC H 증분과 동일)
 * - 글자 중앙 높이에서 면 점 1회 → 그 θ의 수직평면(법선=수평 방사)에 스트로크
 * - 폭 u: θ 증가(CCW 접선), 높이 v: STL +Z, 하단 = FL+1mm
 */
export function buildPostSideLotEngravingStlPolylines(opts: {
  serialCode: string;
  site: PostLotEngravingSite;
  center?: { x: number; y: number } | null;
  /**
   * (θ°, z) → 메시 표면점. 글자당 1회(중앙 높이)만 호출.
   * null이면 site.radius 원통 폴백.
   */
  resolveSurfacePoint?: (
    thetaDeg: number,
    z: number,
  ) => { x: number; y: number; z: number } | null;
}): Array<Array<{ x: number; y: number; z: number }>> {
  const serial = normalizeLotSerialCode(opts.serialCode);
  if (!serial) return [];

  const { site } = opts;
  const cx = Number(opts.center?.x) || 0;
  const cy = Number(opts.center?.y) || 0;
  const charW = LOT_ENGRAVING_DEFAULTS.charWidth;
  const charH = LOT_ENGRAVING_DEFAULTS.charHeight;
  const lift = LOT_ENGRAVING_DEFAULTS.surfaceLift;
  const fallbackR = Math.max(site.radius, 0.4);
  // 피치는 표면 반경 기준 (사이트 반경 우선, 레이캐스트로 갱신됐을 수 있음)
  const pitchDeg = Math.max(
    site.charPitchCDeg,
    (charW / fallbackR) * (180 / Math.PI),
  );
  const n = serial.length;
  const zBottom = site.engraveZ;
  const out: Array<Array<{ x: number; y: number; z: number }>> = [];

  for (let i = 0; i < n; i += 1) {
    const ch = serial[i];
    const charCenterDeg = site.angleDeg + (i - (n - 1) / 2) * pitchDeg;
    const theta = (charCenterDeg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    // CNC: 고정 C에서 수직면. 글자 중앙 높이 면점으로 반경(깊이)만 맞춤.
    const zMid = zBottom + charH * 0.5;
    const hit = opts.resolveSurfacePoint?.(charCenterDeg, zMid) ?? null;

    let ox: number;
    let oy: number;
    let oz: number;
    if (hit) {
      const hx = hit.x - cx;
      const hy = hit.y - cy;
      const hr = Math.hypot(hx, hy) || 1;
      ox = hit.x + (hx / hr) * lift;
      oy = hit.y + (hy / hr) * lift;
      oz = hit.z;
    } else {
      const r = fallbackR + lift;
      ox = cx + r * cosT;
      oy = cy + r * sinT;
      oz = zMid;
    }

    // 폭: θ↑ = CCW 접선 (−sin, cos). 높이: +Z. 원점 = 글자 박스 중심(u=v=0.5).
    const tx = -sinT;
    const ty = cosT;

    const strokes = getLotLetterStrokes(ch);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const poly: Array<{ x: number; y: number; z: number }> = [];
      for (const [u, v] of stroke) {
        poly.push({
          x: ox + (u - 0.5) * charW * tx,
          y: oy + (u - 0.5) * charW * ty,
          z: oz + (v - 0.5) * charH,
        });
      }
      out.push(poly);
    }
  }
  return out;
}

export type LotEngravingTarget = "hex" | "post";

/**
 * 각인 미리뷰 polyline. target으로 헥스면 | 포스트 측면 분기 (동시 표시 금지).
 */
export function buildLotEngravingStlPolylines(opts: {
  serialCode: string;
  ncParams: LotEngravingNcParams;
  hexAppliedDeg?: number | null;
  /** 기본 hex. post면 site 필수. */
  target?: LotEngravingTarget | null;
  site?: PostLotEngravingSite | null;
  center?: { x: number; y: number } | null;
  resolveSurfacePoint?: (
    thetaDeg: number,
    z: number,
  ) => { x: number; y: number; z: number } | null;
}): Array<Array<{ x: number; y: number; z: number }>> {
  const target: LotEngravingTarget =
    opts.target === "post" ? "post" : "hex";

  if (target === "post") {
    if (!opts.site) return [];
    return buildPostSideLotEngravingStlPolylines({
      serialCode: opts.serialCode,
      site: opts.site,
      center: opts.center,
      resolveSurfacePoint: opts.resolveSurfacePoint,
    });
  }

  return buildHexFaceLotEngravingStlPolylines({
    serialCode: opts.serialCode,
    ncParams: opts.ncParams,
    hexAppliedDeg: opts.hexAppliedDeg,
  });
}
