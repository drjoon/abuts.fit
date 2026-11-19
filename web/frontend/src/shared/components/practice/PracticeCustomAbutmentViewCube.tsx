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
  { face: "top", label: "상", transform: "rotateX(90deg) rotateZ(180deg) translateZ(var(--cube-half))" },
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

export type ToothCubeNeighbor = { toothNumber: string; origin: Vec3 };

function flatToUp(v: THREE.Vector3, up: THREE.Vector3) {
  v.addScaledVector(up, -v.dot(up));
  return v;
}

/** 악궁이 놓인 앞·오른쪽에서 FDI 치아의 바깥(순·협)과 정중선(근심) 쪽을 어림한다. */
function archToothDirs(toothNumber: string, up: THREE.Vector3, frame: DentalFrame) {
  const m = /^([1-4])([1-8])$/.exec(toothNumber);
  if (!m) return null;
  const quadrant = Number(m[1]);
  const position = Number(m[2]);
  const side = quadrant === 1 || quadrant === 4 ? 1 : -1;
  const phi = (Math.min(position, 8) / 8) * 1.45;
  const buccal = flatToUp(
    frame.right
      .clone()
      .multiplyScalar(side * Math.sin(phi))
      .addScaledVector(frame.anterior, Math.cos(phi)),
    up,
  );
  const mesial = flatToUp(
    frame.anterior
      .clone()
      .multiplyScalar(Math.sin(phi))
      .addScaledVector(frame.right, -side * Math.cos(phi)),
    up,
  );
  if (buccal.lengthSq() < 1e-8 || mesial.lengthSq() < 1e-8) return null;
  return { buccal: buccal.normalize(), mesial: mesial.normalize(), quadrant, position };
}

function neighborOrigin(
  neighbors: readonly ToothCubeNeighbor[] | undefined,
  toothNumber: string,
): THREE.Vector3 | null {
  const hit = neighbors?.find((row) => row.toothNumber === toothNumber);
  return hit ? new THREE.Vector3(...hit.origin) : null;
}

/**
 * 디자인한 치아 기준 큐브. 정면=순(협)측, 위=환자 위쪽(상악은 치은, 하악은 교합),
 * 좌·우=근심·원심.
 * 방향은 악궁이 놓인 3차원 축(앞·오른쪽·위)과 치아 번호로 정한다.
 * 이웃 치아가 있으면 그 자리의 접선을 근심으로 쓰고, 픽스처 방향이 악궁과 반대면 악궁 부호를 따른다.
 */
export function toothViewCube(
  toothNumber: string,
  fixture: {
    labialDir: Vec3;
    archOcclusalDir: Vec3;
    mesialDir?: Vec3 | null;
    fixturePose?: { origin: Vec3 };
  },
  frame: DentalFrame,
  neighbors?: readonly ToothCubeNeighbor[],
): { frame: DentalFrame; labels: ViewCubeFaceLabels } | null {
  const digits = String(toothNumber).trim();
  const arch = archToothDirs(digits, frame.up.clone().normalize(), frame);
  if (!arch) return null;
  const { quadrant, position } = arch;
  const upper = quadrant <= 2;
  const anteriorTooth = position <= 3;
  const up = frame.up.clone().normalize();

  const buccalGuess = arch.buccal;
  const mesialGuess = arch.mesial;
  const matchArch = (dir: THREE.Vector3, guess: THREE.Vector3) => {
    if (dir.lengthSq() < 1e-8) return guess.clone();
    dir.normalize();
    if (dir.dot(guess) < 0) dir.negate();
    return dir;
  };
  const buccal = matchArch(flatToUp(new THREE.Vector3(...fixture.labialDir), up), buccalGuess);

  const self = fixture.fixturePose ? new THREE.Vector3(...fixture.fixturePose.origin) : null;
  const otherCentral = quadrant === 1 ? 2 : quadrant === 2 ? 1 : quadrant === 3 ? 4 : 3;
  const mesialTooth =
    position > 1
      ? neighborOrigin(neighbors, `${quadrant}${position - 1}`)
      : neighborOrigin(neighbors, `${otherCentral}1`);
  const distalTooth =
    position < 8 ? neighborOrigin(neighbors, `${quadrant}${position + 1}`) : null;
  const tangent =
    mesialTooth && distalTooth
      ? mesialTooth.clone().sub(distalTooth)
      : mesialTooth && self
        ? mesialTooth.clone().sub(self)
        : distalTooth && self
          ? self.clone().sub(distalTooth)
          : null;
  const mesialSource =
    tangent && flatToUp(tangent, up).lengthSq() > 1e-8
      ? tangent
      : fixture.mesialDir
        ? flatToUp(new THREE.Vector3(...fixture.mesialDir), up)
        : mesialGuess.clone();
  const mesial = matchArch(mesialSource, mesialGuess);
  mesial.addScaledVector(buccal, -mesial.dot(buccal));
  if (mesial.lengthSq() < 1e-8) mesial.crossVectors(up, buccal);
  mesial.normalize();
  if (mesial.dot(mesialGuess) < 0) mesial.negate();

  // 오른손: 바깥(순·협)을 정면으로 볼 때 오른쪽 = 순협 × 환자 위.
  const right = new THREE.Vector3().crossVectors(buccal, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  const mesialRight = mesial.dot(right) > 0;
  return {
    frame: { up, anterior: buccal, right },
    labels: {
      front: anteriorTooth ? "순측" : "협측",
      back: upper ? "구개측" : "설측",
      top: upper ? "치은" : "교합",
      bottom: upper ? "교합" : "치은",
      left: mesialRight ? "원심" : "근심",
      right: mesialRight ? "근심" : "원심",
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
                : "회전 중심 켜기 (선택 어벗, 또는 면 클릭·더블클릭)"
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
