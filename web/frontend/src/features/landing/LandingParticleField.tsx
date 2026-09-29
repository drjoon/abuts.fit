// related files:
// - web/frontend/src/features/landing/LandingHero.tsx
// - web/frontend/src/index.css
import { useEffect, useRef, type RefObject } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  ox: number;
  oy: number;
  delay: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
  color: string;
};

type Dust = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  alpha: number;
  color: string;
};

/** 글자를 이루는 파티클 목표 개수(성능 상한). */
const TEXT_PARTICLE_TARGET = 2600;
/** 마우스가 파티클을 밀어내는 반경(px). */
const MOUSE_RADIUS = 110;
const FONT_FAMILY =
  '"Pretendard Variable", Pretendard, system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif';

type ColorStops = Array<[number, [number, number, number]]>;

/** 어두운 배경: 왼쪽 흰색 → 오른쪽 하늘색. */
const COLOR_STOPS_ON_DARK: ColorStops = [
  [0, [255, 255, 255]],
  [0.55, [186, 230, 253]],
  [1, [56, 189, 248]],
];

/** 밝은 배경: 왼쪽 네이비 → 오른쪽 하늘색. */
const COLOR_STOPS_ON_LIGHT: ColorStops = [
  [0, [11, 42, 92]],
  [0.55, [37, 99, 235]],
  [1, [56, 189, 248]],
];

function gradientColor(t: number, stops: ColorStops): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i += 1) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (clamped <= t1) {
      const k = (clamped - t0) / (t1 - t0 || 1);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * k);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * k);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * k);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(56,189,248)";
}

type TextPoint = { x: number; y: number; t: number; gap: number };

/** 오프스크린 캔버스에 글자를 그려 픽셀 좌표를 표본으로 뽑는다. */
function sampleText(text: string, width: number, height: number): TextPoint[] {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return [];

  let fontSize = h * 0.86;
  octx.font = `800 ${fontSize}px ${FONT_FAMILY}`;
  const measured = octx.measureText(text).width;
  const maxWidth = w * 0.98;
  if (measured > maxWidth) fontSize *= maxWidth / measured;
  octx.font = `800 ${fontSize}px ${FONT_FAMILY}`;
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  octx.fillStyle = "#fff";
  octx.fillText(text, w / 2, h / 2 + fontSize * 0.04);

  const { data } = octx.getImageData(0, 0, w, h);
  let filled = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 128) filled += 1;
  }
  if (filled === 0) return [];

  const gap = Math.max(2, Math.ceil(Math.sqrt(filled / TEXT_PARTICLE_TARGET)));
  const points: TextPoint[] = [];
  for (let y = 0; y < h; y += gap) {
    for (let x = 0; x < w; x += gap) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        points.push({
          x: x + (Math.random() - 0.5) * gap * 0.6,
          y: y + (Math.random() - 0.5) * gap * 0.6,
          t: x / w,
          gap,
        });
      }
    }
  }
  return points;
}

/**
 * 히어로 파티클 캔버스.
 * - `anchorRef` 영역에 `text` 를 파티클로 그린다(진입 시 모여들고, 마우스가 밀어내고, 스크롤하면 흩어진다).
 *   둘 중 하나라도 없으면 글자 없이 먼지 입자·커서 글로우만 그린다(서브페이지 히어로).
 * - `tone`: onDark(어두운 사진 위 · 가산 합성) / onLight(흰·하늘색 배경 위 · 파랑 계열).
 * - 배경에 떠다니는 먼지 입자와 커서 글로우.
 * - 부모 요소에 `--hero-p`(0~1 스크롤 진행)를 써서 히어로 콘텐츠 페이드에 공유한다.
 * - `prefers-reduced-motion` 이면 정지 프레임 한 장만 그린다.
 */
export function LandingParticleField({
  anchorRef,
  text,
  tone = "onDark",
}: {
  anchorRef?: RefObject<HTMLElement | null>;
  text?: string;
  tone?: "onDark" | "onLight";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = tone === "onLight";
    const stops = light ? COLOR_STOPS_ON_LIGHT : COLOR_STOPS_ON_DARK;
    const blend: GlobalCompositeOperation = light ? "source-over" : "lighter";
    const dustColors = light
      ? ["rgb(37,99,235)", "rgb(56,189,248)"]
      : ["rgb(255,255,255)", "rgb(125,211,252)"];

    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    let dust: Dust[] = [];
    let running = false;
    let inView = true;
    let raf = 0;
    let resizeRaf = 0;
    let last = 0;
    let time = 0;
    let progress = 0;
    let introDone = false;
    const mouse = { x: -9999, y: -9999, active: false, gx: 0, gy: 0, glow: 0 };

    const build = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const anchor = anchorRef?.current;
      particles = [];
      if (anchor && text) {
        const ar = anchor.getBoundingClientRect();
        const ax = ar.left - rect.left;
        const ay = ar.top - rect.top;
        const points = sampleText(text, ar.width, ar.height);
        particles = points.map((pt) => {
          const hx = ax + pt.x;
          const hy = ay + pt.y;
          const settled = reduced || introDone;
          return {
            x: settled ? hx : hx + (Math.random() - 0.5) * w * 0.8,
            y: settled ? hy : hy + (Math.random() - 0.5) * h * 0.8,
            vx: 0,
            vy: 0,
            hx,
            hy,
            ox: (Math.random() - 0.5) * 2,
            oy: -(0.2 + Math.random() * 1.1),
            delay: settled ? 0 : time + pt.t * 0.6 + Math.random() * 0.5,
            size: Math.min(2.2, Math.max(1.1, pt.gap * 0.55)),
            alpha: 0.6 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 1.6,
            color: gradientColor(pt.t, stops),
          };
        });
      }

      const dustCount = Math.min(90, Math.max(24, Math.floor((w * h) / 22000)));
      dust = Array.from({ length: dustCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.05 + Math.random() * 0.18),
        r: 0.8 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.15 + Math.random() * 0.35,
        color: dustColors[Math.random() < 0.35 ? 1 : 0],
      }));
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = blend;
      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.hx - p.size / 2, p.hy - p.size / 2, p.size, p.size);
      }
      for (const d of dust) {
        ctx.globalAlpha = d.alpha * 0.7;
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.r, d.r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      if (time > 3) introDone = true;
      const k60 = dt * 60;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = blend;

      // 커서 글로우
      mouse.glow += ((mouse.active ? 1 : 0) - mouse.glow) * Math.min(1, dt * 6);
      mouse.gx += (mouse.x - mouse.gx) * Math.min(1, dt * 10);
      mouse.gy += (mouse.y - mouse.gy) * Math.min(1, dt * 10);
      if (mouse.glow > 0.01) {
        const grad = ctx.createRadialGradient(mouse.gx, mouse.gy, 0, mouse.gx, mouse.gy, 220);
        grad.addColorStop(0, `rgba(56,189,248,${(light ? 0.18 : 0.2) * mouse.glow})`);
        grad.addColorStop(1, "rgba(56,189,248,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(mouse.gx - 220, mouse.gy - 220, 440, 440);
      }

      const damp = 0.86 ** k60;
      const spread = progress * progress;
      const fade = 1 - progress;
      const r2 = MOUSE_RADIUS * MOUSE_RADIUS;

      for (const p of particles) {
        if (time < p.delay) continue;
        const born = Math.min(1, (time - p.delay) / 0.5);
        const tx = p.hx + Math.sin(time * p.speed + p.phase) * 1.1 + p.ox * spread * 280;
        const ty = p.hy + Math.cos(time * p.speed * 0.9 + p.phase) * 1.1 + p.oy * spread * 280;
        p.vx += (tx - p.x) * 0.05 * k60;
        p.vy += (ty - p.y) * 0.05 * k60;

        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = 1 - d / MOUSE_RADIUS;
            const a = f * f * 2.6 * k60;
            p.vx += (dx / d) * a;
            p.vy += (dy / d) * a;
          }
        }

        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * k60;
        p.y += p.vy * k60;

        const twinkle = 0.78 + 0.22 * Math.sin(time * 2.2 + p.phase * 3);
        const alpha = p.alpha * twinkle * born * fade;
        if (alpha < 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      for (const d of dust) {
        d.x += d.vx * k60;
        d.y += d.vy * k60;
        if (d.y < -4) d.y = h + 4;
        if (d.x < -4) d.x = w + 4;
        if (d.x > w + 4) d.x = -4;
        if (mouse.active) {
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_RADIUS * 1.3 && dist > 0.01) {
            const f = 1 - dist / (MOUSE_RADIUS * 1.3);
            d.x += (dx / dist) * f * 2 * k60;
            d.y += (dy / dist) * f * 2 * k60;
          }
        }
        ctx.globalAlpha = d.alpha * (0.6 + 0.4 * Math.sin(time * 1.4 + d.phase)) * fade;
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.r, d.r);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const start = () => {
      if (running || reduced || !inView || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const rebuild = () => {
      build();
      if (reduced) drawStatic();
    };

    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(rebuild);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      if (!mouse.active) {
        mouse.gx = mouse.x;
        mouse.gy = mouse.y;
      }
      mouse.active = true;
    };
    const onPointerLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };

    const onScroll = () => {
      const rect = parent.getBoundingClientRect();
      progress = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.75)));
      parent.style.setProperty("--hero-p", progress.toFixed(3));
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    rebuild();
    if (!reduced) {
      parent.addEventListener("pointermove", onPointerMove);
      parent.addEventListener("pointerleave", onPointerLeave);
      parent.addEventListener("pointercancel", onPointerLeave);
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      onScroll();
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    resizeObserver?.observe(parent);

    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            inView = entries.some((entry) => entry.isIntersecting);
            if (inView) start();
            else stop();
          });
    intersection?.observe(parent);

    void document.fonts?.ready.then(rebuild);
    start();

    return () => {
      stop();
      cancelAnimationFrame(resizeRaf);
      resizeObserver?.disconnect();
      intersection?.disconnect();
      parent.removeEventListener("pointermove", onPointerMove);
      parent.removeEventListener("pointerleave", onPointerLeave);
      parent.removeEventListener("pointercancel", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      parent.style.removeProperty("--hero-p");
    };
  }, [anchorRef, text, tone]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
