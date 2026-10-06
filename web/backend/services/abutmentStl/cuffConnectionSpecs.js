// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/SelfInspectionReportModal.tsx (원점 직경 diameterRef)
// - web/backend/rules.md (커프 이음부 G2 보정)
// - web/backend/scripts/abutment-stl-js/measure-cuff-connection.js
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs (connectionTopZ → Middle Xk)
// - .cursor/rules/cuff-connection-spec.mdc
//
// 커넥션 11° 테이퍼 스펙 SSOT. 커프 이음부 G2 보정과 Re(커프 재디자인)가 보호하는 제조사 영역의 상단(Z_a)을 정한다.
//
// - 원점 = 브랜드별 원점 직경(originDiameter, 자체검사 diameterRef)이 되는 높이. 정렬 단계가 그 높이를 Z=0으로 둔다.
// - 모든 브랜드 테이퍼는 11°. 원점에서 taperHeightMm 위까지가 제조사 커넥션이다(Z_a = taperHeightMm).
// - 형상 검증에 쓰는 테이퍼 끝 직경 = originDiameter + 2·tan(11°)·taperHeightMm.
// - 매칭은 입력된 임플란트 스펙(제조사|브랜드|규격) 기준. STL 형상으로 브랜드를 추정하지 않는다.
//
// 값 출처: 2026-09-28 Test DB filled STL 131건 역측정(브랜드별 최대 12건, 불량·메타 오류 샘플 제외).
//
// [스펙 미등록 — 샘플 올라오면 여기 채운다]
// 아래 키로 들어온 의뢰는 cuffBlend.status="spec-pending"이 되고,
// 제조사 준비 탭 의뢰카드에 빨간 테두리 +「개발팀 확인 필요」가 뜬다.
// 개발팀이 해당 filled STL의 테이퍼 끝 높이를 재서 CUFF_CONNECTION_SPECS에 추가하고, 이 목록에서 뺀다.
// 측정: scripts/abutment-stl-js/measure-cuff-connection.js --pending (턱 있는 샘플 3건 이상이 ±0.03mm로 모일 때만 등록).
// - DENTIS SQ Regular            : 형상 3종 혼재
// - DIO UF Narrow                : 샘플 1건
// - MEGAGEN AnyOne Mini / Mini Internal, NEOBIOTECH Small Narrow, DENTIS Mini·Narrow, MEGAGEN ARi : 샘플 없음·메타 오류
// - NEOBIOTECH IS2 중 테이퍼가 더 긴 변형(끝 직경 약 3.45) : IS 스펙과 안 맞으면 spec-pending으로 뜬다

export const TAPER_ANGLE_DEG = 11;
export const TAPER_SLOPE = Math.tan((TAPER_ANGLE_DEG * Math.PI) / 180);

/**
 * @typedef {{
 *   key: string,
 *   aliases?: string[],
 *   originDiameter: number,
 *   taperHeightMm: number,
 *   labExtendsTaper?: boolean,
 *   samples: number,
 * }} CuffConnectionSpec
 */

/** @type {CuffConnectionSpec[]} */
export const CUFF_CONNECTION_SPECS = [
  // 테이퍼 끝 직경 3.428
  {
    key: "OSSTEM|TS3|REGULAR",
    aliases: ["OSSTEM|TS|REGULAR"],
    originDiameter: 3.35,
    taperHeightMm: 0.2,
    samples: 13,
  },
  { key: "DIO|UF|REGULAR", originDiameter: 3.35, taperHeightMm: 0.2, samples: 7 },
  // 테이퍼 끝 직경 3.416
  {
    key: "NEOBIOTECH|IS|REGULAR",
    aliases: ["NEOBIOTECH|ALX|REGULAR", "NEOBIOTECH|IS2|REGULAR", "NEOBIOTECH|ISALX|REGULAR"],
    originDiameter: 3.35,
    taperHeightMm: 0.17,
    samples: 17,
  },
  { key: "DENTIS|ONEQ|REGULAR", originDiameter: 3.35, taperHeightMm: 0.17, samples: 6 },
  // Implantium·Superline2는 SuperLine과 같은 커넥션이다. 이 둘은 기공소가 원뿔을 스펙보다 길게 이어 그리는 파일이 많아
  // 원뿔이 Z_a보다 위까지 이어져도 기공소 연장으로 보고 Z_a부터 잇는다(labExtendsTaper).
  {
    key: "DENTIUM|SUPERLINE|REGULAR",
    aliases: ["DENTIUM|IMPLANTIUM|REGULAR", "DENTIUM|SUPERLINE2|REGULAR"],
    originDiameter: 3.33,
    taperHeightMm: 0.22,
    labExtendsTaper: true,
    samples: 5,
  },
  {
    key: "MEGAGEN|ANYONE|REGULAR",
    aliases: ["MEGAGEN|ANYONEINTERNAL|REGULAR"],
    originDiameter: 3.3,
    taperHeightMm: 0.3,
    samples: 13,
  },
  // 테이퍼 끝 직경 2.866
  { key: "OSSTEM|TS3|MINI", originDiameter: 2.6, taperHeightMm: 0.68, samples: 2 },
];

const normalizeToken = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export function cuffConnectionSpecKey(caseInfos) {
  const ci = caseInfos || {};
  return [ci.implantManufacturer, ci.implantBrand, ci.implantFamily].map(normalizeToken).join("|");
}

const SPEC_BY_KEY = new Map();
for (const spec of CUFF_CONNECTION_SPECS) {
  SPEC_BY_KEY.set(spec.key, spec);
  for (const alias of spec.aliases || []) SPEC_BY_KEY.set(alias, spec);
}

/** @returns {{ key: string, spec: CuffConnectionSpec | null }} */
export function resolveCuffConnectionSpec(caseInfos) {
  const key = cuffConnectionSpecKey(caseInfos);
  return { key, spec: SPEC_BY_KEY.get(key) || null };
}

export function taperTopDiameterOf(spec) {
  return spec.originDiameter + 2 * TAPER_SLOPE * spec.taperHeightMm;
}
