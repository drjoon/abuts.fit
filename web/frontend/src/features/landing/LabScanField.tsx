// related files:
// - web/frontend/src/features/landing/LabOfferSections.tsx
// - web/frontend/src/features/landing/LandingParticleField.tsx (랜딩 전용 파티클 워드 — 이 컴포넌트와 효과가 겹치지 않게 유지)
import { useEffect, useRef } from "react";

type Kind = 0 | 1 | 2; // 0 치아 · 1 잇몸 · 2 어벗(식립 부위)

type Pt = { x: number; y: number; z: number; kind: Kind; group: number };

/** 재현 가능한 난수(렌더마다 같은 모양). */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARCH_A = 1.55;
const ARCH_B = 1.25;
const TEETH = 14;
const ABUTMENT_TOOTH = 9;
const PER_TOOTH = 64;

/** 악궁(말발굽) 점군 + 식립 부위 어벗 원기둥. 이웃 연결(메시)용 쌍도 함께 만든다. */
function buildModel() {
  const rnd = mulberry32(11);
  const pts: Pt[] = [];
  const links: Array<[number, number]> = [];

  for (let i = 0; i < TEETH; i += 1) {
    const th = -2.15 + (4.3 * i) / (TEETH - 1);
    const cx = ARCH_A * Math.sin(th);
    const cz = ARCH_B * Math.cos(th);
    const tx = Math.cos(th);
    const tz = -Math.sin(th);
    const rx = Math.sin(th);
    const rz = Math.cos(th);
    const back = Math.abs(Math.sin(th));

    if (i === ABUTMENT_TOOTH) {
      const start = pts.length;
      const rings = 7;
      const around = 16;
      for (let r = 0; r < rings; r += 1) {
        const y = -0.12 + (r / (rings - 1)) * 0.62;
        const radius = 0.13 - (r > 4 ? (r - 4) * 0.012 : 0);
        for (let k = 0; k < around; k += 1) {
          const a = (k / around) * Math.PI * 2;
          pts.push({
            x: cx + Math.cos(a) * radius,
            y,
            z: cz + Math.sin(a) * radius,
            kind: 2,
            group: i,
          });
        }
      }
      for (let r = 0; r < rings - 1; r += 1) {
        for (let k = 0; k < around; k += 1) {
          const a = start + r * around + k;
          links.push([a, start + r * around + ((k + 1) % around)]);
          links.push([a, start + (r + 1) * around + k]);
        }
      }
      continue;
    }

    const rw = 0.14 + back * 0.05;
    const rd = 0.12 + back * 0.07;
    const rh = 0.3 + (1 - back) * 0.08;
    const start = pts.length;
    for (let n = 0; n < PER_TOOTH; n += 1) {
      const f = (n + 0.5) / PER_TOOTH;
      const phi = Math.acos(1 - f); // 상반구만
      const theta = n * 2.399963;
      const u = Math.sin(phi) * Math.cos(theta);
      const v = Math.sin(phi) * Math.sin(theta);
      const w = Math.cos(phi);
      pts.push({
        x: cx + tx * u * rw + rx * v * rd + (rnd() - 0.5) * 0.01,
        y: w * rh + (rnd() - 0.5) * 0.01,
        z: cz + tz * u * rw + rz * v * rd + (rnd() - 0.5) * 0.01,
        kind: 0,
        group: i,
      });
    }
    for (let n = 0; n < PER_TOOTH; n += 1) {
      links.push([start + n, start + ((n + 1) % PER_TOOTH)]);
      if (n + 8 < PER_TOOTH) links.push([start + n, start + n + 8]);
    }
  }

  // 잇몸 띠
  const gumStart = pts.length;
  const gumCount = 300;
  for (let n = 0; n < gumCount; n += 1) {
    const th = -2.3 + (4.6 * n) / (gumCount - 1);
    const spread = (rnd() - 0.5) * 0.62;
    const rx = Math.sin(th);
    const rz = Math.cos(th);
    pts.push({
      x: ARCH_A * Math.sin(th) + rx * spread,
      y: -0.14 - Math.abs(spread) * 0.22 + (rnd() - 0.5) * 0.04,
      z: ARCH_B * Math.cos(th) + rz * spread,
      kind: 1,
      group: -1,
    });
  }
  for (let n = 0; n < gumCount - 1; n += 1) {
    links.push([gumStart + n, gumStart + n + 1]);
  }

  return { pts, links };
}

const MODEL = buildModel();

/**
 * 기공서비스 히어로 — 3D 구강스캔 점군 위로 스캔 평면이 지나가며 메시가 켜진다.
 * (랜딩 히어로의 「파티클 워드」와 다른 효과)
 * - 악궁 점군이 천천히 회전하고, 마우스를 따라 기울어진다.
 * - 스캔 평면이 좌우로 쓸고 지나간 자리는 잠시 밝아지며 메시 선이 그려진다.
 * - 식립 부위의 어벗 원기둥에는 삽입축 점선이 붙는다.
 * - 화면 밖이면 멈추고, `prefers-reduced-motion` 이면 정지 프레임 한 장만 그린다.
 */
export function LabScanField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return undefined;

    const { pts, links } = MODEL;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heat = new Float32Array(pts.length);
    const sx = new Float32Array(pts.length);
    const sy = new Float32Array(pts.length);
    const depth = new Float32Array(pts.length);

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let inView = true;
    let last = 0;
    let time = reduced ? 2.2 : 0;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (dt: number) => {
      if (w < 2) return;
      time += dt;
      tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3);
      tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);

      const yaw = time * 0.22 + tilt.x * 0.9;
      const pitch = 0.62 + tilt.y * 0.35;
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const cam = 6.2;
      const scale = Math.min(w / 4.3, h / 3.3);
      const ox = w / 2;
      const oy = h * 0.56;

      const scanX = ARCH_A * 1.35 * Math.sin(time * 0.62);
      const sigma = 0.2;
      const decay = Math.pow(0.5, dt / 0.9); // 반감기 0.9초

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const d = (p.x - scanX) / sigma;
        const hit = Math.exp(-d * d);
        heat[i] = Math.max(heat[i] * decay, hit);

        const x1 = p.x * cyaw + p.z * syaw;
        const z1 = -p.x * syaw + p.z * cyaw;
        const y2 = p.y * cp - z1 * sp;
        const z2 = p.y * sp + z1 * cp;
        const s = cam / (cam - z2);
        sx[i] = ox + x1 * s * scale;
        sy[i] = oy - y2 * s * scale;
        depth[i] = s;
      }

      // 메시 선 — 스캔이 지나간 자리만 3단계 농도로 묶어서 그린다.
      const buckets: Array<Array<[number, number]>> = [[], [], []];
      for (const link of links) {
        const m = Math.min(heat[link[0]], heat[link[1]]);
        if (m > 0.7) buckets[2].push(link);
        else if (m > 0.45) buckets[1].push(link);
        else if (m > 0.2) buckets[0].push(link);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 0.8;
      const alphas = [0.16, 0.34, 0.6];
      for (let b = 0; b < 3; b += 1) {
        if (buckets[b].length === 0) continue;
        ctx.strokeStyle = `rgba(125,211,252,${alphas[b]})`;
        ctx.beginPath();
        for (const [a, c] of buckets[b]) {
          ctx.moveTo(sx[a], sy[a]);
          ctx.lineTo(sx[c], sy[c]);
        }
        ctx.stroke();
      }

      // 점
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const hv = heat[i];
        const near = Math.min(1, Math.max(0.3, 0.35 + (depth[i] - 0.85) * 1.6));
        let r: number;
        let g: number;
        let bl: number;
        let alpha: number;
        if (p.kind === 2) {
          // 어벗은 늘 또렷하게(하늘색 → 스캔되면 흰색)
          r = 90 + hv * 165;
          g = 200 + hv * 55;
          bl = 255;
          alpha = 0.75 + hv * 0.25;
        } else {
          r = 120 + hv * 135;
          g = 165 + hv * 90;
          bl = 235 + hv * 20;
          alpha = (p.kind === 1 ? 0.22 : 0.34) + hv * 0.6;
        }
        const size = (p.kind === 2 ? 1.7 : 1.2) * depth[i] + hv * 1.5;
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${Math.min(1, alpha * near)})`;
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 스캔 평면
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cyaw + z * syaw;
        const z1 = -x * syaw + z * cyaw;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const s = cam / (cam - z2);
        return [ox + x1 * s * scale, oy - y2 * s * scale] as const;
      };
      const c0 = project(scanX, -0.5, -1.6);
      const c1 = project(scanX, -0.5, 1.6);
      const c2 = project(scanX, 0.75, 1.6);
      const c3 = project(scanX, 0.75, -1.6);
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(c0[0], c0[1]);
      ctx.lineTo(c1[0], c1[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.lineTo(c3[0], c3[1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(56,189,248,0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(186,230,253,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 삽입축 점선(어벗 위)
      const top = project(
        ARCH_A * Math.sin(-2.15 + (4.3 * ABUTMENT_TOOTH) / (TEETH - 1)),
        0.5,
        ARCH_B * Math.cos(-2.15 + (4.3 * ABUTMENT_TOOTH) / (TEETH - 1)),
      );
      const axisTop = project(
        ARCH_A * Math.sin(-2.15 + (4.3 * ABUTMENT_TOOTH) / (TEETH - 1)),
        1.25,
        ARCH_B * Math.cos(-2.15 + (4.3 * ABUTMENT_TOOTH) / (TEETH - 1)),
      );
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = "rgba(125,211,252,0.85)";
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(axisTop[0], axisTop[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(186,230,253,0.95)";
      ctx.font = '600 10px "Pretendard Variable", Pretendard, system-ui, sans-serif';
      ctx.textAlign = "left";
      ctx.fillText("INSERTION AXIS", axisTop[0] + 8, axisTop[1] + 3);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      frame(dt);
    };
    const start = () => {
      if (running || reduced || !inView || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = parent.getBoundingClientRect();
      tilt.tx = (event.clientX - rect.left) / rect.width - 0.5;
      tilt.ty = (event.clientY - rect.top) / rect.height - 0.5;
    };
    const onLeave = () => {
      tilt.tx = 0;
      tilt.ty = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    if (reduced) {
      // 정지 프레임 — 스캔이 한가운데를 지나는 순간
      for (let step = 0; step < 30; step += 1) frame(0.03);
    } else {
      parent.addEventListener("pointermove", onMove);
      parent.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) frame(0);
    });
    ro.observe(parent);
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) start();
      else stop();
    });
    io.observe(parent);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? "pointer-events-none absolute inset-0 h-full w-full"}
    />
  );
}
