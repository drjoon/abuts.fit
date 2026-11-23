import assert from "node:assert/strict";
import test from "node:test";

import type { MatchedScanbodyFixture } from "./customAbutmentScanbodyMatch";
import {
  matchAlignedScans,
  rebaseCarriedFixtures,
  rigidFitCorresponding,
} from "./customAbutmentOcclusionRestore";

test("작업 스캔은 이름이 달라도 같은 정점 수면 정렬을 붙인다", () => {
  const loaded = [
    { fileName: "work-upper.dcm", role: "upper", vertexCount: 63354 },
    { fileName: "work-lower.dcm", role: "lower", vertexCount: 58548 },
    { fileName: "work-bite.dcm", role: "bite", vertexCount: 42446 },
  ];
  const matched = matchAlignedScans(
    [
      { fileName: "조세원 UpperJawScan.dcm", role: "upper", vertexCount: 63354 },
      { fileName: "조세원 LowerJawScan.dcm", role: "lower", vertexCount: 58548 },
    ],
    loaded,
  );
  assert.deepEqual(
    matched?.map((row) => row.fileName),
    ["work-upper.dcm", "work-lower.dcm"],
  );
});

test("같은 역할에 정점 수가 같은 스캔이 둘이면 이름을 맞추지 않는다", () => {
  const matched = matchAlignedScans(
    [{ fileName: "a.dcm", role: "upper", vertexCount: 10 }],
    [
      { fileName: "b.dcm", role: "upper", vertexCount: 10 },
      { fileName: "c.dcm", role: "upper", vertexCount: 10 },
    ],
  );
  assert.equal(matched, null);
});

test("파일 이름이 같으면 그 스캔을 쓴다", () => {
  const matched = matchAlignedScans(
    [{ fileName: "upper.dcm", role: "upper", vertexCount: 4 }],
    [
      { fileName: "other.dcm", role: "upper", vertexCount: 4 },
      { fileName: "upper.dcm", role: "upper", vertexCount: 4 },
    ],
  );
  assert.equal(matched?.[0]?.fileName, "upper.dcm");
});

function cloud(points: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    out[index * 3] = point[0];
    out[index * 3 + 1] = point[1];
    out[index * 3 + 2] = point[2];
  });
  return out;
}

test("같은 정점의 이동은 강체로 맞춘다", () => {
  const src = cloud([
    [0, 0, 0],
    [10, 0, 0],
    [0, 8, 0],
    [3, 4, 2],
  ]);
  const dst = cloud([
    [1, -2, 5],
    [11, -2, 5],
    [1, 6, 5],
    [4, 2, 7],
  ]);
  const fit = rigidFitCorresponding(src, dst);
  assert.ok(fit);
  assert.ok(fit.rms < 0.05);
  assert.ok(Math.abs(fit.elements[12] - 1) < 1e-6);
  assert.ok(Math.abs(fit.elements[13] + 2) < 1e-6);
  assert.ok(Math.abs(fit.elements[14] - 5) < 1e-6);
});

test("순서가 다른 정점은 스캔바디를 옮기지 않는다", () => {
  const src = cloud([
    [0, 0, 0],
    [10, 0, 0],
    [0, 8, 0],
    [3, 4, 2],
  ]);
  const dst = cloud([
    [40, -20, 8],
    [-3, 90, 1],
    [12, 4, -30],
    [0, 0, 70],
  ]);
  assert.equal(rigidFitCorresponding(src, dst), null);
});

test("이미 고른 스캔바디는 교합을 다시 맞춘 악궁으로 따라간다", () => {
  const src = cloud([
    [0, 0, 0],
    [10, 0, 0],
    [0, 8, 0],
    [2, 3, 1],
  ]);
  const dst = cloud([
    [5, 0, 0],
    [5, 10, 0],
    [-3, 0, 0],
    [2, 2, 1],
  ]);
  const fixture = {
    toothNumber: "34",
    jaw: "lower",
    scanbodyTop: [2, 3, 4],
    fixturePose: {
      origin: [2, 3, 0],
      axis: [0, 0, 1],
      hexX: [1, 0, 0],
      hexY: [0, 1, 0],
    },
    archOcclusalDir: [0, 0, 1],
    labialDir: [0, 1, 0],
    mesialDir: [1, 0, 0],
  } as MatchedScanbodyFixture;
  const moved = rebaseCarriedFixtures(
    { fixtures: [fixture], jaws: [{ role: "lower", vertexCount: 4, positions: src }] },
    [{ role: "lower", vertexCount: 4, positions: dst }],
  );
  assert.equal(moved.length, 1);
  assert.ok(Math.abs(moved[0]!.scanbodyTop[0] - 2) < 1e-6);
  assert.ok(Math.abs(moved[0]!.scanbodyTop[1] - 2) < 1e-6);
  assert.ok(Math.abs(moved[0]!.scanbodyTop[2] - 4) < 1e-6);
});
