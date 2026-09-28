// 스캔 메시 뒷면을 반투명하게 겹쳐 그린다. 반대 악 안쪽에서 볼 때 대합치 교두가 얼마나 튀어나왔는지 보인다.
// related files:
// - web/frontend/src/shared/share/CaseLayerViewer.tsx
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx
import * as THREE from "three";

/** 뒷면 불투명도. 앞면은 그대로 불투명하다. */
export const BACK_FACE_OPACITY = 0.9;

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
 * 앞면은 `mesh.material`(FrontSide), 뒷면은 같은 지오메트리의 반투명 복제본으로 그린다.
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
  back.transparent = true;
  back.opacity = BACK_FACE_OPACITY;
  back.depthWrite = false;

  const shell = findShell(mesh);
  if (shell) {
    (shell.material as THREE.Material).dispose();
    shell.material = back;
    shell.geometry = mesh.geometry;
    return;
  }
  const next = new THREE.Mesh(mesh.geometry, back);
  next.userData[SHELL_KEY] = true;
  // 픽킹·편집은 본 메시만 맞힌다.
  next.raycast = () => {};
  mesh.add(next);
}
