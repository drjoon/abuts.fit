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
  /** 포스트 최상단 개구 입구 베벨 직경(mm). 우리기공소 샘플·FaceHole 센터드릴 실측 ~2.50mm. */
  screwTopMouthDiameterMm?: number;
  /** 스크류 시트(45° 턱) 하단·상단 Z 높이(플랫폼 원점 기준 mm). */
  screwSeatBottomZMm?: number;
  screwSeatTopZMm?: number;
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
  /** 교합면 안에서 순측에 수직, 정중선 쪽(근심). */
  mesialDir: Vec3;
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

/**
 * 우리치과기공소 커스텀어벗 STL 실측(이지선 #25 NEOBIOTECH IS2 Regular, 배종만 #47 OSSTEM TS3 Regular,
 * 남덕순 #43 MEGAGEN AnyOne Regular, 박형순 #46 DENTIS SQ Regular, 박봉희 #27 DENTIUM Implantium Regular 등)
 * 및 AcroDent FaceHole PRC(T41 D6.0*A90 센터드릴 입구 ~2.50mm + T45 D2.015/D2.35·T44 D1.615/D2.25·T43 D1.415/D2.25 스텝드릴) 기준 스크류 채널 치수.
 */
function screwBoresForOrigin(originDiameterMm: number, manufacturerToken = "") {
  if (originDiameterMm <= 2.45) {
    return {
      screwLowerDiameterMm: 1.45,
      screwUpperDiameterMm: 2.05,
      screwTopMouthDiameterMm: 2.25,
      screwSeatBottomZMm: 1.4,
      screwSeatTopZMm: 1.65,
    };
  }
  if (originDiameterMm <= 2.95) {
    return {
      screwLowerDiameterMm: 1.69,
      screwUpperDiameterMm: 2.34,
      screwTopMouthDiameterMm: 2.48,
      screwSeatBottomZMm: 1.4,
      screwSeatTopZMm: 1.6,
    };
  }
  if (manufacturerToken === "OSSTEM") {
    return {
      screwLowerDiameterMm: 2.05,
      screwUpperDiameterMm: 2.4,
      screwTopMouthDiameterMm: 2.5,
      screwSeatBottomZMm: 0.84,
      screwSeatTopZMm: 1.01,
    };
  }
  return {
    screwLowerDiameterMm: 2.1,
    screwUpperDiameterMm: 2.45,
    screwTopMouthDiameterMm: 2.5,
    screwSeatBottomZMm: 0.7,
    screwSeatTopZMm: 0.87,
  };
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
  const makerToken = SPEC_TOKEN(manufacturer);
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
      ...screwBoresForOrigin(hit.originDiameterMm, makerToken),
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
    ...screwBoresForOrigin(originDiameterMm, makerToken),
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
  capDepthOverrideMm?: number,
): ScanbodyMesh {
  const r = Math.max(1.6, Math.min(4.5, diameterMm / 2));
  const hTop = Math.max(4.5, Math.min(16, heightMm));
  // 잇몸 위로 드러나는 스캔바디 최상부 원기둥·베벨 캡 구간만 모델링한다.
  // 일반 노출용(3.6~4.2mm)과 치은에 깊게 묻히거나 짧은 5mm 스캔바디용 얕은 캡(1.8mm, 3Shape GMS 2.0mm 캡과 동일 원리)을 모두 지원한다.
  const defaultCapDepth = Math.min(4.0, Math.max(2.2, hTop - 2.3));
  const capDepth =
    capDepthOverrideMm != null
      ? Math.max(1.5, Math.min(hTop - 1.2, capDepthOverrideMm))
      : defaultCapDepth;
  const hBot = Math.max(1.1, hTop - capDepth);
  const bevelStart = hTop - Math.min(2.2, (hTop - hBot) * 0.62);
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
  const loadedCandidates = await Promise.all(
    libCandidates.slice(0, 6).map(async (cand) => {
      try {
        const mesh = await loadScanbodyGeometry(cand.s3Key);
        const ext = meshExtent(mesh.positions);
        const bodySpanMm = ext.topMm - ext.bottomMm;
        if (bodySpanMm < 1.8) return null;
        if (orderHeight != null && Math.abs(ext.topMm - orderHeight) > 0.85) return null;
        if (orderDiam != null && Math.abs(ext.radiusMm * 2 - orderDiam) > 0.48) return null;
        return {
          key: cand.s3Key,
          label: cand.label,
          isLibraryCad: true as const,
          mesh,
          topMm: ext.topMm,
          radiusMm: ext.radiusMm,
        };
      } catch {
        return null;
      }
    }),
  );
  for (const row of loadedCandidates) {
    if (row) out.push(row);
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
  // 짧은 스캔바디(5mm)나 치은 하방 심부 식립으로 상단 1.5~2.2mm만 잇몸 위로 노출된 케이스(김우중 #37, 이춘식 #33 등)를 위해
  // 동일한 플랫폼 높이(topMm = paramHeight)를 유지한 상단 1.8mm 얕은 캡 후보를 함께 준비한다.
  const shallowCapMesh = buildParametricScanbodyLibraryMesh(paramDiam, paramHeight, 1.8);
  out.push({
    key: `param-shallow:${paramDiam}x${paramHeight}`,
    label: `${paramLabel} (상부캡)`,
    isLibraryCad: false,
    mesh: shallowCapMesh,
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

/** 교합면·악궁 축은 모델정렬·교합으로 잡은 frame을 쓴다. 부분 스캔 PCA는 쓰지 않는다. */
function computeJawOcclusalAxes(
  pts: Array<[number, number, number]>,
  frame: DentalFrame,
  jaw: "upper" | "lower",
): { occlusalDir: Vec3; archRight: Vec3; archAnterior: Vec3; mean: Vec3 } | null {
  const m = meanVec(pts);
  if (!m) return null;
  const mean: Vec3 = [m.x, m.y, m.z];
  const occ: Vec3 = norm(
    jaw === "upper"
      ? [-frame.up.x, -frame.up.y, -frame.up.z]
      : [frame.up.x, frame.up.y, frame.up.z],
  );

  const rawRight: Vec3 = [frame.right.x, frame.right.y, frame.right.z];
  const archRight = norm(sub(rawRight, scale(occ, dot(rawRight, occ))));
  let archAnterior = norm(
    jaw === "upper" ? cross(scale(occ, -1), archRight) : cross(occ, archRight),
  );
  const wantAnt: Vec3 = [frame.anterior.x, frame.anterior.y, frame.anterior.z];
  if (dot(archAnterior, wantAnt) < 0) archAnterior = scale(archAnterior, -1);

  return { occlusalDir: occ, archRight, archAnterior, mean };
}

/**
 * 매칭된 픽스쳐 주변 인접 치관·인접 어벗 봉우리(local maxima)를 찾아 실제 치열 접선으로 순(협)측·근심 방향을 보정한다.
 * 점 구름 전체 공분산을 쓰면 협측 스캔 경계 플랜지나 원심 후구치 삼각 융기(경사 점막)가 섞여 축이 40~50° 돌아간다.
 * 교합 평면 1.5mm 격자에서 주변 잇몸보다 2.2mm 이상 우뚝 솟고 주변 면이 채워진 실제 치관·어벗 봉우리만 추려
 * 픽스쳐 원점(0, 0)과 잇는 치열 접선을 구하고, 악궁 내측 반대쪽으로 외측(순·협측) 부호를 정한다.
 */
function refineMatchedFixtureDirections(
  jawGeometry: THREE.BufferGeometry,
  fixture: MatchedScanbodyFixture,
  side: 1 | -1,
  jawFixtures?: readonly MatchedScanbodyFixture[],
): { labialDir: Vec3; mesialDir: Vec3 } {
  const pts = samplePositions(jawGeometry, 12000);
  const occ = fixture.archOcclusalDir;
  const isUpper = fixture.jaw === "upper";
  const cranialUp = isUpper ? scale(occ, -1) : occ;
  const fallbackMesial = norm(scale(cross(cranialUp, fixture.labialDir), side));
  if (pts.length < 80) {
    return { labialDir: fixture.labialDir, mesialDir: fallbackMesial };
  }

  const orig = fixture.fixturePose.origin;
  const e1 =
    Math.abs(occ[2]) < 0.9 ? norm(cross(occ, [0, 0, 1])) : norm(cross(occ, [1, 0, 0]));
  const e2 = norm(cross(occ, e1));
  const ownFdi = parseFdiTooth(fixture.toothNumber);
  const allSbs = jawFixtures && jawFixtures.length > 0 ? jawFixtures : [fixture];
  const isOnAnyScanbody = (p: Vec3) => {
    for (const sb of allSbs) {
      const rSb = sub(p, sb.fixturePose.origin);
      const tSb = dot(rSb, sb.fixturePose.axis);
      if (tSb < -0.5 || tSb > sb.scanbodyHeightMm + 1.2) continue;
      if (Math.hypot(...sub(rSb, scale(sb.fixturePose.axis, tSb))) < sb.scanbodyRadiusMm + 0.9) {
        return true;
      }
    }
    return false;
  };

  const step = 1.5;
  const halfCells = 22;
  const nSide = halfCells * 2 + 1;
  const grid = new Float64Array(nSide * nSide).fill(-Infinity);
  const gingH: number[] = [];
  for (const p of pts) {
    const rel = sub(p, orig);
    const x = dot(rel, e1);
    const y = dot(rel, e2);
    const z = dot(rel, occ);
    const r = Math.hypot(x, y);
    if (r >= fixture.scanbodyRadiusMm + 0.8 && r <= 5.5) gingH.push(z);
    const gx = Math.round(x / step) + halfCells;
    const gy = Math.round(y / step) + halfCells;
    if (gx >= 0 && gx < nSide && gy >= 0 && gy < nSide && z > grid[gy * nSide + gx]!) {
      grid[gy * nSide + gx] = z;
    }
  }
  gingH.sort((a, b) => a - b);
  const baseOcc = gingH.length > 0 ? gingH[Math.floor(gingH.length * 0.45)]! : 0;

  const smooth = new Float64Array(nSide * nSide).fill(-Infinity);
  for (let y = 1; y < nSide - 1; y += 1) {
    for (let x = 1; x < nSide - 1; x += 1) {
      if (!Number.isFinite(grid[y * nSide + x]!)) continue;
      let sum = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const v = grid[(y + dy) * nSide + (x + dx)]!;
          if (Number.isFinite(v)) {
            sum += v;
            cnt += 1;
          }
        }
      }
      smooth[y * nSide + x] = sum / cnt;
    }
  }

  // 악궁은 혀·구개 쪽으로 오목하므로, 12mm 이상 떨어진 나머지 치관 격자의 중심 반대쪽이 외측(순·협측)이다.
  let fx = 0;
  let fy = 0;
  let fn = 0;
  for (let y = 2; y < nSide - 2; y += 1) {
    for (let x = 2; x < nSide - 2; x += 1) {
      const v = smooth[y * nSide + x]!;
      if (!Number.isFinite(v) || v < baseOcc + 1.2 || v > baseOcc + 13.5) continue;
      const px = (x - halfCells) * step;
      const py = (y - halfCells) * step;
      if (Math.hypot(px, py) < 12) continue;
      fx += px;
      fy += py;
      fn += 1;
    }
  }
  let outwardRef = norm(sub(fixture.labialDir, scale(occ, dot(fixture.labialDir, occ))));
  if (fn >= 10) {
    fx /= fn;
    fy /= fn;
    if (Math.hypot(fx, fy) > 3) {
      const chordOut = norm(add(scale(e1, -fx), scale(e2, -fy)));
      outwardRef =
        dot(outwardRef, chordOut) >= 0.2
          ? chordOut
          : norm(add(scale(chordOut, 0.5), scale(outwardRef, 0.5)));
    }
  }

  const rawPeaks: Array<{ x: number; y: number; r: number; prom: number }> = [];
  for (let y = 3; y < nSide - 3; y += 1) {
    for (let x = 3; x < nSide - 3; x += 1) {
      const v = smooth[y * nSide + x]!;
      if (!Number.isFinite(v) || v < baseOcc + 1.5 || v > baseOcc + 13.5) continue;
      const px = (x - halfCells) * step;
      const py = (y - halfCells) * step;
      const r = Math.hypot(px, py);
      if (r < 4.5 || r > 24) continue;
      let isMax = true;
      let minNear = v;
      let filled = 0;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const nv = smooth[(y + dy) * nSide + (x + dx)]!;
          if (!Number.isFinite(nv)) continue;
          if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
            filled += 1;
            if ((dx !== 0 || dy !== 0) && nv > v) isMax = false;
          }
          if (nv < minNear) minNear = nv;
        }
      }
      if (isMax && filled >= 15 && v - minNear >= 2.0) {
        rawPeaks.push({ x: px, y: py, r, prom: v - minNear });
      }
    }
  }
  rawPeaks.sort((a, b) => a.r - b.r);
  const peaks: Array<{ x: number; y: number; r: number; prom: number }> = [];
  for (const p of rawPeaks) {
    const i = peaks.findIndex((q) => Math.hypot(p.x - q.x, p.y - q.y) < 5.0);
    if (i < 0) peaks.push(p);
    else if (p.prom > peaks[i]!.prom) peaks[i] = p;
  }

  // 같은 사분면 인접 임플란트 픽스쳐(예: #47↔#46) 원점도 치조정·중심구 악궁선 위의 기준점으로 넣는다.
  const nbAnchors: Array<{ x: number; y: number; r: number; w: number }> = [];
  if (ownFdi && jawFixtures) {
    for (const other of jawFixtures) {
      if (other.toothNumber === fixture.toothNumber) continue;
      const ofdi = parseFdiTooth(other.toothNumber);
      if (!ofdi || ofdi.digits[0] !== ownFdi.digits[0]) continue;
      if (Math.abs(ofdi.pos - ownFdi.pos) > 2) continue;
      const rel = sub(other.fixturePose.origin, orig);
      const ox = dot(rel, e1);
      const oy = dot(rel, e2);
      const r = Math.hypot(ox, oy);
      if (r >= 4.0 && r <= 18.0) {
        nbAnchors.push({ x: ox, y: oy, r, w: 18 / (r + 2.5) });
      }
    }
  }

  const mesialHint = norm(scale(cross(cranialUp, outwardRef), side));
  const isWisdom = ownFdi?.pos === 8;
  const maxPeakRadius = ownFdi && ownFdi.pos >= 7 ? 24 : ownFdi && ownFdi.pos === 6 ? 18 : 19;
  const near = peaks.filter((p) => {
    if (p.r > maxPeakRadius) return false;
    const pVec = add(scale(e1, p.x), scale(e2, p.y));
    const alongMes = dot(pVec, mesialHint);
    // 사랑니(#18·#28·#38·#48) 원심 뒤쪽은 치아가 아니라 후구치 삼각 융기·상악결절 점막이므로 배제한다.
    if (isWisdom && alongMes < -2.0) return false;
    return true;
  });
  let perp = outwardRef;
  if (near.length > 0 || nbAnchors.length > 0) {
    let sw = 1.5;
    let mx = 0;
    let my = 0;
    for (const p of near) {
      const w = 10 / (p.r + 3);
      sw += w;
      mx += p.x * w;
      my += p.y * w;
    }
    for (const nb of nbAnchors) {
      sw += nb.w;
      mx += nb.x * nb.w;
      my += nb.y * nb.w;
    }
    mx /= sw;
    my /= sw;
    let lxx = 1.5 * mx * mx;
    let lxy = 1.5 * mx * my;
    let lyy = 1.5 * my * my;
    for (const p of near) {
      const w = 10 / (p.r + 3);
      lxx += w * (p.x - mx) ** 2;
      lxy += w * (p.x - mx) * (p.y - my);
      lyy += w * (p.y - my) ** 2;
    }
    for (const nb of nbAnchors) {
      lxx += nb.w * (nb.x - mx) ** 2;
      lxy += nb.w * (nb.x - mx) * (nb.y - my);
      lyy += nb.w * (nb.y - my) ** 2;
    }
    const th = 0.5 * Math.atan2(2 * lxy, lxx - lyy);
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const v1 = lxx * cs * cs + 2 * lxy * cs * sn + lyy * sn * sn;
    const v2 = lxx * sn * sn - 2 * lxy * cs * sn + lyy * cs * cs;
    const min2: [number, number] = v1 >= v2 ? [-sn, cs] : [cs, sn];
    perp = norm(add(scale(e1, min2[0]), scale(e2, min2[1])));
    if (dot(perp, outwardRef) < 0) perp = scale(perp, -1);
  }

  // 협측 교두나 설측 교두 중 한쪽 봉우리만 잡혀 접선이 10~15° 돌아가는 현상을 막기 위해,
  // 초기 접선(t0) 방향 구간마다 교합면 상단 띠의 협설 양끝 중앙(= central groove 연결선)을 추적해 보정한다.
  const t0 = norm(scale(cross(cranialUp, perp), side));
  const minStationMm = isWisdom ? 3.6 : -(ownFdi && ownFdi.pos >= 6 ? 14.5 : 16.0);
  const maxStationMm = ownFdi && ownFdi.pos >= 7 ? 24.0 : ownFdi && ownFdi.pos === 6 ? 16.5 : 16.0;
  const binMm = 2.4;
  const binCount = Math.max(1, Math.ceil((maxStationMm - minStationMm) / binMm));
  const bins: Array<Array<{ u: number; z: number }>> = Array.from({ length: binCount }, () => []);
  for (const p of pts) {
    if (isOnAnyScanbody(p)) continue;
    const rel = sub(p, orig);
    const z = dot(rel, occ);
    if (z < baseOcc + 2.0 || z > baseOcc + 13.0) continue;
    const s = dot(rel, t0);
    const u = dot(rel, perp);
    if (Math.abs(s) < 3.6 || s < minStationMm || s > maxStationMm || Math.abs(u) > 7.5) continue;
    const bi = Math.min(binCount - 1, Math.max(0, Math.floor((s - minStationMm) / binMm)));
    bins[bi]!.push({ u, z });
  }
  const groovePts: Array<{ s: number; u: number; w: number }> = [];
  for (let bi = 0; bi < binCount; bi += 1) {
    const list = bins[bi]!;
    if (list.length < 10) continue;
    const zs = list.map((q) => q.z).sort((a, b) => a - b);
    const zTop = zs[Math.floor(zs.length * 0.92)]!;
    if (zTop < baseOcc + 2.6) continue;
    const occBand = list
      .filter((q) => q.z >= zTop - 2.3)
      .map((q) => q.u)
      .sort((a, b) => a - b);
    if (occBand.length < 6) continue;
    const uLo = occBand[Math.floor(occBand.length * 0.14)]!;
    const uHi = occBand[Math.floor(occBand.length * 0.86)]!;
    if (uHi - uLo < 2.2 || uHi - uLo > 12.5) continue;
    const sMid = minStationMm + (bi + 0.5) * binMm;
    groovePts.push({
      s: sMid,
      u: (uLo + uHi) * 0.5,
      w: 12 / (Math.abs(sMid) + 2.5),
    });
  }
  for (const nb of nbAnchors) {
    const vecWorld = add(scale(e1, nb.x), scale(e2, nb.y));
    groovePts.push({
      s: dot(vecWorld, t0),
      u: dot(vecWorld, perp),
      w: nb.w * 1.25,
    });
  }
  if (groovePts.length >= 2) {
    // 원점(내 픽스쳐)을 부드럽게 지나는 central groove 직선 기울기 du/ds로 회전 보정한다.
    let s2Sum = 12;
    let suSum = 0;
    for (const g of groovePts) {
      s2Sum += g.w * g.s * g.s;
      suSum += g.w * g.s * g.u;
    }
    const maxCorr = Math.tan((22 * Math.PI) / 180);
    const slope = Math.max(-maxCorr, Math.min(maxCorr, suSum / Math.max(s2Sum, 1e-4)));
    const nextMesial = norm(add(t0, scale(perp, slope)));
    perp = norm(scale(cross(nextMesial, cranialUp), side));
    if (dot(perp, outwardRef) < 0) perp = scale(perp, -1);
  }

  const mesialDir = norm(scale(cross(cranialUp, perp), side));
  return { labialDir: perp, mesialDir };
}

/** 교합면 안에서 순측에 수직인 방향 중 정중선(근심) 쪽. */
function mesialDirOf(slot: {
  occlusalDir: Vec3;
  archRight: Vec3;
  archAnterior: Vec3;
  labialDir: Vec3;
  side: 1 | -1;
}): Vec3 {
  let mesial = norm(cross(slot.occlusalDir, slot.labialDir));
  const hint = add(scale(slot.archRight, -slot.side), slot.archAnterior);
  if (dot(mesial, hint) < 0) mesial = scale(mesial, -1);
  return mesial;
}

/**
 * 악궁 중심(말굽 극)에서 한 점을 잇는 방향. 그 점의 협측이고, 수직이 치열 접선이다.
 * 편측이라 말굽 각이 안 나오면 null.
 */
export function archOutwardAtPoint(args: {
  geometry: THREE.BufferGeometry;
  frame: DentalFrame;
  jaw: "upper" | "lower";
  point: Vec3;
  toothNumber?: string;
}): { labialDir: Vec3; mesialDir: Vec3 } | null {
  const pts = samplePositions(args.geometry, 6000);
  if (pts.length < 40) return null;
  const jawAxes = computeJawOcclusalAxes(pts, args.frame, args.jaw);
  if (!jawAxes) return null;
  const { occlusalDir, archRight, archAnterior, mean } = jawAxes;

  const heights = pts.map((p) => dot(p, occlusalDir));
  const sortedH = [...heights].sort((a, b) => a - b);
  const cut = quantile(sortedH, 0.55);
  const band = pts.filter((_, i) => (heights[i] ?? 0) >= cut);
  const usePts = band.length >= 60 ? band : pts;

  const proj = usePts.map((p) => {
    const rel = sub(p, mean);
    return {
      r: dot(rel, archRight),
      a: dot(rel, archAnterior),
    };
  });
  const rs = proj.map((q) => q.r).sort((a, b) => a - b);
  const as = proj.map((q) => q.a).sort((a, b) => a - b);
  const poleR = (quantile(rs, 0.05) + quantile(rs, 0.95)) / 2;
  const aHi = quantile(as, 0.95);
  const depth = Math.max(aHi - quantile(as, 0.05), 1e-3);
  const poleA = aHi - depth * 0.38;

  const angs = proj
    .map((q) => ({ ang: Math.atan2(q.r - poleR, q.a - poleA), dist: Math.hypot(q.r - poleR, q.a - poleA) }))
    .filter((q) => q.dist > depth * 0.22);
  const spanR = quantile(
    angs.map((q) => q.ang).filter((a) => a > 0.08).sort((a, b) => a - b),
    0.92,
  );
  const spanL = quantile(
    angs.map((q) => -q.ang).filter((a) => a > 0.08).sort((a, b) => a - b),
    0.92,
  );
  if (Math.max(spanR, spanL) < 0.4) return null;

  const rel = sub(args.point, mean);
  const pr = dot(rel, archRight) - poleR;
  const pa = dot(rel, archAnterior) - poleA;
  if (Math.hypot(pr, pa) < 1.5) return null;
  const labialDir = norm(add(scale(archRight, pr), scale(archAnterior, pa)));
  const parsed = args.toothNumber ? parseFdiTooth(args.toothNumber) : null;
  const side: 1 | -1 = parsed?.side ?? (pr >= 0 ? 1 : -1);
  let mesial = norm(cross(occlusalDir, labialDir));
  const hint = add(scale(archRight, -side), archAnterior);
  if (dot(mesial, hint) < 0) mesial = scale(mesial, -1);
  return { labialDir, mesialDir: mesial };
}

/** 악궁 말굽 형태에서 FDI 치아의 기준 슬롯 중심과 법선·순측 방향을 찾는다. */
export function locateNominalToothSlot(args: {
  geometry: THREE.BufferGeometry;
  frame: DentalFrame;
  toothNumber: string;
  /** 클릭 재탐색만. 편측 스캔의 자동 배정에 쓰면 다른 융기가 스캔바디로 잡힌다. */
  allowPartialArch?: boolean;
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

  // 편악·구치부만 있는 스캔은 말굽 각이 0.4rad가 안 되어 슬롯이 통째로 비고,
  // 클릭 정합도 그 슬롯이 없으면 바로 포기한다. 교합 축은 있으므로 중심만 악궁 평균으로 둔다.
  const fallbackSlot = () => ({
    center: [origin.x, origin.y, origin.z] as Vec3,
    occlusalDir,
    archRight,
    archAnterior,
    labialDir: norm(archAnterior),
    jaw: parsed.jaw,
    side: parsed.side,
  });

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
  if (spanR < 0.4) return args.allowPartialArch ? fallbackSlot() : null;

  const span = parsed.side > 0 ? spanR : spanL;
  const targetAng = parsed.side * (TOOTH_SPAN_T[parsed.pos] ?? 0.5) * span;
  let wedge = Math.max(0.2, span * 0.12);
  let picked = pool.filter((q) => angleAbsDiff(q.ang, targetAng) <= wedge);
  if (picked.length < 15) {
    wedge = Math.max(wedge, 0.45);
    picked = pool.filter((q) => angleAbsDiff(q.ang, targetAng) <= wedge);
  }
  if (picked.length === 0) return args.allowPartialArch ? fallbackSlot() : null;

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
 * 12부채꼴(30° 간격) 둘레에서 서로 마주보는 협측·설(구개)측 두 호(각 ≥60°, 2칸 연속)가 모두 치관 퍼짐 없이 깨끗한지 본다.
 * 인접 스캔바디나 인접 자연치가 근심·원심 양쪽으로 바짝 붙어 있어도 협측과 설측 절벽은 비어 있고,
 * 반대로 넓은 구치 교합면 위에 얹힌 가짜 후보는 협·설 중 적어도 한쪽으로 치관이 퍼져 있어 걸러진다.
 */
function hasOppositeCleanSectorArcs(sectorCounts: ArrayLike<number>, cleanMax: number): boolean {
  for (let s = 0; s < 12; s += 1) {
    if ((sectorCounts[s] ?? 0) > cleanMax || (sectorCounts[(s + 1) % 12] ?? 0) > cleanMax) {
      continue;
    }
    for (const offset of [5, 6] as const) {
      const o0 = (s + offset) % 12;
      const o1 = (o0 + 1) % 12;
      if ((sectorCounts[o0] ?? 0) <= cleanMax && (sectorCounts[o1] ?? 0) <= cleanMax) {
        return true;
      }
    }
  }
  return false;
}

function sumSmallestSectors(sectorCounts: ArrayLike<number>, keepCount: number): number {
  const sorted = Array.from({ length: 12 }, (_, i) => Number(sectorCounts[i] ?? 0)).sort(
    (a, b) => a - b,
  );
  let sum = 0;
  for (let i = 0; i < Math.min(12, keepCount); i += 1) sum += sorted[i]!;
  return sum;
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

  // 스캔바디가 기울어져 있으면 가장 높은 점(guess)이 상판 한쪽 가장자리(중심에서 ~R)에 찍힌다.
  // 그냥 반경 R+0.55mm 창으로 평균을 내면 반대쪽 스캔바디 절반은 잘리고 옆 치은/후구치 융기가 섞여 중심이 밀리므로,
  // 먼저 절벽(치은 열구 단차 > 0.65mm)에서 멈추는 2D 연결 평탄면(flood-fill)으로 진짜 상판 중심을 잡는다.
  {
    const g1 = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
    const g2 = cross(n, g1);
    const cell = 0.42;
    const maxSpan = expectedRadiusMm * 2 + 0.55;
    const half = maxSpan + 0.5;
    const side = Math.ceil((2 * half) / cell);
    const cellH = new Float32Array(side * side).fill(-Infinity);
    const cellSum = new Float64Array(side * side * 3);
    const cellCnt = new Int32Array(side * side);
    for (let i = 0; i < target.length; i += 3) {
      const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], guess);
      const h = dot(d, n);
      if (h < -2.4 || h > 2.0) continue;
      const u = dot(d, g1);
      const v = dot(d, g2);
      if (Math.abs(u) > half || Math.abs(v) > half) continue;
      const gx = Math.floor((u + half) / cell);
      const gy = Math.floor((v + half) / cell);
      if (gx < 0 || gy < 0 || gx >= side || gy >= side) continue;
      const idx = gy * side + gx;
      if (h > cellH[idx]!) cellH[idx] = h;
      if (h >= -1.55) {
        cellSum[idx * 3] += target[i]!;
        cellSum[idx * 3 + 1] += target[i + 1]!;
        cellSum[idx * 3 + 2] += target[i + 2]!;
        cellCnt[idx] += 1;
      }
    }
    const cIdx = Math.floor(half / cell);
    let seedX = cIdx;
    let seedY = cIdx;
    let seedH = -Infinity;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cIdx + dx;
        const y = cIdx + dy;
        if (x < 0 || y < 0 || x >= side || y >= side) continue;
        const h = cellH[y * side + x]!;
        if (h > seedH) {
          seedH = h;
          seedX = x;
          seedY = y;
        }
      }
    }
    if (Number.isFinite(seedH)) {
      const visited = new Uint8Array(side * side);
      const queue: number[] = [seedY * side + seedX];
      visited[seedY * side + seedX] = 1;
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      let ptsCnt = 0;
      let cellsUsed = 0;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const cx = cur % side;
        const cy = Math.floor(cur / side);
        const curH = cellH[cur]!;
        const u = (cx + 0.5) * cell - half;
        const v = (cy + 0.5) * cell - half;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
        cellsUsed += 1;
        const cnt = cellCnt[cur]!;
        if (cnt > 0) {
          sumX += cellSum[cur * 3]!;
          sumY += cellSum[cur * 3 + 1]!;
          sumZ += cellSum[cur * 3 + 2]!;
          ptsCnt += cnt;
        }
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
            const nIdx = ny * side + nx;
            if (visited[nIdx]) continue;
            const nh = cellH[nIdx]!;
            if (!Number.isFinite(nh) || nh < seedH - 1.45) continue;
            if (Math.abs(nh - curH) > 0.65) continue;
            const nu = (nx + 0.5) * cell - half;
            const nv = (ny + 0.5) * cell - half;
            if (Math.hypot(nu, nv) > maxSpan) continue;
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
      const spanLim = expectedRadiusMm * 2 + 1.25;
      if (cellsUsed >= 4 && ptsCnt >= 12 && maxU - minU <= spanLim && maxV - minV <= spanLim) {
        center = [sumX / ptsCnt, sumY / ptsCnt, sumZ / ptsCnt];
      }
    }
  }

  for (let iter = 0; iter < 4; iter += 1) {
    const near: Vec3[] = [];
    let maxH = -Infinity;
    const capSearchR = expectedRadiusMm + 0.38;
    for (let i = 0; i < target.length; i += 3) {
      const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
      const h = dot(d, n);
      if (h < -2.2 || h > 2.2) continue;
      if (Math.hypot(...sub(d, scale(n, h))) > capSearchR) continue;
      near.push(d);
      if (h > maxH) maxH = h;
    }
    const cap = near.filter((d) => dot(d, n) >= maxH - (iter === 0 ? 0.95 : 0.55));
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

  // 1) 상단 원기둥 중심(깊이 0.45~2.2mm 구간의 수평 중심)을 먼저 맞춰 짧은/심부 스캔바디에서도 축 편향을 없앤다.
  //    인접 스캔바디와 옆면이 붙어 한쪽 벽이 비어도 중심이 반대쪽으로 쏠리지 않도록 부채꼴별 반경(R) 정합으로 다듬는다.
  const e1 = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
  const e2 = cross(n, e1);
  let cylU = 0;
  let cylV = 0;
  let cylN = 0;
  const shaftSlice: Array<[number, number]> = [];
  for (let i = 0; i < target.length; i += 3) {
    const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
    const h = dot(d, n);
    if (h > -0.4 || h < -2.4) continue;
    const u = dot(d, e1);
    const v = dot(d, e2);
    if (Math.hypot(u, v) <= expectedRadiusMm + 1.35) shaftSlice.push([u, v]);
    if (Math.hypot(u, v) > expectedRadiusMm + 0.75) continue;
    cylU += u;
    cylV += v;
    cylN += 1;
  }
  if (cylN >= 12) {
    cylU /= cylN;
    cylV /= cylN;
  } else {
    cylU = 0;
    cylV = 0;
  }
  const initU = cylU;
  const initV = cylV;
  for (let step = 0; step < 2; step += 1) {
    const binSumU = new Float64Array(12);
    const binSumV = new Float64Array(12);
    const binCnt = new Int32Array(12);
    for (const [pu, pv] of shaftSlice) {
      const du = pu - cylU;
      const dv = pv - cylV;
      const r = Math.hypot(du, dv);
      if (r < expectedRadiusMm * 0.55 || r > expectedRadiusMm + 0.68) continue;
      const b = Math.min(11, Math.max(0, Math.floor(((Math.atan2(dv, du) + Math.PI) / (Math.PI * 2)) * 12)));
      binSumU[b] += du;
      binSumV[b] += dv;
      binCnt[b] += 1;
    }
    let a00 = 0.2;
    let a01 = 0;
    let a11 = 0.2;
    let b0 = 0;
    let b1 = 0;
    let usedBins = 0;
    for (let b = 0; b < 12; b += 1) {
      const cnt = binCnt[b]!;
      if (cnt < 2) continue;
      const mu = binSumU[b]! / cnt;
      const mv = binSumV[b]! / cnt;
      const mr = Math.hypot(mu, mv);
      if (mr < 1e-4) continue;
      const nx = mu / mr;
      const ny = mv / mr;
      const err = mr - expectedRadiusMm;
      a00 += nx * nx;
      a01 += nx * ny;
      a11 += ny * ny;
      b0 += nx * err;
      b1 += ny * err;
      usedBins += 1;
    }
    const det = a00 * a11 - a01 * a01;
    if (usedBins < 6 || det < 1.1) break;
    const stepU = (a11 * b0 - a01 * b1) / det;
    const stepV = (a00 * b1 - a01 * b0) / det;
    const nextU = cylU + stepU;
    const nextV = cylV + stepV;
    if (Math.hypot(nextU - initU, nextV - initV) > 0.9) break;
    cylU = nextU;
    cylV = nextV;
  }

  // 2) 상부 노출 원기둥 구간(h ∈ [-2.0, -0.35])의 반경 분포와 최상단(h > -1.05) 치관 퍼짐을 함께 잰다.
  //    잇몸에 깊게 묻혀 1.5~2.0mm만 드러난 스캔바디도 -1.05mm 아래는 둘레 치은이므로 치관 누설에서 제외한다.
  const shaftRadii: number[] = [];
  let sectors = 0;
  const sectorHit = new Uint8Array(12);
  let outerLeak = 0;
  const leakBySec = new Int32Array(12);
  for (let i = 0; i < target.length; i += 3) {
    const d = sub([target[i]!, target[i + 1]!, target[i + 2]!], center);
    const h = dot(d, n);
    if (h > -0.35 || h < -2.3) continue;
    const u = dot(d, e1) - cylU;
    const v = dot(d, e2) - cylV;
    const r = Math.hypot(u, v);
    const bin = Math.min(11, Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * 12)));
    if (r > expectedRadiusMm + 0.65 && r < expectedRadiusMm + 2.3) {
      if (h > -1.05) {
        outerLeak += 1;
        leakBySec[bin] += 1;
      }
      continue;
    }
    if (r < expectedRadiusMm * 0.55 || r > expectedRadiusMm + 0.65) continue;
    shaftRadii.push(r);
    if (!sectorHit[bin]) {
      sectorHit[bin] = 1;
      sectors += 1;
    }
  }
  if (shaftRadii.length < 14 || sectors < 5) return null;
  const shaftDenom = Math.max(shaftRadii.length, 1);
  const leakRatio = outerLeak / shaftDenom;
  const proximalLeakOnly =
    sectors >= 7 &&
    hasOppositeCleanSectorArcs(leakBySec, Math.max(2, Math.floor(shaftDenom * 0.012)));
  const maxLeakRatio = proximalLeakOnly ? 1.85 : sectors >= 10 ? 1.15 : 0.8;
  if (leakRatio > maxLeakRatio) return null;
  shaftRadii.sort((a, b) => a - b);
  const medR = shaftRadii[Math.floor(shaftRadii.length * 0.55)]!;
  const spreadR =
    shaftRadii[Math.floor(shaftRadii.length * 0.85)]! -
    shaftRadii[Math.floor(shaftRadii.length * 0.2)]!;
  const radiusErr = Math.abs(medR - expectedRadiusMm);
  if (radiusErr > 0.68) return null;
  const recenteredTop = add(center, add(scale(e1, cylU), scale(e2, cylV)));
  const effectiveLeak = proximalLeakOnly
    ? Math.min(leakRatio, sumSmallestSectors(leakBySec, 8) / shaftDenom)
    : leakRatio;
  const cylinderScore =
    radiusErr * 1.2 + spreadR * 0.8 + effectiveLeak * 0.85 + (1 - sectors / 12) * 0.4;
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

type JawPointGrid = {
  xyz: Float32Array;
  cell: number;
  buckets: Map<number, number[]>;
};

function readPositionArray(geometry: THREE.BufferGeometry): Float32Array | null {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 3) return null;
  if (
    pos.array instanceof Float32Array &&
    pos.itemSize === 3 &&
    !pos.isInterleavedBufferAttribute &&
    pos.array.length >= pos.count * 3
  ) {
    return pos.array.subarray(0, pos.count * 3);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    out[i * 3] = pos.getX(i);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  return out;
}

function jawCellKey(ix: number, iy: number, iz: number) {
  return (ix + 4096) + (iy + 4096) * 8193 + (iz + 4096) * 8193 * 8193;
}

/** 악궁 정점을 2mm 칸에 넣어, 치아마다 전체 스캔을 다시 훑지 않게 한다. */
function buildJawPointGrid(geometry: THREE.BufferGeometry, cell = 2): JawPointGrid | null {
  const xyz = readPositionArray(geometry);
  if (!xyz || xyz.length < 90 * 3) return null;
  const buckets = new Map<number, number[]>();
  const n = xyz.length / 3;
  for (let i = 0; i < n; i += 1) {
    const key = jawCellKey(
      Math.floor(xyz[i * 3]! / cell),
      Math.floor(xyz[i * 3 + 1]! / cell),
      Math.floor(xyz[i * 3 + 2]! / cell),
    );
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  return { xyz, cell, buckets };
}

type DetectScanbodyArgs = {
  jawGeometry: THREE.BufferGeometry;
  frame: DentalFrame;
  toothWork: ToothWorkSelection;
  models: readonly LoadedScanbodyModel[];
  connections: readonly ImplantConnection[];
  excludeTops?: readonly Vec3[];
  /** 사용자가 찍은 스캔 위의 점. 있으면 그 점만 탐색 원점으로 쓴다. */
  anchorWorld?: Vec3;
  jawGrid?: JawPointGrid | null;
};

type ScanbodyHit = {
  fixture: MatchedScanbodyFixture;
  totalScore: number;
  /** 교합 평면에서 슬롯 중심과 스캔바디 윗면 사이 거리(mm). */
  distFromSlotMm: number;
  /** 같은 사분면 안에서 원심으로 갈수록 커지는 악궁 위치 값. */
  archKey: number;
};

/** 슬롯 주변 봉우리마다 가장 잘 맞는 정합을 모아 점수순으로 돌려준다(스캔바디당 1개). */
function collectScanbodyHits(args: DetectScanbodyArgs, maxHits: number): ScanbodyHit[] {
  const { jawGeometry, frame, toothWork, models, connections } = args;
  if (models.length === 0) return [];
  const anchor = args.anchorWorld;
  const anchored = anchor != null;
  const nominal = locateNominalToothSlot({
    geometry: jawGeometry,
    frame,
    toothNumber: toothWork.toothNumber,
    allowPartialArch: anchored,
  });
  if (!nominal) return [];
  const slot = anchored ? { ...nominal, center: [anchor[0], anchor[1], anchor[2]] as Vec3 } : nominal;

  const posAttr = jawGeometry.getAttribute("position");
  const xyz = args.jawGrid?.xyz ?? readPositionArray(jawGeometry);
  if (!posAttr || !xyz || xyz.length < 90 * 3) return [];

  const searchRadiusMm = anchored ? 12 : 26;
  const r2 = searchRadiusMm * searchRadiusMm;
  const seen = new Set<number>();
  const localPts: number[] = [];
  const takePoint = (i: number) => {
    const wx = xyz[i * 3]!;
    const wy = xyz[i * 3 + 1]!;
    const wz = xyz[i * 3 + 2]!;
    if (!anchored) {
      const worldR =
        wx * slot.archRight[0] + wy * slot.archRight[1] + wz * slot.archRight[2];
      if (slot.side * worldR < -2.5) return;
    }
    const dx = wx - slot.center[0];
    const dy = wy - slot.center[1];
    const dz = wz - slot.center[2];
    if (dx * dx + dy * dy + dz * dz > r2) return;
    const voxelKey =
      (Math.floor(dx * 22) + 2048) * 16777216 +
      (Math.floor(dy * 22) + 2048) * 4096 +
      (Math.floor(dz * 22) + 2048);
    if (seen.has(voxelKey)) return;
    seen.add(voxelKey);
    localPts.push(dx, dy, dz);
  };
  const grid = args.jawGrid;
  if (grid) {
    const [cx, cy, cz] = slot.center;
    const ix0 = Math.floor((cx - searchRadiusMm) / grid.cell);
    const ix1 = Math.floor((cx + searchRadiusMm) / grid.cell);
    const iy0 = Math.floor((cy - searchRadiusMm) / grid.cell);
    const iy1 = Math.floor((cy + searchRadiusMm) / grid.cell);
    const iz0 = Math.floor((cz - searchRadiusMm) / grid.cell);
    const iz1 = Math.floor((cz + searchRadiusMm) / grid.cell);
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let iy = iy0; iy <= iy1; iy += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const bucket = grid.buckets.get(jawCellKey(ix, iy, iz));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k += 1) takePoint(bucket[k]!);
        }
      }
    }
  } else {
    for (let i = 0; i < xyz.length / 3; i += 1) takePoint(i);
  }
  if (localPts.length < 180) return [];
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
  const minCenterSep = Math.max(2.9, Math.min(3.5, expectedR * 1.48));
  const evaluatedPeaksRaw: Array<{
    top: Vec3;
    axis: Vec3;
    cylinderScore: number;
    distMm: number;
  }> = [];
  for (const guess of nmsPeaks) {
    // 기울어진 인접 스캔바디는 국소 최고점(guess)이 이미 매칭된 옆 스캔바디 쪽 가장자리(~2.3mm)에 찍힐 수 있으므로,
    // 중심 보정 전에는 옆 스캔바디 상판 내부(< 0.85R)만 제외하고 보정된 중심(ev.top)에서 중심 간격을 검사한다.
    if (excludedLocal.some((ex) => Math.hypot(...sub(guess, ex)) < expectedR * 0.85)) continue;
    const ev = evaluateScanbodyPeak(target, guess, axis, expectedR);
    if (!ev) continue;
    if (excludedLocal.some((ex) => Math.hypot(...sub(ev.top, ex)) < minCenterSep)) continue;
    const distMm = Math.hypot(dot(ev.top, e1), dot(ev.top, e2));
    evaluatedPeaksRaw.push({ ...ev, distMm });
  }

  const peakDistWeight = anchored ? 0.18 : 0.025;
  evaluatedPeaksRaw.sort(
    (a, b) =>
      a.cylinderScore + a.distMm * peakDistWeight - (b.cylinderScore + b.distMm * peakDistWeight),
  );
  // 한 스캔바디/교두 안의 중복 봉우리(반경 1.4mm)는 묶고, 기울어진 스캔바디에서 윗면 중앙과 치은 경계처럼
  // 1.5~2.2mm 떨어진 서로 다른 후보는 모두 남겨 최대 26개까지 ICP 정합을 대 본다.
  const evaluatedPeaks: typeof evaluatedPeaksRaw = [];
  for (const row of evaluatedPeaksRaw) {
    if (evaluatedPeaks.some((p) => Math.hypot(...sub(p.top, row.top)) < 1.35)) continue;
    evaluatedPeaks.push(row);
  }

  // 정합된 스캔바디 최상단(z ∈ [-1.05, 0.22])이 자연치 치관처럼 바깥으로 퍼지거나(flareRatio),
  // 평평한 캡 바로 위(z > 0.42, r < 0.88R)에 자연치 절단연/교두가 더 솟아 있으면 가짜 정합으로 거른다.
  // 또한 윗면 원판 중심부(r <= 0.65R, z ∈ [-0.28, 0.28])의 평탄도와 마주보는 협·설 절벽(hasOppositeCleanArcs)을 함께 재서,
  // 인접 스캔바디·자연치와 근원심으로 붙어 있는 스캔바디는 정확히 살리고 구치 교합면 가짜 정합은 차단한다.
  const measureFittedIsolation = (fittedTopLocal: Vec3, fitAxis: Vec3, radiusMm: number) => {
    const u1 = norm(Math.abs(fitAxis[2]) < 0.9 ? cross(fitAxis, [0, 0, 1]) : cross(fitAxis, [1, 0, 0]));
    const u2 = cross(fitAxis, u1);
    let shaftCnt = 0;
    let outerTopCnt = 0;
    let capOverhangCnt = 0;
    let capCenterCnt = 0;
    const shaftSectors = new Uint8Array(12);
    const outerBySec = new Int32Array(12);
    for (let i = 0; i < target.length; i += 3) {
      const rel = sub([target[i]!, target[i + 1]!, target[i + 2]!], fittedTopLocal);
      const z = dot(rel, fitAxis);
      if (z < -2.4 || z > 2.4) continue;
      const u = dot(rel, u1);
      const v = dot(rel, u2);
      const r = Math.hypot(u, v);
      if (r > radiusMm + 2.5) continue;
      const sec = Math.min(
        11,
        Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * 12)),
      );
      if (z > 0.42 && r < radiusMm * 0.88) capOverhangCnt += 1;
      if (z >= -0.28 && z <= 0.28 && r <= radiusMm * 0.65) capCenterCnt += 1;
      if (z >= -1.05 && z <= 0.22 && r > radiusMm + 0.5 && r < radiusMm + 2.35) {
        outerTopCnt += 1;
        outerBySec[sec] += 1;
      }
      if (z >= -2.1 && z <= -0.35 && r >= radiusMm * 0.58 && r <= radiusMm + 0.58) {
        shaftCnt += 1;
        shaftSectors[sec] = 1;
      }
    }
    const denom = Math.max(1, shaftCnt);
    let sectorCount = 0;
    for (let k = 0; k < 12; k += 1) sectorCount += shaftSectors[k]!;
    return {
      flareRatio: outerTopCnt / denom,
      halfCleanFlareRatio: sumSmallestSectors(outerBySec, 6) / denom,
      clean8FlareRatio: sumSmallestSectors(outerBySec, 8) / denom,
      hasOppositeCleanArcs: hasOppositeCleanSectorArcs(
        outerBySec,
        Math.max(3, Math.floor(denom * 0.012)),
      ),
      overhangRatio: capOverhangCnt / denom,
      capCenterRatio: capCenterCnt / denom,
      capCenterCnt,
      sectorCount,
    };
  };

  const refHint: Vec3 = [slot.labialDir[0], slot.labialDir[1], slot.labialDir[2]];
  // 입력 모델에 상부 1.8mm 얕은 캡 후보가 아직 없으면(단위 테스트 등) 자동으로 보강한다.
  const candidateModels: LoadedScanbodyModel[] = [...models];
  if (models.length > 0 && !models.some((m) => m.key.startsWith("param-shallow:"))) {
    const refModel = models[models.length - 1]!;
    candidateModels.push({
      key: `param-shallow:${refModel.radiusMm * 2}x${refModel.topMm}`,
      label: `${refModel.label} (상부캡)`,
      isLibraryCad: false,
      mesh: buildParametricScanbodyLibraryMesh(refModel.radiusMm * 2, refModel.topMm, 1.8),
      topMm: refModel.topMm,
      radiusMm: refModel.radiusMm,
    });
  }

  type PeakHit = {
    model: LoadedScanbodyModel;
    fit: IcpResult;
    cylinderScore: number;
    totalScore: number;
    fittedTop: Vec3;
    distFromSlot: number;
  };
  const peakHits: PeakHit[] = [];
  let peaksForFit = evaluatedPeaks.slice(0, anchored ? 12 : 26);
  if (anchored) {
    const clickGuess: Vec3 = [0, 0, 0];
    const clicked = evaluateScanbodyPeak(target, clickGuess, axis, expectedR);
    const seed = clicked
      ? { ...clicked, distMm: Math.hypot(dot(clicked.top, e1), dot(clicked.top, e2)) }
      : { top: clickGuess, axis, cylinderScore: 0.45, distMm: 0 };
    const rest = peaksForFit.filter((p) => Math.hypot(...sub(p.top, seed.top)) >= 2.2);
    peaksForFit = [seed, ...rest].slice(0, 8);
  }

  for (const candPeak of peaksForFit) {
    let bestHit: PeakHit | null = null;
    for (const model of candidateModels) {
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
      const isShallowCap = model.key.startsWith("param-shallow:");
      const fittedTop = applyPose(fit.pose, 0, model.topMm, 0);
      if (excludedLocal.some((ex) => Math.hypot(...sub(fittedTop, ex)) < minCenterSep)) continue;
      const distFromSlot = Math.hypot(dot(fittedTop, e1), dot(fittedTop, e2));
      if (anchored && distFromSlot > 6.5) continue;
      const fitAxis = norm(poseColumn(fit.pose, 1));
      const iso = measureFittedIsolation(fittedTop, fitAxis, model.radiusMm);
      const proximalBridgedScanbody =
        iso.hasOppositeCleanArcs &&
        iso.halfCleanFlareRatio <= 0.08 &&
        iso.capCenterCnt >= 145 &&
        iso.sectorCount >= 8 &&
        iso.overhangRatio <= (anchored ? 0.08 : 0.04);
      const overhangLimit = anchored ? 0.12 : 0.08;
      const flareLimit = proximalBridgedScanbody
        ? anchored
          ? 1.55
          : 1.25
        : anchored
          ? 0.78
          : 0.62;
      if (iso.overhangRatio > overhangLimit || iso.flareRatio > flareLimit) continue;
      // 자연치 절단연·교두에 비스듬히 얹힌 가짜 정합을 차단하되,
      // 치은에 깊게 묻힌 5mm 단축·심부 식립 스캔바디(360° 원통 ≥11/12 부채꼴 + 평평한 상단 중심 원판 + 돌출 0)는
      // 베벨 위치 차이로 파라메트릭 ICP rms가 0.18~0.19mm까지 올라가더라도 정확히 인식한다.
      const deepCleanCylinder =
        iso.sectorCount >= 11 &&
        iso.capCenterCnt >= 145 &&
        iso.flareRatio <= 0.45 &&
        iso.overhangRatio <= 0.015;
      const ultraSharpPartialScanbody =
        iso.sectorCount >= 9 &&
        iso.capCenterCnt >= 145 &&
        fit.rmsMm <= 0.135 &&
        iso.flareRatio <= 0.12 &&
        iso.overhangRatio <= 0.015;
      const maxAllowedRms = anchored
        ? model.isLibraryCad
          ? 0.21
          : deepCleanCylinder
            ? 0.23
            : 0.21
        : model.isLibraryCad
          ? 0.168
          : isShallowCap
            ? deepCleanCylinder && fit.topCoverage >= 0.86
              ? 0.188
              : 0.165
            : deepCleanCylinder
              ? 0.198
              : 0.172;
      const minAllowedTopCov = anchored
        ? 0.62
        : ultraSharpPartialScanbody
          ? 0.66
          : deepCleanCylinder
            ? 0.72
            : proximalBridgedScanbody && fit.rmsMm <= 0.165
              ? 0.75
              : 0.82;
      if (fit.topCoverage < minAllowedTopCov || fit.rmsMm > maxAllowedRms) continue;
      const libBonus = model.isLibraryCad && fit.rmsMm <= 0.11 && fit.topCoverage >= 0.85 ? -0.08 : 0;
      const shallowPenalty = isShallowCap ? 0.035 : 0;
      const effectiveFlare = proximalBridgedScanbody
        ? Math.min(iso.flareRatio, iso.clean8FlareRatio)
        : iso.flareRatio;
      const totalScore =
        fit.rmsMm * 2.4 +
        (1 - fit.topCoverage) * 2.1 +
        candPeak.cylinderScore * 0.45 +
        effectiveFlare * 0.75 +
        distFromSlot * (anchored ? 0.12 : 0.008) +
        libBonus +
        shallowPenalty;
      if (!bestHit || totalScore < bestHit.totalScore) {
        bestHit = {
          model,
          fit,
          cylinderScore: candPeak.cylinderScore,
          totalScore,
          fittedTop,
          distFromSlot,
        };
      }
    }
    if (!bestHit) continue;
    const dup = peakHits.findIndex(
      (h) => Math.hypot(...sub(h.fittedTop, bestHit!.fittedTop)) < 3.0,
    );
    if (dup < 0) peakHits.push(bestHit);
    else if (bestHit.totalScore < peakHits[dup]!.totalScore) peakHits[dup] = bestHit;
  }

  const buildMatchedFixture = (bestHit: PeakHit): MatchedScanbodyFixture => {
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
      mesialDir: mesialDirOf(slot),
    };
  };

  peakHits.sort((a, b) => a.totalScore - b.totalScore);
  return peakHits.slice(0, Math.max(1, maxHits)).map((hit) => {
    const baseFixture = buildMatchedFixture(hit);
    const refined = refineMatchedFixtureDirections(jawGeometry, baseFixture, slot.side);
    const fixture: MatchedScanbodyFixture = {
      ...baseFixture,
      labialDir: refined.labialDir,
      mesialDir: refined.mesialDir,
    };
    return {
      fixture,
      totalScore: hit.totalScore,
      distFromSlotMm: hit.distFromSlot,
      archKey:
        slot.side * dot(fixture.scanbodyTop, slot.archRight) -
        dot(fixture.scanbodyTop, slot.archAnterior),
    };
  });
}

/**
 * 한 악궁의 여러 치아를 함께 배정한다. 치아별로 먼저 매칭하면 앞 치아가 옆 스캔바디를 가져가므로,
 * 후보를 모두 모은 뒤 (정합 점수 + 슬롯 거리) 합이 최소인 1:1 배정을 고른다.
 */
export function detectAndMatchScanbodiesOnJaw(args: {
  jawGeometry: THREE.BufferGeometry;
  frame: DentalFrame;
  teeth: ReadonlyArray<{ toothWork: ToothWorkSelection; models: readonly LoadedScanbodyModel[] }>;
  connections: readonly ImplantConnection[];
}): Map<string, MatchedScanbodyFixture> {
  const jawGrid = buildJawPointGrid(args.jawGeometry);
  const perTooth = args.teeth.map((t) => ({
    toothNumber: t.toothWork.toothNumber,
    fdi: parseFdiTooth(t.toothWork.toothNumber),
    hits: collectScanbodyHits(
      {
        jawGeometry: args.jawGeometry,
        frame: args.frame,
        toothWork: t.toothWork,
        models: t.models,
        connections: args.connections,
        jawGrid,
      },
      6,
    ),
  }));

  const sameScanbody = (a: MatchedScanbodyFixture, b: MatchedScanbodyFixture) =>
    Math.hypot(...sub(a.scanbodyTop, b.scanbodyTop)) < 3.0;
  // 슬롯 위치 추정 오차(편측·비대칭 스캔 등)가 진짜 스캔바디 정합 점수를 뒤집지 않도록 거리 가중은 작게 둔다.
  const hitCost = (h: ScanbodyHit) => h.totalScore + h.distFromSlotMm * 0.025;
  // 게이트를 통과한 정합은 슬롯이 멀어도 미배정보다 낫다.
  const MISS_COST = 8;
  // 같은 사분면에서 치아 번호가 크면 악궁에서 더 원심이어야 한다(슬롯 추정이 겹쳐도 순서는 지킨다).
  const orderOk = (i: number, h: ScanbodyHit) =>
    pick.every((p, j) => {
      if (!p) return true;
      const a = perTooth[i]!.fdi;
      const b = perTooth[j]!.fdi;
      if (!a || !b || a.digits[0] !== b.digits[0] || a.pos === b.pos) return true;
      return a.pos > b.pos ? h.archKey > p.archKey : h.archKey < p.archKey;
    });
  const pairSpacingPenalty = (i: number, h: ScanbodyHit) => {
    let pen = 0;
    const a = perTooth[i]!.fdi;
    if (!a) return 0;
    for (let j = 0; j < pick.length; j += 1) {
      const p = pick[j];
      const b = perTooth[j]?.fdi;
      if (!p || !b || a.digits[0] !== b.digits[0]) continue;
      const dPos = Math.abs(a.pos - b.pos);
      const dist = Math.hypot(...sub(h.fixture.scanbodyTop, p.fixture.scanbodyTop));
      const expected = dPos * 6.8;
      pen += Math.max(0, Math.abs(dist - expected) - 2.6) * 0.04;
    }
    return pen;
  };

  let bestCost = Infinity;
  let bestPick: Array<ScanbodyHit | null> = [];
  const pick: Array<ScanbodyHit | null> = [];
  const visit = (i: number, cost: number) => {
    if (cost >= bestCost) return;
    if (i === perTooth.length) {
      bestCost = cost;
      bestPick = [...pick];
      return;
    }
    for (const h of perTooth[i]!.hits) {
      if (pick.some((p) => p && sameScanbody(p.fixture, h.fixture))) continue;
      if (!orderOk(i, h)) continue;
      const extra = hitCost(h) + pairSpacingPenalty(i, h);
      pick.push(h);
      visit(i + 1, cost + extra);
      pick.pop();
    }
    pick.push(null);
    visit(i + 1, cost + MISS_COST);
    pick.pop();
  };
  visit(0, 0);

  const rawOut = new Map<string, MatchedScanbodyFixture>();
  bestPick.forEach((h, i) => {
    if (h) rawOut.set(perTooth[i]!.toothNumber, h.fixture);
  });
  if (rawOut.size <= 1) return rawOut;

  const allMatched = [...rawOut.values()];
  const out = new Map<string, MatchedScanbodyFixture>();
  for (const [toothNumber, fx] of rawOut.entries()) {
    const fdi = parseFdiTooth(toothNumber);
    const side: 1 | -1 = fdi ? fdi.side : 1;
    const dirs = refineMatchedFixtureDirections(args.jawGeometry, fx, side, allMatched);
    out.set(toothNumber, { ...fx, labialDir: dirs.labialDir, mesialDir: dirs.mesialDir });
  }
  return out;
}

/**
 * 사용자가 스캔 위에서 찍은 점 주변(반경 12mm, 정합 윗면은 6.5mm 안)만 다시 찾는다.
 * 자동 배정이 비었을 때 그 치아의 스캔바디 상단을 클릭하면 호출한다.
 */
export function matchScanbodyNearPoint(args: {
  jawGeometry: THREE.BufferGeometry;
  frame: DentalFrame;
  toothWork: ToothWorkSelection;
  models: readonly LoadedScanbodyModel[];
  connections: readonly ImplantConnection[];
  point: readonly [number, number, number];
  excludeTops?: readonly Vec3[];
}): MatchedScanbodyFixture | null {
  const hits = collectScanbodyHits(
    {
      jawGeometry: args.jawGeometry,
      frame: args.frame,
      toothWork: args.toothWork,
      models: args.models,
      connections: args.connections,
      excludeTops: args.excludeTops,
      anchorWorld: [args.point[0], args.point[1], args.point[2]],
    },
    1,
  );
  return hits[0]?.fixture ?? null;
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

const croppedPointsCache = new WeakMap<THREE.BufferGeometry, Map<string, Float32Array>>();

function geometryPositionFingerprint(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string {
  const n = pos.count;
  if (n <= 0) return "0";
  const mid = n >> 1;
  const last = n - 1;
  const r = (v: number) => Math.round(v * 1000);
  return `${n}:${r(pos.getX(0))},${r(pos.getY(mid))},${r(pos.getZ(last))}`;
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
  const r4 = (v: number) => Math.round(v * 1e4);
  const cacheKey = `${geometryPositionFingerprint(pos)}|${Math.round(radiusMm * 100)}|${r4(pose.origin[0])},${r4(pose.origin[1])},${r4(pose.origin[2])}|${r4(pose.axis[0])},${r4(pose.axis[1])},${r4(pose.axis[2])}|${r4(pose.hexX[0])},${r4(pose.hexX[1])},${r4(pose.hexX[2])}`;
  let byKey = croppedPointsCache.get(geometry);
  if (!byKey) {
    byKey = new Map();
    croppedPointsCache.set(geometry, byKey);
  }
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const r2 = radiusMm * radiusMm;
  const out: number[] = [];
  const seen = new Set<number>();
  const [ox, oy, oz] = pose.origin;
  const hx0 = pose.hexX[0], hx1 = pose.hexX[1], hx2 = pose.hexX[2];
  const hy0 = pose.hexY[0], hy1 = pose.hexY[1], hy2 = pose.hexY[2];
  const az0 = pose.axis[0], az1 = pose.axis[1], az2 = pose.axis[2];
  const rawArr =
    !("isInterleavedBufferAttribute" in pos && pos.isInterleavedBufferAttribute) &&
    pos.itemSize === 3 &&
    pos.array instanceof Float32Array
      ? pos.array
      : null;
  if (rawArr) {
    const end = pos.count * 3;
    for (let o = 0; o < end; o += 3) {
      const dx = rawArr[o]! - ox;
      const dy = rawArr[o + 1]! - oy;
      const dz = rawArr[o + 2]! - oz;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const lx = dx * hx0 + dy * hx1 + dz * hx2;
      const ly = dx * hy0 + dy * hy1 + dz * hy2;
      const lz = dx * az0 + dy * az1 + dz * az2;
      const key =
        (Math.floor(lx * 20) + 2048) * 16777216 +
        (Math.floor(ly * 20) + 2048) * 4096 +
        (Math.floor(lz * 20) + 2048);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lx, ly, lz);
    }
  } else {
    for (let i = 0; i < pos.count; i += 1) {
      const dx = pos.getX(i) - ox;
      const dy = pos.getY(i) - oy;
      const dz = pos.getZ(i) - oz;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const lx = dx * hx0 + dy * hx1 + dz * hx2;
      const ly = dx * hy0 + dy * hy1 + dz * hy2;
      const lz = dx * az0 + dy * az1 + dz * az2;
      const key =
        (Math.floor(lx * 20) + 2048) * 16777216 +
        (Math.floor(ly * 20) + 2048) * 4096 +
        (Math.floor(lz * 20) + 2048);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lx, ly, lz);
    }
  }
  const built = new Float32Array(out);
  byKey.set(cacheKey, built);
  return built;
}

const TEXTURE_PIXELS_CACHE = new WeakMap<
  object,
  { width: number; height: number; data: Uint8Array | Uint8ClampedArray } | null
>();

function readTexturePixelsForSplit(
  tex: THREE.Texture | null | undefined,
): { width: number; height: number; data: Uint8Array | Uint8ClampedArray } | null {
  const img = tex?.image as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
        data?: ArrayLike<number>;
      }
    | null
    | undefined;
  if (!img || typeof img !== "object") return null;
  if (TEXTURE_PIXELS_CACHE.has(img)) return TEXTURE_PIXELS_CACHE.get(img) ?? null;

  const w = Number(img.width || img.naturalWidth || 0);
  const h = Number(img.height || img.naturalHeight || 0);
  if (w <= 0 || h <= 0) {
    TEXTURE_PIXELS_CACHE.set(img, null);
    return null;
  }
  if (
    (img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray) &&
    img.data.length >= w * h * 3
  ) {
    const out = { width: w, height: h, data: img.data };
    TEXTURE_PIXELS_CACHE.set(img, out);
    return out;
  }
  if (typeof document !== "undefined") {
    try {
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, cw, ch);
        const imageData = ctx.getImageData(0, 0, cw, ch);
        const out = { width: cw, height: ch, data: imageData.data };
        TEXTURE_PIXELS_CACHE.set(img, out);
        return out;
      }
    } catch {
      // ignore CORS / non-drawable image source
    }
  }
  TEXTURE_PIXELS_CACHE.set(img, null);
  return null;
}

/** HMR로 분리 구현이 교체됐을 때 열린 뷰어 메시를 1회 갱신하기 위한 모듈 토큰 */
export const SCANBODY_SPLIT_IMPL_TOKEN: object = {};

/**
 * 스캔을 정합된 각 스캔바디 표면(치아별 조각)과 나머지(치은·인접치)로 분리한다. 원본 지오메트리는 건드리지 않는다.
 *
 * 1) 정합된 스캔바디 축·높이·반경 주변 ROI에서 삼각형 면 법선과 정점 용접 인접 그래프를 구성한다.
 * 2) 스캔바디 상부 캡·내면·외향 기둥 벽을 시드로 삼아 연결된 삼각형만 따라 내려간다.
 * 3) 치은 열구 바닥(상향 법선 꺾임)과 인접 자연치 인접면·치은 출현 커프 내벽(스캔바디 축을 향하는 내향 법선)에서
 *    성장을 멈추고, 스캔바디·주변 조직 색차가 뚜렷한 스캔에서는 재질 색을 함께 결합해 잔여 막만 흡수한다.
 */
function filterFloatingScanConfettiIndices(
  xyz: ArrayLike<number>,
  vertCount: number,
  triVertIds: readonly number[],
): number[] {
  const restTriCount = Math.floor(triVertIds.length / 3);
  if (restTriCount < 12_000 || vertCount < 3) return triVertIds as number[];

  let tableCap = 1024;
  while (tableCap < vertCount * 2) tableCap <<= 1;
  const tableMask = tableCap - 1;
  const htQx = new Int32Array(tableCap);
  const htQy = new Int32Array(tableCap);
  const htQz = new Int32Array(tableCap);
  const htVal = new Int32Array(tableCap).fill(-1);
  const vertToWeld = new Int32Array(vertCount).fill(-1);
  let nextW = 0;

  const weld = (vi: number): number => {
    const cached = vertToWeld[vi]!;
    if (cached >= 0) return cached;
    const base = vi * 3;
    const qx = Math.round((xyz[base] ?? 0) * 2000);
    const qy = Math.round((xyz[base + 1] ?? 0) * 2000);
    const qz = Math.round((xyz[base + 2] ?? 0) * 2000);
    let slot = (((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) >>> 0) & tableMask;
    while (true) {
      const w = htVal[slot]!;
      if (w < 0) {
        const id = nextW++;
        htQx[slot] = qx;
        htQy[slot] = qy;
        htQz[slot] = qz;
        htVal[slot] = id;
        vertToWeld[vi] = id;
        return id;
      }
      if (htQx[slot] === qx && htQy[slot] === qy && htQz[slot] === qz) {
        vertToWeld[vi] = w;
        return w;
      }
      slot = (slot + 1) & tableMask;
    }
  };

  const triW0 = new Int32Array(restTriCount);
  for (let t = 0; t < restTriCount; t += 1) {
    const off = t * 3;
    triW0[t] = weld(triVertIds[off]!);
    weld(triVertIds[off + 1]!);
    weld(triVertIds[off + 2]!);
  }

  const parent = new Int32Array(nextW);
  for (let i = 0; i < nextW; i += 1) parent[i] = i;
  const find = (start: number): number => {
    let x = start;
    while (parent[x]! !== x) {
      const p = parent[x]!;
      parent[x] = parent[p]!;
      x = p;
    }
    return x;
  };

  for (let t = 0; t < restTriCount; t += 1) {
    const off = t * 3;
    const ra = find(triW0[t]!);
    const rb = find(vertToWeld[triVertIds[off + 1]!]!);
    if (ra !== rb) parent[rb] = ra;
    const rab = find(ra);
    const rc = find(vertToWeld[triVertIds[off + 2]!]!);
    if (rab !== rc) parent[rc] = rab;
  }

  const compTris = new Int32Array(nextW);
  let maxCompTris = 0;
  for (let t = 0; t < restTriCount; t += 1) {
    const r = find(triW0[t]!);
    const nextCnt = compTris[r]! + 1;
    compTris[r] = nextCnt;
    if (nextCnt > maxCompTris) maxCompTris = nextCnt;
  }
  if (maxCompTris < 8_000) return triVertIds as number[];

  const maxScrapTris = Math.min(400, Math.max(24, Math.floor(maxCompTris * 0.004)));
  let dropCount = 0;
  for (let t = 0; t < restTriCount; t += 1) {
    if (compTris[find(triW0[t]!)]! <= maxScrapTris) dropCount += 1;
  }
  if (dropCount === 0) return triVertIds as number[];

  const filtered = new Array<number>((restTriCount - dropCount) * 3);
  let out = 0;
  for (let t = 0; t < restTriCount; t += 1) {
    if (compTris[find(triW0[t]!)]! <= maxScrapTris) continue;
    const off = t * 3;
    filtered[out++] = triVertIds[off]!;
    filtered[out++] = triVertIds[off + 1]!;
    filtered[out++] = triVertIds[off + 2]!;
  }
  return filtered;
}

export function splitScanByScanbodies(
  source: THREE.BufferGeometry,
  fixtures: readonly MatchedScanbodyFixture[],
  texture?: THREE.Texture | null,
): { rest: THREE.BufferGeometry; scanbodies: Map<string, THREE.BufferGeometry> } {
  const scanbodies = new Map<string, THREE.BufferGeometry>();
  const pos = source.getAttribute("position");
  const xyz = readPositionArray(source);
  if (!pos || !xyz || pos.count < 3) {
    return { rest: source.clone(), scanbodies };
  }

  const index = source.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  if (triCount <= 0) return { rest: source.clone(), scanbodies };
  const vert = (t: number, c: number) => (index ? index.getX(t * 3 + c) : t * 3 + c);
  const withIndex = (ids: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(source.attributes)) g.setAttribute(name, attr);
    g.setIndex(ids);
    return g;
  };

  if (fixtures.length === 0) {
    if (triCount < 12_000) return { rest: source.clone(), scanbodies };
    const allIds = new Array<number>(triCount * 3);
    for (let t = 0; t < triCount; t += 1) {
      const off = t * 3;
      allIds[off] = vert(t, 0);
      allIds[off + 1] = vert(t, 1);
      allIds[off + 2] = vert(t, 2);
    }
    const cleaned = filterFloatingScanConfettiIndices(xyz, pos.count, allIds);
    if (cleaned.length === allIds.length) return { rest: source.clone(), scanbodies };
    return { rest: withIndex(cleaned), scanbodies };
  }

  const SECTORS = 36;
  const ROI_RAD_PAD_MM = 2.5;
  const ROI_TOP_PAD_MM = 1.6;
  const ROI_BOT_MM = -0.2;

  // 1) 픽스처별 월드 AABB 및 전체 합집합 AABB로 악궁 전체 삼각형의 90%+ 를 즉시 건너뛴다.
  let uMinX = Infinity;
  let uMinY = Infinity;
  let uMinZ = Infinity;
  let uMaxX = -Infinity;
  let uMaxY = -Infinity;
  let uMaxZ = -Infinity;
  const fixBounds = fixtures.map((f) => {
    const o = f.fixturePose.origin;
    const a = f.fixturePose.axis;
    const rMax = f.scanbodyRadiusMm + ROI_RAD_PAD_MM;
    const zMax = f.scanbodyHeightMm + ROI_TOP_PAD_MM;
    const rx = rMax * Math.sqrt(Math.max(0, 1 - a[0] * a[0]));
    const ry = rMax * Math.sqrt(Math.max(0, 1 - a[1] * a[1]));
    const rz = rMax * Math.sqrt(Math.max(0, 1 - a[2] * a[2]));
    const x0 = o[0] + ROI_BOT_MM * a[0];
    const x1 = o[0] + zMax * a[0];
    const y0 = o[1] + ROI_BOT_MM * a[1];
    const y1 = o[1] + zMax * a[1];
    const z0 = o[2] + ROI_BOT_MM * a[2];
    const z1 = o[2] + zMax * a[2];
    const minX = Math.min(x0, x1) - rx;
    const maxX = Math.max(x0, x1) + rx;
    const minY = Math.min(y0, y1) - ry;
    const maxY = Math.max(y0, y1) + ry;
    const minZ = Math.min(z0, z1) - rz;
    const maxZ = Math.max(z0, z1) + rz;
    if (minX < uMinX) uMinX = minX;
    if (maxX > uMaxX) uMaxX = maxX;
    if (minY < uMinY) uMinY = minY;
    if (maxY > uMaxY) uMaxY = maxY;
    if (minZ < uMinZ) uMinZ = minZ;
    if (maxZ > uMaxZ) uMaxZ = maxZ;
    return { o, a, rMax2: rMax * rMax, zMax, minX, maxX, minY, maxY, minZ, maxZ };
  });

  const roiTris: number[] = [];
  const fixRoiList: number[][] = fixtures.map(() => []);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = vert(t, 0) * 3;
    const x0 = xyz[i0]!;
    if (x0 < uMinX - 2.5 || x0 > uMaxX + 2.5) continue;
    const y0 = xyz[i0 + 1]!;
    if (y0 < uMinY - 2.5 || y0 > uMaxY + 2.5) continue;
    const z0 = xyz[i0 + 2]!;
    if (z0 < uMinZ - 2.5 || z0 > uMaxZ + 2.5) continue;

    const i1 = vert(t, 1) * 3;
    const i2 = vert(t, 2) * 3;
    const cx = (x0 + xyz[i1]! + xyz[i2]!) / 3;
    if (cx < uMinX || cx > uMaxX) continue;
    const cy = (y0 + xyz[i1 + 1]! + xyz[i2 + 1]!) / 3;
    if (cy < uMinY || cy > uMaxY) continue;
    const cz = (z0 + xyz[i1 + 2]! + xyz[i2 + 2]!) / 3;
    if (cz < uMinZ || cz > uMaxZ) continue;

    let ri = -1;
    for (let fi = 0; fi < fixBounds.length; fi += 1) {
      const fb = fixBounds[fi]!;
      if (
        cx < fb.minX ||
        cx > fb.maxX ||
        cy < fb.minY ||
        cy > fb.maxY ||
        cz < fb.minZ ||
        cz > fb.maxZ
      ) {
        continue;
      }
      const dx = cx - fb.o[0];
      const dy = cy - fb.o[1];
      const dz = cz - fb.o[2];
      const hz = dx * fb.a[0] + dy * fb.a[1] + dz * fb.a[2];
      if (hz < ROI_BOT_MM || hz > fb.zMax) continue;
      const rx = dx - fb.a[0] * hz;
      const ry = dy - fb.a[1] * hz;
      const rz = dz - fb.a[2] * hz;
      if (rx * rx + ry * ry + rz * rz <= fb.rMax2) {
        if (ri < 0) {
          ri = roiTris.length;
          roiTris.push(t);
        }
        fixRoiList[fi]!.push(ri);
      }
    }
  }

  const R = roiTris.length;
  if (R === 0) return { rest: source.clone(), scanbodies };

  // 2) ROI 삼각형 중심·법선·색상·공간 정점 용접(0.5µm) 인접 그래프 구성
  const col = source.getAttribute("color");
  const hasVertexColor = Boolean(col && col.itemSize >= 3 && col.count >= pos.count);
  const colorScale =
    hasVertexColor && col
      ? col.array instanceof Uint8Array
        ? 1 / 255
        : col.array instanceof Uint16Array
          ? 1 / 65535
          : 1
      : 1;

  const resolvedTex =
    texture ?? (source.userData?.scanTexture as THREE.Texture | null | undefined) ?? null;
  const uv = !hasVertexColor ? source.getAttribute("uv") : undefined;
  const texPixels =
    !hasVertexColor && uv && uv.itemSize >= 2 && uv.count >= pos.count
      ? readTexturePixelsForSplit(resolvedTex)
      : null;
  const texStride =
    texPixels && texPixels.data.length >= texPixels.width * texPixels.height * 4 ? 4 : 3;
  const texFlipY = resolvedTex ? resolvedTex.flipY !== false : true;
  const hasColor = hasVertexColor || Boolean(texPixels);

  const cxArr = new Float64Array(R);
  const cyArr = new Float64Array(R);
  const czArr = new Float64Array(R);
  const nxArr = new Float64Array(R);
  const nyArr = new Float64Array(R);
  const nzArr = new Float64Array(R);
  const rgbR = hasColor ? new Float32Array(R) : null;
  const rgbG = hasColor ? new Float32Array(R) : null;
  const rgbB = hasColor ? new Float32Array(R) : null;

  const vertWeld = new Int32Array(pos.count).fill(-1);
  const hashBuckets = new Map<number, number[]>();
  let nextW = 0;
  const weldVert = (vi: number): number => {
    const cached = vertWeld[vi]!;
    if (cached >= 0) return cached;
    const x = xyz[vi * 3]!;
    const y = xyz[vi * 3 + 1]!;
    const z = xyz[vi * 3 + 2]!;
    const qx = Math.round(x * 2000);
    const qy = Math.round(y * 2000);
    const qz = Math.round(z * 2000);
    const h = ((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) | 0;
    const bucket = hashBuckets.get(h);
    if (bucket) {
      for (let k = 0; k < bucket.length; k += 4) {
        if (bucket[k] === qx && bucket[k + 1] === qy && bucket[k + 2] === qz) {
          const w = bucket[k + 3]!;
          vertWeld[vi] = w;
          return w;
        }
      }
      const w = nextW++;
      bucket.push(qx, qy, qz, w);
      vertWeld[vi] = w;
      return w;
    }
    const w = nextW++;
    hashBuckets.set(h, [qx, qy, qz, w]);
    vertWeld[vi] = w;
    return w;
  };

  const edgeFirst = new Map<number, number>();
  const edgeExtra = new Map<number, number[]>();
  const adj: number[][] = Array.from({ length: R }, () => []);
  const edgeCountOfTri = new Uint8Array(R);
  let orientVote = 0;
  const refAxis = fixtures[0]!.fixturePose.axis;

  for (let ri = 0; ri < R; ri += 1) {
    const t = roiTris[ri]!;
    const vi0 = vert(t, 0);
    const vi1 = vert(t, 1);
    const vi2 = vert(t, 2);
    const i0 = vi0 * 3;
    const i1 = vi1 * 3;
    const i2 = vi2 * 3;
    const x0 = xyz[i0]!;
    const y0 = xyz[i0 + 1]!;
    const z0 = xyz[i0 + 2]!;
    const x1 = xyz[i1]!;
    const y1 = xyz[i1 + 1]!;
    const z1 = xyz[i1 + 2]!;
    const x2 = xyz[i2]!;
    const y2 = xyz[i2 + 1]!;
    const z2 = xyz[i2 + 2]!;

    cxArr[ri] = (x0 + x1 + x2) / 3;
    cyArr[ri] = (y0 + y1 + y2) / 3;
    czArr[ri] = (z0 + z1 + z2) / 3;

    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 1e-12) {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    }
    nxArr[ri] = nx;
    nyArr[ri] = ny;
    nzArr[ri] = nz;
    const dAx = nx * refAxis[0] + ny * refAxis[1] + nz * refAxis[2];
    if (Math.abs(dAx) > 0.72) orientVote += dAx;

    if (rgbR && rgbG && rgbB) {
      if (hasVertexColor && col) {
        rgbR[ri] = ((col.getX(vi0) + col.getX(vi1) + col.getX(vi2)) / 3) * colorScale;
        rgbG[ri] = ((col.getY(vi0) + col.getY(vi1) + col.getY(vi2)) / 3) * colorScale;
        rgbB[ri] = ((col.getZ(vi0) + col.getZ(vi1) + col.getZ(vi2)) / 3) * colorScale;
      } else if (texPixels && uv) {
        const uMean = (uv.getX(vi0) + uv.getX(vi1) + uv.getX(vi2)) / 3;
        const vMean = (uv.getY(vi0) + uv.getY(vi1) + uv.getY(vi2)) / 3;
        const uw = uMean - Math.floor(uMean);
        const vw = vMean - Math.floor(vMean);
        const px = Math.min(texPixels.width - 1, Math.max(0, Math.floor(uw * texPixels.width)));
        const py = Math.min(
          texPixels.height - 1,
          Math.max(0, Math.floor((texFlipY ? 1 - vw : vw) * texPixels.height)),
        );
        const off = (py * texPixels.width + px) * texStride;
        rgbR[ri] = (texPixels.data[off] ?? 0) / 255;
        rgbG[ri] = (texPixels.data[off + 1] ?? 0) / 255;
        rgbB[ri] = (texPixels.data[off + 2] ?? 0) / 255;
      }
    }

    const w0 = weldVert(vi0);
    const w1 = weldVert(vi1);
    const w2 = weldVert(vi2);
    const pairs = [w0, w1, w1, w2, w2, w0];
    for (let e = 0; e < 6; e += 2) {
      let a = pairs[e]!;
      let b = pairs[e + 1]!;
      if (a === b) continue;
      if (a > b) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      const ek = a * 2097152 + b;
      const first = edgeFirst.get(ek);
      if (first === undefined) {
        edgeFirst.set(ek, ri);
      } else {
        adj[first]!.push(ri);
        adj[ri]!.push(first);
        if (edgeCountOfTri[first]! < 3) edgeCountOfTri[first]! += 1;
        if (edgeCountOfTri[ri]! < 3) edgeCountOfTri[ri]! += 1;
        const extras = edgeExtra.get(ek);
        if (extras) {
          for (const ex of extras) {
            adj[ex]!.push(ri);
            adj[ri]!.push(ex);
          }
          extras.push(ri);
        } else {
          edgeExtra.set(ek, [ri]);
        }
      }
    }
  }

  if (orientVote < 0) {
    for (let ri = 0; ri < R; ri += 1) {
      nxArr[ri] = -nxArr[ri]!;
      nyArr[ri] = -nyArr[ri]!;
      nzArr[ri] = -nzArr[ri]!;
    }
  }

  const isCloserOrInsideOther = (
    px: number,
    py: number,
    pz: number,
    myR: number,
    skipIdx: number,
  ) => {
    for (let j = 0; j < fixtures.length; j += 1) {
      if (j === skipIdx) continue;
      const o = fixtures[j]!;
      const ox = px - o.fixturePose.origin[0];
      const oy = py - o.fixturePose.origin[1];
      const oz = pz - o.fixturePose.origin[2];
      const oh =
        ox * o.fixturePose.axis[0] +
        oy * o.fixturePose.axis[1] +
        oz * o.fixturePose.axis[2];
      if (oh < 0.5 || oh > o.scanbodyHeightMm + 0.8) continue;
      const or = Math.hypot(
        ox - o.fixturePose.axis[0] * oh,
        oy - o.fixturePose.axis[1] * oh,
        oz - o.fixturePose.axis[2] * oh,
      );
      if (or < myR - 0.04 || or <= o.scanbodyRadiusMm + 0.18) return true;
    }
    return false;
  };

  type Rgb3 = [number, number, number];
  const colorDist = (a: Rgb3, b: Rgb3) => {
    const la = (a[0] + a[1] + a[2]) / 3;
    const lb = (b[0] + b[1] + b[2]) / 3;
    return Math.hypot(
      (la - lb) * 0.65,
      (a[0] - a[1] - (b[0] - b[1])) * 2.2,
      (a[0] - a[2] - (b[0] - b[2])) * 2.0,
    );
  };
  const medianRgb = (samples: Rgb3[]): Rgb3 | null => {
    if (samples.length < 12) return null;
    const ch = (k: 0 | 1 | 2) => {
      const sorted = samples.map((x) => x[k]).sort((a, c) => a - c);
      return sorted[Math.floor(sorted.length / 2)]!;
    };
    return [ch(0), ch(1), ch(2)];
  };

  const owner = new Int32Array(R).fill(-1);

  // 3) 각 스캔바디마다 원통 축 미세 재중심화·외벽 반경·열구 바닥·색 모델을 구한 뒤 연결 영역 성장
  for (let fi = 0; fi < fixtures.length; fi += 1) {
    const f = fixtures[fi]!;
    const localList = fixRoiList[fi]!;
    if (localList.length === 0) continue;

    let [ox, oy, oz] = f.fixturePose.origin;
    const axis = f.fixturePose.axis;
    const e1 = norm(Math.abs(axis[2]) < 0.9 ? cross(axis, [0, 0, 1]) : cross(axis, [1, 0, 0]));
    const e2 = cross(axis, e1);
    const sbR = f.scanbodyRadiusMm;
    const sbH = f.scanbodyHeightMm;

    // 정합·캐시 포즈에 미세 수평 편심(<=0.42mm)이 있어도 실제 3D 스캔바디 기둥 중심에 맞춰 자른다.
    const centerVotesU: number[] = [];
    const centerVotesV: number[] = [];
    const minBarrelZ = Math.max(1.3, f.gingivaFloorMm + 0.55);
    const maxBarrelZ = sbH - 0.25;
    if (maxBarrelZ > minBarrelZ + 0.5) {
      for (const ri of localList) {
        const dx = cxArr[ri]! - ox;
        const dy = cyArr[ri]! - oy;
        const dz = czArr[ri]! - oz;
        const hz = dx * axis[0] + dy * axis[1] + dz * axis[2];
        if (hz < minBarrelZ || hz > maxBarrelZ) continue;
        const u = dx * e1[0] + dy * e1[1] + dz * e1[2];
        const v = dx * e2[0] + dy * e2[1] + dz * e2[2];
        const r = Math.hypot(u, v);
        if (r < sbR * 0.62 || r > sbR + 0.52) continue;
        if (isCloserOrInsideOther(cxArr[ri]!, cyArr[ri]!, czArr[ri]!, r, fi)) continue;
        const nAx = nxArr[ri]! * axis[0] + nyArr[ri]! * axis[1] + nzArr[ri]! * axis[2];
        if (Math.abs(nAx) > 0.44) continue;
        const nu = nxArr[ri]! * e1[0] + nyArr[ri]! * e1[1] + nzArr[ri]! * e1[2];
        const nv = nxArr[ri]! * e2[0] + nyArr[ri]! * e2[1] + nzArr[ri]! * e2[2];
        const nPerp = Math.hypot(nu, nv);
        if (nPerp < 0.72) continue;
        const radialDot = (u * nu + v * nv) / (r * nPerp);
        const tangCross = Math.abs(u * nv - v * nu) / (r * nPerp);
        // 평면 베벨 면은 법선이 반경 방향에서 벗어나므로 제외하고 원통 호(arc)만 투표에 사용한다.
        if (radialDot < 0.94 || tangCross > 0.26) continue;
        centerVotesU.push(u - sbR * (nu / nPerp));
        centerVotesV.push(v - sbR * (nv / nPerp));
      }
      if (centerVotesU.length >= 24) {
        centerVotesU.sort((a, c) => a - c);
        centerVotesV.sort((a, c) => a - c);
        let du = centerVotesU[Math.floor(centerVotesU.length / 2)]!;
        let dv = centerVotesV[Math.floor(centerVotesV.length / 2)]!;
        const shift = Math.hypot(du, dv);
        if (shift > 0.42) {
          const s = 0.42 / shift;
          du *= s;
          dv *= s;
        }
        ox += e1[0] * du + e2[0] * dv;
        oy += e1[1] * du + e2[1] * dv;
        oz += e1[2] * du + e2[2] * dv;
      }
    }

    const wallRBySec: number[][] = Array.from({ length: SECTORS }, () => []);
    const sulcBySec: number[][] = Array.from({ length: SECTORS }, () => []);
    const sbColorSamples: Rgb3[] = [];
    const tissueColorSamples: Rgb3[] = [];

    for (const ri of localList) {
      const dx = cxArr[ri]! - ox;
      const dy = cyArr[ri]! - oy;
      const dz = czArr[ri]! - oz;
      const hz = dx * axis[0] + dy * axis[1] + dz * axis[2];
      if (hz < 0.55 || hz > sbH + 1.0) continue;
      const u = dx * e1[0] + dy * e1[1] + dz * e1[2];
      const v = dx * e2[0] + dy * e2[1] + dz * e2[2];
      const r = Math.hypot(u, v);
      if (isCloserOrInsideOther(cxArr[ri]!, cyArr[ri]!, czArr[ri]!, r, fi)) continue;
      const b = Math.min(
        SECTORS - 1,
        Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * SECTORS)),
      );
      const rx = dx - axis[0] * hz;
      const ry = dy - axis[1] * hz;
      const rz = dz - axis[2] * hz;
      const nEr = r > 1e-4 ? (nxArr[ri]! * rx + nyArr[ri]! * ry + nzArr[ri]! * rz) / r : 0;
      const nAx = nxArr[ri]! * axis[0] + nyArr[ri]! * axis[1] + nzArr[ri]! * axis[2];

      if (
        r >= sbR * 0.65 &&
        r <= sbR + 0.34 &&
        hz >= Math.max(1.0, f.gingivaFloorMm + 0.25) &&
        hz <= sbH - 0.15 &&
        nEr > 0.48 &&
        Math.abs(nAx) < 0.62
      ) {
        wallRBySec[b]!.push(r);
      }

      if (rgbR && rgbG && rgbB) {
        const cSample: Rgb3 = [rgbR[ri]!, rgbG[ri]!, rgbB[ri]!];
        const lumSample = (cSample[0] + cSample[1] + cSample[2]) / 3;
        if (
          r <= sbR + 0.08 &&
          hz >= Math.max(1.4, f.gingivaFloorMm + 0.35) &&
          hz <= sbH + 0.12 &&
          (r <= sbR * 0.8 || (nEr > 0.45 && Math.abs(nAx) < 0.65))
        ) {
          sbColorSamples.push(cSample);
        } else if (
          lumSample >= 0.14 &&
          r >= sbR + 0.34 &&
          r <= sbR + 1.85 &&
          hz <= sbH - 0.45 &&
          nAx >= 0.72
        ) {
          tissueColorSamples.push(cSample);
        } else if (
          lumSample >= 0.14 &&
          r >= sbR + 0.45 &&
          r <= sbR + 2.2 &&
          nEr <= -0.35 &&
          hz >= f.gingivaFloorMm + 0.6
        ) {
          tissueColorSamples.push(cSample);
        }
      }

      // 열구 바닥은 분홍 치은·내향 커프만. 스캔바디 어깨(암적색 상향 면)를 넣으면 sulcZ가
      // 교합쪽으로 올라 마진이 잔여 선반에 붙는다.
      if (r >= sbR + 0.05 && r <= sbR + 0.95 && hz <= sbH - 0.55 && (nAx >= 0.70 || nEr <= -0.18)) {
        if (rgbR && rgbG && rgbB) {
          const cr = rgbR[ri]!;
          const cg = rgbG[ri]!;
          const lum = (cr + cg + rgbB[ri]!) / 3;
          const darkSbShelf = lum <= 0.37 && cg <= 0.22 && cr <= 0.64;
          if (darkSbShelf) {
            // skip — scanbody shoulder / bite collar, not gingiva floor
          } else {
            sulcBySec[b]!.push(hz);
          }
        } else {
          sulcBySec[b]!.push(hz);
        }
      }
    }

    const rawWallR = new Float64Array(SECTORS).fill(NaN);
    for (let b = 0; b < SECTORS; b += 1) {
      const arr = wallRBySec[b]!;
      if (arr.length >= 3) {
        arr.sort((a, c) => a - c);
        const q88 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.88))]!;
        rawWallR[b] = Math.max(sbR * 0.78, Math.min(sbR + 0.26, q88));
      }
    }
    const filledWallR = new Float64Array(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      if (Number.isFinite(rawWallR[b]!)) {
        filledWallR[b] = rawWallR[b]!;
        continue;
      }
      let found = sbR;
      for (let d = 1; d <= 6; d += 1) {
        const l = rawWallR[(b - d + SECTORS) % SECTORS]!;
        const r = rawWallR[(b + d) % SECTORS]!;
        if (Number.isFinite(l) && Number.isFinite(r)) {
          found = 0.5 * (l + r);
          break;
        }
        if (Number.isFinite(l)) {
          found = l;
          break;
        }
        if (Number.isFinite(r)) {
          found = r;
          break;
        }
      }
      filledWallR[b] = found;
    }
    const wallR = new Float64Array(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      wallR[b] =
        0.25 * filledWallR[(b - 1 + SECTORS) % SECTORS]! +
        0.5 * filledWallR[b]! +
        0.25 * filledWallR[(b + 1) % SECTORS]!;
    }

    const baseSulc = Math.max(0.75, f.gingivaFloorMm);
    const rawSulc = new Float64Array(SECTORS).fill(NaN);
    for (let b = 0; b < SECTORS; b += 1) {
      const arr = sulcBySec[b]!;
      if (arr.length >= 2) {
        arr.sort((a, c) => a - c);
        rawSulc[b] = arr[Math.floor(arr.length * 0.1)]!;
      }
    }
    const filledSulc = new Float64Array(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      if (Number.isFinite(rawSulc[b]!)) {
        filledSulc[b] = rawSulc[b]!;
        continue;
      }
      let found = baseSulc;
      for (let d = 1; d <= SECTORS / 2; d += 1) {
        const l = rawSulc[(b - d + SECTORS) % SECTORS]!;
        const r = rawSulc[(b + d) % SECTORS]!;
        if (Number.isFinite(l) && Number.isFinite(r)) {
          found = 0.5 * (l + r);
          break;
        }
        if (Number.isFinite(l)) {
          found = l;
          break;
        }
        if (Number.isFinite(r)) {
          found = r;
          break;
        }
      }
      filledSulc[b] = found;
    }
    const sulcZ = new Float64Array(SECTORS);
    for (let b = 0; b < SECTORS; b += 1) {
      const s =
        0.25 * filledSulc[(b - 1 + SECTORS) % SECTORS]! +
        0.5 * filledSulc[b]! +
        0.25 * filledSulc[(b + 1) % SECTORS]!;
      sulcZ[b] = Math.max(0.65, Math.min(sbH - 1.15, s));
    }

    const sbProto = medianRgb(sbColorSamples);
    const tisProto = medianRgb(tissueColorSamples);
    const tisLum = tisProto ? (tisProto[0] + tisProto[1] + tisProto[2]) / 3 : 0;
    const colorSep = sbProto && tisProto ? colorDist(sbProto, tisProto) : 0;
    const useColor = Boolean(sbProto && tisProto && colorSep >= 0.16);
    const looksClearlyHealthyTissue = (ri: number) => {
      if (!rgbR || !rgbG || !rgbB || !tisProto) return false;
      const c: Rgb3 = [rgbR[ri]!, rgbG[ri]!, rgbB[ri]!];
      const lum = (c[0] + c[1] + c[2]) / 3;
      // 암적색·적갈색 스캔바디 어깨는 치은으로 보지 않는다. 여기 걸리면 원심 선반이 남는다.
      if (lum <= 0.37 && c[1] <= 0.22 && c[0] <= 0.64) return false;
      if (colorDist(c, tisProto) <= 0.16) return true;
      // 분홍 치은: G≥0.22 (어깨 잔여 G≈0.19–0.21 과 구분).
      if (c[0] >= 0.44 && c[1] >= 0.22 && c[0] - c[1] >= 0.14) return true;
      if (c[0] >= 0.46 && c[1] >= 0.24 && c[2] >= 0.22) return true;
      return false;
    };
    const looksLikeScanbodyColor = (ri: number) => {
      if (!useColor || !rgbR || !rgbG || !rgbB || !sbProto || !tisProto) return false;
      const c: Rgb3 = [rgbR[ri]!, rgbG[ri]!, rgbB[ri]!];
      const dSb = colorDist(c, sbProto);
      const dTis = colorDist(c, tisProto);
      const lum = (c[0] + c[1] + c[2]) / 3;
      // 밝은 분홍 치은만 거절. 어두운 스캔바디 어깨(적갈색)는 R-G가 커도 치은이 아니다.
      if (
        lum > 0.30 &&
        c[0] > 0.34 &&
        c[0] - c[1] > 0.13 &&
        c[0] - c[2] > 0.08 &&
        dTis < dSb
      ) {
        return false;
      }
      return dSb <= Math.max(0.22, colorSep * 0.62) && dSb < dTis * 0.92;
    };
    // 스캔바디 칼라·어깨의 암적색 잔여(바이트 실리콘·조명 암부·플라스틱 선반) 판별
    const looksLikeDarkBiteCollarArtifact = (ri: number) => {
      if (!rgbR || !rgbG || !rgbB) return false;
      if (looksClearlyHealthyTissue(ri)) return false;
      const r0 = rgbR[ri]!;
      const g0 = rgbG[ri]!;
      const b0 = rgbB[ri]!;
      const lum = (r0 + g0 + b0) / 3;
      // 밝은 분홍 치은 제외
      if (r0 >= 0.50 && g0 >= 0.22 && r0 - g0 >= 0.14) return false;
      // 원심 어깨 잔여: lum~0.29–0.37·G~0.15–0.21 도 칼라로 본다.
      if (tisProto && tisLum >= 0.25) {
        return (
          lum <= Math.max(0.37, Math.min(0.38, tisLum * 0.92)) &&
          g0 <= Math.max(0.21, Math.min(0.22, tisProto[1] * 0.95)) &&
          r0 <= Math.max(0.62, Math.min(0.64, tisProto[0] * 1.02))
        );
      }
      return lum <= 0.37 && g0 <= 0.21 && r0 <= 0.64;
    };

    const triGeom = (ri: number) => {
      const dx = cxArr[ri]! - ox;
      const dy = cyArr[ri]! - oy;
      const dz = czArr[ri]! - oz;
      const hz = dx * axis[0] + dy * axis[1] + dz * axis[2];
      const u = dx * e1[0] + dy * e1[1] + dz * e1[2];
      const v = dx * e2[0] + dy * e2[1] + dz * e2[2];
      const r = Math.hypot(u, v);
      const b = Math.min(
        SECTORS - 1,
        Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * SECTORS)),
      );
      const rx = dx - axis[0] * hz;
      const ry = dy - axis[1] * hz;
      const rz = dz - axis[2] * hz;
      const nEr = r > 1e-4 ? (nxArr[ri]! * rx + nyArr[ri]! * ry + nzArr[ri]! * rz) / r : 0;
      const nAx = nxArr[ri]! * axis[0] + nyArr[ri]! * axis[1] + nzArr[ri]! * axis[2];
      return { hz, r, b, rw: wallR[b]!, sz: sulcZ[b]!, nEr, nAx };
    };

    const claimed = new Uint8Array(R);
    const queue: number[] = [];

    for (const ri of localList) {
      if (owner[ri]! >= 0) continue;
      const g = triGeom(ri);
      if (g.hz < 0.7 || g.hz > sbH + 0.55) continue;
      if (isCloserOrInsideOther(cxArr[ri]!, cyArr[ri]!, czArr[ri]!, g.r, fi)) continue;

      const isInnerOrCap =
        (g.r <= sbR * 0.76 && g.hz >= 0.8) ||
        (g.r <= Math.min(g.rw, sbR) - 0.02 && g.hz >= Math.max(1.1, sbH - 2.2));
      const isCoreWall =
        g.r <= Math.max(g.rw, sbR) + 0.14 &&
        g.hz >= Math.max(0.85, g.sz - 0.65) &&
        g.nEr > 0.42 &&
        Math.abs(g.nAx) < 0.66;
      // 원심 등에서 남는 상향 암적색 어깨/선반 — 수직 벽 시드에 못 들어가도 칼라로 시드한다.
      const isDarkShoulderShelf =
        looksLikeDarkBiteCollarArtifact(ri) &&
        g.r <= Math.max(g.rw, sbR) + 0.78 &&
        g.hz >= Math.max(0.95, g.sz - 0.35) &&
        g.hz <= sbH - 0.2 &&
        g.nAx >= 0.55 &&
        g.nEr >= -0.72;

      if (isInnerOrCap || isCoreWall || isDarkShoulderShelf) {
        claimed[ri] = 1;
        queue.push(ri);
      }
    }

    for (let head = 0; head < queue.length; head += 1) {
      const cur = queue[head]!;
      for (const nb of adj[cur]!) {
        if (claimed[nb] || owner[nb]! >= 0) continue;
        const g = triGeom(nb);
        if (g.hz < 0.6 || g.hz > sbH + 0.65) continue;
        const maxCoreR = Math.max(g.rw, sbR);
        const isDarkBite = looksLikeDarkBiteCollarArtifact(nb);
        if (g.r > maxCoreR + (isDarkBite ? 1.08 : 1.0)) continue;
        if (isCloserOrInsideOther(cxArr[nb]!, cyArr[nb]!, czArr[nb]!, g.r, fi)) continue;

        // 스크류홀 내면 및 베벨 안쪽 면
        if (g.r <= sbR * 0.78 && g.hz >= 0.7) {
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }
        // 수평 치은 바닥은 wallR 과대추정(평면 베벨) 시 안으로 오인될 수 있어 nAx 로 제외.
        if (
          g.r <= g.rw - 0.06 &&
          g.hz >= Math.max(0.95, g.sz + 0.15) &&
          g.nEr >= -0.2 &&
          g.nAx < 0.55
        ) {
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }

        // 스캔바디 축 안쪽을 바라보는 수직 인접치 인접면·출현 커프 내벽은 절대 넘지 않는다.
        // 벽 바로 밖 암적색 어깨(선반)만 nEr 음수 허용. 바깥 치간 암부는 수평막(nAx>=0.72)일 때만.
        if (g.nEr < -0.06) {
          const nearDarkShelf =
            isDarkBite &&
            g.r <= maxCoreR + 0.78 &&
            g.hz >= g.sz - 0.45 &&
            g.hz <= sbH - 0.35 &&
            g.nAx >= 0.55 &&
            g.nEr >= -0.72;
          const outerDarkFilm =
            isDarkBite &&
            g.r <= maxCoreR + 1.05 &&
            g.hz >= g.sz - 0.45 &&
            g.hz <= sbH - 0.35 &&
            g.nAx >= 0.72 &&
            g.nEr >= -0.62;
          if (nearDarkShelf || outerDarkFilm) {
            claimed[nb] = 1;
            queue.push(nb);
          }
          continue;
        }

        // Zone 1: 스캔바디 기둥·베벨·열구 경계 (r <= maxCoreR + 0.24)
        if (g.r <= maxCoreR + 0.24) {
          const isOutwardMeniscus =
            g.nEr >= 0.20 && g.nAx < 0.70 && !looksClearlyHealthyTissue(nb);
          const isDarkShelf =
            isDarkBite && g.nAx >= 0.55 && g.r <= maxCoreR + 0.78 && g.hz >= g.sz - 0.35;
          // wallR 이 공칭으로 부풀어 있어도(평면 베벨) 상향 열구·치은은 지킨다.
          if (
            g.hz < sbH - 0.8 &&
            g.nAx >= 0.7 &&
            !isDarkBite &&
            !isDarkShelf &&
            !isOutwardMeniscus
          ) {
            const nearSulcusDepth = g.hz <= g.sz + 0.65;
            const outsideFlatBevelNonSb =
              g.r >= Math.min(g.rw, sbR) + 0.02 &&
              (!useColor || !looksLikeScanbodyColor(nb));
            if (nearSulcusDepth || outsideFlatBevelNonSb) continue;
          }
          if (g.hz < g.sz - 0.85) continue;
          if (
            useColor &&
            g.r >= g.rw + 0.06 &&
            g.hz < g.sz + 0.45 &&
            g.nAx >= 0.48 &&
            !isDarkBite &&
            !isDarkShelf &&
            !isOutwardMeniscus &&
            !looksLikeScanbodyColor(nb)
          ) {
            continue;
          }
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }

        // Zone 1.5: 벽 바로 밖 암적색 어깨·선반 (원심 잔여가 주로 여기, r <= maxCoreR + 0.78)
        if (
          isDarkBite &&
          g.r <= maxCoreR + 0.78 &&
          g.hz >= g.sz - 0.45 &&
          g.hz <= sbH - 0.25 &&
          g.nAx >= 0.55 &&
          g.nEr >= -0.72
        ) {
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }

        // Zone 2A: 칼라 밖 검붉은 수평 바이트 막 (r <= maxCoreR + 1.05, 강한 상향만)
        if (
          isDarkBite &&
          g.r <= maxCoreR + 1.05 &&
          g.hz >= g.sz - 0.45 &&
          g.hz <= sbH - 0.3 &&
          g.nAx >= 0.70
        ) {
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }

        // Zone 2B: 스캔바디 벽에서 바깥 아래로 이어지는 짧은 외향 메니스커스 립 (r <= maxCoreR + 0.38)
        // 수평 치은 바닥(nAx 큼)은 제외 — 평면 베벨 바깥 분홍 보존.
        if (
          g.r <= maxCoreR + 0.38 &&
          g.hz >= g.sz - 0.25 &&
          g.hz <= sbH + 0.1 &&
          g.nEr >= 0.24 &&
          g.nAx < 0.70 &&
          !looksClearlyHealthyTissue(nb)
        ) {
          claimed[nb] = 1;
          queue.push(nb);
          continue;
        }

        // Zone 2C: 스캔바디 외벽에 붙어 뻗은 얇은 스캐너 잔여 막 (maxCoreR + 0.24 < r <= maxCoreR + 1.0)
        if (g.hz < g.sz + 0.25 || g.hz > sbH + 0.2) continue;
        if (g.nAx >= 0.58) continue;
        if (useColor) {
          if (!looksLikeScanbodyColor(nb)) continue;
          if (g.nEr < 0.2) continue;
        } else {
          if (g.r > maxCoreR + 0.34 || g.nEr < 0.48) continue;
        }
        claimed[nb] = 1;
        queue.push(nb);
      }
    }

    // 스캔바디 코어·어깨(r <= max(rw, sbR) + 0.65)에 완전히 갇힌 작은 구멍·섬(<= 48개 삼각형) 흡수
    const visitedUnclaimed = new Uint8Array(R);
    for (const ri of localList) {
      if (claimed[ri] || visitedUnclaimed[ri] || owner[ri]! >= 0) continue;
      const g0 = triGeom(ri);
      const islandDark = looksLikeDarkBiteCollarArtifact(ri);
      const islandPad = islandDark ? 0.80 : 0.28;
      if (g0.r > Math.max(g0.rw, sbR) + islandPad || g0.hz < g0.sz - 0.5) continue;
      // 상향 분홍 치은 바닥은 섬으로 삼키지 않는다(평면 베벨 바깥 보존). 암적 선반만 허용.
      if (
        g0.nAx >= 0.55 &&
        !islandDark &&
        !looksLikeScanbodyColor(ri)
      ) {
        continue;
      }
      const comp = [ri];
      visitedUnclaimed[ri] = 1;
      let escaped = false;
      for (let h = 0; h < comp.length; h += 1) {
        const u = comp[h]!;
        for (const nb of adj[u]!) {
          if (claimed[nb]) continue;
          if (owner[nb]! >= 0) {
            escaped = true;
            break;
          }
          const gn = triGeom(nb);
          if (gn.r > Math.max(gn.rw, sbR) + islandPad + 0.05 || gn.hz < gn.sz - 0.55) {
            escaped = true;
            break;
          }
          if (!visitedUnclaimed[nb]) {
            visitedUnclaimed[nb] = 1;
            comp.push(nb);
            if (comp.length > 48) {
              escaped = true;
              break;
            }
          }
        }
        if (escaped) break;
      }
      if (!escaped && comp.length <= 48) {
        for (const u of comp) claimed[u] = 1;
      }
    }

    // 절단 경계 톱니·외톨이 혀(dangling ear/sliver) 정리: 열린 절단선에 매달린 뾰족한 잔여 삼각형 반복 제거
    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false;
      for (const ri of localList) {
        if (claimed[ri] || owner[ri]! >= 0) continue;
        const g = triGeom(ri);
        const maxCoreR = Math.max(g.rw, sbR);
        const darkOrSb = looksLikeDarkBiteCollarArtifact(ri) || looksLikeScanbodyColor(ri);
        const nearDarkShelf =
          darkOrSb && g.r <= maxCoreR + 0.78 && g.nAx >= 0.55 && g.hz >= g.sz - 0.4;
        const maxPeelR = maxCoreR + (nearDarkShelf ? 0.80 : darkOrSb ? 1.08 : 0.88);
        if (g.r > maxPeelR || g.hz < g.sz - 0.5 || g.nEr < (nearDarkShelf ? -0.72 : darkOrSb ? -0.58 : -0.35)) {
          continue;
        }
        // 상향 비암적 치은 바닥은 peel 로 잠식하지 않는다.
        if (g.nAx >= 0.74 && !darkOrSb) continue;
        let cCnt = 0;
        let uCnt = 0;
        for (const nb of adj[ri]!) {
          if (claimed[nb]) cCnt += 1;
          else if (owner[nb]! < 0) uCnt += 1;
        }
        if (cCnt === 0) continue;
        const healthy = looksClearlyHealthyTissue(ri);
        if (
          (nearDarkShelf && cCnt >= 1 && !healthy) ||
          (cCnt >= 2 && (g.r <= maxCoreR + 0.24 ? g.nAx < 0.74 || !healthy : darkOrSb || !healthy)) ||
          (uCnt <= 1 && !healthy)
        ) {
          claimed[ri] = 1;
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const ri of localList) {
      if (claimed[ri]) owner[ri] = fi;
    }
  }

  const triOwner = new Int32Array(triCount).fill(-1);
  for (let ri = 0; ri < R; ri += 1) {
    const fi = owner[ri]!;
    if (fi >= 0) triOwner[roiTris[ri]!] = fi;
  }

  const rawRest: number[] = [];
  const parts: number[][] = fixtures.map(() => []);
  for (let t = 0; t < triCount; t += 1) {
    const a = vert(t, 0);
    const b = vert(t, 1);
    const c = vert(t, 2);
    const fi = triOwner[t]!;
    if (fi >= 0) parts[fi]!.push(a, b, c);
    else rawRest.push(a, b, c);
  }

  const rest = filterFloatingScanConfettiIndices(xyz, pos.count, rawRest);
  fixtures.forEach((f, k) => {
    if (parts[k]!.length > 0) scanbodies.set(f.toothNumber, withIndex(parts[k]!));
  });
  return { rest: withIndex(rest), scanbodies };
}

/**
 * 크라운 작업 스캔 다운로드본(`meshesToLabMeshData`)이 다시 의뢰 구강스캔으로 올라온 경우,
 * 악궁 메시 뒤에 붙어 있는 이전 커스텀어벗 삼각형(단색 금색 `0xd4c59e` 비색인 수프·분리 셸)을 제거한다.
 * 인덱스에서 빠진 원본 스캔바디 미참조 정점(`parent[v] === -1`)은 스캔바디 정합에 쓰이므로 그대로 남긴다.
 */
export function stripBakedAbutmentTrianglesFromJawGeometry(
  geometry: THREE.BufferGeometry,
): boolean {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!pos || !index || pos.count < 500 || index.count < 1500) return false;
  const vCount = pos.count;
  const triCount = Math.floor(index.count / 3);
  if (triCount < 500) return false;

  const parent = new Int32Array(vCount).fill(-1);
  const find = (start: number): number => {
    let x = start;
    while (parent[x]! !== x) {
      const next = parent[x]!;
      parent[x] = parent[next]!;
      x = next;
    }
    return x;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    const a = index.getX(base);
    const b = index.getX(base + 1);
    const c = index.getX(base + 2);
    if (a < 0 || b < 0 || c < 0 || a >= vCount || b >= vCount || c >= vCount) continue;
    if (parent[a]! < 0) parent[a] = a;
    if (parent[b]! < 0) parent[b] = b;
    if (parent[c]! < 0) parent[c] = c;
    unite(a, b);
    unite(b, c);
  }

  const compVertCount = new Int32Array(vCount);
  let maxCompVerts = 0;
  for (let v = 0; v < vCount; v += 1) {
    if (parent[v]! < 0) continue;
    const r = find(v);
    const next = (compVertCount[r] ?? 0) + 1;
    compVertCount[r] = next;
    if (next > maxCompVerts) maxCompVerts = next;
  }
  if (maxCompVerts < 500) return false;

  const color = geometry.getAttribute("color");
  const hasColor = Boolean(color && color.itemSize >= 3 && color.count >= vCount);
  const dropComp = new Uint8Array(vCount);

  if (hasColor && color) {
    const compGoldCount = new Int32Array(vCount);
    const isGold = (r: number, g: number, b: number): boolean => {
      const linMatch =
        Math.abs(r - 0.6584) <= 0.045 &&
        Math.abs(g - 0.5605) <= 0.045 &&
        Math.abs(b - 0.3419) <= 0.045;
      if (linMatch) return true;
      return (
        Math.abs(r - 0.8314) <= 0.045 &&
        Math.abs(g - 0.7725) <= 0.045 &&
        Math.abs(b - 0.6196) <= 0.045
      );
    };
    const scale =
      !color.normalized &&
      (color.array instanceof Uint8Array ||
        color.array instanceof Uint16Array ||
        color.array instanceof Uint32Array)
        ? 1 / 255
        : 1;
    for (let v = 0; v < vCount; v += 1) {
      if (parent[v]! < 0) continue;
      const r = color.getX(v) * scale;
      const g = color.getY(v) * scale;
      const b = color.getZ(v) * scale;
      if (isGold(r, g, b)) {
        compGoldCount[find(v)]! += 1;
      }
    }
    const maxRemovable = Math.floor(maxCompVerts * 0.45);
    for (let r = 0; r < vCount; r += 1) {
      const count = compVertCount[r]!;
      if (count >= 3 && count <= maxRemovable && compGoldCount[r] === count) {
        dropComp[r] = 1;
      }
    }
  } else if (maxCompVerts >= 2000) {
    let isolatedTriCount = 0;
    for (let t = 0; t < triCount; t += 1) {
      const a = index.getX(t * 3);
      if (a >= 0 && a < vCount && parent[a]! >= 0 && compVertCount[find(a)] === 3) {
        isolatedTriCount += 1;
      }
    }
    if (isolatedTriCount >= 500) {
      for (let r = 0; r < vCount; r += 1) {
        if (compVertCount[r] === 3) dropComp[r] = 1;
      }
    }
  }

  let keptTriCount = 0;
  let droppedTriCount = 0;
  for (let t = 0; t < triCount; t += 1) {
    const a = index.getX(t * 3);
    if (a >= 0 && a < vCount && parent[a]! >= 0 && dropComp[find(a)] === 1) {
      droppedTriCount += 1;
    } else {
      keptTriCount += 1;
    }
  }
  if (droppedTriCount === 0 || keptTriCount < 100) return false;

  const remap = new Int32Array(vCount).fill(-1);
  let nextVertCount = 0;
  for (let v = 0; v < vCount; v += 1) {
    if (parent[v]! >= 0 && dropComp[find(v)] === 1) continue;
    remap[v] = nextVertCount;
    nextVertCount += 1;
  }

  for (const [name, attr] of Object.entries(geometry.attributes)) {
    if (!(attr instanceof THREE.BufferAttribute) || attr.isInterleavedBufferAttribute) continue;
    if (attr.count !== vCount) continue;
    const itemSize = attr.itemSize;
    const Ctor = attr.array.constructor as { new (length: number): THREE.TypedArray };
    const nextArr = new Ctor(nextVertCount * itemSize);
    const srcArr = attr.array;
    for (let v = 0; v < vCount; v += 1) {
      const dst = remap[v]!;
      if (dst < 0) continue;
      const srcOff = v * itemSize;
      const dstOff = dst * itemSize;
      for (let k = 0; k < itemSize; k += 1) {
        nextArr[dstOff + k] = srcArr[srcOff + k]!;
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(nextArr, itemSize, attr.normalized));
  }

  const nextIndices =
    nextVertCount > 65535 ? new Uint32Array(keptTriCount * 3) : new Uint16Array(keptTriCount * 3);
  let writeAt = 0;
  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    const a = index.getX(base);
    const b = index.getX(base + 1);
    const c = index.getX(base + 2);
    if (a >= 0 && a < vCount && parent[a]! >= 0 && dropComp[find(a)] === 1) continue;
    const na = a >= 0 && a < vCount ? remap[a]! : -1;
    const nb = b >= 0 && b < vCount ? remap[b]! : -1;
    const nc = c >= 0 && c < vCount ? remap[c]! : -1;
    if (na < 0 || nb < 0 || nc < 0) continue;
    nextIndices[writeAt] = na;
    nextIndices[writeAt + 1] = nb;
    nextIndices[writeAt + 2] = nc;
    writeAt += 3;
  }
  geometry.setIndex(
    new THREE.BufferAttribute(
      writeAt === nextIndices.length ? nextIndices : nextIndices.subarray(0, writeAt),
      1,
    ),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

export { basisRotation, type Mat3 };
