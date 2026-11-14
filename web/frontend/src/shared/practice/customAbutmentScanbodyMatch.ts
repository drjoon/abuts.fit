// 구강스캔에서 스캔바디를 인식하고 스캔바디 라이브러리를 정합(ICP)해 픽스쳐 위치·축·인덱스를 구한다.
// related files:
// - web/frontend/src/shared/practice/scanbodyRegistration.ts
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/frontend/src/shared/practice/dentalFrame.ts
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx

import * as THREE from "three";
import type { DentalFrame } from "@/shared/practice/dentalFrame";
import { meanVec, samplePositions } from "@/shared/practice/dentalFrame";
import {
  abutmentTemplateFor,
  loadScanbodyGeometry,
  loadTemplateModel,
  orderTemplateSpec,
  scanbodyCandidatesFor,
  type ScanbodyCatalog,
} from "@/shared/practice/scanbodyLibraryApi";
import { libraryMatchesMaker } from "@/shared/practice/scanbodyLibraryIdentity";
import {
  applyPose,
  basisRotation,
  meshExtent,
  poseColumn,
  poseTiltDeg,
  registerScanbody,
  type IcpResult,
  type Mat3,
  type ScanbodyMesh,
  type Vec3,
} from "@/shared/practice/scanbodyRegistration";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import { buildImplantLibraries, matchImplantLibrary } from "@/shared/practice/implantLibrary";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

export type CustomAbutmentConnectionSpec = {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
  originDiameterMm: number;
  hexSizeMm: number | null;
  l2Mm: number;
  prcConeTopMm: number;
  screwLowerDiameterMm: number;
  screwUpperDiameterMm: number;
};

export type FixtureWorldPose = {
  /** 픽스쳐 플랫폼 원점(월드 mm). */
  origin: Vec3;
  /** 임플란트 장축(+Z_implant, 치관·교합 방향 단위벡터). */
  axis: Vec3;
  /** 헥스 평면·스캔바디 베벨 기준축(+X_implant). */
  hexX: Vec3;
  /** +Y_implant = axis × hexX. */
  hexY: Vec3;
};

export type MatchedScanbodyFixture = {
  toothNumber: string;
  jaw: "upper" | "lower";
  fixturePose: FixtureWorldPose;
  scanbodyTop: Vec3;
  scanbodyRadiusMm: number;
  scanbodyHeightMm: number;
  /** 플랫폼 기준 스캔바디가 잇몸 위로 드러나기 시작하는 높이(mm). */
  gingivaFloorMm: number;
  rmsMm: number;
  topCoverage: number;
  matchedLibraryLabel: string;
  connectionSpec: CustomAbutmentConnectionSpec;
  archOcclusalDir: Vec3;
  labialDir: Vec3;
};

type CanonicalSeedSpec = {
  key: string;
  aliases?: string[];
  originDiameterMm: number;
  hexSizeMm: number | null;
  l2Mm: number;
  prcConeTopMm: number;
};

/** CONNECTIONS_SEED + CUFF_CONNECTION_SPECS 정합 스펙. */
const CANONICAL_CONNECTION_SPECS: CanonicalSeedSpec[] = [
  {
    key: "OSSTEM|TS3|REGULAR",
    aliases: ["OSSTEM|TS|REGULAR"],
    originDiameterMm: 3.35,
    hexSizeMm: 2.5,
    l2Mm: 2.4,
    prcConeTopMm: 0.3,
  },
  {
    key: "OSSTEM|TS3|MINI",
    aliases: ["OSSTEM|TS|MINI"],
    originDiameterMm: 2.6,
    hexSizeMm: 2.1,
    l2Mm: 2.1,
    prcConeTopMm: 0.84,
  },
  {
    key: "DENTIUM|SUPERLINE2|REGULAR",
    aliases: ["DENTIUM|SUPERLINE|REGULAR", "DENTIUM|IMPLANTIUM|REGULAR"],
    originDiameterMm: 3.33,
    hexSizeMm: 2.5,
    l2Mm: 2.75,
    prcConeTopMm: 0.33,
  },
  {
    key: "NEOBIOTECH|IS2|REGULAR",
    aliases: [
      "NEOBIOTECH|IS|REGULAR",
      "NEOBIOTECH|IS3|REGULAR",
      "NEOBIOTECH|ALX|REGULAR",
      "NEOBIOTECH|ISALX|REGULAR",
    ],
    originDiameterMm: 3.35,
    hexSizeMm: 2.5,
    l2Mm: 2.75,
    prcConeTopMm: 0.3,
  },
  {
    key: "NEOBIOTECH|IS2|SMALLNARROW",
    aliases: ["NEOBIOTECH|IS3|SMALLNARROW", "NEOBIOTECH|ALX|SMALLNARROW"],
    originDiameterMm: 2.6,
    hexSizeMm: 2.1,
    l2Mm: 2.1,
    prcConeTopMm: 0.3,
  },
  {
    key: "DIO|UF|REGULAR",
    aliases: ["DIO|UF2|REGULAR"],
    originDiameterMm: 3.35,
    hexSizeMm: 2.5,
    l2Mm: 2.75,
    prcConeTopMm: 0.3,
  },
  {
    key: "DIO|UF|NARROW",
    originDiameterMm: 2.3,
    hexSizeMm: 1.7,
    l2Mm: 2.75,
    prcConeTopMm: 0.3,
  },
  {
    key: "MEGAGEN|ANYONEINTERNAL|REGULAR",
    aliases: ["MEGAGEN|ANYONE|REGULAR"],
    originDiameterMm: 3.3,
    hexSizeMm: 2.5,
    l2Mm: 2.75,
    prcConeTopMm: 0.4,
  },
  {
    key: "MEGAGEN|MINIINTERNAL|MINI",
    originDiameterMm: 2.3,
    hexSizeMm: 1.7,
    l2Mm: 2.1,
    prcConeTopMm: 0.3,
  },
  {
    key: "DENTIS|SQ|REGULAR",
    aliases: ["DENTIS|ONEQ|REGULAR"],
    originDiameterMm: 3.35,
    hexSizeMm: 2.5,
    l2Mm: 2.55,
    prcConeTopMm: 0.4,
  },
  {
    key: "DENTIS|SQ|MINI",
    aliases: ["DENTIS|ONEQ|MINI"],
    originDiameterMm: 2.8,
    hexSizeMm: 2.1,
    l2Mm: 2.6,
    prcConeTopMm: 0.35,
  },
  {
    key: "DENTIS|SQ|NARROW",
    aliases: ["DENTIS|ONEQ|NARROW"],
    originDiameterMm: 2.3,
    hexSizeMm: 1.7,
    l2Mm: 2.6,
    prcConeTopMm: 0.35,
  },
];

const SPEC_TOKEN = (v: unknown) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const SPEC_MAP = (() => {
  const map = new Map<string, CanonicalSeedSpec>();
  for (const row of CANONICAL_CONNECTION_SPECS) {
    map.set(row.key, row);
    for (const alias of row.aliases ?? []) map.set(alias, row);
  }
  return map;
})();

const TOOTH_SPAN_T = [0, 0.065, 0.181, 0.289, 0.401, 0.508, 0.639, 0.794, 0.935];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function screwBoresForOrigin(originDiameterMm: number) {
  if (originDiameterMm <= 2.45) {
    return { screwLowerDiameterMm: 1.45, screwUpperDiameterMm: 1.85 };
  }
  if (originDiameterMm <= 2.95) {
    return { screwLowerDiameterMm: 1.75, screwUpperDiameterMm: 2.15 };
  }
  return { screwLowerDiameterMm: 2.08, screwUpperDiameterMm: 2.45 };
}

export function resolveCustomAbutmentConnectionSpec(
  row: Pick<
    ToothWorkSelection,
    "implantManufacturer" | "implantBrand" | "implantFamily" | "implantType"
  >,
  connections: readonly ImplantConnection[] = [],
): CustomAbutmentConnectionSpec {
  const manufacturer = String(row.implantManufacturer || "").trim();
  const brand = String(row.implantBrand || "").trim();
  const family = String(row.implantFamily || "").trim();
  const type = String(row.implantType || "Hex").trim();
  const nonHex = /non/i.test(type);
  const key = [manufacturer, brand, family].map(SPEC_TOKEN).join("|");
  const hit = SPEC_MAP.get(key);
  if (hit) {
    return {
      manufacturer,
      brand,
      family,
      type,
      originDiameterMm: hit.originDiameterMm,
      hexSizeMm: nonHex ? null : hit.hexSizeMm,
      l2Mm: hit.l2Mm,
      prcConeTopMm: hit.prcConeTopMm,
      ...screwBoresForOrigin(hit.originDiameterMm),
    };
  }
  const libs = buildImplantLibraries(connections);
  const matched = matchImplantLibrary(libs, { manufacturer, brand, family, type });
  const originDiameterMm = matched?.connectionDiameterMm ?? 3.35;
  const defaultHex =
    originDiameterMm <= 2.45 ? 1.7 : originDiameterMm <= 2.95 ? 2.1 : 2.5;
  return {
    manufacturer,
    brand,
    family,
    type,
    originDiameterMm,
    hexSizeMm: nonHex ? null : defaultHex,
    l2Mm: originDiameterMm <= 2.95 ? 2.2 : 2.65,
    prcConeTopMm: 0.3,
    ...screwBoresForOrigin(originDiameterMm),
  };
}

export function parseFdiTooth(raw: string): {
  digits: string;
  jaw: "upper" | "lower";
  side: 1 | -1;
  pos: number;
} | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const q = Number(digits[0]);
  const pos = Number(digits[1]);
  return {
    digits,
    jaw: q <= 2 ? "upper" : "lower",
    side: q === 1 || q === 4 ? 1 : -1,
    pos,
  };
}

/**
 * 의뢰 규격(직경·높이)에 대응하는 표준 스캔바디 형상(플랫폼 원점, +Y 축, +X 평면 베벨).
 * 서버에 해당 제조사 .dme가 아직 등록되지 않은 경우에도 정확한 높이(플랫폼 거리)와 원기둥·베벨을 맞춘다.
 */
export function buildParametricScanbodyLibraryMesh(
  diameterMm: number,
  heightMm: number,
): ScanbodyMesh {
  const r = Math.max(1.6, Math.min(4.5, diameterMm / 2));
  const hTop = Math.max(4.5, Math.min(16, heightMm));
  // 잇몸 위로 드러나는 스캔바디 최상부 원기둥·베벨 캡 구간(상단 4.2mm)만 모델링해
  // 짧은 스캔바디(5mm·7mm)나 깊게 식립된 스캔바디에서도 잇몸 아래 미노출부 오차를 막는다.
  const capDepth = Math.min(4.2, Math.max(2.6, hTop - 2.0));
  const hBot = Math.max(1.2, hTop - capDepth);
  const bevelStart = hTop - Math.min(2.6, (hTop - hBot) * 0.55);
  const bevelX = r * 0.74;
  const holeR = Math.min(1.05, r * 0.48);
  const cols = 48;
  const rows = 16;
  const positions: number[] = [];
  const indices: number[] = [];

  const profilePoint = (row: number, col: number): Vec3 => {
    const theta = (col / cols) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const t = row / rows;
    const y = hBot + (hTop - hBot) * t;
    let x = r * c;
    const z = r * s;
    if (y > bevelStart && x > bevelX) {
      const w = Math.min(1, (y - bevelStart) / Math.max(0.4, (hTop - bevelStart) * 0.35));
      x = x * (1 - w) + bevelX * w;
    }
    return [x, y, z];
  };

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      positions.push(...profilePoint(row, col));
    }
  }
  const topRingBase = positions.length / 3;
  for (let col = 0; col < cols; col += 1) {
    const theta = (col / cols) * Math.PI * 2;
    positions.push(holeR * Math.cos(theta), hTop, holeR * Math.sin(theta));
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const next = (col + 1) % cols;
      const a = row * cols + col;
      const b = row * cols + next;
      const c = (row + 1) * cols + next;
      const d = (row + 1) * cols + col;
      indices.push(a, b, c, a, c, d);
    }
  }
  const outerTopBase = rows * cols;
  for (let col = 0; col < cols; col += 1) {
    const next = (col + 1) % cols;
    const a = outerTopBase + col;
    const b = outerTopBase + next;
    const c = topRingBase + next;
    const d = topRingBase + col;
    indices.push(a, b, c, a, c, d);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

export type LoadedScanbodyModel = {
  key: string;
  label: string;
  isLibraryCad: boolean;
  mesh: ScanbodyMesh;
  topMm: number;
  radiusMm: number;
};

/**
 * 의뢰 치아의 스캔바디·임플란트 사양으로 정합에 쓸 후보 형상을 모은다.
 * 등록된 라이브러리 STL(전체 높이 topMm 기준 포함)과 의뢰 치수 파라메트릭 모델을 함께 준비한다.
 */
export async function loadCandidateScanbodyModels(args: {
  toothWork: ToothWorkSelection;
  catalog: ScanbodyCatalog;
  connections: readonly ImplantConnection[];
}): Promise<LoadedScanbodyModel[]> {
  const { toothWork, catalog, connections } = args;
  const maker = String(toothWork.abutmentManufacturer || "").trim();
  const rawDiam = Number(String(toothWork.abutmentDiameter || "").replace(",", "."));
  const rawHeight = Number(String(toothWork.abutmentHeight || "").replace(",", "."));
  const orderDiam = Number.isFinite(rawDiam) && rawDiam > 0 ? rawDiam : null;
  const orderHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : null;

  const out: LoadedScanbodyModel[] = [];
  const seenKeys = new Set<string>();

  const templateSpec = orderTemplateSpec({
    simpleAbutment:
      maker === "심플어벗" || maker === "심플밀링"
        ? {
            kind: maker,
            diameter: String(toothWork.abutmentDiameter || ""),
            height: String(toothWork.abutmentHeight || ""),
          }
        : null,
    scanbodyOrder: maker
      ? {
          manufacturer: maker,
          diameter: String(toothWork.abutmentDiameter || ""),
          height: String(toothWork.abutmentHeight || ""),
        }
      : null,
  });
  if (templateSpec) {
    const tpl = abutmentTemplateFor(catalog.templates, templateSpec);
    if (tpl) {
      try {
        const mesh = await loadTemplateModel(tpl);
        const ext = meshExtent(mesh.positions);
        out.push({
          key: `tpl:${tpl.id}`,
          label: `${tpl.kind} ${tpl.diameter}${tpl.height}`,
          isLibraryCad: true,
          mesh,
          topMm: ext.topMm,
          radiusMm: ext.radiusMm,
        });
      } catch {
        // 템플릿 로드 실패 시 파라메트릭 후보로 이어간다.
      }
    }
  }

  // 1) 제조사·치수가 맞는 라이브러리 부품 (3Shape 캡 부품은 heightMm 대신 topMm이 전체 높이일 수 있음)
  const libCandidates: Array<{ s3Key: string; label: string; err: number }> = [];
  if (maker && catalog.libraries.length > 0) {
    for (const lib of catalog.libraries) {
      if (!libraryMatchesMaker(lib, maker)) continue;
      for (const part of lib.parts) {
        if (part.partClass !== "scanAbutment" || seenKeys.has(part.s3Key)) continue;
        if (orderDiam != null && part.diameterMm != null && Math.abs(part.diameterMm - orderDiam) > 0.45) {
          continue;
        }
        const errD =
          orderDiam != null && part.diameterMm != null ? Math.abs(part.diameterMm - orderDiam) : 0.2;
        const errH =
          orderHeight != null && part.heightMm != null ? Math.min(Math.abs(part.heightMm - orderHeight), 1.5) : 0.5;
        seenKeys.add(part.s3Key);
        libCandidates.push({
          s3Key: part.s3Key,
          label: `${lib.systemName} · ${part.name}`,
          err: errD + errH * 0.25,
        });
      }
    }
  }

  // 2) 의뢰에 스캔바디 제조사가 지정되지 않았거나 제조사 일치 라이브러리에서 못 찾았을 때만 임플란트 연결 후보를 본다.
  //    치과가 스캔바디 제조사·직경·높이를 명시한 경우에는 다른 시스템(예: 2020 3Shape GMS 치은마스크 링)이 잘못 선택되지 않게 막는다.
  if (!maker) {
    const libs = buildImplantLibraries(connections);
    const matchedImplant = matchImplantLibrary(libs, {
      manufacturer: String(toothWork.implantManufacturer || "").trim(),
      brand: String(toothWork.implantBrand || "").trim(),
      family: String(toothWork.implantFamily || "").trim(),
      type: String(toothWork.implantType || "").trim(),
    });
    const linked = scanbodyCandidatesFor(
      catalog.libraries,
      matchedImplant?.id ?? null,
      matchedImplant ?? {
        manufacturer: String(toothWork.implantManufacturer || "").trim(),
        brand: String(toothWork.implantBrand || "").trim(),
        family: String(toothWork.implantFamily || "").trim(),
        type: String(toothWork.implantType || "").trim(),
      },
    );
    for (const row of linked) {
      if (seenKeys.has(row.s3Key)) continue;
      seenKeys.add(row.s3Key);
      libCandidates.push({
        s3Key: row.s3Key,
        label: `${row.systemName} · ${row.name}`,
        err: 0.6,
      });
    }
  }

  libCandidates.sort((a, b) => a.err - b.err);
  for (const cand of libCandidates.slice(0, 4)) {
    try {
      const mesh = await loadScanbodyGeometry(cand.s3Key);
      const ext = meshExtent(mesh.positions);
      const bodySpanMm = ext.topMm - ext.bottomMm;
      // 3Shape GMS 치은 마스크(두께 2~3mm짜리 얇은 링)는 스캔바디 기둥이 아니므로 제외한다.
      if (bodySpanMm < 3.8) continue;
      if (orderHeight != null && Math.abs(ext.topMm - orderHeight) > 0.8) continue;
      if (orderDiam != null && Math.abs(ext.radiusMm * 2 - orderDiam) > 0.45) continue;
      out.push({
        key: cand.s3Key,
        label: cand.label,
        isLibraryCad: true,
        mesh,
        topMm: ext.topMm,
        radiusMm: ext.radiusMm,
      });
    } catch {
      // 개별 부품 로드 실패는 건너뛴다.
    }
  }

  const fallbackConn = resolveCustomAbutmentConnectionSpec(toothWork, connections);
  const paramDiam = orderDiam ?? Math.min(5.5, Math.max(3.8, fallbackConn.originDiameterMm + 1.15));
  const paramHeight = orderHeight ?? 10;
  const paramMesh = buildParametricScanbodyLibraryMesh(paramDiam, paramHeight);
  const paramLabel = maker
    ? `${maker} Ø${paramDiam}×${paramHeight}mm`
    : `표준 스캔바디 Ø${paramDiam}×${paramHeight}mm`;
  out.push({
    key: `param:${paramDiam}x${paramHeight}`,
    label: paramLabel,
    isLibraryCad: false,
    mesh: paramMesh,
    topMm: paramHeight,
    radiusMm: paramDiam / 2,
  });

  return out;
}

function quantile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
}

function angleAbsDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** 악궁 자체의 최소분산(PCA) 교합면 법선과 전치·우측 축을 구한다(악궁이 기울어 있어도 치열 평면을 정확히 잡는다). */
function computeJawOcclusalAxes(
  pts: Array<[number, number, number]>,
  frame: DentalFrame,
  jaw: "upper" | "lower",
): { occlusalDir: Vec3; archRight: Vec3; archAnterior: Vec3; mean: Vec3 } | null {
  const m = meanVec(pts);
  if (!m) return null;
  const mean: Vec3 = [m.x, m.y, m.z];
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const dx = p[0] - mean[0];
    const dy = p[1] - mean[1];
    const dz = p[2] - mean[2];
    cov[0] += dx * dx;
    cov[1] += dx * dy;
    cov[2] += dx * dz;
    cov[4] += dy * dy;
    cov[5] += dy * dz;
    cov[8] += dz * dz;
  }
  cov[3] = cov[1]!;
  cov[6] = cov[2]!;
  cov[7] = cov[5]!;
  const eig = jacobi3(cov);
  let minIdx = 0;
  if (eig.values[1]! < eig.values[minIdx]!) minIdx = 1;
  if (eig.values[2]! < eig.values[minIdx]!) minIdx = 2;
  let occ = norm(eig.vec(minIdx));
  const wantOcc: Vec3 =
    jaw === "upper"
      ? [-frame.up.x, -frame.up.y, -frame.up.z]
      : [frame.up.x, frame.up.y, frame.up.z];
  if (dot(occ, wantOcc) < 0) occ = scale(occ, -1);

  const rawRight: Vec3 = [frame.right.x, frame.right.y, frame.right.z];
  const archRight = norm(sub(rawRight, scale(occ, dot(rawRight, occ))));
  let archAnterior = norm(
    jaw === "upper" ? cross(scale(occ, -1), archRight) : cross(occ, archRight),
  );
  const wantAnt: Vec3 = [frame.anterior.x, frame.anterior.y, frame.anterior.z];
  if (dot(archAnterior, wantAnt) < 0) archAnterior = scale(archAnterior, -1);

  return { occlusalDir: occ, archRight, archAnterior, mean };
}

/** 악궁 말굽 형태에서 FDI 치아의 기준 슬롯 중심과 법선·순측 방향을 찾는다. */
export function locateNominalToothSlot(args: {
  geometry: THREE.BufferGeometry;
  frame: DentalFrame;
  toothNumber: string;
}): {
  center: Vec3;
  occlusalDir: Vec3;
  archRight: Vec3;
  archAnterior: Vec3;
  labialDir: Vec3;
  jaw: "upper" | "lower";
  side: 1 | -1;
} | null {
  const parsed = parseFdiTooth(args.toothNumber);
  if (!parsed) return null;
  const pts = samplePositions(args.geometry, 6000);
  if (pts.length < 40) return null;

  const jawAxes = computeJawOcclusalAxes(pts, args.frame, parsed.jaw);
  if (!jawAxes) return null;
  const { occlusalDir, archRight, archAnterior } = jawAxes;

  const heights = pts.map((p) => p[0] * occlusalDir[0] + p[1] * occlusalDir[1] + p[2] * occlusalDir[2]);
  const sortedH = [...heights].sort((a, b) => a - b);
  const cut = quantile(sortedH, 0.55);
  const band = pts.filter((_, i) => (heights[i] ?? 0) >= cut);
  const usePts = band.length >= 60 ? band : pts;
  const origin = meanVec(usePts);
  if (!origin) return null;

  const proj = usePts.map((p) => {
    const dx = p[0] - origin.x;
    const dy = p[1] - origin.y;
    const dz = p[2] - origin.z;
    return {
      p,
      r: dx * archRight[0] + dy * archRight[1] + dz * archRight[2],
      a: dx * archAnterior[0] + dy * archAnterior[1] + dz * archAnterior[2],
    };
  });
  const rs = proj.map((q) => q.r).sort((a, b) => a - b);
  const as = proj.map((q) => q.a).sort((a, b) => a - b);
  const poleR = (quantile(rs, 0.05) + quantile(rs, 0.95)) / 2;
  const aHi = quantile(as, 0.95);
  const depth = Math.max(aHi - quantile(as, 0.05), 1e-3);
  const poleA = aHi - depth * 0.38;

  const angled = proj.map((q) => {
    const dr = q.r - poleR;
    const da = q.a - poleA;
    return { ...q, ang: Math.atan2(dr, da), dist: Math.hypot(dr, da) };
  });
  const outer = angled.filter((q) => q.dist > depth * 0.22);
  const pool = outer.length >= 40 ? outer : angled;
  const rAngles = pool.map((q) => q.ang).filter((a) => a > 0.08).sort((a, b) => a - b);
  const lAngles = pool.map((q) => -q.ang).filter((a) => a > 0.08).sort((a, b) => a - b);
  let spanR = quantile(rAngles, 0.92);
  let spanL = quantile(lAngles, 0.92);
  if (spanR < 0.4) spanR = spanL;
  if (spanL < 0.4) spanL = spanR;
  if (spanR < 0.4) return null;

  const span = parsed.side > 0 ? spanR : spanL;
  const targetAng = parsed.side * (TOOTH_SPAN_T[parsed.pos] ?? 0.5) * span;
  let wedge = Math.max(0.2, span * 0.12);
  let picked = pool.filter((q) => angleAbsDiff(q.ang, targetAng) <= wedge);
  if (picked.length < 15) {
    wedge = Math.max(wedge, 0.45);
    picked = pool.filter((q) => angleAbsDiff(q.ang, targetAng) <= wedge);
  }
  if (picked.length === 0) return null;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const q of picked) {
    sx += q.p[0];
    sy += q.p[1];
    sz += q.p[2];
  }
  const n = picked.length;
  const center: Vec3 = [sx / n, sy / n, sz / n];

  const sAng = Math.sin(targetAng);
  const cAng = Math.cos(targetAng);
  const labialDir = norm([
    archRight[0] * sAng + archAnterior[0] * cAng,
    archRight[1] * sAng + archAnterior[1] * cAng,
    archRight[2] * sAng + archAnterior[2] * cAng,
  ]);
  return {
    center,
    occlusalDir,
    archRight,
    archAnterior,
    labialDir,
    jaw: parsed.jaw,
    side: parsed.side,
  };
}

function jacobi3(input: number[]) {
  const a = input.slice();
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sw = 0; sw < 36; sw += 1) {
    for (let p = 0; p < 3; p += 1) {
      for (let q = p + 1; q < 3; q += 1) {
        const apq = a[p * 3 + q]!;
        if (Math.abs(apq) < 1e-13) continue;
        const theta = (a[q * 3 + q]! - a[p * 3 + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k += 1) {
          const akp = a[k * 3 + p]!;
          const akq = a[k * 3 + q]!;
          a[k * 3 + p] = c * akp - s * akq;
          a[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k += 1) {
          const apk = a[p * 3 + k]!;
          const aqk = a[q * 3 + k]!;
          a[p * 3 + k] = c * apk - s * aqk;
          a[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k += 1) {
          const vkp = v[k * 3 + p]!;
          const vkq = v[k * 3 + q]!;
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return {
    values: [a[0]!, a[4]!, a[8]!],
    vec: (i: number): Vec3 => [v[i]!, v[3 + i]!, v[6 + i]!],
  };
}

/**
 * 봉우리 후보에서 스캔바디 윗면 평면과 원기둥 옆면 반경을 함께 평가한다.
 * 인접 자연치보다 낮게 묻힌 스캔바디(예: 견치 심부 식립)도 원기둥 반경 일관성으로 정확히 구별한다.
 */
function evaluateScanbodyPeak(
  target: Float32Array,
  guess: Vec3,
  occlusalAxis: Vec3,
  expectedRadiusMm: number,
): { top: Vec3; axis: Vec3; cylinderScore: number } | null {
  let center = guess;
  let n = occlusalAxis;
  for (let iter = 0; iter < 4; iter += 1) {
    const near: Vec3[] = [];
    let maxH = -Infinity;
    for (let i = 0; i < target.length; i += 3) {
      const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
      const h = dot(d, n);
      if (h < -2.2 || h > 2.2) continue;
      if (Math.hypot(...sub(d, scale(n, h))) > expectedRadiusMm + 0.55) continue;
      near.push(d);
      if (h > maxH) maxH = h;
    }
    const cap = near.filter((d) => dot(d, n) >= maxH - (iter === 0 ? 1.1 : 0.55));
    if (cap.length < 14) break;
    const c: Vec3 = [0, 0, 0];
    for (const d of cap) {
      c[0] += d[0] / cap.length;
      c[1] += d[1] / cap.length;
      c[2] += d[2] / cap.length;
    }
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const d of cap) {
      const e = sub(d, c);
      for (let r = 0; r < 3; r += 1) {
        for (let s = 0; s < 3; s += 1) cov[r * 3 + s] += e[r]! * e[s]!;
      }
    }
    const eig = jacobi3(cov);
    let minIdx = 0;
    if (eig.values[1]! < eig.values[minIdx]!) minIdx = 1;
    if (eig.values[2]! < eig.values[minIdx]!) minIdx = 2;
    let nextAxis = norm(eig.vec(minIdx));
    if (dot(nextAxis, occlusalAxis) < 0) nextAxis = scale(nextAxis, -1);
    if (dot(nextAxis, occlusalAxis) < Math.cos((44 * Math.PI) / 180)) break;
    n = nextAxis;
    center = add(center, c);
  }

  // 1) 상단 원기둥 중심(깊이 1.0~3.2mm 구간의 수평 중심)을 먼저 맞춰 축 편향을 없앤다.
  const e1 = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
  const e2 = cross(n, e1);
  let cylU = 0;
  let cylV = 0;
  let cylN = 0;
  for (let i = 0; i < target.length; i += 3) {
    const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
    const h = dot(d, n);
    if (h > -0.6 || h < -3.2) continue;
    const u = dot(d, e1);
    const v = dot(d, e2);
    if (Math.hypot(u, v) > expectedRadiusMm + 0.9) continue;
    cylU += u;
    cylV += v;
    cylN += 1;
  }
  if (cylN >= 16) {
    cylU /= cylN;
    cylV /= cylN;
  } else {
    cylU = 0;
    cylV = 0;
  }

  // 2) 깊이 0.6~2.8mm 구간의 원기둥 반경 분포와 외부 퍼짐(치관 비대 여부)을 함께 잰다.
  const shaftRadii: number[] = [];
  let sectors = 0;
  const sectorHit = new Uint8Array(12);
  let outerLeak = 0;
  for (let i = 0; i < target.length; i += 3) {
    const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
    const h = dot(d, n);
    if (h > -0.55 || h < -2.8) continue;
    const u = dot(d, e1) - cylU;
    const v = dot(d, e2) - cylV;
    const r = Math.hypot(u, v);
    if (r > expectedRadiusMm + 0.65 && r < expectedRadiusMm + 2.3) {
      outerLeak += 1;
      continue;
    }
    if (r < expectedRadiusMm * 0.55 || r > expectedRadiusMm + 0.65) continue;
    shaftRadii.push(r);
    const bin = Math.min(11, Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * 12)));
    if (!sectorHit[bin]) {
      sectorHit[bin] = 1;
      sectors += 1;
    }
  }
  if (shaftRadii.length < 18 || sectors < 5) return null;
  const leakRatio = outerLeak / Math.max(shaftRadii.length, 1);
  if (leakRatio > 0.75) return null;
  shaftRadii.sort((a, b) => a - b);
  const medR = shaftRadii[Math.floor(shaftRadii.length * 0.55)]!;
  const spreadR =
    shaftRadii[Math.floor(shaftRadii.length * 0.85)]! -
    shaftRadii[Math.floor(shaftRadii.length * 0.2)]!;
  const radiusErr = Math.abs(medR - expectedRadiusMm);
  if (radiusErr > 0.68) return null;
  const recenteredTop = add(center, add(scale(e1, cylU), scale(e2, cylV)));
  const cylinderScore =
    radiusErr * 1.2 + spreadR * 0.8 + leakRatio * 0.85 + (1 - sectors / 12) * 0.4;
  return { top: recenteredTop, axis: n, cylinderScore };
}

/** 잇몸 위로 드러난 스캔바디 하단(잇몸 시작 높이, 플랫폼 기준 mm)을 잰다. */
function estimateGingivaFloorMm(
  localTarget: Float32Array,
  originLocal: Vec3,
  axis: Vec3,
  scanbodyRadiusMm: number,
  scanbodyHeightMm: number,
): number {
  const bins = 24;
  const floorBySector: number[] = [];
  const e1 = norm(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
  const e2 = cross(axis, e1);
  const minZByBin = new Float64Array(bins).fill(Infinity);
  for (let i = 0; i < localTarget.length; i += 3) {
    const d = sub([localTarget[i]!, localTarget[i + 1]!, localTarget[i + 2]!], originLocal);
    const z = dot(d, axis);
    if (z < 0.8 || z > scanbodyHeightMm - 0.6) continue;
    const u = dot(d, e1);
    const v = dot(d, e2);
    const r = Math.hypot(u, v);
    if (r < scanbodyRadiusMm + 0.35 || r > scanbodyRadiusMm + 1.9) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * bins)));
    if (z < minZByBin[b]!) minZByBin[b] = z;
  }
  for (let b = 0; b < bins; b += 1) {
    if (Number.isFinite(minZByBin[b]!)) floorBySector.push(minZByBin[b]!);
  }
  if (floorBySector.length < 4) {
    return Math.max(1.5, scanbodyHeightMm - 5.5);
  }
  floorBySector.sort((a, b) => a - b);
  return Math.max(1.2, Math.min(scanbodyHeightMm - 1.5, quantile(floorBySector, 0.35)));
}

/**
 * 구강스캔에서 해당 치아의 스캔바디를 찾아 라이브러리를 ICP 정합하고 픽스쳐 월드 자세를 구한다.
 */
export function detectAndMatchScanbodyOnScan(args: {
  jawGeometry: THREE.BufferGeometry;
  frame: DentalFrame;
  toothWork: ToothWorkSelection;
  models: readonly LoadedScanbodyModel[];
  connections: readonly ImplantConnection[];
  excludeTops?: readonly Vec3[];
}): MatchedScanbodyFixture | null {
  const { jawGeometry, frame, toothWork, models, connections } = args;
  if (models.length === 0) return null;
  const slot = locateNominalToothSlot({
    geometry: jawGeometry,
    frame,
    toothNumber: toothWork.toothNumber,
  });
  if (!slot) return null;

  const posAttr = jawGeometry.getAttribute("position");
  if (!posAttr || posAttr.count < 90) return null;

  const searchRadiusMm = 22.5;
  const r2 = searchRadiusMm * searchRadiusMm;
  const seen = new Set<number>();
  const localPts: number[] = [];
  for (let i = 0; i < posAttr.count; i += 1) {
    const wx = posAttr.getX(i);
    const wy = posAttr.getY(i);
    const wz = posAttr.getZ(i);
    const worldR =
      wx * slot.archRight[0] + wy * slot.archRight[1] + wz * slot.archRight[2];
    if (slot.side * worldR < -2.5) continue;
    const dx = wx - slot.center[0];
    const dy = wy - slot.center[1];
    const dz = wz - slot.center[2];
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const voxelKey =
      (Math.floor(dx * 22) + 2048) * 16777216 +
      (Math.floor(dy * 22) + 2048) * 4096 +
      (Math.floor(dz * 22) + 2048);
    if (seen.has(voxelKey)) continue;
    seen.add(voxelKey);
    localPts.push(dx, dy, dz);
  }
  if (localPts.length < 180) return null;
  const target = new Float32Array(localPts);

  const axis = slot.occlusalDir;
  const e1 = norm(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
  const e2 = cross(axis, e1);
  const excludedLocal = (args.excludeTops ?? []).map((w) => sub(w, slot.center));

  // 2D 교합 평면 격자(0.45mm)에서 반경 1.8mm(±4칸) 국소 최댓값을 찾는다.
  // 인접 자연치보다 5mm 이상 낮게 묻힌 스캔바디도 자기 자리 둘레 잇몸보다는 높으므로 사분면 전체에서 정확히 치아·스캔바디당 1개씩만 잡힌다.
  const cell = 0.45;
  const half = searchRadiusMm + 1;
  const gridSize = Math.ceil((2 * half) / cell);
  const heights = new Float32Array(gridSize * gridSize).fill(-Infinity);
  const peakPointIdx = new Int32Array(gridSize * gridSize).fill(-1);
  for (let i = 0; i < target.length; i += 3) {
    const p: Vec3 = [target[i]!, target[i + 1]!, target[i + 2]!];
    const gx = Math.floor((dot(p, e1) + half) / cell);
    const gy = Math.floor((dot(p, e2) + half) / cell);
    if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) continue;
    const h = dot(p, axis);
    const k = gy * gridSize + gx;
    if (h > heights[k]!) {
      heights[k] = h;
      peakPointIdx[k] = i;
    }
  }

  const nmsPeaks: Vec3[] = [];
  for (let gy = 3; gy < gridSize - 3; gy += 1) {
    for (let gx = 3; gx < gridSize - 3; gx += 1) {
      const k = gy * gridSize + gx;
      const h = heights[k]!;
      const pi = peakPointIdx[k]!;
      if (!Number.isFinite(h) || pi < 0) continue;
      let isLocalMax = true;
      for (let dy = -2; dy <= 2 && isLocalMax; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nh = heights[(gy + dy) * gridSize + (gx + dx)]!;
          if (nh > h + 0.02 || (nh === h && (dy < 0 || (dy === 0 && dx < 0)))) {
            isLocalMax = false;
            break;
          }
        }
      }
      if (!isLocalMax) continue;
      const px = target[pi]!;
      const py = target[pi + 1]!;
      const pz = target[pi + 2]!;
      if (px * px + py * py + pz * pz > (searchRadiusMm - 3.6) ** 2) continue;
      nmsPeaks.push([px, py, pz]);
    }
  }

  const expectedR = models[models.length - 1]!.radiusMm;
  const evaluatedPeaksRaw: Array<{
    top: Vec3;
    axis: Vec3;
    cylinderScore: number;
    distMm: number;
  }> = [];
  for (const guess of nmsPeaks) {
    if (excludedLocal.some((ex) => Math.hypot(...sub(guess, ex)) < 3.6)) continue;
    const ev = evaluateScanbodyPeak(target, guess, axis, expectedR);
    if (!ev) continue;
    if (excludedLocal.some((ex) => Math.hypot(...sub(ev.top, ex)) < 3.6)) continue;
    const distMm = Math.hypot(dot(ev.top, e1), dot(ev.top, e2));
    evaluatedPeaksRaw.push({ ...ev, distMm });
  }

  evaluatedPeaksRaw.sort(
    (a, b) => a.cylinderScore + a.distMm * 0.045 - (b.cylinderScore + b.distMm * 0.045),
  );
  const evaluatedPeaks: typeof evaluatedPeaksRaw = [];
  for (const row of evaluatedPeaksRaw) {
    if (evaluatedPeaks.some((p) => Math.hypot(...sub(p.top, row.top)) < 2.2)) continue;
    evaluatedPeaks.push(row);
  }

  const refHint: Vec3 = [slot.labialDir[0], slot.labialDir[1], slot.labialDir[2]];
  let bestHit: {
    model: LoadedScanbodyModel;
    fit: IcpResult;
    cylinderScore: number;
    totalScore: number;
  } | null = null;

  for (const candPeak of evaluatedPeaks.slice(0, 6)) {
    for (const model of models) {
      const originGuess = sub(candPeak.top, scale(candPeak.axis, model.topMm));
      const fit = registerScanbody({
        model: model.mesh.positions,
        target,
        axis: candPeak.axis,
        origin: originGuess,
        ref: refHint,
        seeds: 12,
      });
      if (!fit) continue;
      if (poseTiltDeg(fit.pose, axis) > 45) continue;
      // 윗면(topCoverage)이 75% 미만이면 인접 자연치 옆면에 비스듬히 붙은 가짜 정합이므로 제외한다.
      if (fit.topCoverage < 0.72) continue;
      const fittedTop = applyPose(fit.pose, 0, model.topMm, 0);
      if (excludedLocal.some((ex) => Math.hypot(...sub(fittedTop, ex)) < 3.6)) continue;
      const distFromSlot = Math.hypot(dot(fittedTop, e1), dot(fittedTop, e2));
      const libBonus = model.isLibraryCad && fit.rmsMm <= 0.11 && fit.topCoverage >= 0.78 ? -0.06 : 0;
      const totalScore =
        fit.rmsMm * 1.4 +
        (1 - fit.topCoverage) * 1.8 +
        candPeak.cylinderScore * 0.55 +
        distFromSlot * 0.015 +
        libBonus;
      if (!bestHit || totalScore < bestHit.totalScore) {
        bestHit = { model, fit, cylinderScore: candPeak.cylinderScore, totalScore };
      }
    }
  }

  if (!bestHit) return null;

  const pose = bestHit.fit.pose;
  const fitAxis = norm(poseColumn(pose, 1));
  const rawX = norm(poseColumn(pose, 0));
  const hexX = norm(sub(rawX, scale(fitAxis, dot(rawX, fitAxis))));
  const hexY = norm(cross(fitAxis, hexX));
  const originLocal = pose.t;
  const originWorld = add(slot.center, originLocal);
  const topLocal = applyPose(pose, 0, bestHit.model.topMm, 0);
  const scanbodyTop = add(slot.center, topLocal);
  const gingivaFloorMm = estimateGingivaFloorMm(
    target,
    originLocal,
    fitAxis,
    bestHit.model.radiusMm,
    bestHit.model.topMm,
  );

  return {
    toothNumber: toothWork.toothNumber,
    jaw: slot.jaw,
    fixturePose: {
      origin: originWorld,
      axis: fitAxis,
      hexX,
      hexY,
    },
    scanbodyTop,
    scanbodyRadiusMm: bestHit.model.radiusMm,
    scanbodyHeightMm: bestHit.model.topMm,
    gingivaFloorMm,
    rmsMm: Math.round(bestHit.fit.rmsMm * 1000) / 1000,
    topCoverage: Math.round(bestHit.fit.topCoverage * 1000) / 1000,
    matchedLibraryLabel: bestHit.model.label,
    connectionSpec: resolveCustomAbutmentConnectionSpec(toothWork, connections),
    archOcclusalDir: slot.occlusalDir,
    labialDir: slot.labialDir,
  };
}

/** 픽스쳐 로컬(플랫폼 원점, +Z 임플란트 축, +X 헥스) → 스캔 월드 4×4 행렬. */
export function fixturePoseToMatrix4(pose: FixtureWorldPose): THREE.Matrix4 {
  const [xx, xy, xz] = pose.hexX;
  const [yx, yy, yz] = pose.hexY;
  const [zx, zy, zz] = pose.axis;
  const [tx, ty, tz] = pose.origin;
  return new THREE.Matrix4().set(
    xx, yx, zx, tx,
    xy, yy, zy, ty,
    xz, yz, zz, tz,
    0, 0, 0, 1,
  );
}

/** 월드 점들을 픽스쳐 로컬 좌표(+Z 임플란트 축)로 옮긴다. */
export function cropScanPointsInFixtureFrame(
  geometry: THREE.BufferGeometry | null,
  pose: FixtureWorldPose,
  radiusMm: number,
): Float32Array {
  if (!geometry) return new Float32Array(0);
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count === 0) return new Float32Array(0);
  const r2 = radiusMm * radiusMm;
  const out: number[] = [];
  const seen = new Set<number>();
  const [ox, oy, oz] = pose.origin;
  for (let i = 0; i < pos.count; i += 1) {
    const dx = pos.getX(i) - ox;
    const dy = pos.getY(i) - oy;
    const dz = pos.getZ(i) - oz;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const lx = dx * pose.hexX[0] + dy * pose.hexX[1] + dz * pose.hexX[2];
    const ly = dx * pose.hexY[0] + dy * pose.hexY[1] + dz * pose.hexY[2];
    const lz = dx * pose.axis[0] + dy * pose.axis[1] + dz * pose.axis[2];
    const key =
      (Math.floor(lx * 20) + 2048) * 16777216 +
      (Math.floor(ly * 20) + 2048) * 4096 +
      (Math.floor(lz * 20) + 2048);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lx, ly, lz);
  }
  return new Float32Array(out);
}

/**
 * 스캔 메시에서 잇몸 위로 솟은 스캔바디 기둥 면만 가려 커스텀어벗과 겹치지 않게 한다.
 * 원본 BufferGeometry는 건드리지 않고 새 지오메트리를 돌려준다.
 */
export function buildScanGeometryWithoutScanbodies(
  source: THREE.BufferGeometry,
  fixtures: readonly MatchedScanbodyFixture[],
): THREE.BufferGeometry {
  if (fixtures.length === 0) return source.clone();
  const pos = source.getAttribute("position");
  if (!pos || pos.count < 3) return source.clone();

  const trimZones = fixtures.map((f) => ({
    origin: f.fixturePose.origin,
    axis: f.fixturePose.axis,
    maxR: f.scanbodyRadiusMm + 0.28,
    minZ: Math.max(0.8, f.gingivaFloorMm + 0.15),
    maxZ: f.scanbodyHeightMm + 1.2,
  }));

  const isInsideScanbody = (vi: number) => {
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    for (const zone of trimZones) {
      const dx = x - zone.origin[0];
      const dy = y - zone.origin[1];
      const dz = z - zone.origin[2];
      const hz = dx * zone.axis[0] + dy * zone.axis[1] + dz * zone.axis[2];
      if (hz < zone.minZ || hz > zone.maxZ) continue;
      const rx = dx - zone.axis[0] * hz;
      const ry = dy - zone.axis[1] * hz;
      const rz = dz - zone.axis[2] * hz;
      if (rx * rx + ry * ry + rz * rz <= zone.maxR * zone.maxR) return true;
    }
    return false;
  };

  const cloned = source.clone();
  const index = cloned.getIndex();
  if (index) {
    const kept: number[] = [];
    for (let t = 0; t + 2 < index.count; t += 3) {
      const a = index.getX(t);
      const b = index.getX(t + 1);
      const c = index.getX(t + 2);
      if (isInsideScanbody(a) && isInsideScanbody(b) && isInsideScanbody(c)) continue;
      kept.push(a, b, c);
    }
    cloned.setIndex(kept);
    return cloned;
  }

  const triCount = Math.floor(pos.count / 3);
  const keepIndices: number[] = [];
  for (let t = 0; t < triCount; t += 1) {
    const a = t * 3;
    const b = a + 1;
    const c = a + 2;
    if (isInsideScanbody(a) && isInsideScanbody(b) && isInsideScanbody(c)) continue;
    keepIndices.push(a, b, c);
  }
  cloned.setIndex(keepIndices);
  return cloned;
}

export { basisRotation, type Mat3 };
