// 스캔 메시 뒷면을 앞면과 같은 색조의 어두운 재질로 불투명하게 겹쳐 그린다.
// - 2026-10-11: 뒷면 알베도만 눌러 대합이 셸 안쪽으로 튀어나온 면을 앞면과 구분한다.
// - 2026-10-04: 표시는 FrontSide+셸이어도 픽킹은 양면을 맞힌다. 안쪽 와인딩 스캔에서 왼쪽 드래그가 빗나가지 않게.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/components/practice/scanMeshEditController.ts
import * as THREE from "three";

const SHELL_KEY = "backFaceShell";
/** 앞면 색을 유지한 채 뒷면만 이 비율로 어둡게. 버텍스 컬러·텍스처는 `color`가 곱해진다. */
const BACK_FACE_ALBEDO = 0.34;

function shadeBackFace(material: THREE.Material) {
  const lit = material as THREE.MeshStandardMaterial;
  if (lit.color?.isColor) lit.color.multiplyScalar(BACK_FACE_ALBEDO);
  if (typeof lit.roughness === "number") {
    lit.roughness = Math.max(lit.roughness, 0.86);
  }
  // 실루엣에서 앞면이 이긴다. 밝기 차이가 가장자리에서 깜빡이지 않게.
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
}

function findShell(mesh: THREE.Mesh): THREE.Mesh | undefined {
  return mesh.children.find((child) => child.userData[SHELL_KEY]) as
    | THREE.Mesh
    | undefined;
}

/** 본 메시 지오메트리를 바꾼 뒤 셸도 같은 지오메트리를 보게 한다. */
export function syncBackFaceShellGeometry(mesh: THREE.Mesh) {
  const shell = findShell(mesh);
  if (shell) shell.geometry = mesh.geometry;
}

export function disposeBackFaceShell(mesh: THREE.Mesh) {
  const shell = findShell(mesh);
  if (!shell) return;
  mesh.remove(shell);
  const list = Array.isArray(shell.material) ? shell.material : [shell.material];
  for (const mat of list) mat.dispose();
}

/**
 * 앞면은 `mesh.material`(FrontSide), 뒷면은 같은 지오메트리를 어둡게 한 불투명 복제본으로 그린다.
 * 재질·지오메트리를 바꾼 뒤마다 다시 부른다.
 * 이미 반투명한 재질(고스트 등)은 셸 없이 원래 `side`를 둔다.
 */
export function syncBackFaceShell(mesh: THREE.Mesh) {
  const base = mesh.material;
  if (Array.isArray(base) || base.transparent) {
    disposeBackFaceShell(mesh);
    return;
  }
  base.side = THREE.FrontSide;
  const back = base.clone();
  back.side = THREE.BackSide;
  back.transparent = false;
  back.opacity = 1;
  back.depthWrite = true;
  shadeBackFace(back);

  const shell = findShell(mesh);
  if (shell) {
    (shell.material as THREE.Material).dispose();
    shell.material = back;
    shell.geometry = mesh.geometry;
    return;
  }
  const next = new THREE.Mesh(mesh.geometry, back);
  next.userData[SHELL_KEY] = true;
  // 픽킹·편집은 본 메시만 맞힌다. 본 메시는 FrontSide라 와인딩이 반대면 빗나간다.
  next.raycast = () => {};
  mesh.add(next);
}

/**
 * 셸 때문에 FrontSide인 스캔도 보이는 면이 맞게. 광선 검사 뒤에 면·셸 픽킹을 되돌린다.
 */
export function withDoubleSidePick<T>(meshes: readonly THREE.Mesh[], run: () => T): T {
  const restored: Array<{ mat: THREE.Material; side: THREE.Side }> = [];
  const shells: Array<{ mesh: THREE.Mesh; raycast: THREE.Mesh["raycast"] }> = [];
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!Array.isArray(mat) && mat.side !== THREE.DoubleSide) {
      restored.push({ mat, side: mat.side });
      mat.side = THREE.DoubleSide;
    }
    const shell = findShell(mesh);
    if (shell) {
      shells.push({ mesh: shell, raycast: shell.raycast });
      shell.raycast = THREE.Mesh.prototype.raycast;
    }
  }
  try {
    return run();
  } finally {
    for (const row of restored) row.mat.side = row.side;
    for (const row of shells) row.mesh.raycast = row.raycast;
  }
}

const normalBitsBuf = new ArrayBuffer(4);
const normalBitsF = new Float32Array(normalBitsBuf);
const normalBitsU = new Uint32Array(normalBitsBuf);

function floatBitsKey(v: number): number {
  // -0과 +0이 같은 해시를 갖도록 정규화한다.
  normalBitsF[0] = v === 0 ? 0 : v;
  return normalBitsU[0] ?? 0;
}

/**
 * 비색인 삼각형 수프(STL/불리언 결과)에서 같은 정점을 공유하는 면들 중
 * 사잇각이 creaseRad 이하인 면들의 면적 가중 법선만 평균해 매끄러운 정점 법선을 계산한다.
 * 포스트 축벽·챔퍼·윗면 라운드·커프의 세로 각진 줄무늬(Mach band)는 없애고,
 * 피니시라인·스크류 홀 테두리·헥스 모서리의 날카로운 각은 그대로 살린다.
 */
export function computeCreasedVertexNormals(
  geometry: THREE.BufferGeometry,
  creaseRad = (32 * Math.PI) / 180,
): void {
  if (geometry.index) geometry.setIndex(null);
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count < 3) return;
  const pos = posAttr.array as Float32Array;
  const triCount = Math.floor(posAttr.count / 3);
  const cornerCount = triCount * 3;

  let normAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!normAttr || normAttr.array.length !== pos.length) {
    normAttr = new THREE.BufferAttribute(new Float32Array(pos.length), 3);
    geometry.setAttribute("normal", normAttr);
  }
  const out = normAttr.array as Float32Array;

  const faceWx = new Float32Array(triCount);
  const faceWy = new Float32Array(triCount);
  const faceWz = new Float32Array(triCount);
  const faceUx = new Float32Array(triCount);
  const faceUy = new Float32Array(triCount);
  const faceUz = new Float32Array(triCount);

  for (let t = 0; t < triCount; t += 1) {
    const o = t * 9;
    const ax = pos[o]!;
    const ay = pos[o + 1]!;
    const az = pos[o + 2]!;
    const e1x = pos[o + 3]! - ax;
    const e1y = pos[o + 4]! - ay;
    const e1z = pos[o + 5]! - az;
    const e2x = pos[o + 6]! - ax;
    const e2y = pos[o + 7]! - ay;
    const e2z = pos[o + 8]! - az;
    const wx = e1y * e2z - e1z * e2y;
    const wy = e1z * e2x - e1x * e2z;
    const wz = e1x * e2y - e1y * e2x;
    faceWx[t] = wx;
    faceWy[t] = wy;
    faceWz[t] = wz;
    const len = Math.hypot(wx, wy, wz);
    if (len > 1e-12) {
      faceUx[t] = wx / len;
      faceUy[t] = wy / len;
      faceUz[t] = wz / len;
    } else {
      faceUx[t] = 0;
      faceUy[t] = 0;
      faceUz[t] = 1;
    }
  }

  const buckets = new Map<number, number[]>();
  const uniqueFirstCorner: number[] = [];
  const cornerVertId = new Int32Array(cornerCount);
  const nextCorner = new Int32Array(cornerCount).fill(-1);
  const headCorner: number[] = [];

  for (let c = 0; c < cornerCount; c += 1) {
    const o = c * 3;
    const x = pos[o]!;
    const y = pos[o + 1]!;
    const z = pos[o + 2]!;
    const h =
      Math.imul(floatBitsKey(x), 0x9e3779b1) ^
      Math.imul(floatBitsKey(y), 0x85ebca6b) ^
      Math.imul(floatBitsKey(z), 0xc2b2ae35);
    let bucket = buckets.get(h);
    let vid = -1;
    if (bucket) {
      for (let k = 0; k < bucket.length; k += 1) {
        const cand = bucket[k]!;
        const fo = uniqueFirstCorner[cand]! * 3;
        if (pos[fo] === x && pos[fo + 1] === y && pos[fo + 2] === z) {
          vid = cand;
          break;
        }
      }
    } else {
      bucket = [];
      buckets.set(h, bucket);
    }
    if (vid < 0) {
      vid = uniqueFirstCorner.length;
      uniqueFirstCorner.push(c);
      headCorner.push(-1);
      bucket.push(vid);
    }
    cornerVertId[c] = vid;
    nextCorner[c] = headCorner[vid]!;
    headCorner[vid] = c;
  }

  const cosCrease = Math.cos(creaseRad);
  for (let c = 0; c < cornerCount; c += 1) {
    const t = Math.floor(c / 3);
    const ux = faceUx[t]!;
    const uy = faceUy[t]!;
    const uz = faceUz[t]!;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let cur = headCorner[cornerVertId[c]!]!;
    while (cur >= 0) {
      const t2 = Math.floor(cur / 3);
      if (ux * faceUx[t2]! + uy * faceUy[t2]! + uz * faceUz[t2]! >= cosCrease) {
        nx += faceWx[t2]!;
        ny += faceWy[t2]!;
        nz += faceWz[t2]!;
      }
      cur = nextCorner[cur]!;
    }
    const len = Math.hypot(nx, ny, nz);
    const o = c * 3;
    if (len > 1e-12) {
      out[o] = nx / len;
      out[o + 1] = ny / len;
      out[o + 2] = nz / len;
    } else {
      out[o] = ux;
      out[o + 1] = uy;
      out[o + 2] = uz;
    }
  }
  for (let i = cornerCount * 3; i < out.length; i += 1) out[i] = 0;
  normAttr.needsUpdate = true;
}
