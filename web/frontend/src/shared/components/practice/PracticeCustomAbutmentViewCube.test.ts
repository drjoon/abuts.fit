// 치아 기준 뷰큐브: 교합 정렬 후 악궁 프레임을 따르고, 예전 픽스처 labialDir에 묶이지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { toothViewCube } from "./PracticeCustomAbutmentViewCube";
import type { DentalFrame } from "../../practice/dentalFrame";

function frameOf(anterior: THREE.Vector3, up: THREE.Vector3): DentalFrame {
  const a = anterior.clone().normalize();
  const u = up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(a, u).normalize();
  return { anterior: a, up: u, right };
}

test("#34 큐브 정면은 현재 악궁 프레임의 협측이고, 예전 labialDir이 설측을 가리켜도 뒤집지 않는다", () => {
  // 환자 기준: +Z 위, +Y 전방, +X 우측
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  // 정렬 전 월드에 남은 설측 방향(협측의 반대)
  const staleLingual: [number, number, number] = [0.66, -0.75, 0];
  const view = toothViewCube(
    "34",
    {
      labialDir: staleLingual,
      archOcclusalDir: [0, 0, 1],
      mesialDir: [1, 0, 0],
      fixturePose: { origin: [-8, 4, 0] },
    },
    frame,
  );
  assert.ok(view, "큐브 프레임이 만들어진다");
  assert.equal(view!.labels.front, "협측");
  assert.equal(view!.labels.back, "설측");
  // #34(하악 좌) 협측은 환자 왼쪽(-X)과 전방(+Y) 사이
  assert.ok(view!.frame.anterior.x < -0.3, `협측 x=${view!.frame.anterior.x}`);
  assert.ok(view!.frame.anterior.y > 0.3, `협측 y=${view!.frame.anterior.y}`);
  // 설측으로 남은 labialDir과 반대여야 한다(정렬 전 방향을 따르지 않음)
  const stale = new THREE.Vector3(...staleLingual).normalize();
  assert.ok(
    view!.frame.anterior.dot(stale) < 0,
    "큐브 협측이 정렬 전 설측 labialDir과 반대다",
  );
});

test("교합 정렬로 악궁 프레임이 돌면 큐브 협측도 같이 돈다", () => {
  const before = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  // 수평 180°: 전방이 -Y
  const after = frameOf(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  const fixture = {
    labialDir: [1, 0, 0] as [number, number, number],
    archOcclusalDir: [0, 0, 1] as [number, number, number],
    fixturePose: { origin: [-8, 4, 0] as [number, number, number] },
  };
  const a = toothViewCube("34", fixture, before)!;
  const b = toothViewCube("34", fixture, after)!;
  assert.ok(a.frame.anterior.dot(b.frame.anterior) < -0.5, "프레임이 바뀌면 큐브 협측도 뒤집힌다");
  assert.equal(b.labels.front, "협측");
});

test("픽스처 없이도 #34는 협·설·교합·치은·근·원심 라벨을 쓴다", () => {
  const frame = frameOf(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const view = toothViewCube("34", null, frame);
  assert.ok(view);
  assert.deepEqual(view!.labels, {
    front: "협측",
    back: "설측",
    top: "교합",
    bottom: "치은",
    left: view!.labels.left,
    right: view!.labels.right,
  });
  assert.ok(
    (view!.labels.left === "근심" && view!.labels.right === "원심") ||
      (view!.labels.left === "원심" && view!.labels.right === "근심"),
    "좌우는 근심·원심이다",
  );
  // 근심은 미드라인(+Y) 쪽, 원심은 그 반대
  const mesialDir = view!.labels.right === "근심" ? view!.frame.right : view!.frame.right.clone().negate();
  assert.ok(mesialDir.dot(new THREE.Vector3(0, 1, 0)) > 0, "근심이 전방(미드라인) 쪽이다");
});
