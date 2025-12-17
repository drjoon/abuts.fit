/**
 * 파일명 파싱 룰 테이블
 *
 * 구조:
 * - 각 기공소/패턴별로 독립적인 룰 정의
 * - 런타임에 이 룰을 읽어서 parseFilename 동작 커스터마이징
 * - 오프라인 AI 도구가 이 JSON을 생성/수정
 */

export interface FilenameRule {
  /** 룰 ID (고유값, 예: "clinic_001", "pattern_date_patient_tooth") */
  id: string;

  /** 룰 설명 (사람이 읽기 위함) */
  description: string;

  /** 이 룰이 적용되는 파일명 패턴 (정규식 문자열) */
  pattern: string;

  /**
   * 추출 규칙
   * - 정규식 캡처 그룹 또는 토큰 인덱스 기반
   */
  extraction: {
    /** 치과이름 추출 방식 */
    clinic?: {
      type: "regex" | "token_range" | "token_indices";
      value: string | number[]; // regex: 정규식, token_range: "0-2", token_indices: [0, 1]
      /** 추출 후 처리 (예: 숫자 제거, 공백 정규화) */
      postprocess?: "strip_leading_digits" | "normalize_spaces";
    };

    /** 환자이름 추출 방식 */
    patient?: {
      type: "regex" | "token_index";
      value: string | number;
      postprocess?: "strip_leading_digits" | "normalize_spaces";
    };

    /** 치아번호 추출 방식 */
    tooth?: {
      type: "regex";
      value: string; // 정규식 (예: "([1-4][1-8])" 또는 "([1-4][1-8])-([1-4][1-8])")
    };
  };

  /** 이 룰의 신뢰도 (0~1, AI가 제안할 때 함께 제공) */
  confidence?: number;

  /** 룰이 마지막으로 업데이트된 시각 (ISO 8601) */
  updatedAt?: string;

  /** 이 룰을 제안한 출처 ("manual" | "ai_suggestion" | "user_feedback") */
  source?: "manual" | "ai_suggestion" | "user_feedback";
}

/**
 * 기본 룰 테이블
 *
 * 초기값: 현재 parseFilename 로직을 룰로 표현
 * 추후 AI가 새로운 룰을 추가/수정
 */
export const DEFAULT_FILENAME_RULES: FilenameRule[] = [
  {
    id: "default_flexible",
    description: "기본 유연한 패턴: 날짜/치과/환자/치아 순서 제각각",
    pattern: ".*", // 모든 파일명에 매칭 (fallback)
    extraction: {
      clinic: {
        type: "token_range",
        value: "0-end", // 환자 앞까지 모든 한글 토큰
        postprocess: "normalize_spaces",
      },
      patient: {
        type: "token_index",
        value: -1, // 치아 바로 앞 한글 토큰 (오른쪽에서 왼쪽으로 검색)
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "([1-4][1-8])|([1-4][1-8])-([1-4][1-8])", // 단일 또는 브리지
      },
    },
    confidence: 0.7,
    source: "manual",
  },

  {
    id: "pattern_date_patient_tooth",
    description: "날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)",
    pattern: "^\\d{8}[가-힣]+_\\d+_\\d+",
    extraction: {
      patient: {
        type: "regex",
        value: "^\\d{8}([가-힣]+)",
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "_([1-4][1-8])_",
      },
    },
    confidence: 0.95,
    source: "manual",
  },
];

/**
 * 런타임에 사용할 룰 테이블 (동적으로 로드 가능)
 *
 * 초기값: DEFAULT_FILENAME_RULES
 * 추후: 백엔드에서 로드하거나, 로컬 스토리지에서 읽을 수 있음
 */
export let ACTIVE_FILENAME_RULES: FilenameRule[] = [...DEFAULT_FILENAME_RULES];

/**
 * 백엔드에서 활성 룰 로드
 * 앱 시작 시 한 번만 호출
 */
export async function loadRulesFromBackend(): Promise<void> {
  try {
    const response = await fetch("/api/filename-rules");
    if (!response.ok) {
      console.warn(
        "[filenameRules] Failed to load rules from backend:",
        response.status
      );
      return;
    }

    const data = await response.json();
    const rules = data.data || data;

    if (Array.isArray(rules) && rules.length > 0) {
      ACTIVE_FILENAME_RULES = rules;
      console.log(`[filenameRules] Loaded ${rules.length} rules from backend`, {
        rules: rules.map((r: any) => ({
          id: r.ruleId || r.id,
          pattern: r.pattern,
          confidence: r.confidence,
        })),
      });
    }
  } catch (error) {
    console.warn("[filenameRules] Error loading rules from backend:", error);
    // Fallback: 기본 룰 사용
  }
}

/**
 * 룰 테이블 업데이트 (오프라인 도구/백엔드에서 호출)
 */
export function updateFilenameRules(newRules: FilenameRule[]): void {
  ACTIVE_FILENAME_RULES = newRules;
  console.log("[filenameRules] Updated rules:", ACTIVE_FILENAME_RULES.length);
}

/**
 * 특정 파일명에 매칭되는 룰 찾기
 */
export function findMatchingRule(filename: string): FilenameRule | null {
  // 신뢰도가 높은 순서로 정렬
  const sortedRules = [...ACTIVE_FILENAME_RULES].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
  );

  for (const rule of sortedRules) {
    try {
      const regex = new RegExp(rule.pattern);
      if (regex.test(filename)) {
        return rule;
      }
    } catch (err) {
      console.warn(`[filenameRules] Invalid regex in rule ${rule.id}:`, err);
    }
  }

  return null;
}

/**
 * 룰 테이블을 JSON으로 내보내기 (백업/AI 분석용)
 */
export function exportRulesToJSON(): string {
  return JSON.stringify(ACTIVE_FILENAME_RULES, null, 2);
}

/**
 * JSON에서 룰 테이블 임포트
 */
export function importRulesFromJSON(jsonString: string): void {
  try {
    const rules = JSON.parse(jsonString) as FilenameRule[];
    updateFilenameRules(rules);
  } catch (err) {
    console.error("[filenameRules] Failed to import rules:", err);
  }
}
