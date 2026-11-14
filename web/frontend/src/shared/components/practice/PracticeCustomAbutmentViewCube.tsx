// 커스텀어벗 디자인 뷰어의 방향 큐브. 카메라 방향을 따라 돌고, 면을 누르면 그 방향으로 보고,
// 두 번 누르면 전체를 맞춘다. 면은 환자 기준(정면=순측, 좌·우=환자 좌·우)이다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/dentalFrame.ts

import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { DentalFrame } from "@/shared/practice/dentalFrame";
import { cn } from "@/shared/ui/cn";

export type ViewCubeFace = "front" | "back" | "left" | "right" | "top" | "bottom";

export type ViewCubeHandle = {
  /** 렌더 루프에서 매 프레임 부른다. */
  sync: (camera: THREE.Camera, frame: DentalFrame | null) => void;
};

const FACES: Array<{ face: ViewCubeFace; label: string; transform: string }> = [
  { face: "front", label: "정면", transform: "translateZ(var(--cube-half))" },
  { face: "back", label: "후면", transform: "rotateY(180deg) translateZ(var(--cube-half))" },
  { face: "left", label: "좌", transform: "rotateY(90deg) translateZ(var(--cube-half))" },
  { face: "right", label: "우", transform: "rotateY(-90deg) translateZ(var(--cube-half))" },
  { face: "top", label: "상", transform: "rotateX(90deg) translateZ(var(--cube-half))" },
  { face: "bottom", label: "하", transform: "rotateX(-90deg) translateZ(var(--cube-half))" },
];

/** 면을 볼 때 카메라 방향(물체 → 카메라)과 화면 위쪽. */
export function viewCubeDirection(
  face: ViewCubeFace,
  frame: DentalFrame,
): { viewDir: THREE.Vector3; upDir: THREE.Vector3 } {
  const a = frame.anterior.clone();
  const u = frame.up.clone();
  const r = frame.right.clone();
  switch (face) {
    case "front":
      return { viewDir: a, upDir: u };
    case "back":
      return { viewDir: a.negate(), upDir: u };
    case "left":
      return { viewDir: r.negate(), upDir: u };
    case "right":
      return { viewDir: r, upDir: u };
    case "top":
      return { viewDir: u, upDir: a };
    default:
      return { viewDir: u.negate(), upDir: a };
  }
}

const tmp = new THREE.Vector3();

export const PracticeCustomAbutmentViewCube = forwardRef<
  ViewCubeHandle,
  {
    onFace: (face: ViewCubeFace) => void;
    onFit: () => void;
    className?: string;
  }
>(function PracticeCustomAbutmentViewCube({ onFace, onFit, className }, ref) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const lastRef = useRef("");

  useImperativeHandle(ref, () => ({
    sync: (camera, frame) => {
      const el = cubeRef.current;
      if (!el || !frame) return;
      const inv = camera.matrixWorldInverse;
      // 큐브 로컬(CSS: x 오른쪽, y 아래, z 앞) = 환자 왼쪽, 아래, 앞. 화면 좌표는 y를 뒤집는다.
      const col = (v: THREE.Vector3) => {
        tmp.copy(v).transformDirection(inv);
        return [tmp.x, -tmp.y, tmp.z];
      };
      const cx = col(frame.right.clone().negate());
      const cy = col(frame.up.clone().negate());
      const cz = col(frame.anterior);
      const m = [...cx, 0, ...cy, 0, ...cz, 0, 0, 0, 0, 1].map((v) => v.toFixed(4)).join(",");
      if (m === lastRef.current) return;
      lastRef.current = m;
      el.style.transform = `matrix3d(${m})`;
    },
  }));

  return (
    <div
      className={cn("pointer-events-auto select-none", className)}
      style={{ width: "4.25rem", height: "4.25rem", ["--cube-half" as string]: "2.125rem" }}
      onDoubleClick={(e) => {
        e.preventDefault();
        onFit();
      }}
    >
      <div
        ref={cubeRef}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FACES.map((f) => (
          <button
            key={f.face}
            type="button"
            className="absolute inset-0 flex items-center justify-center border border-slate-400/70 bg-white/90 text-[0.6875rem] font-semibold text-slate-700 hover:bg-primary/15 hover:text-primary"
            style={{ transform: f.transform, backfaceVisibility: "hidden" }}
            aria-label={`${f.label} 보기`}
            onClick={() => onFace(f.face)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
});
