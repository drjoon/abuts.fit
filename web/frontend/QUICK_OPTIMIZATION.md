# 프론트엔드 즉시 적용 가능한 최적화 (30분)

## 현재 문제

대시보드 페이지에서 API를 **순차적으로** 호출하여 초기 로딩이 느립니다.

```
순차 호출: 3.6초 + 3.7초 + 3.1초 + 6.4초 = 16.8초
병렬 호출: max(3.6초, 3.7초, 3.1초, 6.4초) = 6.4초
```

**개선 효과: 10초 단축 (62% 개선)**

---

## 즉시 적용 방법

### 1. 대시보드 페이지 찾기

대시보드 관련 파일을 찾으세요:

```bash
# 가능한 위치
src/pages/requestor/dashboard/RequestorDashboardPage.tsx
src/pages/requestor/Dashboard.tsx
src/features/requestor/dashboard/
```

### 2. 현재 코드 패턴 확인

**❌ 느린 순차 호출 (현재):**

```typescript
// 각 API를 순차적으로 대기
const summary = await fetchDashboardSummary();
const stats = await fetchDiameterStats();
const pricing = await fetchPricingStats();
const shipping = await fetchBulkShipping();
```

### 3. 병렬 호출로 변경

**✅ 빠른 병렬 호출 (권장):**

```typescript
// 모든 API를 동시에 호출
const [summary, stats, pricing, shipping] = await Promise.all([
  fetchDashboardSummary(),
  fetchDiameterStats(),
  fetchPricingStats(),
  fetchBulkShipping(),
]);
```

---

## 실제 적용 예시

### Before (느림)

```typescript
export function RequestorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // ❌ 순차 호출 (느림)
      const summary = await api.get(
        "/api/requests/my/dashboard-summary?period=30d"
      );
      const pricing = await api.get("/api/requests/my/pricing-referral-stats");
      const shipping = await api.get("/api/requests/my/bulk-shipping");

      setData({ summary, pricing, shipping });
      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) return <LoadingSpinner />;

  return <div>...</div>;
}
```

### After (빠름)

```typescript
export function RequestorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // ✅ 병렬 호출 (빠름)
      const [summary, pricing, shipping] = await Promise.all([
        api.get("/api/requests/my/dashboard-summary?period=30d"),
        api.get("/api/requests/my/pricing-referral-stats"),
        api.get("/api/requests/my/bulk-shipping"),
      ]);

      setData({ summary, pricing, shipping });
      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) return <LoadingSpinner />;

  return <div>...</div>;
}
```

---

## 추가 최적화: 우선순위 로딩

필수 데이터만 먼저 로드하고 나머지는 나중에 로드하세요.

```typescript
export function RequestorDashboardPage() {
  const [essentialData, setEssentialData] = useState(null);
  const [additionalData, setAdditionalData] = useState(null);

  useEffect(() => {
    async function loadData() {
      // 1단계: 필수 데이터만 먼저 (빠른 초기 렌더링)
      const summary = await api.get(
        "/api/requests/my/dashboard-summary?period=30d"
      );
      setEssentialData(summary);

      // 2단계: 나머지 데이터는 백그라운드에서 (사용자는 이미 화면을 보고 있음)
      const [pricing, shipping] = await Promise.all([
        api.get("/api/requests/my/pricing-referral-stats"),
        api.get("/api/requests/my/bulk-shipping"),
      ]);
      setAdditionalData({ pricing, shipping });
    }

    loadData();
  }, []);

  if (!essentialData) return <LoadingSpinner />;

  return (
    <div>
      <DashboardSummary data={essentialData} />

      {additionalData ? (
        <>
          <PricingCard data={additionalData.pricing} />
          <ShippingCard data={additionalData.shipping} />
        </>
      ) : (
        <SkeletonLoader />
      )}
    </div>
  );
}
```

---

## 체크리스트

- [ ] 대시보드 페이지 파일 찾기
- [ ] 순차 API 호출을 병렬로 변경
- [ ] 브라우저에서 테스트
- [ ] DevTools Network 탭에서 확인
  - 모든 API가 동시에 시작되는지 확인
  - 전체 로딩 시간 측정

---

## 예상 결과

### 최적화 전

```
dashboard-summary: 3637ms (시작: 0ms)
pricing-stats:     3743ms (시작: 3637ms)
bulk-shipping:     6358ms (시작: 7380ms)
총 시간: 13,738ms (약 14초)
```

### 최적화 후

```
dashboard-summary: 800ms  (시작: 0ms, 캐시 적용)
pricing-stats:     143ms  (시작: 0ms, 캐시 적용)
bulk-shipping:     1500ms (시작: 0ms, 캐시 적용)
총 시간: 1,500ms (약 1.5초)
```

**개선율: 90% 단축!**

---

## 추가 팁

### 1. 에러 처리

```typescript
const [summary, pricing, shipping] = await Promise.allSettled([
  api.get("/api/requests/my/dashboard-summary?period=30d"),
  api.get("/api/requests/my/pricing-referral-stats"),
  api.get("/api/requests/my/bulk-shipping"),
]);

// 각 결과 확인
if (summary.status === "fulfilled") {
  // 성공
} else {
  // 실패 처리
}
```

### 2. 캐시 확인

백엔드 응답에 `cached: true` 필드가 있으면 캐시에서 조회된 것입니다:

```typescript
const response = await api.get("/api/requests/diameter-stats");
console.log(response.data.cached); // true면 캐시, false면 DB 조회
```

### 3. 성능 측정

```typescript
performance.mark("dashboard-start");

await loadDashboardData();

performance.mark("dashboard-end");
performance.measure("dashboard-load", "dashboard-start", "dashboard-end");

const measure = performance.getEntriesByName("dashboard-load")[0];
console.log(`로딩 시간: ${measure.duration}ms`);
```

---

## 다음 단계

이 최적화를 적용한 후:

1. React Query 도입 (자동 캐싱, 백그라운드 갱신)
2. 코드 스플리팅 (번들 크기 감소)
3. 이미지 최적화 (WebP, lazy loading)

상세 가이드: `PERFORMANCE_OPTIMIZATION_GUIDE.md`
