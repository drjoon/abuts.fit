// 치아 기준 뷰큐브: 회전은 악궁 프레임, 라벨만 협·설·근·원심.
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

test("#34 큐브 회전은 악궁 프레임을 유지한다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("34", null, frame);
  assert.ok(view);
  assert.ok(view!.frame.anterior.dot(frame.anterior) > 0.99, "전방축이 악궁과 같다");
  assert.ok(view!.frame.right.dot(frame.right) > 0.99, "우측축이 악궁과 같다");
  assert.ok(view!.frame.up.dot(frame.up) > 0.99, "위축이 악궁과 같다");
});

test("#34 협측 라벨은 아치 바깥쪽 면에 붙고, 근심은 미드라인 쪽이다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("34", null, frame)!;
  assert.equal(view.labels.top, "교합");
  assert.equal(view.labels.bottom, "치은");

  // #34 구치: 환자 오른쪽 면=협측(볼), 후방 면=근심(미드라인 쪽 큐브 매핑)
  assert.equal(view.labels.right, "협측");
  assert.equal(view.labels.left, "설측");
  assert.equal(view.labels.back, "근심");
  assert.equal(view.labels.front, "원심");

  const bucDir = viewCubeDirection(faceOfLabel(view.labels, "협측"), view.frame).viewDir;
  assert.ok(bucDir.x > 0.9, "협측은 큐브 우면(+right)");
  const mesDir = viewCubeDirection(faceOfLabel(view.labels, "근심"), view.frame).viewDir;
  assert.ok(mesDir.y < -0.9, "근심은 큐브 후면(-anterior)");
});

test("교합 정렬로 악궁 프레임이 돌면 큐브 축도 같이 돈다", () => {
  const before = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const after = frameOf(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  const a = toothViewCube("34", null, before)!;
  const b = toothViewCube("34", null, after)!;
  assert.ok(a.frame.anterior.dot(b.frame.anterior) < -0.5, "악궁이 돌면 큐브 전방도 돈다");
  assert.ok(faceOfLabel(b.labels, "협측"), "정렬 후에도 협측 라벨이 있다");
});

test("예전 labialDir이 있어도 축·라벨은 악궁 큐브 매핑을 따른다", () => {
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
  assert.ok(view.frame.anterior.dot(frame.anterior) > 0.99);
  assert.equal(view.labels.right, "협측");
  assert.equal(view.labels.back, "근심");
});
