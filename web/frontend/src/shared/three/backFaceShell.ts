// 스캔 메시 뒷면을 앞면과 같은 재질로 불투명하게 겹쳐 그린다.
// - 2026-10-04: 표시는 FrontSide+셸이어도 픽킹은 양면을 맞힌다. 안쪽 와인딩 스캔에서 왼쪽 드래그가 빗나가지 않게.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
// - web/frontend/src/shared/components/practice/scanMeshEditController.ts
import * as THREE from "three";

const SHELL_KEY = "backFaceShell";

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
 * 앞면은 `mesh.material`(FrontSide), 뒷면은 같은 지오메트리의 불투명 복제본으로 그린다.
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
