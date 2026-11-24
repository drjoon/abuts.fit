// 악궁 프레임: 전치 쪽이 앞, 치아 쪽이 교합, 뒤집어도 같은 해부 방향을 가리킨다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  archFrameAxes,
  dentalFrameFromStored,
  dentalFrameFromOcclusalToothView,
  dentalFrameFromViewOrientation,
  estimateDentalFrame,
  isPartialArchScan,
  orientAnteriorFromAbutmentFdi,
  orientAnteriorFromMesialDistalClick,
  resolveArchMdBlOrientation,
  type DentalFrame,
  type FrameMesh,
} from "./dentalFrame";

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

test("말굽은 전악, 사분악은 편측으로 본다", () => {
  assert.equal(
    isPartialArchScan([
      cloud("upper", horseshoe(16, 24, 0)),
      cloud("lower", horseshoe(6, 0, 0)),
    ]),
    false,
  );
  assert.equal(
    isPartialArchScan([
      cloud("upper", unilateralRightQuadrant(16, 24, 0, false)),
      cloud("lower", unilateralRightQuadrant(6, 0, 0, false)),
    ]),
    true,
  );
});

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

/**
 * 편측 7칸. 앞(+X 근처)에 작은 전치 3개가 옆으로 퍼져 끝 폭은 대구치보다 넓다.
 * 빠진 칸·부정교합(옆 밀림)이 있어도 큰 치아 쪽이 구치다.
 */
function unilateralSizedQuadrant(
  zTooth: number,
  zGum: number,
  yaw: number,
  opts?: { keep?: readonly number[]; shift?: readonly number[]; palate?: boolean },
): number[] {
  const out: number[] = [];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const push = (x: number, y: number, z: number) => {
    out.push(c * x - s * y, s * x + c * y, z);
  };
  const teeth = [
    { x: -30, y: 0, md: 10.2, bl: 10.8, cusps: 4 },
    { x: -16.5, y: 1, md: 9.8, bl: 10.4, cusps: 4 },
    { x: -4, y: 1.4, md: 7, bl: 8.6, cusps: 2 },
    { x: 6.5, y: 0.6, md: 6.8, bl: 8.2, cusps: 2 },
    { x: 16, y: -7.5, md: 7, bl: 7, cusps: 1 },
    { x: 21, y: 0.5, md: 6.2, bl: 5.6, cusps: 1 },
    { x: 16.5, y: 9, md: 8, bl: 6.2, cusps: 1 },
  ];
  const keep = opts?.keep ?? [0, 1, 2, 3, 4, 5, 6];
  const shift = opts?.shift ?? [];
  for (const index of keep) {
    const tooth = teeth[index];
    if (!tooth) continue;
    const x = tooth.x;
    const y = tooth.y + (shift[index] ?? 0);
    const hx = tooth.md / 2;
    const hy = tooth.bl / 2;
    for (let ix = -1; ix <= 1.001; ix += 0.28) {
      for (let iy = -1; iy <= 1.001; iy += 0.28) {
        if (ix * ix + iy * iy > 1) continue;
        push(x + ix * hx, y + iy * hy, zTooth);
        push(x + ix * hx * 0.55, y + iy * hy * 0.55, zGum);
      }
    }
    const cuspZ = zTooth + Math.sign(zTooth - zGum) * 0.75;
    const cuspAt = (cx: number, cy: number) => push(x + cx, y + cy, cuspZ);
    if (tooth.cusps >= 4) {
      cuspAt(-0.32 * tooth.md, -0.28 * tooth.bl);
      cuspAt(-0.32 * tooth.md, 0.28 * tooth.bl);
      cuspAt(0.32 * tooth.md, -0.28 * tooth.bl);
      cuspAt(0.32 * tooth.md, 0.28 * tooth.bl);
    } else if (tooth.cusps === 2) {
      cuspAt(-0.36 * tooth.md, 0);
      cuspAt(0.36 * tooth.md, 0);
    } else {
      cuspAt(0, 0);
    }
  }
  if (opts?.palate) {
    for (let i = 0; i <= 16; i += 1) {
      for (let j = 0; j <= 14; j += 1) {
        push(8 + i, -16 - j * 0.9, zGum + 1);
      }
    }
  }
  return out;
}

test("편측은 전치가 넓게 퍼져도 작은 치아 쪽이 앞이다", () => {
  for (const yaw of [0, Math.PI * 0.4, Math.PI]) {
    const frame = estimateDentalFrame([
      cloud("upper", unilateralSizedQuadrant(16, 26, yaw, { palate: true })),
      cloud("lower", unilateralSizedQuadrant(6, 0, yaw)),
    ]);
    assert.ok(frame, `yaw ${yaw}`);
    const incisor = new THREE.Vector3(Math.cos(yaw), Math.sin(yaw), 0);
    assert.ok(
      frame!.anterior.dot(incisor) > 0.7,
      `작은 전치가 앞이다 yaw=${yaw} dot=${frame!.anterior.dot(incisor)} ant=${frame!.anterior.toArray().join(",")}`,
    );
  }
});

test("편측은 빠진 치아와 부정교합이 있어도 큰 쪽이 구치다", () => {
  const cases: Array<{ keep: number[]; shift: number[]; label: string }> = [
    { keep: [1, 3, 4, 5], shift: [0, 3.2, -2.4, 4.1, -3.5, 2.2, -1.8], label: "대구·소구·전치 일부" },
    { keep: [0, 1, 2], shift: [2.5, -3.4, 4.2, 0, 0, 0, 0], label: "구치만" },
    { keep: [2, 3, 5, 6], shift: [-1, 2, -3.6, 3.1, 0, -2.8, 4.4], label: "소구치와 전치" },
  ];
  for (const row of cases) {
    const frame = estimateDentalFrame([
      cloud("upper", unilateralSizedQuadrant(16, 26, 0.6, { keep: row.keep, shift: row.shift })),
      cloud("lower", unilateralSizedQuadrant(6, 0, 0.6, { keep: row.keep, shift: row.shift })),
    ]);
    assert.ok(frame, row.label);
    const incisor = new THREE.Vector3(Math.cos(0.6), Math.sin(0.6), 0);
    assert.ok(
      frame!.anterior.dot(incisor) > 0.65,
      `${row.label} dot=${frame!.anterior.dot(incisor)} ant=${frame!.anterior.toArray().join(",")}`,
    );
  }
});

test("하악 편측만 있어도 작은 치아 쪽이 앞이다", () => {
  const frame = estimateDentalFrame([
    cloud("lower", unilateralSizedQuadrant(8, 0, Math.PI * 0.5, { keep: [0, 2, 4, 6], shift: [0, 0, 3.5, 0, -4, 0, 2.5] })),
  ]);
  assert.ok(frame);
  const incisor = new THREE.Vector3(Math.cos(Math.PI * 0.5), Math.sin(Math.PI * 0.5), 0);
  assert.ok(
    frame!.anterior.dot(incisor) > 0.65,
    `하악 편측 dot=${frame!.anterior.dot(incisor)} ant=${frame!.anterior.toArray().join(",")}`,
  );
  assert.ok(frame!.up.z > 0.7, "하악 위쪽은 치아 쪽이다");
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

function lineArch(from: number, to: number, n = 40): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    out.push([from + (to - from) * t, 0, 0]);
  }
  return out;
}

function axisFrame(anteriorX: number): DentalFrame {
  return {
    up: new THREE.Vector3(0, 0, 1),
    anterior: new THREE.Vector3(anteriorX, 0, 0),
    right: new THREE.Vector3(0, anteriorX, 0),
  };
}

test("인접치 없이 FDI만 있으면 FDI로 앞을 잡는다", () => {
  const cloud = lineArch(-24, 24);
  const marks = [
    { toothNumber: "14", point: [10, 0, 0] as const },
    { toothNumber: "16", point: [-12, 0, 0] as const },
  ];
  const resolved = resolveArchMdBlOrientation(axisFrame(1), marks, cloud);
  assert.equal(resolved.confirmed, true);
  assert.ok(resolved.frame.anterior.x > 0.9, "작은 번호(#14,+X)가 전치");

  const single = resolveArchMdBlOrientation(
    axisFrame(-1),
    [{ toothNumber: "16", point: [-14, 0, 0] as const }],
    cloud,
  );
  assert.equal(single.confirmed, false);
  assert.ok(single.frame.anterior.x < -0.9, "신호 없으면 시드(−X)를 유지한다");
});

test("근심·원심 클릭으로 앞 축을 맞춘다", () => {
  const seed = axisFrame(-1);
  const fromMesial = orientAnteriorFromMesialDistalClick(
    seed,
    [0, 0, 0],
    [10, 0, 0],
    "mesial",
  );
  assert.ok(fromMesial.anterior.x > 0.9, "근심 클릭이 앞(+X)");
  const fromDistal = orientAnteriorFromMesialDistalClick(
    seed,
    [0, 0, 0],
    [-10, 0, 0],
    "distal",
  );
  assert.ok(fromDistal.anterior.x > 0.9, "원심 클릭은 반대가 앞");
});

test("인접치 신호가 약하고 FDI만 있으면 FDI로 확정한다", () => {
  // 픽스처 바로 위에 치아 블롭이 있어 옆 비교(A)가 안 되고, FDI(#14·#16)만 남는다.
  const pts: Array<[number, number, number]> = [];
  const addBlob = (cx: number, cy: number, rx: number, ry: number, step: number) => {
    for (let x = -rx; x <= rx; x += step) {
      for (let y = -ry; y <= ry; y += step) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        pts.push([cx + x, cy + y, 16]);
      }
    }
  };
  addBlob(-8, 0, 4.5, 3.8, 0.55);
  addBlob(8, 0, 2.0, 1.8, 0.55);
  for (let x = -14; x <= 14; x += 0.7) pts.push([x, 0.05, 15.5]);
  const marks = [
    { toothNumber: "14", point: [-8, 0, 16] as const },
    { toothNumber: "16", point: [8, 0, 16] as const },
  ];
  const resolved = resolveArchMdBlOrientation(axisFrame(1), marks, pts);
  assert.equal(resolved.confirmed, true);
  // #16(+X)이 더 구치 → 전치는 −X.
  assert.ok(resolved.frame.anterior.x < -0.55, "FDI로 전치(−X)를 잡는다");
});

test("인접치와 FDI가 충돌하면 인접치(A)를 따른다", () => {
  // 스캔바디(#15) 왼쪽 큰 대구치·오른쪽 작은 전치(A=+X 전치).
  // FDI는 반대로 #14를 +X·#16을 −X에 두어 B와 충돌시킨다.
  const pts: Array<[number, number, number]> = [];
  const addBlob = (cx: number, cy: number, rx: number, ry: number, step: number) => {
    for (let x = -rx; x <= rx; x += step) {
      for (let y = -ry; y <= ry; y += step) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        pts.push([cx + x, cy + y, 16]);
      }
    }
  };
  addBlob(-4, 0, 4.2, 3.6, 0.55);
  addBlob(10, 0.3, 2.2, 2.0, 0.55);
  addBlob(14, 0.2, 2.0, 1.8, 0.55);
  for (let x = -8; x <= 18; x += 0.8) pts.push([x, 0.05, 15.5]);
  const marks = [
    { toothNumber: "15", point: [6.5, 0.2, 16] as const },
    { toothNumber: "14", point: [12, 0.2, 16] as const },
    { toothNumber: "16", point: [-4, 0.2, 16] as const },
  ];
  const resolved = resolveArchMdBlOrientation(axisFrame(1), marks, pts);
  assert.equal(resolved.confirmed, true);
  assert.ok(
    resolved.frame.anterior.x > 0.55,
    `A(+X 전치)가 B와 충돌해도 A (got ${resolved.frame.anterior.toArray().join(",")})`,
  );
});

test("순측 뷰에서 카메라 쪽이 전방·화면 위가 두개다", () => {
  // 기본 카메라: −Z를 보고 +Y가 화면 위. 순측에서 보면 앞=+Z, 위=+Y.
  const q = new THREE.Quaternion();
  const frame = dentalFrameFromViewOrientation(q, new THREE.Vector3(0, 1, 0));
  assert.ok(frame.anterior.z > 0.9, "카메라 쪽(+Z)이 전방");
  assert.ok(frame.up.y > 0.9, "화면 위(+Y)가 두개");
});

test("교합면 뷰(#16)에서 협측·근원심으로 악궁 축을 되돌린다", () => {
  const up = new THREE.Vector3(0, 0, 1);
  const anterior = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  const side = 1;
  const phi = (6 / 8) * 1.45;
  const buccal = right
    .clone()
    .multiplyScalar(side * Math.sin(phi))
    .addScaledVector(anterior, Math.cos(phi))
    .normalize();
  const mesial = anterior
    .clone()
    .multiplyScalar(Math.sin(phi))
    .addScaledVector(right, -side * Math.cos(phi))
    .normalize();
  // 상악 교합: look=+두개, 화면 위=협측, 오른쪽=근심(10번대).
  const m = new THREE.Matrix4().makeBasis(mesial, buccal, up.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const frame = dentalFrameFromOcclusalToothView(q, "16", up);
  assert.ok(frame.up.z > 0.9, "두개(+Z)");
  assert.ok(frame.anterior.y > 0.85, `전치(+Y) got ${frame.anterior.toArray().join(",")}`);
  assert.ok(frame.right.x > 0.85, `환자 우측(+X) got ${frame.right.toArray().join(",")}`);
});

test("교합면 뷰(#26)는 화면 오른쪽이 원심이어도 같은 악궁 축이다", () => {
  const up = new THREE.Vector3(0, 0, 1);
  const anterior = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  const side = -1;
  const phi = (6 / 8) * 1.45;
  const buccal = right
    .clone()
    .multiplyScalar(side * Math.sin(phi))
    .addScaledVector(anterior, Math.cos(phi))
    .normalize();
  const mesial = anterior
    .clone()
    .multiplyScalar(Math.sin(phi))
    .addScaledVector(right, -side * Math.cos(phi))
    .normalize();
  // 20번대: 화면 오른쪽=원심=−근심.
  const m = new THREE.Matrix4().makeBasis(mesial.clone().negate(), buccal, up.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const frame = dentalFrameFromOcclusalToothView(q, "26", up);
  assert.ok(frame.up.z > 0.9, "두개(+Z)");
  assert.ok(frame.anterior.y > 0.85, `전치(+Y) got ${frame.anterior.toArray().join(",")}`);
  assert.ok(frame.right.x > 0.85, `환자 우측(+X) got ${frame.right.toArray().join(",")}`);
});

test("원심 대구치가 없고 구개가 넓어도 치아 줄이 근원심이다", () => {
  // #15 자리(index 3). 대구치(0·1)는 없고, 앞니는 +X. 구개 플랩이 협설로 넓다.
  const coords = unilateralSizedQuadrant(16, 24, 0, {
    keep: [2, 3, 4, 5, 6],
    palate: true,
  });
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < coords.length; i += 3) {
    pts.push([coords[i]!, coords[i + 1]!, coords[i + 2]!]);
  }
  const mark = [{ toothNumber: "15", point: [6.5, 0.6, 16] as const }];
  const seededBl = {
    up: new THREE.Vector3(0, 0, 1),
    anterior: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(-1, 0, 0),
  };
  const resolved = resolveArchMdBlOrientation(seededBl, mark, pts);
  assert.equal(resolved.confirmed, true);
  assert.ok(
    resolved.frame.anterior.x > 0.55,
    `전치(+X)가 근심 (got ${resolved.frame.anterior.toArray().join(",")})`,
  );
  assert.ok(Math.abs(resolved.frame.anterior.y) < 0.55, "앞이 구개(협설)로 서지 않는다");
});

test("스캔바디 옆에서 큰 치아 쪽을 원심으로 잡는다", () => {
  // #15 소구치 자리. −X 대구치, +X 전치.
  const coords = unilateralSizedQuadrant(16, 24, 0);
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < coords.length; i += 3) {
    pts.push([coords[i]!, coords[i + 1]!, coords[i + 2]!]);
  }
  const mark = [{ toothNumber: "15", point: [6.5, 0.6, 16] as const }];
  const resolved = resolveArchMdBlOrientation(axisFrame(1), mark, pts);
  assert.equal(resolved.confirmed, true, "인접치+FDI가 맞으면 확정");
  assert.ok(resolved.frame.anterior.x > 0.7, "큰 치아가 −X면 +X가 전치다");
  const flipped = orientAnteriorFromAbutmentFdi(axisFrame(-1), mark, pts);
  assert.ok(flipped.anterior.x > 0.7, "앞이 대구치 쪽이면 뒤집는다");
});

test("협설이 더 넓어도 근원심을 앞뒤로 잡는다", () => {
  // 편측 치열(+X 전치)에 협설(−Y) 플랩을 붙여 PCA가 협설을 장축으로 유인한다.
  // 플랩은 치열 줄에서 충분히 떨어뜨려 크기 투표에 섞이지 않게 한다.
  const coords = unilateralSizedQuadrant(16, 24, 0);
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < coords.length; i += 3) {
    pts.push([coords[i]!, coords[i + 1]!, coords[i + 2]!]);
  }
  for (let i = 0; i <= 30; i += 1) {
    for (let j = 0; j <= 24; j += 1) {
      pts.push([-8 + i * 0.7, -12 - j * 1.1, 22]);
    }
  }
  const mark = [{ toothNumber: "15", point: [6.5, 0.6, 16] as const }];
  const seededBl = {
    up: new THREE.Vector3(0, 0, 1),
    anterior: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(-1, 0, 0),
  };
  const resolved = resolveArchMdBlOrientation(seededBl, mark, pts);
  assert.equal(resolved.confirmed, true);
  assert.ok(
    resolved.frame.anterior.x > 0.55,
    `협설 시드여도 전치는 +X (got ${resolved.frame.anterior.toArray().join(",")})`,
  );
  assert.ok(Math.abs(resolved.frame.anterior.y) < 0.55, "앞이 협설로 서지 않는다");
});

test("근심에 치아가 많아도 옆 대구치 쪽을 원심으로 잡는다", () => {
  // 스캔바디(+6.5) 왼쪽(−X)에 큰 대구치 하나, 오른쪽(+X)에 작은 치아를 여러 개.
  // 예전 합산 평균은 전치 줄이 이겨 180° 뒤집혔다.
  const pts: Array<[number, number, number]> = [];
  const addBlob = (cx: number, cy: number, rx: number, ry: number, step: number) => {
    for (let x = -rx; x <= rx; x += step) {
      for (let y = -ry; y <= ry; y += step) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        pts.push([cx + x, cy + y, 16]);
      }
    }
  };
  addBlob(-4, 0, 4.2, 3.6, 0.55); // #16 대구치
  addBlob(10, 0.3, 2.2, 2.0, 0.55); // #14
  addBlob(14, 0.2, 2.0, 1.8, 0.55); // #13
  addBlob(18, 0.1, 1.8, 1.6, 0.55); // #12
  addBlob(22, 0, 1.7, 1.5, 0.55); // #11
  // 장축 PCA용 얇은 줄
  for (let x = -8; x <= 26; x += 0.8) pts.push([x, 0.05, 15.5]);
  const mark = [{ toothNumber: "15", point: [6.5, 0.2, 16] as const }];
  const resolved = resolveArchMdBlOrientation(axisFrame(1), mark, pts);
  assert.equal(resolved.confirmed, true);
  assert.ok(resolved.frame.anterior.x > 0.55, `옆 대구치가 원심 (got ${resolved.frame.anterior.toArray().join(",")})`);
  const flipped = orientAnteriorFromAbutmentFdi(axisFrame(-1), mark, pts);
  assert.ok(flipped.anterior.x > 0.55, "뒤집힌 시드도 전치(+X)로 되돌린다");
});
