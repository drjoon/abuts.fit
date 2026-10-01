// 페인트 표시의 좌표. 화면 비율과, 모델에 붙인 평면.
// related files: viewPaintSpace.ts, viewPaintInk.ts, ViewPaintSurface.tsx

export type Vec3 = { x: number; y: number; z: number };

export type ScreenPoint = { x: number; y: number };

/** 모델 좌표의 평면. origin은 표면에 두고, axisU·axisV는 그릴 때의 화면 오른쪽·위. */
export type Pose = {
  origin: Vec3;
  normal: Vec3;
  axisU: Vec3;
  axisV: Vec3;
};

/** 곡면을 따라간 펜 점. lift는 평면 법선 방향. */
export type PenSample = { u: number; v: number; lift: number };

/** 그릴 때의 화면 배율. 선 굵기·점 크기를 그 시점 크기로 고정한다. */
export type InkScale = { px: number; lift: number };

type BoxShape = {
  color: string;
  width: number;
  from: ScreenPoint;
  to: ScreenPoint;
  pose?: Pose;
  au?: number;
  av?: number;
  bu?: number;
  bv?: number;
  ink?: InkScale;
};

export type PaintShape =
  | {
      kind: "pen";
      color: string;
      width: number;
      points: ScreenPoint[];
      pose?: Pose;
      samples?: PenSample[];
      ink?: InkScale;
    }
  | ({ kind: "arrow" } & BoxShape)
  | ({ kind: "rect" } & BoxShape)
  | ({ kind: "ellipse" } & BoxShape)
  | {
      kind: "dot";
      color: string;
      width: number;
      at: ScreenPoint;
      pose?: Pose;
      au?: number;
      av?: number;
      /** 점 반지름. 3D면 모델 단위, 2D면 CSS px. 없으면 굵기에서 계산한다. */
      radius?: number;
      ink?: InkScale;
    }
  | {
      kind: "text";
      color: string;
      width: number;
      at: ScreenPoint;
      text: string;
      pose?: Pose;
      au?: number;
      av?: number;
      scale?: number;
      ink?: InkScale;
    };

export const TEXT_FONT =
  "600 {size}px system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif";

export function textSize(width: number) {
  return 12 + width * 2;
}

export function dotRadius(width: number) {
  return 3 + width * 1.5;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vlen(a: Vec3) {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm(a: Vec3): Vec3 {
  const len = vlen(a);
  if (len < 1e-8) return { x: 0, y: 0, z: 1 };
  return mul(a, 1 / len);
}

export function posePoint(pose: Pose, u: number, v: number, lift = 0): Vec3 {
  return add(add(pose.origin, mul(pose.axisU, u)), add(mul(pose.axisV, v), mul(pose.normal, lift)));
}

export function toUV(pose: Pose, point: Vec3): PenSample {
  const d = sub(point, pose.origin);
  return { u: dot(d, pose.axisU), v: dot(d, pose.axisV), lift: dot(d, pose.normal) };
}

export function intersectPlane(
  ray: { origin: Vec3; direction: Vec3 },
  pose: Pose,
): Vec3 | null {
  const denom = dot(pose.normal, ray.direction);
  if (Math.abs(denom) < 1e-8) return null;
  const t = dot(pose.normal, sub(pose.origin, ray.origin)) / denom;
  if (t < 0) return null;
  return add(ray.origin, mul(ray.direction, t));
}

export function cloneShape(shape: PaintShape): PaintShape {
  return structuredClone(shape);
}

export type ResizeHandle = { id: string; x: number; y: number; cursor: string };

const HANDLE_HIT = 14;

function cornerCursor(x: number, y: number, cx: number, cy: number) {
  const dx = x - cx;
  const dy = y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return "nwse-resize";
  return dx * dy > 0 ? "nwse-resize" : "nesw-resize";
}

function edgeCursor(horizontal: boolean) {
  return horizontal ? "ew-resize" : "ns-resize";
}

function boxHandles(
  corners: Array<{ id: string; x: number; y: number } | null>,
  edges: Array<{ id: string; x: number; y: number; horizontal: boolean } | null>,
): ResizeHandle[] {
  const live = corners.filter((corner): corner is { id: string; x: number; y: number } => corner != null);
  if (live.length === 0) return [];
  const cx = live.reduce((sum, corner) => sum + corner.x, 0) / live.length;
  const cy = live.reduce((sum, corner) => sum + corner.y, 0) / live.length;
  const handles: ResizeHandle[] = live.map((corner) => ({
    id: corner.id,
    x: corner.x,
    y: corner.y,
    cursor: cornerCursor(corner.x, corner.y, cx, cy),
  }));
  for (const edge of edges) {
    if (!edge) continue;
    handles.push({
      id: edge.id,
      x: edge.x,
      y: edge.y,
      cursor: edgeCursor(edge.horizontal),
    });
  }
  return handles;
}

function projectBox(
  shape: Extract<PaintShape, { kind: "rect" | "ellipse" | "arrow" }>,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): { au: ScreenPoint; bu: ScreenPoint; ab: ScreenPoint; ba: ScreenPoint } | null {
  if (shape.pose && project) {
    const au = project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
    const bu = project(posePoint(shape.pose, shape.bu ?? 0, shape.bv ?? 0));
    const ab = project(posePoint(shape.pose, shape.bu ?? 0, shape.av ?? 0));
    const ba = project(posePoint(shape.pose, shape.au ?? 0, shape.bv ?? 0));
    if (!au || !bu || !ab || !ba) return null;
    return { au, bu, ab, ba };
  }
  const au = shape.from;
  const bu = shape.to;
  return {
    au,
    bu,
    ab: { x: bu.x, y: au.y },
    ba: { x: au.x, y: bu.y },
  };
}

export function shapeHandles(
  shape: PaintShape,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): ResizeHandle[] {
  if (shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "arrow") {
    const box = projectBox(shape, project);
    if (!box) return [];
    if (shape.kind === "arrow") {
      return [
        { id: "from", x: box.au.x, y: box.au.y, cursor: "move" },
        { id: "to", x: box.bu.x, y: box.bu.y, cursor: "move" },
      ];
    }
    const mid = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    const top = mid(box.au, box.ab);
    const right = mid(box.ab, box.bu);
    const bottom = mid(box.bu, box.ba);
    const left = mid(box.ba, box.au);
    return boxHandles(
      [
        { id: "au", ...box.au },
        { id: "ab", ...box.ab },
        { id: "bu", ...box.bu },
        { id: "ba", ...box.ba },
      ],
      [
        { id: "edge-av", ...top, horizontal: false },
        { id: "edge-bu", ...right, horizontal: true },
        { id: "edge-bv", ...bottom, horizontal: false },
        { id: "edge-au", ...left, horizontal: true },
      ],
    );
  }
  if (shape.kind === "pen") {
    const pts = penScreenPoints(shape, project);
    if (pts.length < 2) return [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of pts) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (maxX - minX < 1e-4 && maxY - minY < 1e-4) return [];
    return boxHandles(
      [
        { id: "pen-nw", x: minX, y: minY },
        { id: "pen-ne", x: maxX, y: minY },
        { id: "pen-se", x: maxX, y: maxY },
        { id: "pen-sw", x: minX, y: maxY },
      ],
      [],
    );
  }
  if (shape.kind === "dot") {
    const at = anchoredPoint(shape, project) ?? shape.at;
    const radiusN = dotScreenRadius(shape, project);
    return [{ id: "radius", x: at.x + radiusN, y: at.y, cursor: "ew-resize" }];
  }
  if (shape.kind !== "text") return [];
  const at = anchoredPoint(shape, project) ?? shape.at;
  const widthN = textScreenWidth(shape, project);
  return [{ id: "scale", x: at.x + widthN, y: at.y, cursor: "ew-resize" }];
}

function penScreenPoints(
  shape: Extract<PaintShape, { kind: "pen" }>,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): ScreenPoint[] {
  if (shape.pose && shape.samples && project) {
    const points: ScreenPoint[] = [];
    for (const sample of shape.samples) {
      const screen = project(posePoint(shape.pose, sample.u, sample.v, sample.lift));
      if (screen) points.push(screen);
    }
    return points;
  }
  return shape.points;
}

function anchoredPoint(
  shape: Extract<PaintShape, { kind: "dot" | "text" }>,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): ScreenPoint | null {
  if (!shape.pose || !project) return null;
  return project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
}

function dotScreenRadius(
  shape: Extract<PaintShape, { kind: "dot" }>,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): number {
  if (shape.pose && project && shape.radius != null) {
    const at = project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
    const edge = project(posePoint(shape.pose, (shape.au ?? 0) + shape.radius, shape.av ?? 0));
    if (at && edge) return Math.hypot(edge.x - at.x, edge.y - at.y) || 0.02;
  }
  return 0.02;
}

function textScreenWidth(
  shape: Extract<PaintShape, { kind: "text" }>,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): number {
  if (shape.pose && shape.ink && project) {
    const font = textSize(shape.width) * (shape.scale ?? 1) * shape.ink.px;
    const at = project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
    const end = project(
      posePoint(shape.pose, (shape.au ?? 0) + font * Math.max(shape.text.length, 1) * 0.6, shape.av ?? 0),
    );
    if (at && end) return Math.max(0.02, end.x - at.x);
  }
  return 0.04 + shape.text.length * 0.012 * (shape.scale ?? 1);
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** 화면 px 거리. 선에서 이 값보다 가까우면 그 표시를 고른다. */
export function shapeHitPx(
  shape: PaintShape,
  x: number,
  y: number,
  viewW: number,
  viewH: number,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): number {
  const px = x * viewW;
  const py = y * viewH;
  const toPx = (point: ScreenPoint) => ({ x: point.x * viewW, y: point.y * viewH });
  if (shape.kind === "dot") {
    const at = toPx(anchoredPoint(shape, project) ?? shape.at);
    const radius =
      shape.pose && shape.radius != null
        ? dotScreenRadius(shape, project) * viewW
        : shape.radius ?? dotRadius(shape.width);
    return Math.max(0, Math.hypot(px - at.x, py - at.y) - radius);
  }
  if (shape.kind === "text") {
    const at = toPx(anchoredPoint(shape, project) ?? shape.at);
    const width = textScreenWidth(shape, project) * viewW;
    const height = textSize(shape.width) * (shape.scale ?? 1);
    const dx = Math.max(at.x - px, 0, px - (at.x + width));
    const dy = Math.max(at.y - py, 0, py - (at.y + height));
    return Math.hypot(dx, dy);
  }
  if (shape.kind === "pen") {
    const points = penScreenPoints(shape, project).map(toPx);
    if (points.length === 0) return Infinity;
    if (points.length === 1) return Math.hypot(px - points[0].x, py - points[0].y);
    let best = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      best = Math.min(
        best,
        distToSeg(px, py, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y),
      );
    }
    return best;
  }
  const box = projectBox(shape, project);
  if (!box) return Infinity;
  const corners = [box.au, box.ab, box.bu, box.ba].map(toPx);
  if (shape.kind === "arrow") {
    return distToSeg(px, py, corners[0].x, corners[0].y, corners[2].x, corners[2].y);
  }
  if (shape.kind === "ellipse") {
    let best = Infinity;
    const steps = 36;
    let prev = ellipsePoint(box, 0);
    for (let i = 1; i <= steps; i += 1) {
      const next = ellipsePoint(box, (i / steps) * Math.PI * 2);
      best = Math.min(
        best,
        distToSeg(px, py, prev.x * viewW, prev.y * viewH, next.x * viewW, next.y * viewH),
      );
      prev = next;
    }
    return best;
  }
  let best = Infinity;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    best = Math.min(best, distToSeg(px, py, a.x, a.y, b.x, b.y));
  }
  return best;
}

function ellipsePoint(
  box: { au: ScreenPoint; bu: ScreenPoint; ab: ScreenPoint; ba: ScreenPoint },
  angle: number,
): ScreenPoint {
  const cx = (box.au.x + box.bu.x) / 2;
  const cy = (box.au.y + box.bu.y) / 2;
  const rx = Math.hypot(box.ab.x - box.au.x, box.ab.y - box.au.y) / 2;
  const ry = Math.hypot(box.ba.x - box.au.x, box.ba.y - box.au.y) / 2;
  return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
}

export { HANDLE_HIT };

function clampSpan(value: number, origin: number, minSpan: number) {
  const delta = value - origin;
  if (Math.abs(delta) >= minSpan) return value;
  return origin + Math.sign(delta || 1) * minSpan;
}

function squareEnd(fixed: number, moving: number, other: number) {
  const side = Math.max(Math.abs(moving - fixed), Math.abs(other));
  return fixed + Math.sign(moving - fixed || 1) * side;
}

/** 드래그로 표시 크기를 바꾼다. start는 드래그를 시작한 사본. */
export function resizeShape(
  shape: PaintShape,
  start: PaintShape,
  handleId: string,
  at: { x: number; y: number; world: Vec3 | null },
  shift: boolean,
  minWorld: number,
  view: { width: number; height: number },
) {
  if (shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "arrow") {
    if (start.kind !== shape.kind) return;
    if (shape.pose && start.pose && at.world) {
      const uv = toUV(shape.pose, at.world);
      let au = start.au ?? 0;
      let av = start.av ?? 0;
      let bu = start.bu ?? 0;
      let bv = start.bv ?? 0;
      const moveU = handleId === "au" || handleId === "ba" || handleId === "edge-au" || handleId === "from";
      const moveV = handleId === "au" || handleId === "ab" || handleId === "edge-av" || handleId === "from";
      const moveBU = handleId === "bu" || handleId === "ab" || handleId === "edge-bu" || handleId === "to";
      const moveBV = handleId === "bu" || handleId === "ba" || handleId === "edge-bv" || handleId === "to";
      if (moveU) au = uv.u;
      if (moveV) av = uv.v;
      if (moveBU) bu = uv.u;
      if (moveBV) bv = uv.v;
      if (shift && shape.kind !== "arrow") {
        if (moveU && moveV) {
          const side = Math.max(Math.abs(au - bu), Math.abs(av - bv));
          au = bu + Math.sign(au - bu || 1) * side;
          av = bv + Math.sign(av - bv || 1) * side;
        } else if (moveBU && moveBV) {
          const side = Math.max(Math.abs(bu - au), Math.abs(bv - av));
          bu = au + Math.sign(bu - au || 1) * side;
          bv = av + Math.sign(bv - av || 1) * side;
        } else if (moveU) au = squareEnd(bu, au, Math.abs(av - bv));
        else if (moveBU) bu = squareEnd(au, bu, Math.abs(av - bv));
        else if (moveV) av = squareEnd(bv, av, Math.abs(au - bu));
        else if (moveBV) bv = squareEnd(av, bv, Math.abs(au - bu));
      }
      if (shape.kind !== "arrow") {
        if (moveU) au = clampSpan(au, start.bu ?? bu, minWorld);
        if (moveV) av = clampSpan(av, start.bv ?? bv, minWorld);
        if (moveBU) bu = clampSpan(bu, start.au ?? au, minWorld);
        if (moveBV) bv = clampSpan(bv, start.av ?? av, minWorld);
      }
      shape.au = au;
      shape.av = av;
      shape.bu = bu;
      shape.bv = bv;
      return;
    }
    const from = { ...start.from };
    const to = { ...start.to };
    const minX = 4 / Math.max(view.width, 1);
    const minY = 4 / Math.max(view.height, 1);
    const apply = (nx: number, ny: number) => {
      let nextFrom = { ...from };
      let nextTo = { ...to };
      if (handleId === "au" || handleId === "from") nextFrom = { x: nx, y: ny };
      if (handleId === "bu" || handleId === "to") nextTo = { x: nx, y: ny };
      if (handleId === "ab") nextTo = { ...nextTo, x: nx };
      if (handleId === "ab") nextFrom = { ...nextFrom, y: ny };
      if (handleId === "ba") nextFrom = { ...nextFrom, x: nx };
      if (handleId === "ba") nextTo = { ...nextTo, y: ny };
      if (handleId === "edge-av") nextFrom = { ...nextFrom, y: ny };
      if (handleId === "edge-bv") nextTo = { ...nextTo, y: ny };
      if (handleId === "edge-au") nextFrom = { ...nextFrom, x: nx };
      if (handleId === "edge-bu") nextTo = { ...nextTo, x: nx };
      if (shift && shape.kind !== "arrow" && (handleId === "au" || handleId === "bu")) {
        const dx = (nextTo.x - nextFrom.x) * view.width;
        const dy = (nextTo.y - nextFrom.y) * view.height;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        if (handleId === "au") {
          nextFrom = {
            x: nextTo.x - Math.sign(dx || 1) * (size / view.width),
            y: nextTo.y - Math.sign(dy || 1) * (size / view.height),
          };
        } else {
          nextTo = {
            x: nextFrom.x + Math.sign(dx || 1) * (size / view.width),
            y: nextFrom.y + Math.sign(dy || 1) * (size / view.height),
          };
        }
      }
      if (shape.kind !== "arrow") {
        if (Math.abs(nextTo.x - nextFrom.x) < minX) return;
        if (Math.abs(nextTo.y - nextFrom.y) < minY) return;
      }
      shape.from = nextFrom;
      shape.to = nextTo;
    };
    apply(at.x, at.y);
    return;
  }
  if (shape.kind === "pen" && start.kind === "pen") {
    if (shape.pose && start.pose && start.samples && shape.samples && at.world) {
      const uv = toUV(shape.pose, at.world);
      scalePenSamples(shape.samples, start.samples, handleId, uv.u, uv.v);
      return;
    }
    scalePenPoints(shape.points, start.points, handleId, at.x, at.y);
    return;
  }
  if (shape.kind === "dot" && start.kind === "dot") {
    if (shape.pose && at.world) {
      const uv = toUV(shape.pose, at.world);
      shape.radius = Math.max(minWorld, Math.hypot(uv.u - (shape.au ?? 0), uv.v - (shape.av ?? 0)));
      return;
    }
    const dx = (at.x - shape.at.x) * view.width;
    const dy = (at.y - shape.at.y) * view.height;
    shape.radius = Math.max(4, Math.hypot(dx, dy));
    return;
  }
  if (shape.kind === "text" && start.kind === "text") {
    if (shape.pose && at.world) {
      const uv = toUV(shape.pose, at.world);
      const du = uv.u - (shape.au ?? 0);
      const base = textSize(shape.width) * (start.scale ?? 1) * (shape.ink?.px ?? minWorld);
      shape.scale = Math.max(0.4, Math.abs(du) / Math.max(base * Math.max(shape.text.length, 1) * 0.6, minWorld));
      return;
    }
    const dx = Math.abs(at.x - shape.at.x) * view.width;
    const base = Math.max(24, shape.text.length * textSize(shape.width) * 0.55);
    shape.scale = Math.max(0.4, dx / base);
  }
}

function scalePenSamples(
  samples: PenSample[],
  start: PenSample[],
  handleId: string,
  u: number,
  v: number,
) {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const sample of start) {
    minU = Math.min(minU, sample.u);
    minV = Math.min(minV, sample.v);
    maxU = Math.max(maxU, sample.u);
    maxV = Math.max(maxV, sample.v);
  }
  const du = Math.max(maxU - minU, 1e-6);
  const dv = Math.max(maxV - minV, 1e-6);
  let nextMinU = minU;
  let nextMinV = minV;
  let nextMaxU = maxU;
  let nextMaxV = maxV;
  if (handleId === "pen-nw") {
    nextMinU = u;
    nextMinV = v;
  } else if (handleId === "pen-ne") {
    nextMaxU = u;
    nextMinV = v;
  } else if (handleId === "pen-se") {
    nextMaxU = u;
    nextMaxV = v;
  } else if (handleId === "pen-sw") {
    nextMinU = u;
    nextMaxV = v;
  }
  const nu = Math.max(nextMaxU - nextMinU, 1e-4);
  const nv = Math.max(nextMaxV - nextMinV, 1e-4);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = start[i];
    if (!sample) continue;
    samples[i] = {
      u: nextMinU + ((sample.u - minU) / du) * nu,
      v: nextMinV + ((sample.v - minV) / dv) * nv,
      lift: sample.lift,
    };
  }
}

function scalePenPoints(
  points: ScreenPoint[],
  start: ScreenPoint[],
  handleId: string,
  x: number,
  y: number,
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of start) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const dx = Math.max(maxX - minX, 1e-6);
  const dy = Math.max(maxY - minY, 1e-6);
  let nextMinX = minX;
  let nextMinY = minY;
  let nextMaxX = maxX;
  let nextMaxY = maxY;
  if (handleId === "pen-nw") {
    nextMinX = x;
    nextMinY = y;
  } else if (handleId === "pen-ne") {
    nextMaxX = x;
    nextMinY = y;
  } else if (handleId === "pen-se") {
    nextMaxX = x;
    nextMaxY = y;
  } else if (handleId === "pen-sw") {
    nextMinX = x;
    nextMaxY = y;
  }
  const nx = Math.max(nextMaxX - nextMinX, 1e-4);
  const ny = Math.max(nextMaxY - nextMinY, 1e-4);
  for (let i = 0; i < points.length; i += 1) {
    const point = start[i];
    if (!point) continue;
    points[i] = {
      x: nextMinX + ((point.x - minX) / dx) * nx,
      y: nextMinY + ((point.y - minY) / dy) * ny,
    };
  }
}

/** 순번이 붙는 모델 좌표. 화면 표시는 null. */
export function shapeAnchorWorld(shape: PaintShape): Vec3 | null {
  if (!shape.pose) return null;
  if (shape.kind === "pen") {
    const last = shape.samples?.[shape.samples.length - 1];
    if (!last) return shape.pose.origin;
    return posePoint(shape.pose, last.u, last.v, last.lift);
  }
  if (shape.kind === "dot" || shape.kind === "text") {
    return posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0);
  }
  if (shape.kind === "arrow") return posePoint(shape.pose, shape.bu ?? 0, shape.bv ?? 0);
  const u = Math.max(shape.au ?? 0, shape.bu ?? 0);
  const v = Math.max(shape.av ?? 0, shape.bv ?? 0);
  return posePoint(shape.pose, u, v);
}

/** 순번 뱃지 위치. 사각형·원은 지금 화면에서 가장 위·오른쪽 모서리. */
export function shapeLabelPoint(
  shape: PaintShape,
  project: ((point: Vec3) => ScreenPoint | null) | null,
): ScreenPoint | null {
  if (shape.kind === "rect" || shape.kind === "ellipse") {
    const box = projectBox(shape, project);
    if (!box) return null;
    const corners = [box.au, box.ab, box.bu, box.ba];
    let best = corners[0];
    for (const corner of corners) {
      if (
        corner.y < best.y - 0.002 ||
        (Math.abs(corner.y - best.y) <= 0.002 && corner.x > best.x)
      ) {
        best = corner;
      }
    }
    return best;
  }
  if (shape.pose && project) {
    const world = shapeAnchorWorld(shape);
    return world ? project(world) : null;
  }
  if (shape.kind === "pen") return shape.points[shape.points.length - 1] ?? null;
  if (shape.kind === "arrow") return shape.to;
  if (shape.kind === "dot" || shape.kind === "text") return shape.at;
  return null;
}

/** 화면 좌표를 모델 투영으로 다시 맞춘다. 순번·손잡이 위치. */
export function refreshShapeScreen(
  shape: PaintShape,
  project: (point: Vec3) => ScreenPoint | null,
) {
  if (!shape.pose) return;
  if (shape.kind === "pen" && shape.samples) {
    const points: ScreenPoint[] = [];
    for (const sample of shape.samples) {
      const screen = project(posePoint(shape.pose, sample.u, sample.v, sample.lift));
      if (screen) points.push(screen);
    }
    if (points.length > 0) shape.points = points;
    return;
  }
  if (shape.kind === "arrow" || shape.kind === "rect" || shape.kind === "ellipse") {
    const from = project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
    const to = project(posePoint(shape.pose, shape.bu ?? 0, shape.bv ?? 0));
    if (from) shape.from = from;
    if (to) shape.to = to;
    return;
  }
  if (shape.kind !== "dot" && shape.kind !== "text") return;
  const at = project(posePoint(shape.pose, shape.au ?? 0, shape.av ?? 0));
  if (at) shape.at = at;
}
