# 프론트엔드 성능 최적화 가이드

- 이 문서는 **아카이브된 운영/히스토리 문서**입니다.
- 현재 기준 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.

## 개요

백엔드 성능 최적화와 함께 프론트엔드에서도 병렬 API 호출 및 캐싱을 적용하여 초기 로딩 속도를 더욱 개선할 수 있습니다.

## 백엔드 최적화 완료 사항

### 적용된 최적화

1. **MongoDB Aggregation 쿼리**: 메모리 사용량 대폭 감소
2. **N+1 쿼리 제거**: Chat API 성능 82% 개선
3. **복합 인덱스 추가**: Request, Chat 모델 쿼리 속도 향상
4. **병렬 조회**: GuideProgress, PricingStats 등
5. **메모리 캐싱**: 자주 조회되는 데이터 캐싱 (1분~5분 TTL)

### API 응답 시간 개선

| API               | 이전   | 이후   | 개선율         |
| ----------------- | ------ | ------ | -------------- |
| dashboard-summary | 4114ms | ~800ms | 80%            |
| diameter-stats    | 3328ms | ~600ms | 82%            |
| support-room      | 2851ms | ~500ms | 82%            |
| pricing-stats     | -      | ~400ms | 병렬 조회 적용 |

---

## 프론트엔드 최적화 권장 사항

### 1. 병렬 API 호출

현재 대시보드 페이지에서 순차적으로 호출되는 API들을 병렬로 변경하세요.

#### 현재 (순차 호출)

```typescript
// ❌ 느림: 각 API를 순차적으로 대기
const summary = await fetchDashboardSummary();
const stats = await fetchDiameterStats();
const pricing = await fetchPricingStats();
const bulkShipping = await fetchBulkShipping();
```

#### 권장 (병렬 호출)

```typescript
// ✅ 빠름: 모든 API를 동시에 호출
const [summary, stats, pricing, bulkShipping] = await Promise.all([
  fetchDashboardSummary(),
  fetchDiameterStats(),
  fetchPricingStats(),
  fetchBulkShipping(),
]);
```

**예상 개선:**

- 순차: 800ms + 600ms + 400ms + 1500ms = **3300ms**
- 병렬: max(800ms, 600ms, 400ms, 1500ms) = **1500ms**
- **개선율: 55% 단축**

---

### 2. React Query 도입 (권장)

React Query를 사용하면 자동 캐싱, 백그라운드 갱신, 중복 요청 제거 등의 이점을 얻을 수 있습니다.

#### 설치

```bash
npm install @tanstack/react-query
```

#### 설정

```typescript
// src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1분
      cacheTime: 5 * 60 * 1000, // 5분
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

```typescript
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

function App() {
  return (
    <QueryClientProvider client={queryClient}>{/* ... */}</QueryClientProvider>
  );
}
```

#### 사용 예시

```typescript
// src/hooks/useDashboardData.ts
import { useQueries } from "@tanstack/react-query";

export function useDashboardData(period = "30d") {
  const results = useQueries({
    queries: [
      {
        queryKey: ["dashboard", "summary", period],
        queryFn: () => fetchDashboardSummary(period),
        staleTime: 60 * 1000, // 1분
      },
      {
        queryKey: ["dashboard", "diameter-stats"],
        queryFn: () => fetchDiameterStats(),
        staleTime: 5 * 60 * 1000, // 5분
      },
      {
        queryKey: ["dashboard", "pricing-stats"],
        queryFn: () => fetchPricingStats(),
        staleTime: 5 * 60 * 1000, // 5분
      },
      {
        queryKey: ["dashboard", "bulk-shipping"],
        queryFn: () => fetchBulkShipping(),
        staleTime: 60 * 1000, // 1분
      },
    ],
  });

  return {
    summary: results[0].data,
    diameterStats: results[1].data,
    pricingStats: results[2].data,
    bulkShipping: results[3].data,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
```

#### 컴포넌트에서 사용

```typescript
// src/pages/requestor/dashboard/RequestorDashboardPage.tsx
import { useDashboardData } from "@/hooks/useDashboardData";

export function RequestorDashboardPage() {
  const { summary, diameterStats, pricingStats, bulkShipping, isLoading } =
    useDashboardData("30d");

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <DashboardSummaryCard data={summary} />
      <DiameterStatsCard data={diameterStats} />
      <PricingCard data={pricingStats} />
      <BulkShippingCard data={bulkShipping} />
    </div>
  );
}
```

**장점:**

- ✅ 자동 캐싱 (중복 요청 방지)
- ✅ 백그라운드 갱신 (사용자가 페이지를 다시 방문할 때 자동 갱신)
- ✅ 낙관적 업데이트 지원
- ✅ 로딩/에러 상태 자동 관리
- ✅ DevTools로 쿼리 상태 모니터링

---

### 3. 우선순위 기반 로딩

필수 데이터만 먼저 로드하고, 나머지는 lazy loading으로 처리하세요.

```typescript
// 1단계: 필수 데이터만 로드 (빠른 초기 렌더링)
const { summary } = await fetchDashboardSummary();

// 2단계: 나머지 데이터는 백그라운드에서 로드
Promise.all([
  fetchDiameterStats(),
  fetchPricingStats(),
  fetchBulkShipping(),
]).then(([stats, pricing, shipping]) => {
  // 데이터 도착 시 UI 업데이트
});
```

---

### 4. 캐시 무효화 전략

데이터가 변경되었을 때 캐시를 적절히 무효화하세요.

```typescript
import { useQueryClient } from "@tanstack/react-query";

function useRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRequest,
    onSuccess: () => {
      // 의뢰 생성 후 관련 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
```

---

### 5. 백엔드 캐시 활용

백엔드에서 제공하는 캐시를 활용하세요. 응답에 `cached: true` 필드가 있으면 캐시된 데이터입니다.

```typescript
const response = await fetch("/api/requests/diameter-stats");
const data = await response.json();

if (data.cached) {
  console.log("✅ 캐시에서 조회 (빠름)");
} else {
  console.log("⏱️ DB에서 조회 (느림)");
}
```

---

## 구현 우선순위

### Phase 1: 즉시 적용 가능 (30분)

1. ✅ **병렬 API 호출**: Promise.all 사용
2. ✅ **불필요한 API 호출 제거**: 중복 요청 확인

### Phase 2: 단기 개선 (2-3시간)

3. 🔄 **React Query 도입**: 기본 설정 및 주요 API 적용
4. 🔄 **우선순위 로딩**: 필수 데이터 먼저 로드

### Phase 3: 중기 개선 (1-2일)

5. 📋 **캐시 무효화 전략**: Mutation 후 자동 갱신
6. 📋 **낙관적 업데이트**: 사용자 경험 개선
7. 📋 **에러 재시도 로직**: 네트워크 오류 대응

---

## 성능 측정

### Chrome DevTools 활용

```javascript
// Performance 탭에서 측정
performance.mark("dashboard-start");

// API 호출
await loadDashboardData();

performance.mark("dashboard-end");
performance.measure("dashboard-load", "dashboard-start", "dashboard-end");

const measure = performance.getEntriesByName("dashboard-load")[0];
console.log(`Dashboard 로딩 시간: ${measure.duration}ms`);
```

### 목표 성능 지표

- **초기 로딩 (FCP)**: < 1.5초
- **대시보드 데이터 로드**: < 2초
- **페이지 전환**: < 500ms

---

## 체크리스트

### 백엔드 최적화 (완료)

- [x] MongoDB Aggregation 쿼리 적용
- [x] N+1 쿼리 제거
- [x] 복합 인덱스 추가
- [x] 메모리 캐싱 구현
- [x] 병렬 조회 적용

### 프론트엔드 최적화 (권장)

- [ ] 병렬 API 호출 적용
- [ ] React Query 도입
- [ ] 우선순위 기반 로딩
- [ ] 캐시 무효화 전략
- [ ] 성능 측정 및 모니터링

---

## 참고 자료

- [React Query 공식 문서](https://tanstack.com/query/latest)
- [Web Vitals 가이드](https://web.dev/vitals/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

---

## 문의

성능 최적화 관련 문의사항은 백엔드 팀에 문의하세요.

- 백엔드 최적화 문서: `backend/PERFORMANCE_OPTIMIZATION.md`
- 캐싱 유틸리티: `backend/utils/cache.utils.js`
