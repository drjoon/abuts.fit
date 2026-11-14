// 커스텀어벗 디자인 뷰어의 방향 큐브. 카메라 방향을 따라 돌고, 면을 누르면 그 방향으로 부드럽게 돌아간다.
// 큐브를 끌면 화면이 같이 돈다. 위 버튼은 기본 시점·전체 맞춤·화면 90° 돌리기·회전 중심이다.
// 면 방향은 `sync`에 넘긴 frame(디자인한 치아 기준이면 순·설·교합·치은·근심·원심)이고, 이름은 `faceLabels`가 정한다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/dentalFrame.ts

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Crosshair, Home, Maximize2, RotateCcw, RotateCw } from "lucide-react";
import * as THREE from "three";
import type { ExternalViewGesture } from "@/shared/three/screenSpaceOrbitControls";
import type { DentalFrame } from "@/shared/practice/dentalFrame";
import { cn } from "@/shared/ui/cn";

export type ViewCubeFace = "front" | "back" | "left" | "right" | "top" | "bottom";

export type ViewCubeFaceLabels = Record<ViewCubeFace, string>;

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

type Vec3 = readonly [number, number, number];

/**
 * 디자인한 치아 기준 큐브. 정면=순(협)측, 위=환자 위쪽(상악은 치은, 하악은 교합),
 * 좌·우=근심·원심. FDI 번호와 픽스처 방향이 맞지 않으면 null.
 */
export function toothViewCube(
  toothNumber: string,
  fixture: { labialDir: Vec3; archOcclusalDir: Vec3; mesialDir?: Vec3 | null },
  frame: DentalFrame,
): { frame: DentalFrame; labels: ViewCubeFaceLabels } | null {
  const m = /^([1-4])([1-8])$/.exec(String(toothNumber).trim());
  if (!m) return null;
  const upper = m[1] === "1" || m[1] === "2";
  const anteriorTooth = Number(m[2]) <= 3;
  const up = new THREE.Vector3(...fixture.archOcclusalDir).normalize();
  if (upper) up.negate();
  if (up.dot(frame.up) < 0) return null;
  const anterior = new THREE.Vector3(...fixture.labialDir);
  anterior.addScaledVector(up, -anterior.dot(up));
  if (anterior.lengthSq() < 1e-6) return null;
  anterior.normalize();
  // 오른손 좌표계: 환자를 정면(+anterior)에서 바라볼 때 오른쪽은 +right = anterior × up (위쪽 화면 우측 = -right).
  const right = new THREE.Vector3().crossVectors(anterior, up).normalize();

  let left = "좌";
  let rightLabel = "우";
  if (fixture.mesialDir) {
    const mesialRight = new THREE.Vector3(...fixture.mesialDir).dot(right) > 0;
    rightLabel = mesialRight ? "근심" : "원심";
    left = mesialRight ? "원심" : "근심";
  }
  return {
    frame: { up, anterior, right },
    labels: {
      front: anteriorTooth ? "순측" : "협측",
      back: upper ? "구개측" : "설측",
      top: upper ? "치은" : "교합",
      bottom: upper ? "교합" : "치은",
      left,
      right: rightLabel,
    },
  };
}

const CUBE_REM = 4.5;
/** 큐브 1px 끌기 = 화면 몇 px 끌기. 큐브가 작아서 크게 돌린다. */
const CUBE_DRAG_GAIN = 2.5;
const DRAG_START_PX = 3;
const ACTIVE_FACE_DOT = 0.985;

const tmp = new THREE.Vector3();
const back = new THREE.Vector3();

export const PracticeCustomAbutmentViewCube = forwardRef<
  ViewCubeHandle,
  {
    onFace: (face: ViewCubeFace) => void;
    onHome: () => void;
    onFit: () => void;
    onRoll: (dir: 1 | -1) => void;
    onOrbit: (gesture: ExternalViewGesture) => void;
    onPivot: () => void;
    /** 면 이름. 없으면 환자 기준(정면·후면·좌·우·상·하). */
    faceLabels?: ViewCubeFaceLabels | null;
    /** 큐브 아래 한 줄. 예: 「#36 기준」 */
    caption?: string | null;
    pivotActive: boolean;
    pivotArmed: boolean;
    className?: string;
  }
>(function PracticeCustomAbutmentViewCube(
  {
    onFace,
    onHome,
    onFit,
    onRoll,
    onOrbit,
    onPivot,
    faceLabels,
    caption,
    pivotActive,
    pivotArmed,
    className,
  },
  ref,
) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const lastRef = useRef("");
  const [activeFace, setActiveFace] = useState<ViewCubeFace | null>(null);
  const activeRef = useRef<ViewCubeFace | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; moving: boolean } | null>(null);
  const suppressClickRef = useRef(false);

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

      back.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
      let next: ViewCubeFace | null = null;
      for (const f of FACES) {
        if (viewCubeDirection(f.face, frame).viewDir.dot(back) > ACTIVE_FACE_DOT) {
          next = f.face;
          break;
        }
      }
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveFace(next);
      }
    },
  }));

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    if (drag.moving) {
      suppressClickRef.current = true;
      onOrbit({ type: "end" });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // noop
      }
    }
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex select-none flex-col items-center gap-1.5 rounded-xl border bg-background/85 p-2 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-0.5">
        <CubeButton label="기본 시점" onClick={onHome}>
          <Home className="h-3.5 w-3.5" />
        </CubeButton>
        <CubeButton label="화면에 맞추기" onClick={onFit}>
          <Maximize2 className="h-3.5 w-3.5" />
        </CubeButton>
        <CubeButton label="왼쪽으로 90° 돌리기" onClick={() => onRoll(-1)}>
          <RotateCcw className="h-3.5 w-3.5" />
        </CubeButton>
        <CubeButton label="오른쪽으로 90° 돌리기" onClick={() => onRoll(1)}>
          <RotateCw className="h-3.5 w-3.5" />
        </CubeButton>
        <CubeButton
          label={
            pivotActive
              ? "회전 중심 지우기"
              : pivotArmed
                ? "회전 중심 고르기 취소"
                : "회전 중심 지정 (누른 뒤 면을 클릭, 또는 면을 더블클릭)"
          }
          active={pivotActive || pivotArmed}
          onClick={onPivot}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </CubeButton>
      </div>
      <div
        className="relative grid cursor-grab place-items-center active:cursor-grabbing"
        style={{ width: `${CUBE_REM + 1.5}rem`, height: `${CUBE_REM + 1.5}rem`, perspective: "22rem" }}
        title="면을 누르면 그 방향으로 봅니다. 끌면 화면이 돕니다."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          suppressClickRef.current = false;
          dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moving: false };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== e.pointerId) return;
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (!drag.moving) {
            if (Math.hypot(dx, dy) < DRAG_START_PX) return;
            drag.moving = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            onOrbit({ type: "start" });
          }
          drag.x = e.clientX;
          drag.y = e.clientY;
          onOrbit({ type: "move", action: "rotate", dx: dx * CUBE_DRAG_GAIN, dy: dy * CUBE_DRAG_GAIN });
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div
          aria-hidden
          className="absolute bottom-0.5 left-1/2 h-2.5 w-[70%] -translate-x-1/2 rounded-[50%] bg-slate-900/10 blur-[3px]"
        />
        <div
          ref={cubeRef}
          className="relative"
          style={{
            width: `${CUBE_REM}rem`,
            height: `${CUBE_REM}rem`,
            transformStyle: "preserve-3d",
            ["--cube-half" as string]: `${CUBE_REM / 2}rem`,
          }}
        >
          {FACES.map((f) => {
            const active = activeFace === f.face;
            const label = faceLabels?.[f.face] ?? f.label;
            return (
              <button
                key={f.face}
                type="button"
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-[0.35rem] border text-xs font-semibold tracking-tight transition-colors",
                  active
                    ? "border-primary/60 bg-gradient-to-br from-primary/25 to-primary/10 text-primary"
                    : "border-slate-300 bg-gradient-to-br from-white to-slate-100 text-slate-600 hover:border-primary/50 hover:from-sky-50 hover:to-sky-100 hover:text-primary",
                )}
                style={{
                  transform: f.transform,
                  backfaceVisibility: "hidden",
                  boxShadow: "inset 0 0 0 0.125rem rgba(255,255,255,0.7)",
                }}
                aria-label={`${label} 보기`}
                aria-pressed={active}
                onClick={() => onFace(f.face)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {caption ? <div className="text-[0.625rem] font-medium leading-none text-muted-foreground">{caption}</div> : null}
    </div>
  );
});

function CubeButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md",
        active
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
