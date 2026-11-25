import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

import {
  splitScanByScanbodies,
  type MatchedScanbodyFixture,
} from "./customAbutmentScanbodyMatch";

function makeFixture(
  toothNumber: string,
  origin: [number, number, number],
  radiusMm = 2.25,
  heightMm = 7,
  gingivaFloorMm = 3.2,
): MatchedScanbodyFixture {
  return {
    toothNumber,
    jaw: "lower",
    fixturePose: {
      origin,
      axis: [0, 0, 1],
      hexX: [1, 0, 0],
      hexY: [0, 1, 0],
    },
    scanbodyTop: [origin[0], origin[1], origin[2] + heightMm],
    scanbodyRadiusMm: radiusMm,
    scanbodyHeightMm: heightMm,
    gingivaFloorMm,
    rmsMm: 0.08,
    topCoverage: 1,
    matchedLibraryLabel: "지오메디 Ø4.5×7mm",
    connectionSpec: {
      manufacturer: "NEOBIOTECH",
      brand: "IS2",
      family: "Regular",
      type: "Hex",
      originDiameterMm: 3.35,
      hexSizeMm: 2.5,
      l2Mm: 2.75,
      prcConeTopMm: 0.3,
      screwLowerDiameterMm: 2.1,
      screwUpperDiameterMm: 2.45,
      screwTopMouthDiameterMm: 2.5,
      screwSeatBottomZMm: 0.7,
      screwSeatTopZMm: 0.87,
    },
    archOcclusalDir: [0, 0, 1],
    labialDir: [0, -1, 0],
    mesialDir: [1, 0, 0],
  };
}

interface TriLabeled {
  tag: string;
  verts: [[number, number, number], [number, number, number], [number, number, number]];
  rgb: [number, number, number];
}

function buildTaggedMesh(tris: readonly TriLabeled[]): THREE.BufferGeometry {
  const positions = new Float32Array(tris.length * 9);
  const colors = new Float32Array(tris.length * 9);
  for (let i = 0; i < tris.length; i += 1) {
    const t = tris[i]!;
    for (let c = 0; c < 3; c += 1) {
      const off = (i * 3 + c) * 3;
      positions[off] = t.verts[c]![0];
      positions[off + 1] = t.verts[c]![1];
      positions[off + 2] = t.verts[c]![2];
      colors[off] = t.rgb[0];
      colors[off + 1] = t.rgb[1];
      colors[off + 2] = t.rgb[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function addQuad(
  out: TriLabeled[],
  tag: string,
  p00: [number, number, number],
  p10: [number, number, number],
  p11: [number, number, number],
  p01: [number, number, number],
  rgb: [number, number, number],
) {
  out.push({ tag, verts: [p00, p10, p11], rgb });
  out.push({ tag, verts: [p00, p11, p01], rgb });
}

describe("splitScanByScanbodies", () => {
  it("스캔바디 전체 기둥·내면은 남김없이 제거하고, 어두운 그림자가 진 인접 자연치 인접면과 치은 열구 바닥은 보존한다", () => {
    const sbRgb: [number, number, number] = [0.22, 0.14, 0.13];
    const sbBrightRgb: [number, number, number] = [0.4, 0.28, 0.25];
    const gingRgb: [number, number, number] = [0.62, 0.34, 0.38];
    const shadedToothRgb: [number, number, number] = [0.21, 0.15, 0.14]; // 스캔바디 색과 유사한 치간 그림자

    const N_THETA = 36;
    const R = 2.25;
    const BORE_R = 1.05;
    const SULCUS_Z = 3.2;
    const TOP_Z = 7.0;
    const tris: TriLabeled[] = [];

    for (let i = 0; i < N_THETA; i += 1) {
      const a0 = (i / N_THETA) * Math.PI * 2;
      const a1 = ((i + 1) / N_THETA) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);

      // 1) 상부 캡 고리 (BORE_R -> R at TOP_Z, 법선 +Z)
      addQuad(
        tris,
        "sb-cap",
        [BORE_R * c0, BORE_R * s0, TOP_Z],
        [R * c0, R * s0, TOP_Z],
        [R * c1, R * s1, TOP_Z],
        [BORE_R * c1, BORE_R * s1, TOP_Z],
        sbRgb,
      );

      // 2) 내면 스크류홀 벽 (z = 2.0 .. TOP_Z)
      addQuad(
        tris,
        "sb-bore",
        [BORE_R * c0, BORE_R * s0, 2.0],
        [BORE_R * c0, BORE_R * s0, TOP_Z],
        [BORE_R * c1, BORE_R * s1, TOP_Z],
        [BORE_R * c1, BORE_R * s1, 2.0],
        sbRgb,
      );

      // 3) 스캔바디 외벽 (SULCUS_Z .. TOP_Z, 중간 대역은 반사로 밝아진 색 포함, 법선 +e_r)
      const zSteps = [SULCUS_Z, 4.4, 5.7, TOP_Z];
      for (let zi = 0; zi < zSteps.length - 1; zi += 1) {
        const z0 = zSteps[zi]!;
        const z1 = zSteps[zi + 1]!;
        const wallColor = zi === 1 ? sbBrightRgb : sbRgb;
        addQuad(
          tris,
          "sb-wall",
          [R * c0, R * s0, z0],
          [R * c1, R * s1, z0],
          [R * c1, R * s1, z1],
          [R * c0, R * s0, z1],
          wallColor,
        );
      }

      // 4) 치은 열구 바닥 (R -> 4.2 at SULCUS_Z, 법선 +Z)
      const rSteps = [R, 2.65, 3.2, 4.2];
      for (let ri = 0; ri < rSteps.length - 1; ri += 1) {
        const r0 = rSteps[ri]!;
        const r1 = rSteps[ri + 1]!;
        addQuad(
          tris,
          ri === 0 ? "sulcus-inner" : "gingiva-floor",
          [r0 * c0, r0 * s0, SULCUS_Z],
          [r1 * c0, r1 * s0, SULCUS_Z],
          [r1 * c1, r1 * s1, SULCUS_Z],
          [r0 * c1, r0 * s1, SULCUS_Z],
          gingRgb,
        );
      }
    }

    // 5) 근심(+X) 쪽 r = 2.65mm 위치에서 솟아오르는 인접 자연치 인접면 (스캔바디 축 안쪽 -X 법선, 치간 그림자 색)
    for (let i = -4; i < 4; i += 1) {
      const y0 = i * 0.45;
      const y1 = (i + 1) * 0.45;
      for (let zi = 0; zi < 4; zi += 1) {
        const z0 = SULCUS_Z + zi * 0.95;
        const z1 = SULCUS_Z + (zi + 1) * 0.95;
        // x = 2.68mm 에서 스캔바디 쪽(-X)을 바라보는 인접치 인접면
        addQuad(
          tris,
          "adj-tooth-proximal",
          [2.68, y0, z0],
          [2.68, y0, z1],
          [2.68, y1, z1],
          [2.68, y1, z0],
          shadedToothRgb,
        );
      }
    }

    const geo = buildTaggedMesh(tris);
    const fx = makeFixture("34", [0, 0, 0], R, TOP_Z, SULCUS_Z);
    const split = splitScanByScanbodies(geo, [fx]);

    const restIdx = split.rest.getIndex()!;
    const keptTriSet = new Set<number>();
    for (let k = 0; k < restIdx.count; k += 3) {
      keptTriSet.add(Math.floor(restIdx.getX(k) / 3));
    }

    let sbLeft = 0;
    let adjDeleted = 0;
    let outerGingDeleted = 0;
    for (let t = 0; t < tris.length; t += 1) {
      const tag = tris[t]!.tag;
      const kept = keptTriSet.has(t);
      if ((tag === "sb-cap" || tag === "sb-bore" || tag === "sb-wall") && kept) sbLeft += 1;
      if (tag === "adj-tooth-proximal" && !kept) adjDeleted += 1;
      if (tag === "gingiva-floor" && !kept) outerGingDeleted += 1;
    }

    assert.equal(sbLeft, 0);
    assert.equal(adjDeleted, 0);
    assert.equal(outerGingDeleted, 0);
  });

  it("평면 베벨 면(반경 < 공칭 반경) 바깥에 바로 이어지는 분홍 치은은 깎지 않는다", () => {
    const sbRgb: [number, number, number] = [0.2, 0.13, 0.12];
    const gingRgb: [number, number, number] = [0.6, 0.33, 0.37];
    const N_THETA = 36;
    const NOMINAL_R = 2.25;
    const SULCUS_Z = 4.5;
    const TOP_Z = 9.0;
    const tris: TriLabeled[] = [];

    // 설측(-Y) 부채꼴은 평면 베벨로 실제 외벽 반경이 1.92mm (공칭 2.25mm보다 작음)
    const wallRadiusAt = (theta: number) => (Math.sin(theta) < -0.5 ? 1.92 : NOMINAL_R);

    for (let i = 0; i < N_THETA; i += 1) {
      const a0 = (i / N_THETA) * Math.PI * 2;
      const a1 = ((i + 1) / N_THETA) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const r0 = wallRadiusAt(a0);
      const r1 = wallRadiusAt(a1);

      addQuad(
        tris,
        "sb-cap",
        [0.9 * c0, 0.9 * s0, TOP_Z],
        [r0 * c0, r0 * s0, TOP_Z],
        [r1 * c1, r1 * s1, TOP_Z],
        [0.9 * c1, 0.9 * s1, TOP_Z],
        sbRgb,
      );
      addQuad(
        tris,
        "sb-wall",
        [r0 * c0, r0 * s0, SULCUS_Z],
        [r1 * c1, r1 * s1, SULCUS_Z],
        [r1 * c1, r1 * s1, TOP_Z],
        [r0 * c0, r0 * s0, TOP_Z],
        sbRgb,
      );
      // 평면 베벨 바로 바깥 r = 1.92 -> 2.35 (공칭 반경 2.25 안쪽 포함!) 에 평평한 분홍 치은이 맞닿음
      addQuad(
        tris,
        "bevel-gingiva",
        [r0 * c0, r0 * s0, SULCUS_Z],
        [(r0 + 0.42) * c0, (r0 + 0.42) * s0, SULCUS_Z],
        [(r1 + 0.42) * c1, (r1 + 0.42) * s1, SULCUS_Z],
        [r1 * c1, r1 * s1, SULCUS_Z],
        gingRgb,
      );
    }

    const geo = buildTaggedMesh(tris);
    const fx = makeFixture("15", [0, 0, 0], NOMINAL_R, TOP_Z, SULCUS_Z);
    const split = splitScanByScanbodies(geo, [fx]);
    const restIdx = split.rest.getIndex()!;
    const keptTriSet = new Set<number>();
    for (let k = 0; k < restIdx.count; k += 3) {
      keptTriSet.add(Math.floor(restIdx.getX(k) / 3));
    }

    let sbLeft = 0;
    let bevelGingDeleted = 0;
    for (let t = 0; t < tris.length; t += 1) {
      const tag = tris[t]!.tag;
      const kept = keptTriSet.has(t);
      if ((tag === "sb-cap" || tag === "sb-wall") && kept) sbLeft += 1;
      if (tag === "bevel-gingiva" && !kept) bevelGingDeleted += 1;
    }

    assert.equal(sbLeft, 0);
    assert.equal(bevelGingDeleted, 0);
  });

  it("앞선 픽스처 축이 뒤집혀 있어도 옆 자연치는 스캔바디로 잘리지 않는다", () => {
    const sbRgb: [number, number, number] = [0.22, 0.14, 0.13];
    const sbBrightRgb: [number, number, number] = [0.4, 0.28, 0.25];
    const gingRgb: [number, number, number] = [0.62, 0.34, 0.38];
    const shadedToothRgb: [number, number, number] = [0.21, 0.15, 0.14];
    const N_THETA = 36;
    const R = 2.25;
    const BORE_R = 1.05;
    const SULCUS_Z = 3.2;
    const TOP_Z = 7.0;
    const tris: TriLabeled[] = [];

    for (let i = 0; i < N_THETA; i += 1) {
      const a0 = (i / N_THETA) * Math.PI * 2;
      const a1 = ((i + 1) / N_THETA) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      addQuad(
        tris,
        "sb-cap",
        [BORE_R * c0, BORE_R * s0, TOP_Z],
        [R * c0, R * s0, TOP_Z],
        [R * c1, R * s1, TOP_Z],
        [BORE_R * c1, BORE_R * s1, TOP_Z],
        sbRgb,
      );
      addQuad(
        tris,
        "sb-bore",
        [BORE_R * c0, BORE_R * s0, 2.0],
        [BORE_R * c0, BORE_R * s0, TOP_Z],
        [BORE_R * c1, BORE_R * s1, TOP_Z],
        [BORE_R * c1, BORE_R * s1, 2.0],
        sbRgb,
      );
      const zSteps = [SULCUS_Z, 4.4, 5.7, TOP_Z];
      for (let zi = 0; zi < zSteps.length - 1; zi += 1) {
        const z0 = zSteps[zi]!;
        const z1 = zSteps[zi + 1]!;
        addQuad(
          tris,
          "sb-wall",
          [R * c0, R * s0, z0],
          [R * c1, R * s1, z0],
          [R * c1, R * s1, z1],
          [R * c0, R * s0, z1],
          zi === 1 ? sbBrightRgb : sbRgb,
        );
      }
      const rSteps = [R, 2.65, 3.2, 4.2];
      for (let ri = 0; ri < rSteps.length - 1; ri += 1) {
        const r0 = rSteps[ri]!;
        const r1 = rSteps[ri + 1]!;
        addQuad(
          tris,
          ri === 0 ? "sulcus-inner" : "gingiva-floor",
          [r0 * c0, r0 * s0, SULCUS_Z],
          [r1 * c0, r1 * s0, SULCUS_Z],
          [r1 * c1, r1 * s1, SULCUS_Z],
          [r0 * c1, r0 * s1, SULCUS_Z],
          gingRgb,
        );
      }
    }
    for (let i = -4; i < 4; i += 1) {
      const y0 = i * 0.45;
      const y1 = (i + 1) * 0.45;
      for (let zi = 0; zi < 4; zi += 1) {
        const z0 = SULCUS_Z + zi * 0.95;
        const z1 = SULCUS_Z + (zi + 1) * 0.95;
        addQuad(
          tris,
          "adj-tooth-proximal",
          [2.68, y0, z0],
          [2.68, y0, z1],
          [2.68, y1, z1],
          [2.68, y1, z0],
          shadedToothRgb,
        );
      }
    }
    for (let i = 0; i < 14; i += 1) {
      for (let j = 0; j < 14; j += 1) {
        const x0 = 40 + (i - 7) * 0.24;
        const y0 = (j - 7) * 0.24;
        addQuad(
          tris,
          "other-cap",
          [x0, y0, 1],
          [x0 + 0.24, y0, 1],
          [x0 + 0.24, y0 + 0.24, 1],
          [x0, y0 + 0.24, 1],
          sbRgb,
        );
      }
    }

    const geo = buildTaggedMesh(tris);
    const good = makeFixture("32", [0, 0, 0], R, TOP_Z, SULCUS_Z);
    const bad = makeFixture("42", [40, 0, 8], R, TOP_Z, SULCUS_Z);
    bad.fixturePose = { ...bad.fixturePose, axis: [0, 0, -1], hexY: [0, -1, 0] };
    bad.scanbodyTop = [40, 0, 1];
    const split = splitScanByScanbodies(geo, [bad, good]);
    const restIdx = split.rest.getIndex()!;
    const keptTriSet = new Set<number>();
    for (let k = 0; k < restIdx.count; k += 3) {
      keptTriSet.add(Math.floor(restIdx.getX(k) / 3));
    }
    let sbLeft = 0;
    let adjDeleted = 0;
    for (let t = 0; t < tris.length; t += 1) {
      const tag = tris[t]!.tag;
      const kept = keptTriSet.has(t);
      if ((tag === "sb-cap" || tag === "sb-bore" || tag === "sb-wall") && kept) sbLeft += 1;
      if (tag === "adj-tooth-proximal" && !kept) adjDeleted += 1;
    }
    assert.equal(sbLeft, 0);
    assert.equal(adjDeleted, 0);
  });
});
