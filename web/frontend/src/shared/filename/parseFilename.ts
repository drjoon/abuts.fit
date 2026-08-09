// change-log:
// - 2026-08-09: 치아번호 없는 구강 스캔 파일명에서도 한글 토큰으로 환자/치과 후보 추출.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/**
 * STL 파일명에서 치과이름, 환자이름, 치아번호를 추출하는 유틸리티
 *
 * 예상 형식:
 * - "치과이름_환자이름_치아번호.stl"
 * - "치과이름-환자이름-치아번호.stl"
 * - "치과이름 환자이름 치아번호.stl"
 */

export interface ParsedFilenameInfo {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
}

/**
 * 치아번호 패턴 (대한민국/FDI 표기법)
 * 단일: 11-18, 21-28, 31-38, 41-48
 * 브리지: 32-42, 11-13 등 (숫자-숫자 형태)
 *
 * 숫자 lookaround로 날짜(YYYYMMDD) 내부 부분일치(예: 20260804 → 26)를 막고,
 * `_32`처럼 underscore 인접 치식은 허용한다. (`\b`는 `_`를 단어로 봐서 실패함)
 * 파일명 끝쪽 토큰을 우선하므로 전역 매칭 후 마지막 후보를 사용한다.
 */
const TOOTH_PATTERN = /(?<!\d)([1-4][1-8])(?!\d)/g;
const BRIDGE_PATTERN = /(?<!\d)([1-4][1-8])-([1-4][1-8])(?!\d)/g;

/**
 * 파일명에서 치아번호 추출 (브리지 우선, 가장 오른쪽 후보)
 * 브리지(예: 32-42)가 있으면 브리지 반환, 없으면 단일 치아번호 반환
 */
function extractTooth(filename: string): string | undefined {
  // 1. 브리지 패턴 먼저 확인 (예: 32-42) — 가장 오른쪽
  let lastBridge: string | undefined;
  for (const bridgeMatch of filename.matchAll(BRIDGE_PATTERN)) {
    lastBridge = `${bridgeMatch[1]}-${bridgeMatch[2]}`;
  }
  if (lastBridge) return lastBridge;

  // 2. 단일 치아번호 — 가장 오른쪽 (환자명 뒤 치식이 일반적)
  let lastTooth: string | undefined;
  for (const match of filename.matchAll(TOOTH_PATTERN)) {
    lastTooth = match[1];
  }
  return lastTooth;
}

/**
 * 파일명을 구분자(_, -, 공백)로 분할
 */
function splitFilename(filename: string): string[] {
  // 확장자 제거
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // 구분자로 분할 (_, -, 공백)
  const parts = nameWithoutExt
    .split(/[_\-\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return parts;
}

/**
 * 파일명에서 환자이름 추출 (치아번호 제외)
 */
function extractPatientName(
  parts: string[],
  toothIndex: number
): string | undefined {
  if (toothIndex < 0 || toothIndex >= parts.length) return undefined;

  // 치아번호 앞쪽 파츠들 중, 한글이 포함된 가장 오른쪽 파트를 환자이름으로 간주
  for (let i = toothIndex - 1; i >= 0; i--) {
    const raw = parts[i];
    if (!/[가-힣]/.test(raw)) {
      continue;
    }

    // 앞쪽에 붙은 날짜/숫자(예: 20251119김혜영) 제거
    const stripped = raw.replace(/^[0-9]+[_\-\s]*/, "");
    const name = stripped.length > 0 ? stripped : raw;
    if (name) return name;
  }

  return undefined;
}

/**
 * 파일명에서 치과이름 추출
 */
function extractClinicName(
  parts: string[],
  toothIndex: number,
  patientIndex: number
): string | undefined {
  // 치과이름은 환자이름 앞의 파트들 중, 한글이 포함되고 순수 숫자가 아닌 파트들을 결합
  // patientIndex == 0 이면 환자 앞에 치과 후보 없음
  const endIndex = patientIndex >= 0 ? patientIndex : toothIndex;
  if (endIndex <= 0) return undefined;

  const clinicParts: string[] = [];
  for (let i = 0; i < endIndex; i++) {
    const token = parts[i];
    // 순수 숫자(날짜 등)는 치과이름에서 제외
    if (/^[0-9]+$/.test(token)) continue;
    // 한글이 하나도 없으면 치과이름 후보로 보지 않음
    if (!/[가-힣]/.test(token)) continue;
    // 앞에 붙은 날짜 숫자 제거 (예: 20251119고운치과)
    const stripped = token.replace(/^[0-9]+/, "");
    if (stripped) clinicParts.push(stripped);
  }

  if (clinicParts.length === 0) return undefined;
  return clinicParts.join(" ");
}

/**
 * STL 파일명에서 치과이름, 환자이름, 치아번호 추출
 *
 * @param filename - STL 파일명 (확장자 포함)
 * @returns 추출된 정보 객체
 */
export function parseFilename(filename: string): ParsedFilenameInfo {
  const result: ParsedFilenameInfo = {};

  // 1. 치아번호 추출
  const tooth = extractTooth(filename);
  if (tooth) {
    result.tooth = tooth;
  }

  // 2. 파일명을 구분자로 분할
  const parts = splitFilename(filename);
  if (parts.length === 0) {
    return result;
  }

  // 3. 치아번호의 위치 찾기 (브리지 또는 단일) — 가장 오른쪽 토큰 우선
  let toothIndex = -1;

  const isBridgeToken = (p: string) =>
    /(?<!\d)([1-4][1-8])-([1-4][1-8])(?!\d)/.test(p);
  const isToothToken = (p: string) => /(?<!\d)([1-4][1-8])(?!\d)/.test(p);

  for (let i = parts.length - 1; i >= 0; i--) {
    if (isBridgeToken(parts[i])) {
      toothIndex = i;
      break;
    }
  }
  if (toothIndex < 0) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isToothToken(parts[i])) {
        toothIndex = i;
        break;
      }
    }
  }

  if (toothIndex >= 0) {
    // 환자이름 추출
    const patientName = extractPatientName(parts, toothIndex);
    if (patientName) {
      result.patientName = patientName;
    }

    // 치과이름: 환자 토큰의 실제 위치 앞까지만 (브리지가 32/42로 쪼개져도 환자명 오인 방지)
    const actualPatientIndex = patientName
      ? parts.findIndex((p) => {
          const stripped = p.replace(/^[0-9]+[_\-\s]*/, "");
          return stripped === patientName || p === patientName;
        })
      : -1;

    const clinicName = extractClinicName(
      parts,
      toothIndex,
      actualPatientIndex
    );
    if (clinicName) {
      result.clinicName = clinicName;
    }
  } else {
    // 치아번호가 없는 구강 스캔 등: 한글 토큰을 환자/치과 후보로 사용
    const hangulParts = parts
      .map((p) => p.replace(/^[0-9]+/, ""))
      .filter((p) => /[가-힣]/.test(p));
    const hasScanToken = parts.some((p) =>
      /jaw|bite|scan|upper|lower|occlusion|모델|스캔|인상/i.test(p),
    );

    if (hangulParts.length === 1) {
      result.patientName = hangulParts[0];
    } else if (hangulParts.length >= 2 && hasScanToken) {
      result.patientName = hangulParts[hangulParts.length - 1];
      result.clinicName = hangulParts.slice(0, -1).join(" ");
    } else if (hangulParts.length >= 2) {
      // 치과+환자 형태 추정 (마지막 한글 = 환자)
      result.patientName = hangulParts[hangulParts.length - 1];
      result.clinicName = hangulParts.slice(0, -1).join(" ");
    }
  }

  return result;
}

/**
 * 여러 파일명에서 정보 추출 (첫 번째 파일의 정보 사용)
 */
export function parseFilenames(filenames: string[]): ParsedFilenameInfo {
  if (filenames.length === 0) {
    return {};
  }

  // 첫 번째 파일명에서 추출
  return parseFilename(filenames[0]);
}
