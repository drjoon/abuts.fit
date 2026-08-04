// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
/**
 * 룰 테이블 기반 파일명 파싱 엔진
 *
 * 흐름:
 * 1. 파일명에 매칭되는 룰 찾기
 * 2. 룰의 extraction 설정에 따라 정보 추출
 * 3. 룰이 없거나 실패하면 fallback (기존 parseFilename 로직)
 */

import { ParsedFilenameInfo } from "./parseFilename";
import { findMatchingRule, FilenameRule } from "./filenameRules";
import { parseFilename as fallbackParseFilename } from "./parseFilename";

/**
 * 토큰 배열에서 특정 범위의 한글 토큰 추출
 */
function extractTokenRange(
  parts: string[],
  rangeStr: string,
  endIndex: number
): string[] {
  if (rangeStr === "0-end") {
    // 0부터 endIndex 앞까지의 한글 토큰
    const result: string[] = [];
    for (let i = 0; i < endIndex; i++) {
      if (/[가-힣]/.test(parts[i]) && !/^[0-9]+$/.test(parts[i])) {
        result.push(parts[i]);
      }
    }
    return result;
  }

  // "0-2" 같은 형식
  const [start, end] = rangeStr.split("-").map((s) => {
    const num = parseInt(s, 10);
    return isNaN(num) ? 0 : num;
  });

  return parts.slice(start, end + 1);
}

/**
 * 토큰 인덱스로 추출 (음수는 뒤에서부터)
 */
function extractTokenByIndex(
  parts: string[],
  index: number,
  direction: "forward" | "backward" = "forward"
): string | undefined {
  if (direction === "backward") {
    // 뒤에서부터 검색 (한글 포함 토큰)
    for (let i = Math.min(index, parts.length - 1); i >= 0; i--) {
      if (/[가-힣]/.test(parts[i])) {
        return parts[i];
      }
    }
  } else {
    // 앞에서부터
    if (index >= 0 && index < parts.length) {
      return parts[index];
    }
  }

  return undefined;
}

/**
 * 정규식으로 추출
 */
function extractByRegex(
  filename: string,
  regexStr: string,
  captureGroupIndex: number = 1
): string | undefined {
  try {
    const regex = new RegExp(regexStr);
    const match = filename.match(regex);
    if (match && match[captureGroupIndex]) {
      return match[captureGroupIndex];
    }
  } catch (err) {
    // invalid regex, ignore
  }

  return undefined;
}

/**
 * 치아번호 정규식 추출 — 여러 캡처 그룹/매치 중 가장 오른쪽 유효 값 사용
 * (날짜 YYYYMMDD 내부 부분일치는 호출 측 regex의 `\b`로 차단)
 */
function extractToothByRegex(
  filename: string,
  regexStr: string
): string | undefined {
  try {
    const regex = new RegExp(regexStr, "g");
    let last: string | undefined;
    for (const match of filename.matchAll(regex)) {
      const value = match.slice(1).find((g) => typeof g === "string" && g.length > 0);
      if (value) last = value;
    }
    return last;
  } catch (err) {
    return undefined;
  }
}

/**
 * 후처리 함수
 */
function postprocess(
  value: string | undefined,
  postprocessType?: string
): string | undefined {
  if (!value) return undefined;

  if (postprocessType === "strip_leading_digits") {
    return value.replace(/^[0-9]+[_\-\s]*/, "");
  }

  if (postprocessType === "normalize_spaces") {
    return value.trim().replace(/\s+/g, " ");
  }

  return value;
}

/**
 * 룰 기반 파싱
 */
function parseWithRule(
  filename: string,
  rule: FilenameRule
): Partial<ParsedFilenameInfo> {
  const result: Partial<ParsedFilenameInfo> = {};

  // 파일명을 토큰으로 분할 (fallback 로직과 동일)
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt
    .split(/[_\-\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 1) 치아번호 먼저 (환자/치과 경계로 사용)
  if (rule.extraction.tooth) {
    const tooth = rule.extraction.tooth;
    if (tooth.type === "regex") {
      const toothValue = extractToothByRegex(filename, tooth.value);
      if (toothValue) {
        result.tooth = toothValue;
      }
    }
  }

  const toothIndex = result.tooth
    ? (() => {
        // 가장 오른쪽에서 치아 토큰 위치 탐색
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i].includes(String(result.tooth))) return i;
        }
        return parts.length;
      })()
    : parts.length;

  // 2) 환자이름
  if (rule.extraction.patient) {
    const patient = rule.extraction.patient;
    let patientValue: string | undefined;

    if (patient.type === "regex") {
      patientValue = extractByRegex(filename, patient.value as string);
    } else if (patient.type === "token_index") {
      const idx = patient.value as number;
      // 음수 인덱스: 치아 바로 앞부터 왼쪽으로 한글 토큰 탐색
      if (idx < 0) {
        const startFrom =
          toothIndex > 0 ? toothIndex - 1 : parts.length + idx;
        patientValue = extractTokenByIndex(parts, startFrom, "backward");
      } else {
        patientValue = extractTokenByIndex(parts, idx, "forward");
      }
    }

    if (patientValue) {
      result.patientName = postprocess(patientValue, patient.postprocess);
    }
  }

  const patientIndex = result.patientName
    ? parts.findIndex((p) => {
        const stripped = p.replace(/^[0-9]+[_\-\s]*/, "");
        return stripped === result.patientName || p === result.patientName;
      })
    : -1;

  // 3) 치과이름 — 환자 토큰 앞까지만 (환자명을 치과명으로 넣지 않음)
  if (rule.extraction.clinic) {
    const clinic = rule.extraction.clinic;
    let clinicValue: string | undefined;

    if (clinic.type === "regex") {
      clinicValue = extractByRegex(filename, clinic.value as string);
    } else if (clinic.type === "token_range") {
      const endIndex =
        patientIndex >= 0
          ? patientIndex
          : toothIndex >= 0
            ? toothIndex
            : parts.length;

      const clinicParts = extractTokenRange(
        parts,
        clinic.value as string,
        endIndex
      );
      clinicValue = clinicParts.join(" ");
    } else if (clinic.type === "token_indices") {
      const indices = clinic.value as number[];
      const clinicParts = indices
        .map((i) => parts[i])
        .filter((p) => p !== undefined);
      clinicValue = clinicParts.join(" ");
    }

    if (clinicValue) {
      const processed = postprocess(clinicValue, clinic.postprocess);
      // 환자명과 동일하면 치과 정보 없음으로 간주
      if (processed && processed !== result.patientName) {
        result.clinicName = processed;
      }
    }
  }

  return result;
}

/**
 * 룰 기반 파일명 파싱 (with fallback)
 */
export function parseFilenameWithRules(filename: string): ParsedFilenameInfo {
  // 1. 매칭되는 룰 찾기
  const rule = findMatchingRule(filename);

  if (rule) {
    try {
      const result = parseWithRule(filename, rule);

      // 부분 성공도 괜찮음 (일부만 추출되었어도 반환)
      if (result.clinicName || result.patientName || result.tooth) {
        return {
          clinicName: result.clinicName,
          patientName: result.patientName,
          tooth: result.tooth,
        };
      }
    } catch (err) {
      // rule failed, fall back
    }
  }

  // 2. Fallback: 기존 parseFilename 로직 사용
  return fallbackParseFilename(filename);
}
