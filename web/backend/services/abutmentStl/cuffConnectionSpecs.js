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
// - 모든 브랜드 테이퍼는 11°. 원점에서 taperHeightMm 위까지가 스펙 원뿔 끝(Z_a)이다.
// - STL·PRC가 같이 깎는 11° 면은 Z_a가 아니라 prcConeHeightMm.
//   Regular RH는 원점 직경(Z=0) 직상방. 덴티움 0.33, 덴티스·메가젠 0.4, 그 외 PRC_CONE_TOP_MM(0.3).
//   미니·내로우 11° 면은 아직 Regular처럼 안 맞췄다. 스펙이 있으면 임시로 Z_a+0.1.
//   샘플이 spec-pending이면 준비 카드에 「PRC와 STL 11° 콘 설정을 다시 하세요」가 뜬다.
//   짧은 원뿔은 connectionTaperFill이 이 높이까지 잇고, 그보다 긴 11°는 그 면에서 잘라 낸다.
//   커프 이음은 그 면에서 2°로 출발한다.
// - 형상 검증에 쓰는 테이퍼 끝 직경 = originDiameter + 2·tan(11°)·taperHeightMm (스펙 Z_a).
// - 매칭은 입력된 임플란트 스펙(제조사|브랜드|규격) 기준. STL 형상으로 브랜드를 추정하지 않는다.
//
// [임플란트 종류 추가]
// 1) 여기 CUFF_CONNECTION_SPECS에 originDiameter·taperHeightMm을 등록한다(샘플 규칙: cuff-connection-spec.mdc).
// 2) Regular RH의 PRC 11° 상단은 브랜드 원점 직경 기준.
//    덴티움 0.33, 덴티스 SQ·One-Q와 메가젠 AnyOne 0.4, 그 외 0.3.
// 3) 면을 다른 높이로 쓰려면 PRC_CONE_TOP_MM(또는 브랜드 prcConeTopMm)과
//    AcroDent/2_Connection·1_Face Hole 원점 Z 묶음(11° 원뿔·Face Hole·시리얼·Rough·헥스·컷오프·페이스 드릴)을 같은 Δ로 같이 바꾼다.
//    PRC에는 주석을 달지 않는다. SSOT: bg/pc1/esprit-addin/rules.md §7.
// 4) 미니·내로우는 샘플이 모일 때까지 3)을 보류한다. spec-pending 카드에 콘 재설정 안내가 뜬다.
//
// [PRC 변경]
// - Z[#520+#523±N]은 한 묶음이다. 11° 원뿔·Face Hole 스텝 드릴·시리얼·Rough·헥스·컷오프·페이스 드릴을 같은 Δ로 한꺼번에 옮긴다.
//   원뿔만 올리면 헥스가 픽스쳐에 걸린다. PRC에는 주석 금지. 센터드릴 Z[#523+1.33]은 묶음 밖.
// - git의 AcroDent PRC는 운영 PC 애드인 폴더에 복사해야 반영된다. Esprit은 저장소가 아니라 로컬 AcroDent를 읽는다.
//
// 값 출처: 2026-09-28 Test DB filled STL 131건 역측정(브랜드별 최대 12건, 불량·메타 오류 샘플 제외).
//
// [스펙 미등록 — 샘플 올라오면 여기 채운다]
// 아래 키로 들어온 의뢰는 cuffBlend.status="spec-pending"이 되고,
// 제조사 준비 탭 의뢰카드에 빨간 테두리 +「개발팀 확인 필요」가 뜬다.
// 미니·내로우이면 「PRC와 STL 11° 콘 설정을 다시 하세요」를 같이 띄운다.
// 개발팀이 해당 filled STL의 테이퍼 끝 높이를 재서 CUFF_CONNECTION_SPECS에 추가하고, 이 목록에서 뺀다.
// 측정: scripts/abutment-stl-js/measure-cuff-connection.js --pending (턱 있는 샘플 3건 이상이 ±0.03mm로 모일 때만 등록).
// PRC(AcroDent/2_Connection)는 있는데 테이퍼 값이 없는 커넥션 (2026-10-20 Test DB 기준):
// - DIO UF Narrow (UF_NH)                      : 샘플 1건 (원뿔 끝 0.42, 턱 없음)
// - MEGAGEN AnyOne Internal Mini (AnyOne_MH)   : 샘플 1건 (원뿔 끝 0.82, 원점 3.093)
// - MEGAGEN MiNi Internal (MiNi_H)             : 샘플 2건, 둘 다 11° 원뿔 없음
// - NEOBIOTECH IS2·IS3·ALX Small Narrow (IS_SNH), DENTIS SQ·One-Q Mini (SQ_MH)·Narrow (SQ_NH) : 샘플 없음
// - MEGAGEN ARi·ARO : PRC 없음
// - NEOBIOTECH IS2 중 테이퍼가 더 긴 변형(끝 직경 약 3.45) : IS 스펙과 안 맞으면 spec-pending으로 뜬다

export const TAPER_ANGLE_DEG = 11;
export const TAPER_SLOPE = Math.tan((TAPER_ANGLE_DEG * Math.PI) / 180);
/**
 * Regular RH 기본 커넥션 Finish 11° 상단. 원점 직경이 되는 높이(Z=0)의 +Z.
 * 덴티움은 0.33, 덴티스 SQ·One-Q와 메가젠 AnyOne은 0.4, 그 외 Regular RH는 0.3.
 */
export const PRC_CONE_TOP_MM = 0.3;

/** prcConeTopMm이 없는 커넥션(미니·내로우)의 임시 PRC 면. Z_a + 이 값. Regular처럼 브랜드별로 맞추기 전. */
export const PRC_FACE_ABOVE_ZA_MM = 0.1;

/** 원점 → PRC 11° 면. Regular RH는 덴티움 0.33, 덴티스·메가젠 0.4, 그 외 0.3mm. */
export function prcConeHeightMm(spec) {
  const za = Number(spec?.taperHeightMm);
  if (!Number.isFinite(za)) return null;
  const fixed = Number(spec?.prcConeTopMm);
  if (Number.isFinite(fixed)) return fixed;
  return za + PRC_FACE_ABOVE_ZA_MM;
}

/**
 * @typedef {{
 *   key: string,
 *   aliases?: string[],
 *   originDiameter: number,
 *   taperHeightMm: number,
 *   prcConeTopMm?: number,
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
    prcConeTopMm: PRC_CONE_TOP_MM,
    samples: 13,
  },
  { key: "DIO|UF|REGULAR", originDiameter: 3.35, taperHeightMm: 0.2, prcConeTopMm: PRC_CONE_TOP_MM, samples: 7 },
  // 테이퍼 끝 직경 3.416
  {
    key: "NEOBIOTECH|IS|REGULAR",
    aliases: [
      "NEOBIOTECH|ALX|REGULAR",
      "NEOBIOTECH|IS2|REGULAR",
      "NEOBIOTECH|IS3|REGULAR",
      "NEOBIOTECH|ISALX|REGULAR",
    ],
    originDiameter: 3.35,
    taperHeightMm: 0.17,
    prcConeTopMm: PRC_CONE_TOP_MM,
    samples: 17,
  },
  { key: "DENTIS|ONEQ|REGULAR", originDiameter: 3.35, taperHeightMm: 0.17, prcConeTopMm: 0.4, samples: 6 },
  // 테이퍼 끝 직경 3.464. SQ는 파일마다 원점 높이가 달라(실측 원점 직경 3.296~3.348) taperTopZ가 0.33~0.43으로 흩어진다.
  // 원점 보정 후 끝 직경은 3.463~3.466으로 모인다(4건). 끝 직경이 3.426/3.414인 변형은 OSSTEM·NEOBIOTECH 스펙으로 매칭된다.
  { key: "DENTIS|SQ|REGULAR", originDiameter: 3.35, taperHeightMm: 0.295, prcConeTopMm: 0.4, samples: 4 },
  // Implantium·Superline2는 SuperLine과 같은 커넥션이다. 이 둘은 기공소가 원뿔을 스펙보다 길게 이어 그리는 파일이 많아
  // 원뿔이 Z_a보다 위까지 이어져도 기공소 연장으로 보고 Z_a부터 잇는다(labExtendsTaper).
  {
    key: "DENTIUM|SUPERLINE|REGULAR",
    aliases: ["DENTIUM|IMPLANTIUM|REGULAR", "DENTIUM|SUPERLINE2|REGULAR"],
    originDiameter: 3.33,
    taperHeightMm: 0.22,
    prcConeTopMm: 0.33,
    labExtendsTaper: true,
    samples: 5,
  },
  {
    key: "MEGAGEN|ANYONE|REGULAR",
    aliases: ["MEGAGEN|ANYONEINTERNAL|REGULAR"],
    originDiameter: 3.3,
    taperHeightMm: 0.3,
    prcConeTopMm: 0.4,
    samples: 13,
  },
  // 테이퍼 끝 직경 2.888. 원뿔 끝 0.72~0.74가 5건이고, 0.82(턱 0.1mm)·1.02처럼 기공소가 원뿔을 더 길게 그린 파일이 섞인다.
  {
    key: "OSSTEM|TS3|MINI",
    aliases: ["OSSTEM|TS|MINI"],
    originDiameter: 2.6,
    taperHeightMm: 0.74,
    labExtendsTaper: true,
    samples: 7,
  },
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
