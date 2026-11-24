// 치아 기준 뷰큐브: 교합면에서 면이 화면과 나란하고, 위가 협측이다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  toothViewCube,
  viewCubeDirection,
  type ViewCubeFace,
} from "./PracticeCustomAbutmentViewCube";
import type { DentalFrame } from "../../practice/dentalFrame";

function frameOf(anterior: THREE.Vector3, up: THREE.Vector3): DentalFrame {
  const a = anterior.clone().normalize();
  const u = up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(a, u).normalize();
  return { anterior: a, up: u, right };
}

function faceOfLabel(labels: Record<ViewCubeFace, string>, label: string): ViewCubeFace {
  const hit = (Object.entries(labels) as [ViewCubeFace, string][]).find(([, v]) => v === label);
  assert.ok(hit, `${label} 라벨이 있다`);
  return hit![0];
}

/** archToothDirs와 같은 협측. 화면 위가 이 방향일 때 큐브 면이 나란해야 한다. */
function buccalOf(frame: DentalFrame, quadrant: number, position: number) {
  const side = quadrant === 1 || quadrant === 4 ? 1 : -1;
  const phi = (Math.min(position, 8) / 8) * 1.45;
  return frame.right
    .clone()
    .multiplyScalar(side * Math.sin(phi))
    .addScaledVector(frame.anterior, Math.cos(phi))
    .normalize();
}

test("#37 교합 뷰에서 큐브 윗면이 화면과 나란하고 위가 협측이다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("37", null, frame);
  assert.ok(view);
  const buccal = buccalOf(frame, 3, 7);
  const top = viewCubeDirection("top", view!.frame);
  assert.ok(top.viewDir.dot(frame.up) > 0.99, "교합면 법선이 화면을 본다");
  assert.ok(top.upDir.dot(buccal) > 0.99, "면의 위쪽이 협측이다");
  assert.equal(view!.labels.top, "교합");
  assert.equal(view!.labels.bottom, "치은");
  assert.equal(view!.labels.front, "협측");
  assert.equal(view!.labels.back, "설측");
  assert.equal(view!.labels.right, "근심");
  assert.equal(view!.labels.left, "원심");
});

test("#34 협측은 큐브 앞, 근심은 오른쪽이다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("34", null, frame)!;
  assert.equal(view.labels.top, "교합");
  assert.equal(view.labels.bottom, "치은");
  assert.equal(view.labels.front, "협측");
  assert.equal(view.labels.back, "설측");
  assert.equal(view.labels.right, "근심");
  assert.equal(view.labels.left, "원심");

  const buccal = buccalOf(frame, 3, 4);
  const bucDir = viewCubeDirection(faceOfLabel(view.labels, "협측"), view.frame).viewDir;
  assert.ok(bucDir.dot(buccal) > 0.99, "협측 면이 아치 바깥을 본다");
  const top = viewCubeDirection("top", view.frame);
  assert.ok(top.upDir.dot(buccal) > 0.99, "교합면 위가 협측이다");
});

test("#14 상악 구치는 교합면(아래)이 화면과 나란하고 협측이 위다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("14", null, frame)!;
  assert.equal(view.labels.top, "치은");
  assert.equal(view.labels.bottom, "교합");
  assert.equal(view.labels.front, "협측");
  assert.equal(view.labels.back, "구개측");
  assert.equal(view.labels.left, "근심");
  assert.equal(view.labels.right, "원심");

  const buccal = buccalOf(frame, 1, 4);
  const bottom = viewCubeDirection("bottom", view.frame);
  assert.ok(bottom.viewDir.dot(frame.up) < -0.99, "아래에서 교합면을 본다");
  assert.ok(bottom.upDir.dot(buccal) > 0.99, "교합면 위가 협측이다");
  const bucDir = viewCubeDirection(faceOfLabel(view.labels, "협측"), view.frame).viewDir;
  assert.ok(bucDir.dot(buccal) > 0.99);
});

test("교합 정렬로 악궁 프레임이 돌면 큐브 축도 같이 돈다", () => {
  const before = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const after = frameOf(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  const a = toothViewCube("34", null, before)!;
  const b = toothViewCube("34", null, after)!;
  assert.ok(a.frame.anterior.dot(b.frame.anterior) < -0.5, "악궁이 돌면 큐브 협측도 돈다");
  assert.ok(faceOfLabel(b.labels, "협측"), "정렬 후에도 협측 라벨이 있다");
});

test("예전 labialDir이 있어도 큐브는 악궁에서 잡은 협측을 따른다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const staleLingual: [number, number, number] = [0.66, -0.75, 0];
  const view = toothViewCube(
    "34",
    {
      labialDir: staleLingual,
      archOcclusalDir: [0, 0, 1],
      fixturePose: { origin: [-8, 4, 0] },
    },
    frame,
  )!;
  const buccal = buccalOf(frame, 3, 4);
  assert.ok(view.frame.anterior.dot(buccal) > 0.99, "저장된 순측이 아니라 악궁 협측");
  assert.equal(view.labels.front, "협측");
  assert.equal(view.labels.right, "근심");
});
