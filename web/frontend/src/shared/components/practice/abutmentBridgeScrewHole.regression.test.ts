/**
 * 회귀: #27 편집(브리지 형제 silent+receivedBridgeSync bake) 후에도 #26 스크류 홀이 유지된다.
 */
import assert from "node:assert/strict";

import * as THREE from "three";

import { resolveCustomAbutmentConnectionSpec } from "../../practice/customAbutmentScanbodyMatch";
import { designCustomAbutmentStl } from "../../practice/customAbutmentStlDesign";
import {
  AbutmentDirectEditSession,
  identityAbutmentEdit,
  type AbutmentEdit,
} from "./abutmentDirectEdit";

function edit(patch: Partial<AbutmentEdit> = {}): AbutmentEdit {
  return {
    ...identityAbutmentEdit(),
    ...patch,
    scale: patch.scale ?? [1, 1, 1],
    partial: patch.partial ?? [],
  };
}

const makeFlatGrid = (zVal: number) => {
  const tris: number[] = [];
  const steps = 32;
  for (let ix = 0; ix < steps; ix += 1) {
    for (let iy = 0; iy < steps; iy += 1) {
      const x0 = -12 + (24 * ix) / steps;
      const x1 = -12 + (24 * (ix + 1)) / steps;
      const y0 = -18 + (36 * iy) / steps;
      const y1 = -18 + (36 * (iy + 1)) / steps;
      tris.push(x0, y0, zVal, x1, y0, zVal, x1, y1, zVal);
      tris.push(x0, y0, zVal, x1, y1, zVal, x0, y1, zVal);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  g.computeVertexNormals();
  return g;
};

const bridgeJaw = makeFlatGrid(2.6);
const bridgeOpp = makeFlatGrid(9.2);
const connSpec = resolveCustomAbutmentConnectionSpec({
  manufacturer: "NEOBIOTECH",
  system: "IS2",
  connectionType: "Hex",
  scanbodySpec: "Ø4.5x9",
});
const fx26 = {
  toothNumber: "26",
  jaw: "upper" as const,
  fixturePose: {
    origin: [0, -4.5, 0] as [number, number, number],
    axis: [0, 0, 1] as [number, number, number],
    hexX: [1, 0, 0] as [number, number, number],
    hexY: [0, 1, 0] as [number, number, number],
  },
  labialDir: [1, 0, 0] as [number, number, number],
  mesialDir: [0, 1, 0] as [number, number, number],
  archOcclusalDir: [0, 0, 1] as [number, number, number],
  scanbodyTop: [0, -4.5, 9] as [number, number, number],
  scanbodyRadiusMm: 2.25,
  scanbodyHeightMm: 9,
  gingivaFloorMm: 2.6,
  rmsMm: 0.02,
  libraryKey: "neo_is2_hex_45_9",
  connectionSpec: connSpec,
};
const fx27 = {
  ...fx26,
  toothNumber: "27",
  fixturePose: {
    origin: [0, 4.5, 0] as [number, number, number],
    axis: [0, Math.sin((5 * Math.PI) / 180), Math.cos((5 * Math.PI) / 180)] as [
      number,
      number,
      number,
    ],
    hexX: [1, 0, 0] as [number, number, number],
    hexY: [0, Math.cos((5 * Math.PI) / 180), -Math.sin((5 * Math.PI) / 180)] as [
      number,
      number,
      number,
    ],
  },
  scanbodyTop: [0, 4.5, 9] as [number, number, number],
};
const bridgeWorks = [
  { toothNumber: "26", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["27"] },
  { toothNumber: "27", prosthesisType: "브리지", customAbutment: true, bridgeLinkedTeeth: ["26"] },
];

const d26 = await designCustomAbutmentStl({
  fixture: fx26,
  jawGeometry: bridgeJaw,
  opposingGeometry: bridgeOpp,
  neighbors: [fx27],
  toothWorks: bridgeWorks,
});
const d27 = await designCustomAbutmentStl({
  fixture: fx27,
  jawGeometry: bridgeJaw,
  opposingGeometry: bridgeOpp,
  neighbors: [fx26],
  toothWorks: bridgeWorks,
});

const scene = new THREE.Scene();
const mesh26 = new THREE.Mesh(d26.worldGeometry.clone(), new THREE.MeshBasicMaterial());
const mesh27 = new THREE.Mesh(d27.worldGeometry.clone(), new THREE.MeshBasicMaterial());
scene.add(mesh26, mesh27);

const session = new AbutmentDirectEditSession({
  getScene: () => scene,
  getCamera: () => null,
  getRenderer: () => null,
  getHost: () => null,
  getDesigns: () => [d26, d27],
  getAbutment: (t) => (t === "26" ? mesh26 : t === "27" ? mesh27 : undefined),
  getCrown: () => undefined,
  getMargin: () => undefined,
  getJawGeometry: () => bridgeJaw,
  getOpposingGeometry: () => bridgeOpp,
  getBridgeMates: (t) => (t === "27" ? ["26"] : t === "26" ? ["27"] : []),
  ui: {
    gumballOn: true,
    sculptOn: false,
    radiusMm: 2.4,
    readOnly: false,
    selected: "27",
    selectedTeeth: ["27"],
    visible: { "26": true, "27": true },
    expanded: { "26": false, "27": true },
  },
  onBadge: () => {},
  onShape: () => {},
  onCommit: () => {},
  onHistory: () => {},
});
session.sync({ quiet: true });

const custom26 = edit({ scale: [1.16, 1.12, 1.05], heightMm: 0.55, shiftLabialMm: 0.35, yawDeg: 7 });
session.setEdit("26", custom26);
const internal = session as unknown as {
  show: (t: string, bake: boolean, silent?: boolean, quiet?: boolean, received?: boolean) => void;
};
internal.show("26", true, false, true);
await new Promise<void>((r) => setTimeout(r, 200));

const solidCount26 = Math.floor((d26.solidBodyLocalPositions?.length ?? 0) / 3);
const drilledCount26 = (mesh26.geometry.getAttribute("position") as THREE.BufferAttribute).count;
assert.ok(solidCount26 > 0, "#26 솔리드 외형이 있다");
assert.ok(
  drilledCount26 !== solidCount26,
  `#26 스크류 홀 bake 후 정점 수(${drilledCount26})는 솔리드(${solidCount26})와 달라야 한다`,
);

// #27 편집 커밋이 각도 없는 형제를 silent+receivedBridgeSync 로 show 하던 경로
internal.show("26", true, true, true, true);
const afterSiblingSilent26 = (mesh26.geometry.getAttribute("position") as THREE.BufferAttribute).count;
assert.equal(
  afterSiblingSilent26,
  drilledCount26,
  "#27 편집으로 형제가 silent bake되어도 #26 스크류 홀 메시 정점 수가 유지된다",
);
assert.notEqual(
  afterSiblingSilent26,
  solidCount26,
  "#27 편집 후에도 #26이 솔리드(홀 없음) 정점 수로 되돌아가지 않는다",
);

session.dispose();
mesh26.geometry.dispose();
(mesh26.material as THREE.Material).dispose();
mesh27.geometry.dispose();
(mesh27.material as THREE.Material).dispose();
d26.worldGeometry.dispose();
d26.predictedCrownWorldGeometry.dispose();
d26.enameloplastyWorldGeometry?.dispose();
d27.worldGeometry.dispose();
d27.predictedCrownWorldGeometry.dispose();
d27.enameloplastyWorldGeometry?.dispose();
bridgeJaw.dispose();
bridgeOpp.dispose();

console.log("abutment bridge screw hole regression ok");
