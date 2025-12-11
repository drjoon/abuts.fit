# 파일명 파싱 룰 테이블 시스템

## 개요

파일명 파싱을 **룰 테이블 기반**으로 구성하여, 코드 수정 없이 AI가 새로운 패턴을 학습하고 규칙을 추가할 수 있는 구조입니다.

---

## 아키텍처

### 런타임 레벨 (프론트엔드)

```
파일 업로드
  ↓
parseFilenameWithRules()
  ├─ 1. findMatchingRule() → 파일명에 매칭되는 룰 찾기
  ├─ 2. parseWithRule() → 룰에 따라 정보 추출
  └─ 3. Fallback → 기존 parseFilename() 로직 사용
  ↓
updateCaseInfos() → Draft에 저장
  ↓
AI 분석 필요 여부 판단
  ├─ 파싱 성공 → 끝
  └─ 파싱 실패 → /api/ai/parse-filenames 호출
```

### 오프라인 레벨 (백오피스/AI 도구)

```
로그 수집 (parseFilenameLogger)
  ├─ 파싱 결과 vs 사용자 최종 입력 비교
  ├─ 틀린 케이스만 필터링
  └─ CSV/JSON으로 내보내기
  ↓
AI 분석
  ├─ "이 패턴들에 대해 더 나은 정규식/토큰 규칙을 제안해줘"
  └─ 새로운 룰 생성 (confidence 포함)
  ↓
사람 리뷰
  ├─ 제안된 룰이 기존 케이스를 깨지 않는지 확인
  └─ 승인/거절
  ↓
룰 테이블 업데이트
  └─ updateFilenameRules() → ACTIVE_FILENAME_RULES 갱신
```

---

## 파일 구조

### 1. `filenameRules.ts`

- **역할**: 룰 테이블 정의 및 관리
- **주요 함수**:
  - `findMatchingRule(filename)`: 파일명에 매칭되는 룰 찾기
  - `updateFilenameRules(newRules)`: 룰 테이블 업데이트
  - `exportRulesToJSON()`: 룰을 JSON으로 내보내기
  - `importRulesFromJSON(jsonString)`: JSON에서 룰 임포트

### 2. `parseFilenameWithRules.ts`

- **역할**: 룰 기반 파싱 엔진
- **주요 함수**:
  - `parseFilenameWithRules(filename)`: 룰을 사용해 파일명 파싱

### 3. `parseFilenameLogger.ts`

- **역할**: 파싱 결과 로깅 및 피드백 수집
- **주요 함수**:
  - `logParseResult(filename, parsed, userInput)`: 파싱 결과 로깅
  - `getIncorrectLogs()`: 틀린 로그만 조회
  - `analyzeCommonMismatches()`: 자주 틀리는 패턴 분석
  - `exportLogsAsJSON()` / `exportLogsAsCSV()`: 로그 내보내기

---

## 룰 테이블 스펙

### FilenameRule 인터페이스

```typescript
interface FilenameRule {
  id: string; // 고유 ID (예: "pattern_date_patient_tooth")
  description: string; // 사람이 읽기 위한 설명
  pattern: string; // 정규식 (파일명 매칭용)
  extraction: {
    clinic?: {
      type: "regex" | "token_range" | "token_indices";
      value: string | number[];
      postprocess?: "strip_leading_digits" | "normalize_spaces";
    };
    patient?: {
      type: "regex" | "token_index";
      value: string | number;
      postprocess?: "strip_leading_digits" | "normalize_spaces";
    };
    tooth?: {
      type: "regex";
      value: string;
    };
  };
  confidence?: number; // 신뢰도 (0~1)
  updatedAt?: string; // 마지막 업데이트 시각
  source?: "manual" | "ai_suggestion" | "user_feedback";
}
```

### 예시 룰

#### 1. 기본 유연한 패턴 (Fallback)

```json
{
  "id": "default_flexible",
  "description": "기본 유연한 패턴: 날짜/치과/환자/치아 순서 제각각",
  "pattern": ".*",
  "extraction": {
    "clinic": {
      "type": "token_range",
      "value": "0-end",
      "postprocess": "normalize_spaces"
    },
    "patient": {
      "type": "token_index",
      "value": -1,
      "postprocess": "strip_leading_digits"
    },
    "tooth": {
      "type": "regex",
      "value": "([1-4][1-8])|([1-4][1-8])-([1-4][1-8])"
    }
  },
  "confidence": 0.7,
  "source": "manual"
}
```

#### 2. 날짜*환자*치아\_번호 패턴

```json
{
  "id": "pattern_date_patient_tooth",
  "description": "날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)",
  "pattern": "^\\d{8}[가-힣]+_\\d+_\\d+",
  "extraction": {
    "patient": {
      "type": "regex",
      "value": "^\\d{8}([가-힣]+)",
      "postprocess": "strip_leading_digits"
    },
    "tooth": {
      "type": "regex",
      "value": "_([1-4][1-8])_"
    }
  },
  "confidence": 0.95,
  "source": "manual"
}
```

---

## 로깅 및 피드백 수집

### 1. 파싱 결과 로깅

파일 업로드 후, 사용자가 폼을 제출할 때:

```typescript
import { logParseResult } from "@/utils/parseFilenameLogger";

// 파싱 결과
const parsed = {
  clinicName: "강남치과",
  patientName: "김혜영",
  tooth: "32",
};

// 사용자가 최종 입력한 값
const userInput = {
  clinicName: "강남치과",
  patientName: "김혜영",
  tooth: "32",
};

// 로깅
logParseResult(filename, parsed, userInput);
```

### 2. 로그 분석

```typescript
import {
  getIncorrectLogs,
  analyzeCommonMismatches,
  exportLogsAsJSON,
  exportLogsAsCSV,
} from "@/utils/parseFilenameLogger";

// 틀린 로그만 조회
const incorrectLogs = getIncorrectLogs();

// 자주 틀리는 필드 분석
const mismatches = analyzeCommonMismatches();
// [
//   { field: "patientName", count: 5, examples: [...] },
//   { field: "tooth", count: 2, examples: [...] },
// ]

// JSON으로 내보내기 (AI 분석용)
const jsonData = exportLogsAsJSON();

// CSV로 내보내기 (스프레드시트용)
const csvData = exportLogsAsCSV();
```

---

## 오프라인 AI 도구 워크플로우

### Step 1: 로그 수집

```bash
# 프론트엔드에서 로그 내보내기
# 개발자 콘솔에서:
// import { exportLogsAsJSON } from "@/utils/parseFilenameLogger";
// console.log(exportLogsAsJSON());
```

### Step 2: AI 분석 프롬프트

```
다음은 파일명 파싱 시스템의 실패 사례들입니다.
각 사례에서 파일명 패턴을 분석하고, 더 나은 정규식/토큰 규칙을 제안해주세요.

[JSON 로그 데이터]

응답 형식:
{
  "newRules": [
    {
      "id": "pattern_xxx",
      "description": "...",
      "pattern": "정규식",
      "extraction": { ... },
      "confidence": 0.9,
      "source": "ai_suggestion"
    }
  ],
  "analysis": "분석 결과 및 설명"
}
```

### Step 3: 사람 리뷰

1. AI가 제안한 룰 검토
2. 기존 테스트 케이스에 대해 회귀 테스트 실행
3. 승인/거절 결정

### Step 4: 룰 테이블 업데이트

```typescript
import { updateFilenameRules } from "@/utils/filenameRules";

const newRules = [
  // 기존 룰들...
  // + AI가 제안한 새로운 룰들
];

updateFilenameRules(newRules);
```

---

## 사용 예시

### 프론트엔드에서 로그 내보내기

```typescript
// 개발자 도구 콘솔에서:
import {
  exportLogsAsJSON,
  getLogStatistics,
} from "@/utils/parseFilenameLogger";

// 통계 확인
const stats = getLogStatistics();
console.log(stats);
// { totalLogs: 50, correctLogs: 45, incorrectLogs: 5, correctRate: 90 }

// 로그 내보내기
const logs = exportLogsAsJSON();
// 클립보드에 복사 후 AI 도구로 전송
```

### 백엔드에서 룰 테이블 관리

```typescript
// 예: Node.js 백엔드
const rulesFromAI = require("./ai-generated-rules.json");

// 프론트엔드로 전송
app.get("/api/filename-rules", (req, res) => {
  res.json(rulesFromAI);
});
```

---

## 장점

1. **코드 수정 없이 규칙 추가 가능**

   - JSON 파일만 업데이트하면 됨
   - 배포 필요 없음 (동적 로드 가능)

2. **AI가 자동으로 규칙 제안**

   - 로그 데이터 기반 학습
   - 사람의 "패턴 분석 노동" 감소

3. **서비스 안정성 유지**

   - Fallback 로직으로 항상 기본 파싱 가능
   - 새 규칙 추가 시에도 기존 기능 영향 없음

4. **추적 가능성**
   - 각 규칙의 출처 기록 (manual / ai_suggestion / user_feedback)
   - 신뢰도 점수로 우선순위 관리

---

## 다음 단계

1. **로그 수집 시작**

   - 실제 사용자 데이터로 로그 쌓기
   - 1주일~1개월 정도 수집

2. **AI 분석**

   - 수집된 로그를 AI에 던지기
   - 새로운 규칙 제안 받기

3. **반복적 개선**
   - 제안된 규칙 리뷰 및 승인
   - 룰 테이블 업데이트
   - 정확도 모니터링

---

## 참고

- `filenameRules.ts`: 룰 테이블 정의
- `parseFilenameWithRules.ts`: 룰 기반 파싱 엔진
- `parseFilenameLogger.ts`: 로깅 및 피드백 수집
- `useNewRequestFilesV2.ts`: 파일 업로드 시 파싱 적용
