// 한 3D 뷰에 그린 페인트를 다른 3D 뷰에 같은 화면 위치로 옮긴다(좌우 프리뷰 연동).
// 두 모델은 좌표계가 달라 3D 좌표를 그대로 쓰지 않는다. 그린 화면 위치를 반대쪽 표면에 다시 얹는다.
// related files: ViewPaintSurface.tsx, viewPaintSpace.ts, viewPaintGeom.ts, PreviewModal.tsx
import {
  dotRadius,
  intersectPlane,
  posePoint,
  refreshShapeScreen,
  toUV,
  type InkScale,
  type PaintShape,
  type Pose,
  type ScreenPoint,
} from "@/shared/components/practice/viewPaintGeom";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";

export type MirrorTarget = {
  space: ViewPaintSpace;
  /** 반대쪽 3D 캔버스의 화면 위치 */
  rect: DOMRect;
};

/** `ViewPaintSurface`와 같은 기준: 넓은 화면 루트 확대. */
function uiScale() {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return root > 0 ? root / 16 : 1;
}

/** 지금 보이는 화면 위치로 되돌린 복사본(모델에 붙은 표시는 카메라 움직임을 반영한다). */
function currentScreen(shape: PaintShape, from: ViewPaintSpace | null): PaintShape {
  const copy = structuredClone(shape);
  if (from) refreshShapeScreen(copy, (p) => from.project(p));
  return copy;
}

function clientOf(target: MirrorTarget, p: ScreenPoint) {
  return { x: target.rect.left + p.x * target.rect.width, y: target.rect.top + p.y * target.rect.height };
}

function anchorAt(target: MirrorTarget, p: ScreenPoint): { pose: Pose; ink: InkScale } | null {
  const c = clientOf(target, p);
  const hit = target.space.pick(c.x, c.y);
  if (!hit) return null;
  return {
    pose: hit.pose,
    ink: { px: target.space.worldPerPixel(hit.point) * uiScale(), lift: target.space.surfaceLift() },
  };
}

function worldAt(target: MirrorTarget, pose: Pose, p: ScreenPoint) {
  const c = clientOf(target, p);
  const ray = target.space.ray(c.x, c.y);
  return ray ? intersectPlane(ray, pose) : null;
}

function mirrorOne(shape: PaintShape, target: MirrorTarget): PaintShape {
  const style = { color: shape.color, width: shape.width };
  if (shape.kind === "pen") {
    const anchor = shape.points[0] ? anchorAt(target, shape.points[0]) : null;
    if (!anchor) return { kind: "pen", ...style, points: shape.points.map((p) => ({ ...p })) };
    const samples = [{ u: 0, v: 0, lift: 0 }];
    const points: ScreenPoint[] = [{ ...shape.points[0] }];
    for (const p of shape.points.slice(1)) {
      const world = worldAt(target, anchor.pose, p);
      if (!world) continue;
      samples.push(toUV(anchor.pose, world));
      const screen = target.space.project(world);
      if (screen) points.push(screen);
    }
    return { kind: "pen", ...style, points, pose: anchor.pose, samples, ink: anchor.ink };
  }
  if (shape.kind === "dot") {
    const anchor = anchorAt(target, shape.at);
    if (!anchor) return { kind: "dot", ...style, at: { ...shape.at } };
    return {
      kind: "dot",
      ...style,
      at: { ...shape.at },
      pose: anchor.pose,
      au: 0,
      av: 0,
      radius: dotRadius(shape.width) * anchor.ink.px,
      ink: anchor.ink,
    };
  }
  if (shape.kind === "text") {
    const anchor = anchorAt(target, shape.at);
    const base = { kind: "text" as const, ...style, at: { ...shape.at }, text: shape.text, scale: shape.scale ?? 1 };
    return anchor ? { ...base, pose: anchor.pose, ink: anchor.ink, au: 0, av: 0 } : base;
  }
  // arrow · rect · ellipse
  const anchor = anchorAt(target, shape.from);
  if (!anchor) return { kind: shape.kind, ...style, from: { ...shape.from }, to: { ...shape.to } };
  const world = worldAt(target, anchor.pose, shape.to);
  const uv = world ? toUV(anchor.pose, world) : { u: 0, v: 0, lift: 0 };
  const to = world ? target.space.project(posePoint(anchor.pose, uv.u, uv.v)) : null;
  return {
    kind: shape.kind,
    ...style,
    from: { ...shape.from },
    to: to ?? { ...shape.to },
    pose: anchor.pose,
    au: 0,
    av: 0,
    bu: uv.u,
    bv: uv.v,
    ink: anchor.ink,
  };
}

/** `shapes`(원본 쪽 목록)를 반대쪽 뷰에 얹은 목록으로 바꾼다. */
export function mirrorShapes(
  shapes: PaintShape[],
  from: ViewPaintSpace | null,
  target: MirrorTarget,
): PaintShape[] {
  return shapes.map((shape) => mirrorOne(currentScreen(shape, from), target));
}
