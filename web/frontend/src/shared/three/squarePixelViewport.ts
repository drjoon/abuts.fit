// 3D 캔버스의 픽셀 비율을 화면 칸과 같게 맞춘다.
// Windows 125%·150%처럼 배율이 정수가 아니면 버퍼 가·세를 따로 내림하면
// 원이 타원이 된다. 버퍼 비율을 화면 비율에 맞춘다.
import * as THREE from "three";

export type WebglHostSize = {
  width: number;
  height: number;
  aspect: number;
};

/** 호스트 칸의 레이아웃 크기. 조상 transform의 시각 크기는 쓰지 않는다. */
export function readHostSize(host: HTMLElement): WebglHostSize {
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  return { width, height, aspect: width / height };
}

/**
 * 그리기 버퍼 비율 = 캔버스가 차지하는 칸의 비율.
 * `setPixelRatio` 뒤 가·세를 따로 `floor` 하면 125%·150%에서 가로·세로 배율이 어긋난다.
 */
export function resizeWebglToHost(
  renderer: THREE.WebGLRenderer,
  host: HTMLElement,
): WebglHostSize {
  const { width, height, aspect } = readHostSize(host);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bufW = Math.max(1, Math.round(width * dpr));
  const bufH = Math.max(1, Math.round(bufW / aspect));
  renderer.setPixelRatio(1);
  renderer.setSize(bufW, bufH, false);
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.maxWidth = "none";
  canvas.style.maxHeight = "none";
  canvas.style.display = "block";
  return { width, height, aspect: width / height };
}

/** 직교 카메라의 세로를 유지하고 가로만 화면 비율에 맞춘다. 원은 원으로 남는다. */
export function applyOrthoHeight(
  camera: THREE.OrthographicCamera,
  halfH: number,
  aspect: number,
) {
  const h = Math.max(halfH, 1e-4);
  const a = Math.max(aspect, 1e-4);
  camera.top = h;
  camera.bottom = -h;
  camera.left = -h * a;
  camera.right = h * a;
  camera.updateProjectionMatrix();
}
