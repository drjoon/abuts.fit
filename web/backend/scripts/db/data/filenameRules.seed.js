export const FILENAME_RULES_SEED = [
  {
    ruleId: "default_flexible",
    description: "기본 유연한 패턴: 날짜/치과/환자/치아 순서 제각각",
    pattern: ".*",
    extraction: {
      clinic: {
        type: "token_range",
        value: "0-end",
        postprocess: "normalize_spaces",
      },
      patient: {
        type: "token_index",
        value: -1,
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "([1-4][1-8])|([1-4][1-8][-_=xX][1-4][1-8])",
      },
    },
    confidence: 0.7,
    source: "manual",
    isActive: true,
  },
  {
    ruleId: "pattern_date_patient_tooth",
    description: "날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)",
    pattern: "^\\d{8}[가-힣]+[ _\\-=]\\d+[ _\\-=]\\d+",
    extraction: {
      patient: {
        type: "regex",
        value: "^\\d{8}([가-힣]+)",
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "(?:^|[ _\\-=])([1-4][1-8](?:[-_=xX][1-4][1-8])?)(?:[ _\\-=]|$)",
      },
    },
    confidence: 0.95,
    source: "manual",
    isActive: true,
  },
  {
    ruleId: "pattern_clinic_patient_tooth",
    description: "치과_환자_치아_번호 패턴 (예: 향기로운치과_김하늘_15)",
    pattern: "^[가-힣]+[ _\\-=][가-힣]+[ _\\-=]\\d+",
    extraction: {
      clinic: {
        type: "regex",
        value: "^([가-힣]+)[ _\\-=]",
      },
      patient: {
        type: "regex",
        value: "[ _\\-=]([가-힣]+)[ _\\-=]",
      },
      tooth: {
        type: "regex",
        value: "[ _\\-=]([1-4][1-8](?:[-_=xX][1-4][1-8])?)(?:\\D|$)",
      },
    },
    confidence: 0.95,
    source: "manual",
    isActive: true,
  },
];
