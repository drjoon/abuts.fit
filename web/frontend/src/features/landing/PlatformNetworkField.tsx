// related files:
// - web/frontend/src/features/landing/PlatformHeroFx.tsx
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
//
// 플랫폼 히어로 — 치과(속 빈 링)와 기공소(채운 점)가 떠다니고, 서로 다른 쪽끼리만 선으로 이어진다.
// 마우스는 「새 의뢰」: 가까운 치과·기공소를 한 줄로 잇고, 그 선 위로 의뢰 패킷이 흐른다.
// 홈의 파티클 워드·랩 스캔 점군과 다른 효과. `prefers-reduced-motion`이면 한 프레임만 그린다.
import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lab: boolean;
  /** 마우스에 이어진 정도(0~1) — 부드럽게 켜지고 꺼진다. */
  glow: number;
};

const LINK_DIST = 150;
const MOUSE_DIST = 210;

export function PlatformNetworkField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement?.parentElement;
    if (!canvas || !host) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    let raf = 0;
    let visible = true;
    const mouse = { x: 0, y: 0, on: false, a: 0 };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(54, Math.round((w * h) / 20000)));
      nodes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        lab: i % 2 === 1,
        glow: 0,
      }));
    };

    const nearest = (lab: boolean, n: number) =>
      nodes
        .filter((node) => node.lab === lab)
        .map((node) => ({ node, d: Math.hypot(node.x - mouse.x, node.y - mouse.y) }))
        .filter((item) => item.d < MOUSE_DIST)
        .sort((a, b) => a.d - b.d)
        .slice(0, n);

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      mouse.a += ((mouse.on ? 1 : 0) - mouse.a) * 0.08;

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -10 || node.x > w + 10) node.vx *= -1;
        if (node.y < -10 || node.y > h + 10) node.vy *= -1;
        node.glow *= 0.92;
      }

      // 치과↔기공소 기본 연결
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.lab === b.lab) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > LINK_DIST) continue;
          ctx.strokeStyle = `rgba(125, 211, 252, ${(1 - d / LINK_DIST) * 0.22})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // 마우스 = 새 의뢰: 가까운 치과 → 마우스 → 가까운 기공소
      if (mouse.a > 0.02) {
        const from = nearest(false, 2);
        const to = nearest(true, 2);
        const links: Array<[Node, boolean]> = [
          ...from.map((item) => [item.node, false] as [Node, boolean]),
          ...to.map((item) => [item.node, true] as [Node, boolean]),
        ];
        links.forEach(([node, isLab], index) => {
          node.glow = 1;
          const d = Math.hypot(node.x - mouse.x, node.y - mouse.y);
          const alpha = (1 - d / MOUSE_DIST) * 0.85 * mouse.a;
          ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
          // 패킷: 치과에서 마우스로, 마우스에서 기공소로
          const t = ((time / 1100 + index * 0.27) % 1 + 1) % 1;
          const p = isLab ? t : 1 - t;
          const px = mouse.x + (node.x - mouse.x) * p;
          const py = mouse.y + (node.y - mouse.y) * p;
          ctx.fillStyle = `rgba(224, 242, 254, ${0.95 * mouse.a})`;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
          // 패킷 쪽으로 살짝 끌려온다
          node.x += (mouse.x - node.x) * 0.0025;
          node.y += (mouse.y - node.y) * 0.0025;
        });

        // 마우스 중심 링
        ctx.strokeStyle = `rgba(125, 211, 252, ${0.55 * mouse.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 9 + Math.sin(time / 380) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 노드
      for (const node of nodes) {
        const r = 3 + node.glow * 1.8;
        if (node.lab) {
          ctx.fillStyle = `rgba(${96 + node.glow * 100}, ${165 + node.glow * 60}, 250, ${0.65 + node.glow * 0.35})`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(186, 230, 253, ${0.6 + node.glow * 0.4})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 0.8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    const loop = (time: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && !reduced) raf = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = host.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.on = true;
    };
    const onLeave = () => {
      mouse.on = false;
    };

    resize();
    if (reduced) draw(0);
    else start();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    observer.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(host);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}
