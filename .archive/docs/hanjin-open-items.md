## 최신 현황 (2026-02-26)

- 이 문서는 **아카이브된 진행 메모**입니다.
- 현재 기준 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.

- **완료**
  - DeliveryInfo 스키마/웹훅 수신 정비(추적 이벤트+정산) — `web/backend/controllers/webhooks/hanjinWebhook.controller.js`.
  - Hanjin HMAC 서비스 계층 구축 — `web/backend/services/hanjin.service.js`.
  - 운송장 출력/수거 접수/수거 취소 컨트롤러 + 라우트 추가 — `web/backend/controllers/requests/shipping.controller.js`, `web/backend/modules/requests/request.routes.js`.
  - 프론트 `MailboxGrid`에서 mock 호출 제거, 실 API 연동 — `web/frontend/.../MailboxGrid.tsx`.

- **진행 중/잔여 작업**
  1. 한진 응답 데이터에 맞춘 DeliveryInfo/Request 후처리 자동화를 추가(운송장 번호 저장, stage 전환 자동화).
  2. Shipping UI에 실시간 상태/오류 표시, webhook 기반 트래킹 타임라인.
  3. 통합 테스트 및 운영 플레이북 작성.

## 환경 변수 정리

| 키                           | 용도                            | 비고                              |
| ---------------------------- | ------------------------------- | --------------------------------- |
| `HANJIN_CLIENT_ID`           | API client id                   | 필수                              |
| `HANJIN_API_KEY`             | API key (`x-api-key`)           | 필수                              |
| `HANJIN_SECRET_KEY`          | HMAC secret                     | 필수                              |
| `HANJIN_PRINT_BASE_URL`      | 운송장/라벨 API base            | 기본 `https://ebbapd.hjt.co.kr`   |
| `HANJIN_ORDER_BASE_URL`      | 주문/수거 API base              | 기본 `https://api-stg.hanjin.com` |
| `HANJIN_CUSTOMER_BASE_URL`   | 고객/기타 API base              | 선택                              |
| `HANJIN_PRINT_WBL_PATH`      | 라벨 API path                   | 예: `/api/ebz/label/print`        |
| `HANJIN_PICKUP_REQUEST_PATH` | 수거 접수 path                  | 예: `/api/pd/order/booking`       |
| `HANJIN_PICKUP_CANCEL_PATH`  | 수거 취소 path                  | 예: `/api/pd/order/cancel`        |
| `HANJIN_TIMEOUT_MS`          | API 타임아웃(ms)                | 기본 15000                        |
| `HANJIN_WEBHOOK_SECRET`      | webhook 헤더 `x-webhook-secret` | 운영 필수                         |
| `DEBUG_HANJIN_WEBHOOK`       | webhook debug 로그              | optional                          |

> **주의**: path는 HMAC canonical string에 들어가므로 앞뒤 슬래시/쿼리 포함 정확히 입력해야 함.

## Backend 흐름

1. **HMAC 서비스 (`hanjin.service.js`)**
   - `resolveUrl`로 base+path 조합 → canon path를 HMAC에 사용.
   - `buildAuthorizationHeader`: `client_id=<id> timestamp=<yyyymmddHHMMSS> signature=<base64>`.
   - `requestPrintApi` / `requestOrderApi` 헬퍼로 baseUrl을 고정하고 나머지 옵션 전달.

2. **Shipping 컨트롤러 (`shipping.controller.js`)**
   - `mailboxAddresses` 기준으로 stage=`포장.발송` 의뢰 조회.
   - `buildHanjinDraftPayload`로 배송지/클리닉/우편함 묶음 생성 후 API 호출.
   - `payload`를 직접 전달하면 override 가능 (수동 패킷 테스트용).
   - 모든 엔드포인트는 성공 시 `{ success: true, data: <hanjin 응답> }` 반환.
   - **Payload 수정 포인트:** `resolveHanjinPayload` 및 `buildHanjinDraftPayload`(@web/backend/controllers/requests/shipping.controller.js)에서 받은/보낸 분, 의뢰 상세 정보가 조합된다. 향후 포맷 변경 시 이 함수만 고치면 됨.

3. **프론트엔드 프린터 처리 (`MailboxGrid.tsx`)**
   - 프론트는 `/shipping/hanjin/print-labels` 호출 시 기본적으로 `mailboxAddresses`만 전송하며, DEV 테스트 시에는 `payload`를 그대로 전달해 백엔드 로직을 우회할 수 있다.
   - API 응답에는 한진에서 내려준 운송장 데이터가 포함되며, **실제 어떤 프린터로 출력할지 결정하는 책임은 브라우저/클라이언트에 있다.**
   - 설정된 프린터/매수는 `localStorage (worksheet:printer:*)`에 저장되어 `MailboxGrid`에서 유지하며, 응답을 받은 뒤에는 해당 설정값을 참고해 로컬 출력 워크플로(예: 새 창으로 라벨 미리보기 후 `window.print()`, 드라이버 앱 연동 등)를 수행해야 한다.

## 로컬 프린터 에이전트 (Silent Print)

- 위치: `bg/print-server/app.js`
- 역할: `http://localhost:5777`에서 프린터 목록/출력 API 제공
  - `GET /printers` → 시스템 프린터 목록 반환
  - `POST /print` → `{ url | base64, printer, title }`로 OS 프린터 자동 출력
- 환경 변수:
  - `PRINT_SERVER_PORT` (기본 5777)
  - `PRINT_SERVER_ORIGIN` (CORS 허용 origin, 기본 `*`)
- 프론트 연결:
  - 프린터 설정 모달에서 `/printers` 호출하여 목록 갱신
  - 운송장 출력 시 `triggerLocalPrint`가 `/print` 호출 (브라우저 인쇄창 없이 자동 출력)

4. **웹훅 (`webhooks/hanjinWebhook.controller.js`)**
   - trackingNumber 또는 requestId(ObjectId)로 대상 Request/DeliveryInfo 매칭.
   - 이벤트 dedup → DeliveryInfo.events 갱신, deliveredAt 시 manufacturerStage=`추적관리`로 승격.
   - 향후 한진 webhook 샘플 확보 후 필드 고정 예정.

## Frontend 연동 (`MailboxGrid.tsx`)

1. `callHanjinApi` 유틸이 `request`를 사용해 `/api/requests/shipping/hanjin/*` 호출.
2. 운송장 출력 → 모든 배정 우편함 리스트 전송.
3. 출력 성공 시 `printedMailboxes` Set 업데이트, UI에서 수거 요청 버튼 활성화.
4. 수거 요청 버튼은 토글형:
   - 최초 클릭 시 `/pickup` 호출 후 `pickupRequested=true`.
   - 재클릭 시 `/pickup-cancel` 호출.
5. 모든 실패 케이스는 toast+console 로그.

## 운영 플로우 요약

1. 제조 단계에서 stage=`포장.발송` 의뢰가 MailboxGrid에 표시.
2. **14:00 이전**: `운송장 출력` 버튼으로 한 번에 라벨 출력.
3. 출력 후 배치 단위로 박스 포장 및 실물 라벨 부착.
4. **15:00 이전**: `택배 수거` 버튼 → Hanjin pickup API 호출.
5. 수거 요청 변경 필요 시 같은 버튼으로 취소.
6. 배송 진행 상황은 webhook → DeliveryInfo 업데이트, stage 자동 전환.

## 수동 테스트 체크리스트

1. `.env.local`에 위 ENV 키 채운 후 backend 재기동.
2. Postman/Insomnia로 `POST /api/requests/shipping/hanjin/print-labels` 호출
   - body `{ "mailboxAddresses": ["A2B1", ...] }`.
   - Hanjin 응답 HTTP 200 / body success 확인.
3. 동일 주소로 `/pickup`, `/pickup-cancel` 호출 → 한진 sandbox에서 상태 확인.
4. webhook 테스트: `curl -H "x-webhook-secret: ..." -d '<샘플>' /api/webhooks/hanjin` → DeliveryInfo, Request stage 변경 확인.
5. 프론트 MailboxGrid에서 UI 버튼 시나리오 재현.

## 남은 TODO

1. `buildHanjinDraftPayload` 확장 — 상품명, 무게, 송장번호 저장 등 실제 요구 필드 매핑.
2. 컨트롤러 응답에 운송장 번호/추가 메타 반영 후 DB 업데이트 로직 연결.
3. MailboxGrid에 운송장 상태 뱃지 + 에러 메시지 표준화.
4. Jest/e2e 테스트 작성 및 운영자용 FAQ 문서 추가.
5. webhook 샘플 확보 후 parser 필드 고정 및 schema 검증 추가.
