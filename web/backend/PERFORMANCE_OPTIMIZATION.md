# 백엔드 성능 최적화 문서

## 개요

초기 로딩 시 느린 API 응답 속도를 개선하기 위한 전반적인 백엔드 성능 최적화 작업을 수행했습니다.

## 최적화 전 성능 문제

### 느린 API 엔드포인트 (초기 로딩 시)

1. `/api/requests/my/dashboard-summary`: **4114ms**
2. `/api/requests/my/bulk-shipping`: **3822ms**
3. `/api/requests/diameter-stats`: **3328ms**
4. `/api/chats/support-room`: **2851ms**
5. `/api/guide-progress/requestor-onboarding`: **2147ms**

### 주요 문제점

1. **N+1 쿼리 문제**: Chat 관련 API에서 각 채팅방마다 별도 쿼리 실행
2. **메모리 과다 사용**: 모든 Request를 메모리로 로드 후 필터링
3. **순차 처리**: 병렬 처리 가능한 쿼리를 순차적으로 실행
4. **인덱스 부족**: 복합 조건 쿼리에 대한 인덱스 미비

## 최적화 작업 내용

### 1. Chat 모델 인덱스 추가 및 N+1 쿼리 개선

#### 변경 파일

- `models/chat.model.js`
- `controllers/chat.controller.js`

#### 최적화 내용

**인덱스 추가:**

```javascript
// 미읽음 메시지 조회 최적화
chatSchema.index({ roomId: 1, sender: 1, "readBy.userId": 1 });

// 삭제되지 않은 메시지 조회
chatSchema.index({ roomId: 1, isDeleted: 1, createdAt: -1 });
```

**N+1 쿼리 제거:**

- **이전**: 각 채팅방마다 2개의 쿼리 실행 (unreadCount, lastMessage)
- **이후**: MongoDB Aggregation으로 한 번에 조회

```javascript
// getMyChatRooms: 모든 채팅방의 통계를 한 번의 집계 쿼리로 조회
const stats = await Chat.aggregate([
  { $match: { roomId: { $in: roomIds }, isDeleted: false } },
  {
    $group: {
      _id: "$roomId",
      unreadCount: { $sum: { $cond: [...] } },
      lastMessage: { $last: "$$ROOT" },
    },
  },
  // ...
]);
```

**성능 개선:**

- 채팅방 10개 기준: 20개 쿼리 → 2개 쿼리
- 예상 응답 시간: 2851ms → **~500ms** (약 82% 개선)

---

### 2. Request 모델 인덱스 최적화

#### 변경 파일

- `models/request.model.js`

#### 최적화 내용

**복합 인덱스 추가:**

```javascript
// 대시보드 조회 최적화
requestSchema.index({
  requestorOrganizationId: 1,
  status: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

// 제조사 대시보드 조회
requestSchema.index({
  manufacturer: 1,
  status: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

// 배송 모드 및 상태 기반 조회
requestSchema.index({
  requestorOrganizationId: 1,
  status: 1,
  shippingMode: 1,
});
```

**효과:**

- 복합 조건 쿼리 시 인덱스 스캔으로 성능 대폭 향상
- Collection Scan 방지

---

### 3. Dashboard 쿼리 집계 함수로 최적화

#### 변경 파일

- `controllers/request/dashboard.controller.js`

#### 최적화 내용

**getDiameterStats:**

- **이전**: 모든 Request를 메모리로 로드 후 JavaScript로 통계 계산
- **이후**: MongoDB Aggregation으로 DB에서 직접 계산

```javascript
const stats = await Request.aggregate([
  { $match: filter },
  {
    $group: {
      _id: null,
      d6Count: { $sum: { $cond: [...] } },
      d8Count: { $sum: { $cond: [...] } },
      d10Count: { $sum: { $cond: [...] } },
      d10plusCount: { $sum: { $cond: [...] } },
    },
  },
]);
```

**getMyDashboardSummary:**

- **이전**: 모든 Request를 populate하여 메모리로 로드 후 필터링
- **이후**: 집계 쿼리로 통계 계산 + 최근 5건만 조회

```javascript
const [statsResult, recentRequestsResult] = await Promise.all([
  Request.aggregate([
    { $match: { ...filter } },
    {
      $addFields: {
        normalizedStage: { $switch: { branches: [...] } },
      },
    },
    {
      $group: {
        _id: null,
        designCount: { $sum: { $cond: [...] } },
        camCount: { $sum: { $cond: [...] } },
        // ...
      },
    },
  ]),
  Request.find({ ...filter })
    .select("필요한 필드만")
    .limit(5)
    .lean(),
]);
```

**성능 개선:**

- 메모리 사용량: 수백 개 문서 → 통계 결과만
- 예상 응답 시간: 4114ms → **~800ms** (약 80% 개선)
- 네트워크 전송량: 대폭 감소

**주의사항:**

- `riskSummary`와 `diameterStats`는 별도 API(`/api/requests/dashboard-risk-summary`, `/api/requests/diameter-stats`) 사용 권장
- 초기 로딩 속도 최적화를 위해 대시보드 요약에서는 기본값 반환

---

### 4. GuideProgress 병렬 조회

#### 변경 파일

- `controllers/guideProgress.controller.js`

#### 최적화 내용

**이전:**

```javascript
const user = await User.findById(req.user._id).lean();
let organization = null;
if (user?.organizationId) {
  organization = await RequestorOrganization.findById(
    user.organizationId
  ).lean();
}
```

**이후:**

```javascript
const [user, organization] = await Promise.all([
  User.findById(req.user._id).lean(),
  req.user.organizationId
    ? RequestorOrganization.findById(req.user.organizationId).lean()
    : Promise.resolve(null),
]);
```

**성능 개선:**

- 순차 실행 → 병렬 실행
- 예상 응답 시간: 2147ms → **~1000ms** (약 53% 개선)

---

## 예상 성능 개선 결과

### API 응답 시간 비교

| API 엔드포인트                             | 최적화 전 | 최적화 후 (예상) | 개선율 |
| ------------------------------------------ | --------- | ---------------- | ------ |
| `/api/requests/my/dashboard-summary`       | 4114ms    | ~800ms           | 80%    |
| `/api/requests/my/bulk-shipping`           | 3822ms    | ~1500ms          | 61%    |
| `/api/requests/diameter-stats`             | 3328ms    | ~600ms           | 82%    |
| `/api/chats/support-room`                  | 2851ms    | ~500ms           | 82%    |
| `/api/guide-progress/requestor-onboarding` | 2147ms    | ~1000ms          | 53%    |

### 전체 초기 로딩 시간

- **최적화 전**: ~16초
- **최적화 후 (예상)**: **~4.4초**
- **개선율**: 약 **72% 단축**

---

## 추가 권장 사항

### 1. 캐싱 전략

```javascript
// Redis 또는 메모리 캐시 활용
const CACHE_TTL = 5 * 60 * 1000; // 5분

// 자주 조회되는 데이터 캐싱
- leadDays (배송 리드타임)
- diameterStats (직경별 통계)
- 사용자별 대시보드 요약 (1분 TTL)
```

### 2. API 분리

현재 `dashboard-summary`에서 제공하는 데이터를 용도별로 분리:

- `/api/requests/my/stats`: 기본 통계만
- `/api/requests/my/recent`: 최근 의뢰 목록
- `/api/requests/dashboard-risk-summary`: 지연 위험 요약 (이미 존재)
- `/api/requests/diameter-stats`: 직경별 통계 (이미 존재)

### 3. 프론트엔드 최적화

- 병렬 API 호출로 초기 로딩 속도 개선
- 필수 데이터만 먼저 로드 후 나머지는 lazy loading
- React Query 등으로 캐싱 및 백그라운드 갱신

### 4. 인덱스 모니터링

```javascript
// 프로덕션 환경에서 느린 쿼리 로깅
mongoose.set("debug", (collectionName, method, query, doc) => {
  console.log(`${collectionName}.${method}`, JSON.stringify(query));
});

// MongoDB Atlas에서 Performance Advisor 활용
// 자주 사용되는 쿼리 패턴에 대한 인덱스 제안 확인
```

### 5. 데이터베이스 최적화

- MongoDB Atlas의 Performance Insights 활용
- 주기적인 인덱스 재구성 (reIndex)
- 불필요한 인덱스 제거 (쓰기 성능 개선)

---

## 배포 시 주의사항

### 1. 인덱스 생성

새로운 인덱스는 서버 재시작 시 자동 생성되지만, 프로덕션에서는 수동으로 생성 권장:

```javascript
// MongoDB Shell에서 실행
db.chats.createIndex({ roomId: 1, sender: 1, "readBy.userId": 1 });
db.chats.createIndex({ roomId: 1, isDeleted: 1, createdAt: -1 });

db.requests.createIndex({
  requestorOrganizationId: 1,
  status: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

db.requests.createIndex({
  manufacturer: 1,
  status: 1,
  "caseInfos.implantSystem": 1,
  createdAt: -1,
});

db.requests.createIndex({
  requestorOrganizationId: 1,
  status: 1,
  shippingMode: 1,
});
```

### 2. 백업

- 최적화 전 백업 파일: `controllers/request/dashboard.controller.backup.js`
- 문제 발생 시 롤백 가능

### 3. 모니터링

배포 후 다음 지표 모니터링:

- API 응답 시간
- 데이터베이스 CPU/메모리 사용률
- 인덱스 사용률
- 에러 로그

---

## 테스트 체크리스트

- [ ] Chat 관련 API 정상 동작 확인

  - [ ] 채팅방 목록 조회
  - [ ] 고객지원 채팅방 생성/조회
  - [ ] 미읽음 메시지 수 정확성

- [ ] Dashboard API 정상 동작 확인

  - [ ] 대시보드 요약 데이터 정확성
  - [ ] 직경별 통계 정확성
  - [ ] 최근 의뢰 목록 정확성

- [ ] GuideProgress API 정상 동작 확인

  - [ ] 온보딩 진행 상태 조회
  - [ ] 단계별 완료 상태 정확성

- [ ] 성능 측정
  - [ ] 각 API 응답 시간 측정
  - [ ] 전체 초기 로딩 시간 측정
  - [ ] 데이터베이스 쿼리 실행 계획 확인

---

## 변경 이력

### 2025-12-31

- Chat 모델 인덱스 추가 및 N+1 쿼리 개선
- Request 모델 복합 인덱스 추가
- Dashboard 쿼리 집계 함수로 최적화
- GuideProgress 병렬 조회로 변경
- 성능 최적화 문서 작성
