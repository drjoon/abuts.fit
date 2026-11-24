// 악궁 프레임: 전치 쪽이 앞, 치아 쪽이 교합, 뒤집어도 같은 해부 방향을 가리킨다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { estimateDentalFrame, type FrameMesh } from "./dentalFrame";

function cloud(role: "upper" | "lower", coords: number[]): FrameMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
  return { role, geometry };
}

/** 앞(+Y)이 전치, 뒤가 좌·우 대구치인 말굽. yaw 만큼 수평 회전. */
function horseshoe(zTooth: number, zGum: number, yaw: number): number[] {
  const out: number[] = [];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const push = (x: number, y: number, z: number) => {
    out.push(c * x - s * y, s * x + c * y, z);
  };
  for (let i = 0; i <= 48; i += 1) {
    const t = -2.15 + (4.3 * i) / 48;
    const x = Math.sin(t) * 24;
    const y = Math.cos(t) * 22 + 4;
    const half = Math.abs(t) > 1.15 ? 4.5 : 1.6;
    for (const dx of [-half, 0, half]) {
      push(x + dx, y, zTooth);
      push(x + dx * 0.6, y - 1.2, zGum);
    }
  }
  return out;
}

test("하악만 있어도 앞은 전치, 교합은 치아 쪽이다", () => {
  const frame = estimateDentalFrame([cloud("lower", horseshoe(8, 0, Math.PI))]);
  assert.ok(frame);
  const incisor = new THREE.Vector3(0, -1, 0);
  assert.ok(frame!.anterior.dot(incisor) > 0.7, "하악도 전치가 앞이다");
  assert.ok(frame!.up.z > 0.7, "하악 위쪽은 치아(교합) 쪽이다");
});

test("말굽을 돌려도 앞은 전치, 위는 두개 쪽이다", () => {
  for (const yaw of [0, Math.PI]) {
    const frame = estimateDentalFrame([
      cloud("upper", horseshoe(16, 24, yaw)),
      cloud("lower", horseshoe(6, 0, yaw)),
    ]);
    assert.ok(frame, `yaw ${yaw} 프레임`);
    const incisor = new THREE.Vector3(-Math.sin(yaw), Math.cos(yaw), 0);
    assert.ok(frame!.anterior.dot(incisor) > 0.8, `앞이 전치를 향한다 yaw=${yaw}`);
    assert.ok(frame!.up.z > 0.8, `위가 두개(+Z)다 yaw=${yaw}`);
    const right = new THREE.Vector3().crossVectors(frame!.anterior, frame!.up);
    assert.ok(frame!.right.dot(right) > 0.9, "오른쪽은 앞×위");
  }
});
