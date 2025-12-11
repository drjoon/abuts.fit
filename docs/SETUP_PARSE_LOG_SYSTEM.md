# 파일명 파싱 로그 시스템 설정 가이드

## 개요

파일명 파싱 로그 시스템을 설정하고 실행하는 단계별 가이드입니다.

---

## 1단계: 백엔드 라우트 등록 ✅

**상태**: 완료

`backend/app.js`에 다음 라우트가 등록되었습니다:

- `POST /api/parse-logs`: 로그 저장
- `GET /api/parse-logs/incorrect`: 틀린 로그 조회
- `GET /api/parse-logs/analysis/mismatches`: 패턴 분석
- `GET /api/parse-logs/stats`: 통계
- `GET /api/parse-logs/export/json|csv`: 내보내기
- `GET /api/filename-rules`: 활성 룰 조회
- `POST /api/filename-rules`: 룰 생성 (관리자)
- `PUT /api/filename-rules/:ruleId`: 룰 업데이트
- `POST /api/filename-rules/batch`: 일괄 생성/업데이트

---

## 2단계: 초기 룰 데이터 마이그레이션

### 2.1 시드 스크립트 실행

```bash
cd backend
node scripts/seedFilenameRules.js
```

**예상 출력:**

```
MongoDB 연결 성공
✅ 2개의 초기 룰이 저장되었습니다.
저장된 룰:
  - default_flexible: 기본 유연한 패턴: 날짜/치과/환자/치아 순서 제각각
  - pattern_date_patient_tooth: 날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)
```

### 2.2 DB 확인

```bash
# MongoDB 접속
mongo abutsFit

# 저장된 룰 확인
db.filenamerules.find().pretty()
```

---

## 3단계: 프론트엔드 설정 ✅

**상태**: 완료

앱 시작 시 자동으로 백엔드에서 활성 룰을 로드합니다.

**동작:**

1. `App.tsx` 마운트 시 `loadRulesFromBackend()` 호출
2. `/api/filename-rules` 에서 활성 룰 조회
3. `ACTIVE_FILENAME_RULES` 업데이트
4. 파일 업로드 시 최신 룰 사용

---

## 4단계: 로그 수집 시작

### 4.1 파일 업로드 및 의뢰 제출

1. 프론트엔드에서 STL 파일 업로드
2. 파일명에서 자동으로 환자/치아 정보 파싱
3. 사용자가 정보 입력/수정
4. 의뢰 제출
5. **자동으로 파싱 결과 vs 입력값 로그 저장**

### 4.2 로그 확인

```bash
# 틀린 로그 조회
curl http://localhost:5000/api/parse-logs/incorrect?limit=10

# 통계 확인
curl http://localhost:5000/api/parse-logs/stats

# 자주 틀리는 패턴 분석
curl http://localhost:5000/api/parse-logs/analysis/mismatches
```

### 4.3 로그 내보내기

```bash
# JSON으로 내보내기
curl http://localhost:5000/api/parse-logs/export/json > logs.json

# CSV로 내보내기
curl http://localhost:5000/api/parse-logs/export/csv > logs.csv
```

---

## 5단계: AI 분석 및 반복 개선

### 5.1 틀린 로그 분석

1. 로그 내보내기
2. AI에게 다음과 같이 요청:

```
다음은 파일명 파싱 시스템의 실패 사례들입니다.
각 사례에서 파일명 패턴을 분석하고, 더 나은 정규식/토큰 규칙을 제안해주세요.

[JSON 로그 데이터]

응답 형식:
{
  "newRules": [
    {
      "ruleId": "pattern_xxx",
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

### 5.2 새로운 룰 적용

```bash
# 새로운 룰을 JSON 파일로 저장 (ai-rules.json)

# 일괄 업데이트
curl -X POST http://localhost:5000/api/filename-rules/batch \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d @ai-rules.json
```

### 5.3 정확도 모니터링

```bash
# 정확도 통계
curl http://localhost:5000/api/parse-logs/stats

# 예상 응답:
{
  "totalLogs": 150,
  "correctLogs": 135,
  "incorrectLogs": 15,
  "correctRate": 90
}
```

---

## 주요 API 엔드포인트

### ParseLog API

| 메서드 | 엔드포인트                            | 설명           | 인증 |
| ------ | ------------------------------------- | -------------- | ---- |
| POST   | `/api/parse-logs`                     | 로그 저장      | 필수 |
| GET    | `/api/parse-logs/incorrect`           | 틀린 로그 조회 | 선택 |
| GET    | `/api/parse-logs/analysis/mismatches` | 패턴 분석      | 선택 |
| GET    | `/api/parse-logs/stats`               | 통계           | 선택 |
| GET    | `/api/parse-logs/export/json`         | JSON 내보내기  | 선택 |
| GET    | `/api/parse-logs/export/csv`          | CSV 내보내기   | 선택 |

### FilenameRule API

| 메서드 | 엔드포인트                             | 설명               | 인증   |
| ------ | -------------------------------------- | ------------------ | ------ |
| GET    | `/api/filename-rules`                  | 활성 룰 조회       | 선택   |
| GET    | `/api/filename-rules/all`              | 모든 룰 조회       | 관리자 |
| POST   | `/api/filename-rules`                  | 룰 생성            | 관리자 |
| PUT    | `/api/filename-rules/:ruleId`          | 룰 업데이트        | 관리자 |
| PATCH  | `/api/filename-rules/:ruleId/toggle`   | 활성화/비활성화    | 관리자 |
| PATCH  | `/api/filename-rules/:ruleId/accuracy` | 정확도 업데이트    | 관리자 |
| DELETE | `/api/filename-rules/:ruleId`          | 룰 삭제            | 관리자 |
| POST   | `/api/filename-rules/batch`            | 일괄 생성/업데이트 | 관리자 |
| GET    | `/api/filename-rules/stats`            | 룰 통계            | 관리자 |

---

## 문제 해결

### 1. 로그가 저장되지 않음

**확인 사항:**

- 백엔드 API가 실행 중인가?
- 프론트엔드가 올바른 API URL을 사용하는가?
- 의뢰 제출 시 에러가 발생하는가?

**해결:**

```bash
# 백엔드 로그 확인
tail -f backend/logs/app.log

# 프론트엔드 콘솔 확인
# 개발자 도구 → Console → 에러 메시지 확인
```

### 2. 룰이 로드되지 않음

**확인 사항:**

- DB에 룰이 저장되었는가?
- 프론트엔드 콘솔에 에러가 있는가?

**해결:**

```bash
# DB에서 룰 확인
mongo abutsFit
db.filenamerules.find().pretty()

# 프론트엔드 콘솔에서 확인
console.log(ACTIVE_FILENAME_RULES)
```

### 3. 파싱 정확도가 낮음

**확인 사항:**

- 기공소별 파일명 패턴이 다른가?
- 새로운 패턴이 자주 나타나는가?

**해결:**

1. 틀린 로그 분석
2. AI에게 새로운 룰 제안 요청
3. 새로운 룰 적용
4. 정확도 재측정

---

## 다음 단계

1. **로그 수집** (1주일~1개월)

   - 실제 사용자 데이터 쌓기
   - 최소 100개 이상의 로그 수집

2. **AI 분석**

   - 틀린 로그 분석
   - 새로운 룰 제안

3. **반복 개선**
   - 새로운 룰 적용
   - 정확도 모니터링
   - 필요시 추가 조정

---

## 참고 자료

- [파일명 파싱 룰 테이블 시스템](./FILENAME_PARSING_RULES.md)
- [ParseLog 모델](../backend/models/parseLog.model.js)
- [FilenameRule 모델](../backend/models/filenameRule.model.js)
- [ParseLog 컨트롤러](../backend/controllers/parseLog.controller.js)
- [FilenameRule 컨트롤러](../backend/controllers/filenameRule.controller.js)
