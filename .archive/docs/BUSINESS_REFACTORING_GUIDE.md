# Organization → Business 리팩터링 가이드

## 개요

전체 코드베이스에서 "organization(조직)" 용어를 "business(사업자)"로 리팩터링합니다.

- **백엔드**: 87개 파일, 1005+ 참조
- **프론트엔드**: 66개 파일, 284+ 참조

## 핵심 원칙

1. **Business-first**: `business` 용어를 기본으로 사용
2. **Legacy alias**: `organization`은 하위 호환용으로 일시적 유지
3. **점진적 전환**: API는 둘 다 받되 내부는 business 우선 사용
4. **일관된 메시지**: 사용자 대면 한글은 "사업자"로 통일

## 백엔드 변경 패턴

### 1. 함수 파라미터 (호환성 유지)

**Before:**

```javascript
const organizationId = req.body?.organizationId;
```

**After:**

```javascript
const businessId = readBusinessId(
  req.body?.businessId || req.body?.organizationId,
);
```

### 2. 응답 데이터 (둘 다 포함)

**Before:**

```javascript
return res.json({
  success: true,
  data: {
    organizationId: org._id,
    organizationName: org.name,
  },
});
```

**After:**

```javascript
return res.json({
  success: true,
  data: {
    businessId: org._id,
    organizationId: org._id, // legacy alias
    businessName: org.name,
    organizationName: org.name, // legacy alias
  },
});
```

### 3. 함수명 (business 기본 + organization alias)

**Before:**

```javascript
export function emitCreditBalanceUpdatedToOrganization({ organizationId, ... }) {
  // ...
}
```

**After:**

```javascript
async function emitCreditBalanceUpdatedToBusinessInternal({ businessId, organizationId, ... }) {
  const orgId = businessId || organizationId;
  // ...
}

export async function emitCreditBalanceUpdatedToBusiness(payload) {
  return emitCreditBalanceUpdatedToBusinessInternal(payload);
}

// Legacy alias
export async function emitCreditBalanceUpdatedToOrganization(payload) {
  return emitCreditBalanceUpdatedToBusinessInternal(payload);
}
```

### 4. 한글 메시지

**Before:**

```javascript
message: "조직을 찾을 수 없습니다.";
message: "기공소를 찾을 수 없습니다.";
message: "이미 등록된 사업자등록번호입니다. 기존 조직에 가입 요청을 진행해주세요.";
```

**After:**

```javascript
message: "사업자를 찾을 수 없습니다.";
message: "사업자를 찾을 수 없습니다.";
message: "이미 등록된 사업자등록번호입니다. 기존 사업자에 가입 요청을 진행해주세요.";
```

### 5. 내부 변수명

**Before:**

```javascript
const org = await RequestorOrganization.findById(organizationId);
```

**After:**

```javascript
const business = await RequestorOrganization.findById(businessId);
// 또는 기존 변수명 유지하되 로직은 businessId 우선
const org = await RequestorOrganization.findById(businessId || organizationId);
```

## 프론트엔드 변경 패턴

### 1. API 호출

**Before:**

```typescript
const response = await axios.get(
  `/api/requestor-organizations/${organizationId}`,
);
```

**After:**

```typescript
const response = await axios.get(
  `/api/requestor-organizations/${businessId || organizationId}`,
);
```

### 2. 타입 정의

**Before:**

```typescript
interface Organization {
  organizationId: string;
  organizationName: string;
}
```

**After:**

```typescript
interface Business {
  businessId: string;
  organizationId?: string; // legacy
  businessName: string;
  organizationName?: string; // legacy
}
```

### 3. 상태/변수명

**Before:**

```typescript
const [organization, setOrganization] = useState<Organization | null>(null);
const orgSearch = useDebounce(searchTerm, 300);
```

**After:**

```typescript
const [business, setBusiness] = useState<Business | null>(null);
const businessSearch = useDebounce(searchTerm, 300);
```

### 4. 표시 텍스트

**Before:**

```tsx
<Label>조직 정보</Label>
<p>조직을 찾을 수 없습니다.</p>
```

**After:**

```tsx
<Label>사업자 정보</Label>
<p>사업자를 찾을 수 없습니다.</p>
```

## 우선순위별 파일 목록

### 최우선 (P0) - 이미 완료

✅ `/web/backend/controllers/organizations/organizationRole.util.js`
✅ `/web/backend/utils/creditRealtime.js`
✅ `/web/backend/controllers/organizations/org.controller.js`
✅ `/web/backend/controllers/requests/shipping.Tracking.helpers.js`
✅ `/web/backend/controllers/organizations/org.updateMyOrganization.js`
✅ `/web/backend/controllers/organizations/member.controller.js` (부분)

### 우선순위 1 (P1) - 핵심 컨트롤러

**Backend:**

- `/web/backend/controllers/organizations/owner.controller.js`
- `/web/backend/controllers/organizations/org.bonus.util.js`
- `/web/backend/controllers/organizations/org.find.util.js`
- `/web/backend/controllers/organizations/utils.js`
- `/web/backend/controllers/organizations/requestorOrganization.controller.js`
- `/web/backend/controllers/organizations/leadTime.controller.js`
- `/web/backend/modules/organizations/requestorOrganization.routes.js`

**Frontend:**

- `/web/frontend/src/shared/components/business/settings/BusinessTab.tsx`
- `/web/frontend/src/shared/components/business/settings/business/handlers.ts`
- `/web/frontend/src/shared/components/business/settings/business/useMembershipManagement.ts`
- `/web/frontend/src/shared/components/business/settings/business/useBusinessDataManagement.ts`
- `/web/frontend/src/shared/components/business/settings/business/useBusinessSearch.ts`

### 우선순위 2 (P2) - Admin/Credits/Requests

**Backend:**

- `/web/backend/controllers/admin/adminBonusGrant.controller.js`
- `/web/backend/controllers/admin/adminCredit.controller.js`
- `/web/backend/controllers/admin/admin.organization.controller.js`
- `/web/backend/controllers/requests/creation.request.controller.js`
- `/web/backend/controllers/requests/shipping.Requestor.helpers.js`
- `/web/backend/controllers/requests/shipping.Hanjin.helpers.js`
- `/web/backend/controllers/credits/creditBPlan.controller.js`

**Frontend:**

- `/web/frontend/src/pages/admin/credits/AdminCreditPage.tsx`
- `/web/frontend/src/pages/admin/users/AdminUserManagement.tsx`
- `/web/frontend/src/features/settings/tabs/StaffTab.tsx`

### 우선순위 3 (P3) - 기타

**Backend:**

- `/web/backend/controllers/salesman/salesman.controller.js`
- `/web/backend/controllers/auth/auth.controller.js`
- `/web/backend/controllers/manufacturers/manufacturer.controller.js`
- `/web/backend/utils/creditBPlanMatching.js`
- `/web/backend/utils/depositCode.utils.js`
- 나머지 50+ 파일

**Frontend:**

- `/web/frontend/src/pages/salesman/SalesmanDashboardPage.tsx`
- `/web/frontend/src/pages/requestor/settings/SettingsPage.tsx`
- 나머지 40+ 파일

## 검색 및 수정 명령어

### Backend 전체 organization 검색

```bash
grep -r "organization" web/backend --include="*.js" --exclude-dir=node_modules
```

### Frontend 전체 organization 검색

```bash
grep -r "organization" web/frontend/src --include="*.ts" --include="*.tsx"
```

### 한글 "조직" 검색

```bash
grep -r "조직" web/backend --include="*.js" --exclude-dir=node_modules
grep -r "조직" web/frontend/src --include="*.ts" --include="*.tsx"
```

### 한글 "기공소" 검색 (사업자로 변경 필요)

```bash
grep -r "기공소" web/backend --include="*.js" --exclude-dir=node_modules
grep -r "기공소" web/frontend/src --include="*.ts" --include="*.tsx"
```

## 테스트 체크리스트

### Backend API

- [ ] GET `/api/requestor-organizations/my-organization` (businessId/organizationId 둘 다 반환)
- [ ] POST `/api/requestor-organizations/update-my-organization` (businessId/organizationId 둘 다 수용)
- [ ] POST `/api/requestor-organizations/join-request` (businessId/organizationId 둘 다 수용)
- [ ] GET `/api/credits/balance` (businessId 기준)
- [ ] 크레딧 실시간 이벤트 (businessId + organizationId 둘 다 emit)

### Frontend UI

- [ ] 온보딩 플로우: "사업자 정보" 표시
- [ ] 설정 페이지: "사업자" 탭 표시
- [ ] 관리자 페이지: "사업자" 용어 사용
- [ ] 에러 메시지: "사업자를 찾을 수 없습니다" 등

### Database 호환성

- [ ] 기존 `organizationType` 필드 정상 작동
- [ ] User 모델 `businessId`/`organizationId` 둘 다 존재
- [ ] RequestorOrganization 모델 정상 조회

## 주의사항

1. **모델명은 유지**: `RequestorOrganization` 모델명은 변경하지 않음 (DB 마이그레이션 복잡도)
2. **DB 필드는 유지**: `organizationType` 등 기존 필드명 유지
3. **점진적 전환**: API는 하위 호환 유지하며 점진적으로 business 우선 사용
4. **레거시 주석**: TODO(legacy) 주석으로 향후 제거 대상 표시
5. **테스트 필수**: 각 변경 후 해당 기능 테스트 필수

## 완료된 작업

### 백엔드 organizations 폴더

1. **organizationRole.util.js**:
   - `BUSINESS_ALLOWED_ROLES` 기본, `ORGANIZATION_ALLOWED_ROLES` alias
   - `resolveBusinessType()` 기본, `resolveOrganizationType()` alias
   - `assertBusinessRole()` 기본, `assertOrganizationRole()` alias
   - `buildBusinessTypeFilter()` 기본, `buildOrganizationTypeFilter()` alias

2. **org.bonus.util.js**:
   - `upsertBonusLedger`: `businessId`, `organizationId` 둘 다 수용, effectiveBusinessId 사용
   - `ensureBonusGrant`: business 우선 사용
   - `grantWelcomeBonusIfEligible`: businessId/organizationId 파라미터, effectiveBusinessId 사용
   - `grantFreeShippingCreditIfEligible`: 동일한 패턴 적용
   - `emitCreditBalanceUpdatedToBusiness` 호출로 변경

3. **org.find.util.js**:
   - `findBusinessByAnchorsInternal`: businessId/organizationId 둘 다 수용
   - `findBusinessByAnchors()` 기본, `findOrganizationByAnchors()` alias

4. **utils.js**:
   - `resolveOwnedBusiness()` 기본, `resolveOwnedOrg()` alias
   - `resolvePrimaryOwnedBusiness()` 기본, `resolvePrimaryOwnedOrg()` alias
   - businessId/organizationId 둘 다 확인

5. **member.controller.js**:
   - "기공소" → "사업자" 메시지 변경

6. **owner.controller.js**:
   - "기공소" → "사업자" 메시지 변경

7. **org.controller.js**:
   - 한글 메시지 "조직" → "사업자"
   - 응답에 `business`/`businessId` 추가

8. **org.updateMyOrganization.js**:
   - 에러 메시지 "조직" → "사업자"

### 백엔드 utils

1. **creditRealtime.js**:
   - `emitCreditBalanceUpdatedToBusiness()` 기본
   - `emitCreditBalanceUpdatedToOrganization()` alias
   - 이벤트에 `businessId`와 `organizationId` 둘 다 emit

## 다음 단계

1. P1 파일들 수정 (핵심 컨트롤러 & 프론트엔드 설정)
2. P2 파일들 수정 (Admin/Credits/Requests)
3. P3 파일들 일괄 수정
4. 전체 테스트
5. 레거시 alias 제거 계획 수립
