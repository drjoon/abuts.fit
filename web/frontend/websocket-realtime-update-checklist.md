# 웹소켓 실시간 업데이트 자동 점검 체크리스트 (Frontend)

> 목적: 실시간 이벤트 반영 중에도 **모달 비종료**, **입력 비간섭**, **무플리커 부분 갱신**을 유지한다.

## 0) 핵심 원칙 (요약)

- 이벤트 송신: backend role fan-out SSOT
- 이벤트 수신: frontend는 **활성 페이지에서만** 반영
- UX 안정성: 진행 중 작업(타이핑/선택/모달)을 방해하지 않음
- 전체 새로고침/강제 리마운트 대신 payload 기반 부분 patch 또는 최소 재조회

---

## 1) 자동 점검 명령 (한 번에)

아래 명령은 프로젝트 루트(`abuts.fit`) 기준.

### 1-1. app-event 직접 구독 금지 점검

```sh
grep -R "onAppEvent(" web/frontend/src --include="*.ts" --include="*.tsx"
```

기대 결과:
- `shared/realtime/socket.ts`와 `shared/realtime/useAppEventListener.ts` 내부 외에는 없어야 함

### 1-2. 공통 수신 훅 사용 점검

```sh
grep -R "useAppEventListener\|useAppEventDebouncedReload" web/frontend/src --include="*.ts" --include="*.tsx"
```

기대 결과:
- app-event 수신 페이지/훅은 위 두 훅으로 수렴

### 1-3. 웹소켓 반영 중 강제 새로고침 금지 점검

```sh
grep -R "window.location.reload\|location.reload\|navigate(0)" web/frontend/src --include="*.ts" --include="*.tsx"
```

기대 결과:
- 실시간 반영 코드 경로에서 0건

### 1-4. 모달 안정성 점검 포인트

수동 확인 대상:
- `src/shared/components/CreditLedgerModal.tsx`
- `src/pages/requestor/dashboard/RequestorDashboardPage.tsx`

기대 결과:
- 이벤트 수신 시 모달 닫힘/재오픈 없이 데이터만 갱신

---

## 2) 주요 웹소켓 실시간 업데이트 파일 지도

### 공통 레이어
- `src/shared/realtime/socket.ts`
- `src/shared/realtime/useAppEventListener.ts`
- `src/shared/realtime/useAppEventDebouncedReload.ts`

### app-event 수신 주요 페이지/훅
- `src/features/layout/DashboardLayout.tsx`
- 제조사 준비 탭 라이노 완료: `request:stage-changed`(source=`bg-file-processed`) /
  `request:stl-metadata-updated`(source=`bg-file-processed:2-filled`) /
  notification `bg-file-processed`(step=`2-filled`) → `caseInfos.camFile.s3Key` 패치 후 카드 블러 해제
  (`useWorksheetRealtimeStatus` + `WorksheetCardGrid`)
- `src/pages/admin/credits/hooks/useAdminCreditPage.ts`
- `src/pages/admin/AdminPaymentsPage.tsx`
- `src/pages/admin/support/AdminBusinessRegistrationInquiryPage.tsx`
- `src/pages/requestor/dashboard/RequestorDashboardPage.tsx`
- `src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx`
- `src/pages/requestor/practice/RequestorPracticePage.tsx`
- `src/pages/practice/PracticeFileTransferPage.tsx`
- `src/shared/components/CreditLedgerModal.tsx`
- `src/features/requests/hooks/useStlMetadata.ts`
- `src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts`
- `src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/usePackingCapture.ts`

### notification/CNC 소켓 이벤트 수신
- `src/shared/hooks/useNotifications.ts`
- `src/shared/hooks/useSocket.ts`
- `src/pages/manufacturer/equipment/cnc/hooks/useCncDashboardQueues.ts`
- `src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts`

---

## 3) 이슈 발생 시 즉시 점검 순서

1. 이벤트 수신 여부 확인 (브라우저 콘솔 + 네트워크)
2. 활성 페이지 조건/role 조건/ID 조건(`businessAnchorId`, `requestId`) 확인
3. `deferWhenEditing` 설정 확인
4. 모달/다이얼로그가 상위 스켈레톤 분기로 언마운트되지 않는지 확인
5. 전체 재조회가 필요한지, payload patch로 줄일 수 있는지 재검토

---

## 4) 이번 세션 회귀 방지 시나리오

- CAM 승인 후:
  - 제조사 CAM 목록 즉시 반영
  - 의뢰자 크레딧 내역 모달 **열린 상태 유지** + 데이터 갱신
  - 관리자 정산 페이지 **지연 최소화** + 무플리커 반영

위 3개를 최소 회귀 테스트로 유지한다.
