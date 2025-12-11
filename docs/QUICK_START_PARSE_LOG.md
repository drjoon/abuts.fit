# 파일명 파싱 로그 시스템 빠른 시작

## 5분 안에 시작하기

### 1. 초기 룰 데이터 저장

```bash
cd backend
node scripts/seedFilenameRules.js
```

### 2. 백엔드 시작

```bash
npm run dev
```

### 3. 프론트엔드 시작

```bash
cd frontend
npm run dev
```

### 4. 파일 업로드 및 의뢰 제출

1. 프론트엔드에서 STL 파일 업로드
2. 파일명에서 자동으로 환자/치아 정보 파싱
3. 정보 확인/수정
4. 의뢰 제출
5. **자동으로 로그 저장됨**

---

## 로그 확인

### 프론트엔드 콘솔에서

```javascript
// 개발자 도구 → Console에서 실행

// 활성 룰 확인
import { ACTIVE_FILENAME_RULES } from "@/utils/filenameRules";
console.log(ACTIVE_FILENAME_RULES);

// 로그 통계 확인
import { getLogStatistics } from "@/utils/parseFilenameLogger";
console.log(getLogStatistics());

// 틀린 로그 확인
import { getIncorrectLogs } from "@/utils/parseFilenameLogger";
console.log(getIncorrectLogs());
```

### 백엔드 API에서

```bash
# 통계
curl http://localhost:5000/api/parse-logs/stats

# 틀린 로그 (상위 10개)
curl http://localhost:5000/api/parse-logs/incorrect?limit=10

# 자주 틀리는 패턴
curl http://localhost:5000/api/parse-logs/analysis/mismatches
```

---

## 로그 내보내기

```bash
# JSON으로 내보내기
curl http://localhost:5000/api/parse-logs/export/json > logs.json

# CSV로 내보내기
curl http://localhost:5000/api/parse-logs/export/csv > logs.csv
```

---

## 새로운 룰 적용

### 1단계: AI 분석

```bash
# 틀린 로그를 JSON으로 내보내기
curl http://localhost:5000/api/parse-logs/export/json > incorrect_logs.json

# AI에게 새로운 룰 제안 요청
# "이 패턴들에 대해 더 나은 정규식을 제안해줘" → ai-rules.json 생성
```

### 2단계: 새로운 룰 적용

```bash
# 일괄 업데이트
curl -X POST http://localhost:5000/api/filename-rules/batch \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d @ai-rules.json
```

### 3단계: 정확도 확인

```bash
# 통계 재확인
curl http://localhost:5000/api/parse-logs/stats
```

---

## 주요 파일

| 파일                                             | 설명                        |
| ------------------------------------------------ | --------------------------- |
| `backend/models/parseLog.model.js`               | ParseLog DB 스키마          |
| `backend/models/filenameRule.model.js`           | FilenameRule DB 스키마      |
| `backend/controllers/parseLog.controller.js`     | ParseLog API 로직           |
| `backend/controllers/filenameRule.controller.js` | FilenameRule API 로직       |
| `backend/routes/parseLog.routes.js`              | ParseLog API 라우트         |
| `backend/routes/filenameRule.routes.js`          | FilenameRule API 라우트     |
| `backend/scripts/seedFilenameRules.js`           | 초기 룰 데이터 시드         |
| `frontend/src/services/parseLogService.ts`       | ParseLog API 클라이언트     |
| `frontend/src/services/filenameRuleService.ts`   | FilenameRule API 클라이언트 |
| `frontend/src/utils/filenameRules.ts`            | 룰 테이블 정의 및 관리      |
| `frontend/src/utils/parseFilenameWithRules.ts`   | 룰 기반 파싱 엔진           |
| `frontend/src/utils/parseFilenameLogger.ts`      | 로그 수집 및 분석           |

---

## 워크플로우

```
파일 업로드
  ↓
파일명 파싱 (룰 기반)
  ↓
환자정보 자동 채우기
  ↓
사용자 입력/수정
  ↓
의뢰 제출
  ↓
파싱 결과 vs 입력값 비교
  ↓
로그 저장 (백엔드 DB)
  ↓
로그 분석 (AI)
  ↓
새로운 룰 제안
  ↓
룰 적용 (일괄 업데이트)
  ↓
정확도 향상
```

---

## 트러블슈팅

### Q: 로그가 저장되지 않음

**A:**

1. 백엔드 API 실행 확인
2. 프론트엔드 콘솔에서 에러 확인
3. 의뢰 제출 시 에러 메시지 확인

### Q: 룰이 로드되지 않음

**A:**

1. DB에 룰이 저장되었는지 확인: `mongo abutsFit` → `db.filenamerules.find()`
2. 프론트엔드 콘솔에서 `loadRulesFromBackend()` 에러 확인

### Q: 파싱 정확도가 낮음

**A:**

1. 틀린 로그 분석: `/api/parse-logs/analysis/mismatches`
2. AI에게 새로운 룰 제안 요청
3. 새로운 룰 적용

---

## 더 알아보기

- [상세 설정 가이드](./SETUP_PARSE_LOG_SYSTEM.md)
- [파일명 파싱 룰 시스템](./FILENAME_PARSING_RULES.md)
