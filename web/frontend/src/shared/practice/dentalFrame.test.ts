// 악궁 프레임: 전치 쪽이 앞, 치아 쪽이 교합, 뒤집어도 같은 해부 방향을 가리킨다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { archFrameAxes, dentalFrameFromStored, estimateDentalFrame, type FrameMesh } from "./dentalFrame";

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

test("교합 정렬 축은 앞이 전치, 오른쪽이 앞×위이고 다시 읽힌다", () => {
  const frame = estimateDentalFrame([
    cloud("upper", horseshoe(16, 24, 0)),
    cloud("lower", horseshoe(6, 0, 0)),
  ]);
  assert.ok(frame);
  const stored = archFrameAxes(frame!);
  assert.ok(stored);
  assert.ok(stored!.anterior[1]! > 0.8, "앞은 전치(+Y)");
  assert.ok(stored!.up[2]! > 0.8, "위는 두개(+Z)");
  assert.ok(stored!.right[0]! > 0.8, "오른쪽은 환자 우측(+X). U의 바깥이 협측이다");
  const back = dentalFrameFromStored(stored);
  assert.ok(back);
  assert.ok(back!.anterior.dot(frame!.anterior) > 0.99);
  assert.equal(dentalFrameFromStored({ ...stored!, right: stored!.up }), null);
});

/** 편측 10번대: +X가 전치(좁음), -X가 대구치(넓음). 전치 쪽에 넓은 구개 플랩을 붙여도 앞은 전치다. */
function unilateralRightQuadrant(
  zTooth: number,
  zGum: number,
  yaw: number,
  withAnteriorPalate: boolean,
): number[] {
  const out: number[] = [];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const push = (x: number, y: number, z: number) => {
    out.push(c * x - s * y, s * x + c * y, z);
  };
  // x: -22(구치) → +18(전치). 구치는 협설 넓고 교합 봉우리가 많고, 전치는 좁다.
  // 전치는 설측(−Y, 정중선)으로 모이고, 구치는 바깥(+Y)에 둔다.
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const x = -22 + t * 40;
    const y = 6 - t * 10;
    const half = t < 0.35 ? 5.4 : t > 0.72 ? 2.0 : 3.5;
    for (const dy of [-half, -half * 0.45, 0, half * 0.45, half]) {
      push(x, y + dy, zTooth);
      push(x, y + dy * 0.65, zGum);
    }
    if (t < 0.32) {
      push(x - 1.6, y, zTooth + 0.7);
      push(x + 1.6, y, zTooth + 0.7);
      push(x, y - 1.4, zTooth + 0.55);
      push(x, y + 1.4, zTooth + 0.55);
      push(x - 0.8, y - 0.8, zTooth + 0.45);
      push(x + 0.8, y + 0.8, zTooth + 0.45);
    }
  }
  if (withAnteriorPalate) {
    for (let i = 0; i <= 24; i += 1) {
      const x = 6 + (i / 24) * 16;
      for (let j = 0; j <= 18; j += 1) {
        const y = -4 - (j / 18) * 20;
        push(x, y, zGum + 1.5);
      }
    }
  }
  return out;
}

test("편측 10·40번대는 구개가 전치 쪽에 넓어도 앞은 전치다", () => {
  const noPalate = estimateDentalFrame([
    cloud("upper", unilateralRightQuadrant(16, 24, 0, false)),
    cloud("lower", unilateralRightQuadrant(6, 0, 0, false)),
  ]);
  assert.ok(noPalate);
  assert.ok(
    noPalate!.anterior.x > 0.55,
    `구개 없이 전치는 +X (got ${noPalate!.anterior.toArray().join(",")})`,
  );

  for (const yaw of [0, Math.PI * 0.35, Math.PI]) {
    const frame = estimateDentalFrame([
      cloud("upper", unilateralRightQuadrant(16, 24, yaw, true)),
      cloud("lower", unilateralRightQuadrant(6, 0, yaw, false)),
    ]);
    assert.ok(frame, `yaw ${yaw} 편측 프레임`);
    // 로컬 +X가 전치. yaw 회전 후 월드 전치 방향.
    const incisor = new THREE.Vector3(Math.cos(yaw), Math.sin(yaw), 0);
    assert.ok(
      frame!.anterior.dot(incisor) > 0.55,
      `편측에서도 전치가 앞이다 yaw=${yaw} dot=${frame!.anterior.dot(incisor)} ant=${frame!.anterior.toArray().join(",")}`,
    );
  }
});

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
