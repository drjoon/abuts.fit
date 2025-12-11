# 파일명 파싱 로그 시스템 구현 완료 요약

## 📋 프로젝트 개요

**목표**: 파일명 파싱 결과를 로그로 수집하고, AI가 자동으로 새로운 규칙을 제안하는 시스템 구축

**전략**:

- **런타임**: 규칙 기반 파싱 + AI 보완 (기존 구조 유지)
- **오프라인**: 로그 기반 AI 규칙 제안 (새로운 기능)

---

## ✅ 완료된 작업

### 1. 백엔드 DB 스키마 (2개 모델)

#### ParseLog 모델 (`backend/models/parseLog.model.js`)

- 파일명 파싱 결과 vs 사용자 최종 입력값 저장
- 일치 여부, 틀린 필드, 매칭된 룰 ID 기록
- 사용자별, 기공소별 필터링 가능
- 복합 인덱스로 조회 성능 최적화

#### FilenameRule 모델 (`backend/models/filenameRule.model.js`)

- 파일명 파싱 룰 테이블 (DB 저장)
- 신뢰도, 출처(manual/ai_suggestion), 정확도 추적
- 사용 횟수, 정확한 횟수 통계
- 활성화/비활성화 관리

### 2. 백엔드 API (2개 컨트롤러 + 2개 라우트)

#### ParseLog API (`backend/controllers/parseLog.controller.js`)

- `POST /api/parse-logs`: 로그 저장
- `GET /api/parse-logs/incorrect`: 틀린 로그 조회 (페이징)
- `GET /api/parse-logs/analysis/mismatches`: 자주 틀리는 패턴 분석
- `GET /api/parse-logs/stats`: 통계 (총 로그, 정확도 등)
- `GET /api/parse-logs/export/json`: JSON 내보내기
- `GET /api/parse-logs/export/csv`: CSV 내보내기

#### FilenameRule API (`backend/controllers/filenameRule.controller.js`)

- `GET /api/filename-rules`: 활성 룰 조회 (공개)
- `GET /api/filename-rules/all`: 모든 룰 조회 (관리자)
- `POST /api/filename-rules`: 룰 생성 (관리자)
- `PUT /api/filename-rules/:ruleId`: 룰 업데이트
- `PATCH /api/filename-rules/:ruleId/toggle`: 활성화/비활성화
- `PATCH /api/filename-rules/:ruleId/accuracy`: 정확도 업데이트
- `DELETE /api/filename-rules/:ruleId`: 룰 삭제
- `POST /api/filename-rules/batch`: 일괄 생성/업데이트 (AI 도구용)
- `GET /api/filename-rules/stats`: 룰 통계

### 3. 프론트엔드 API 클라이언트 (2개 서비스)

#### parseLogService.ts (`frontend/src/services/parseLogService.ts`)

- `createParseLog()`: 로그 저장
- `getIncorrectLogs()`: 틀린 로그 조회
- `analyzeMismatches()`: 패턴 분석
- `getParseLogStatistics()`: 통계
- `exportLogsAsJSON()`: JSON 내보내기
- `exportLogsAsCSV()`: CSV 내보내기

#### filenameRuleService.ts (`frontend/src/services/filenameRuleService.ts`)

- `getActiveRules()`: 활성 룰 조회
- `getAllRules()`: 모든 룰 조회 (관리자)
- `createRule()`: 룰 생성
- `updateRule()`: 룰 업데이트
- `toggleRuleActive()`: 활성화/비활성화
- `updateRuleAccuracy()`: 정확도 업데이트
- `deleteRule()`: 룰 삭제
- `batchUpsertRules()`: 일괄 생성/업데이트
- `getRuleStatistics()`: 룰 통계

### 4. 파일 업로드 시 로그 자동 전송

#### useNewRequestSubmitV2.ts 수정

- `saveParseLogs()` 함수 추가
- 의뢰 제출 시 각 파일별로 로그 저장
- 로그 저장 실패해도 의뢰 제출에 영향 없음 (비동기)

#### useNewRequestPage.ts 수정

- `caseInfosMap`을 `useNewRequestSubmitV2`에 전달

### 5. 룰 테이블 시스템 (프론트엔드)

#### filenameRules.ts 수정

- `loadRulesFromBackend()` 함수 추가
- 앱 시작 시 백엔드에서 활성 룰 자동 로드
- Fallback: 기본 룰 사용

#### App.tsx 수정

- `useEffect`에서 `loadRulesFromBackend()` 호출
- 앱 마운트 시 최신 룰 로드

### 6. 초기 데이터 마이그레이션

#### seedFilenameRules.js (`backend/scripts/seedFilenameRules.js`)

- 초기 2개 룰 저장 (default_flexible, pattern_date_patient_tooth)
- 중복 키 에러 처리
- npm 스크립트로 실행 가능

#### package.json 수정

- `npm run seed:filename-rules` 추가

### 7. 문서 작성

#### FILENAME_PARSING_RULES.md

- 전체 아키텍처 설명
- 룰 테이블 스펙
- 오프라인 AI 도구 워크플로우
- 사용 예시

#### SETUP_PARSE_LOG_SYSTEM.md

- 단계별 설정 가이드
- API 엔드포인트 목록
- 문제 해결 가이드

#### QUICK_START_PARSE_LOG.md

- 5분 안에 시작하기
- 주요 파일 목록
- 트러블슈팅

#### IMPLEMENTATION_SUMMARY.md (이 문서)

- 완료된 작업 요약
- 파일 목록
- 다음 단계

---

## 📁 생성된 파일 목록

### 백엔드

```
backend/
├── models/
│   ├── parseLog.model.js              (새로 생성)
│   └── filenameRule.model.js          (새로 생성)
├── controllers/
│   ├── parseLog.controller.js         (새로 생성)
│   └── filenameRule.controller.js     (새로 생성)
├── routes/
│   ├── parseLog.routes.js             (새로 생성)
│   └── filenameRule.routes.js         (새로 생성)
├── scripts/
│   └── seedFilenameRules.js           (새로 생성)
├── app.js                              (수정: 라우트 등록)
└── package.json                        (수정: 시드 스크립트 추가)
```

### 프론트엔드

```
frontend/src/
├── services/
│   ├── parseLogService.ts             (새로 생성)
│   └── filenameRuleService.ts         (새로 생성)
├── utils/
│   ├── filenameRules.ts               (수정: loadRulesFromBackend 추가)
│   ├── parseFilenameWithRules.ts      (기존)
│   ├── parseFilenameLogger.ts         (기존)
│   └── parseFilename.ts               (기존)
├── features/requestor/hooks/
│   ├── useNewRequestPage.ts           (수정: caseInfosMap 전달)
│   └── new_requests/
│       └── useNewRequestSubmitV2.ts   (수정: saveParseLogs 추가)
└── App.tsx                             (수정: loadRulesFromBackend 호출)
```

### 문서

```
docs/
├── FILENAME_PARSING_RULES.md          (기존)
├── SETUP_PARSE_LOG_SYSTEM.md          (새로 생성)
├── QUICK_START_PARSE_LOG.md           (새로 생성)
└── IMPLEMENTATION_SUMMARY.md          (이 문서)
```

---

## 🚀 실행 방법

### 1단계: 초기 룰 데이터 저장

```bash
cd backend
npm run seed:filename-rules
```

### 2단계: 백엔드 시작

```bash
npm run dev
```

### 3단계: 프론트엔드 시작

```bash
cd frontend
npm run dev
```

### 4단계: 파일 업로드 및 의뢰 제출

- 프론트엔드에서 STL 파일 업로드
- 파일명에서 자동으로 환자/치아 정보 파싱
- 정보 확인/수정
- 의뢰 제출
- **자동으로 로그 저장됨**

---

## 📊 데이터 흐름

### 런타임 (프론트엔드)

```
파일 업로드
  ↓
parseFilenameWithRules() [룰 기반 파싱]
  ↓
환자정보 자동 채우기
  ↓
사용자 입력/수정
  ↓
의뢰 제출
  ↓
saveParseLogs() [파싱 결과 vs 입력값 비교]
  ↓
createParseLog() [백엔드 API 호출]
  ↓
ParseLog 저장 (DB)
```

### 오프라인 (백오피스/AI)

```
로그 조회 [GET /api/parse-logs/incorrect]
  ↓
패턴 분석 [GET /api/parse-logs/analysis/mismatches]
  ↓
JSON 내보내기 [GET /api/parse-logs/export/json]
  ↓
AI 분석 [새로운 룰 제안]
  ↓
일괄 업데이트 [POST /api/filename-rules/batch]
  ↓
프론트엔드 자동 로드 [GET /api/filename-rules]
  ↓
정확도 향상
```

---

## 🔄 반복 개선 사이클

1. **로그 수집** (1주일~1개월)

   - 실제 사용자 데이터 쌓기
   - 최소 100개 이상의 로그 수집

2. **분석**

   - 틀린 로그 조회: `GET /api/parse-logs/incorrect`
   - 패턴 분석: `GET /api/parse-logs/analysis/mismatches`
   - JSON 내보내기: `GET /api/parse-logs/export/json`

3. **AI 제안**

   - 틀린 로그를 AI에 제공
   - "이 패턴들에 대해 더 나은 정규식을 제안해줘"
   - 새로운 룰 생성

4. **적용**

   - 새로운 룰 일괄 업데이트: `POST /api/filename-rules/batch`
   - 프론트엔드 자동 로드

5. **모니터링**
   - 정확도 재측정: `GET /api/parse-logs/stats`
   - 필요시 추가 조정

---

## 🎯 주요 특징

### 1. 코드 수정 없이 규칙 추가 가능

- JSON 룰 테이블만 업데이트
- 배포 필요 없음 (동적 로드)

### 2. AI가 자동으로 규칙 제안

- 로그 데이터 기반 학습
- 사람의 "패턴 분석 노동" 감소

### 3. 서비스 안정성 유지

- Fallback 로직으로 항상 기본 파싱 가능
- 새 규칙 추가 시에도 기존 기능 영향 없음

### 4. 추적 가능성

- 각 규칙의 출처 기록 (manual / ai_suggestion / user_feedback)
- 신뢰도 점수로 우선순위 관리
- 사용 횟수, 정확도 통계

---

## 📈 성과 지표

### 초기 상태

- 기본 규칙 2개 (default_flexible, pattern_date_patient_tooth)
- 정확도: ~70% (기본 규칙 신뢰도)

### 목표

- 로그 수집 후 AI 분석으로 규칙 추가
- 정확도: 90% 이상 달성

---

## 🔧 기술 스택

### 백엔드

- **DB**: MongoDB (Mongoose ODM)
- **API**: Express.js
- **모델**: ParseLog, FilenameRule
- **컨트롤러**: 비즈니스 로직 분리

### 프론트엔드

- **언어**: TypeScript
- **상태 관리**: 로컬 스토리지 + 백엔드 API
- **API 클라이언트**: fetch API
- **로깅**: 로컬 스토리지 + 백엔드 DB

---

## 📝 다음 단계

### 단기 (1주일)

- [ ] 초기 룰 데이터 마이그레이션 실행
- [ ] 로그 수집 시작
- [ ] 프론트엔드에서 로그 확인

### 중기 (1개월)

- [ ] 100개 이상 로그 수집
- [ ] AI 분석 및 새로운 룰 제안
- [ ] 새로운 룰 적용 및 정확도 재측정

### 장기 (3개월)

- [ ] 정확도 90% 이상 달성
- [ ] 기공소별 커스텀 룰 추가
- [ ] 오프라인 AI 도구 개발 (선택사항)

---

## 📚 참고 자료

- [파일명 파싱 룰 시스템](./FILENAME_PARSING_RULES.md)
- [설정 가이드](./SETUP_PARSE_LOG_SYSTEM.md)
- [빠른 시작](./QUICK_START_PARSE_LOG.md)

---

## 💡 설계 철학

> "코드는 간결하게, 규칙은 유연하게"

1. **런타임은 가볍게**: 기본 파싱 + AI 보완
2. **규칙은 데이터로**: JSON 테이블로 관리
3. **AI는 오프라인에서**: 로그 기반 제안
4. **사람은 최종 결정**: 리뷰 후 승인

이 구조로 서비스 안정성을 유지하면서도 지속적인 개선이 가능합니다.

---

**작성일**: 2025-12-12  
**상태**: ✅ 완료  
**다음 리뷰**: 로그 수집 1주일 후
