// 커프 단면. PRC 면에서 2°로 시작해 골 높이까지 4°를 유지한 뒤 오목하게 벌어져 피니시라인에 닿는다.
// related files:
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/abutmentDirectEdit.ts
// - web/backend/services/abutmentStl/cuffBlend.js

const DEG = Math.PI / 180;
const CUFF_START_SLOPE = Math.tan(2 * DEG);
const CUFF_HOLD_SLOPE = Math.tan(4 * DEG);
const CUFF_END_SLOPE_MAX = Math.tan(65 * DEG);
const CUFF_BONE_MM = 1.35;
const CUFF_EASE_MM = 0.5;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** ∫₀ˣ smootherstep. x=1이면 0.5. */
function smootherstepIntegral(t: number) {
  const x = clamp(t, 0, 1);
  return x ** 4 * (x * x - 3 * x + 2.5);
}

/**
 * cuffBlend 커프 단면 r(z). PRC 면에서 2°(곡률 0)로 시작해 골 높이까지 4°를 유지하고,
 * 오목하게 기울기를 올린 뒤(r'' ≥ 0, 볼록 없음) 같은 기울기로 피니시라인에 닿는다.
 * 끝 기울기는 필요한 만큼만 둔다(실측 25~30°). 칼날 마진을 만드는 65° 플레어는 피한다.
 */
export function cuffProfile(rStart: number, zStart: number, rEnd: number, zEnd: number) {
  const span = Math.max(0.35, zEnd - zStart);
  const delta = rEnd - rStart;
  if (delta <= 0) {
    return (z: number) => rStart + delta * clamp((z - zStart) / span, 0, 1);
  }
  const s0 = CUFF_START_SLOPE;
  const s1 = CUFF_HOLD_SLOPE;
  type Plan = { e: number; zh: number; lead: number; lr: number; sEnd: number; scale: number };
  const planFor = (holdMm: number): Plan => {
    const zh = Math.min(holdMm, span * 0.25);
    const e = Math.min(CUFF_EASE_MM, zh * 0.6);
    const lead = (e * (s0 + s1)) / 2 + (zh - e) * s1;
    const L = span - zh;
    const need = delta - lead;
    if (L <= 1e-6 || need <= L * s1) {
      const full = lead + L * s1;
      return { e, zh, lead, lr: 0, sEnd: s1, scale: full > 0 ? delta / full : 1 };
    }
    const lr = Math.min(L, Math.max(0.4, L * 0.3));
    const sEnd = (need - (lr * s1) / 2) / (L - lr / 2);
    return { e, zh, lead, lr, sEnd, scale: 1 };
  };
  let plan = planFor(CUFF_BONE_MM);
  if (plan.sEnd > CUFF_END_SLOPE_MAX) {
    const zeroPlan = planFor(0);
    if (zeroPlan.sEnd >= CUFF_END_SLOPE_MAX) {
      plan = zeroPlan;
    } else {
      let lo = 0;
      let hi = CUFF_BONE_MM;
      for (let it = 0; it < 18; it += 1) {
        const mid = (lo + hi) * 0.5;
        if (planFor(mid).sEnd > CUFF_END_SLOPE_MAX) hi = mid;
        else lo = mid;
      }
      plan = planFor(lo);
    }
  }
  const { e, zh, lead, lr, sEnd, scale } = plan;
  return (z: number) => {
    const u = clamp(z - zStart, 0, span);
    let r: number;
    if (u <= e) {
      r = s0 * u + (e > 0 ? (s1 - s0) * e * smootherstepIntegral(u / e) : 0);
    } else if (u <= zh) {
      r = (e * (s0 + s1)) / 2 + s1 * (u - e);
    } else {
      const x = u - zh;
      if (lr <= 0) r = lead + s1 * x;
      else if (x <= lr) r = lead + s1 * x + (sEnd - s1) * lr * smootherstepIntegral(x / lr);
      else r = lead + s1 * lr + (sEnd - s1) * lr * 0.5 + sEnd * (x - lr);
    }
    return rStart + r * scale;
  };
}
