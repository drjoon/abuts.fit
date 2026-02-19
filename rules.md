# abuts.fit rules

이 문서는 `abuts.fit` 프로젝트 전체에 적용되는 개발 규칙 및 정책을 정의합니다.

## 1. 기본 원칙

- **언어**: 한국어 사용을 원칙으로 하되, 코드는 영문으로 작성합니다.
- **코드 스타일**: 간결하고 필수적인 기능만 구현합니다.

## 2. 프로젝트 구조 및 기술 스택

- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, ESLint, Prettier
- **Package Manager**: Bun (frontend), NPM (backend)

## 3. 역할/권한 (RBAC)

시스템은 **Role(역할)**로 권한을 관리합니다.

### 3.1 역할(Role)

| Role                         | 설명                                            |
| :--------------------------- | :---------------------------------------------- |
| **Requestor**<br>(기공소)    | 의뢰 생성/조회, 채팅 가능                       |
| **Manufacturer**<br>(제조사) | 제조 관리, 작업(Worksheet) 처리, 공정 진행 가능 |
| **Admin**<br>(어벗츠핏)      | 시스템 전체 관리자, 모니터링, 고객지원(채팅)    |

### 3.2 권한 상세

#### Requestor (기공소)

- 조직 정보 수정
- 결제 수단 관리 및 결제 내역 조회
- 직원 초대 및 관리
- 의뢰 생성/수정/삭제/조회
- 채팅

#### Manufacturer (제조사)

- 제조사 설정 관리
- 전체 의뢰 할당 및 관리
- 매출/정산 조회
- 할당된 의뢰의 공정 단계(Worksheet) 처리
- 공정 관련 파일 업로드/다운로드
- 채팅

#### Admin (관리자)

- 시스템 설정, 보안
- 전체 사용자/조직 관리
- 전체 통계 및 매출 조회
- 의뢰 모니터링
- 1:1 문의/채팅 응대

## 4. 코드 품질 및 유지보수

### 4.1 파일 크기 제한

- 모든 소스 파일(Frontend 컴포넌트, Backend 컨트롤러 등)은 **800줄**을 넘지 않도록 유지합니다.
- 파일이 커지면 로직을 분리하여 모듈화합니다. (Hook, Service, Component 분리)

### 4.2 레거시 제거 원칙

- 제거하기로 결정한 기능/필드/타입/응답 스펙은 레거시로 남겨두지 않습니다.
  - 프론트 타입/컴포넌트 props
  - 백엔드 컨트롤러 계산 로직
  - API 응답 payload
  - DB 스키마/테스트/문서

### 4.3 동기화/통신 원칙 (이벤트 드리븐 우선)

- **대전제**: 폴링은 최대한 자제하고, 가능한 모든 동기화는 **이벤트 드리븐(push)** 으로 구현합니다.
- **폴링 도입 금지**: 주기적 폴링이 꼭 필요하다고 판단되면, 반드시 사전에 사용자 승인 후 도입합니다.

### 4.4 CNC 제어/브리지 호출 정책 (1회 시도)

- CNC 제어(Start/Stop/Reset/Pause) 및 브리지(Hi-Link) 관련 호출은 **1회만 시도**합니다.
- 실패 시 자동 재시도를 넣지 않고, 실패 원인(`result`/`message`)을 API 응답으로 그대로 반환하여 프론트에서 에러 토스트로 노출합니다.

## 5. UI/UX 공통 정책

- **Alert/Confirm/Prompt 금지**: 브라우저 기본 팝업 대신 전역 토스트(`useToast`) 또는 UI 컴포넌트를 사용합니다.
- **전역 컨펌 모달**: 확인이 필요한 모든 액션은 `@/features/support/components/ConfirmDialog` 공통 컴포넌트를 사용합니다. 새 컨펌이 필요하면 이 컴포넌트를 import하여 재사용하고, 버튼 핸들러에서 상태로 열림 여부를 제어합니다.
- **설정 저장 정책**:
  - 설정 화면에는 **[저장하기] 버튼을 두지 않습니다.**
  - 입력 필드는 `blur` 시 자동 저장합니다.
  - 토글/스위치/체크박스는 변경 즉시 저장합니다.
  - 업로드/삭제 등 액션은 완료 즉시 저장합니다.
  - 자동 저장 성공 토스트는 기본적으로 띄우지 않고, 실패/에러만 토스트로 노출합니다.
- **토스트 정책**:
  - 1줄(설명 없음): 5초
  - 2줄(설명 있음): 10초
  - 로그인 성공 시에는 띄우지 않고, 실패/에러 상황에만 사용.
- **에러 처리**: 인라인 에러 텍스트보다는 Error State + 전역 토스트 사용을 권장합니다.

### 5.1 Requestor 가이드(Guide Tour) 적용 범위

- **적용 화면(의뢰자)**:
  - 설정 > **계정(Account)**
  - 설정 > **기공소(Business)**
  - **신규의뢰(New Request)**
- **비적용 화면(의뢰자)**:
  - 대시보드(홈) 및 대시보드 내 기타 화면
  - 설정의 나머지 탭(배송/결제/알림/임직원 등)

### 5.2 GuideFocus 레이아웃 원칙

- `GuideFocus`는 **감싸는 카드/섹션과 동일한 width/라운딩**으로 보이도록 구현합니다.
- 그리드 정렬에서는 margin(`mr-*`) 기반 정렬 대신 `gap` 기반 정렬을 사용합니다.

## 6. 비즈니스 규칙

### 6.0 파일명/파일메타 단일 소스(SSOT)

- **표준 파일명**: 모든 공정 파일의 표준 파일명은 `filePath`를 사용합니다.
- **업로더 원본명**: 업로더가 올린 로컬 파일명은 `originalName`에만 보관합니다.
- **금지**: `fileName`(원본 STL의) 필드는 저장/참조하지 않습니다.
- **BG 프로그램 규칙**: Rhino/ESPRIT/Bridge 등 BG 프로그램은 requestId/파일명을 조작하지 않고, 백엔드가 내려준 `filePath`를 입력/출력 naming의 기준으로 사용합니다.
- **finish line**: 파일(finishLineFile)로 저장하지 않으며, `caseInfos.finishLine.points`만 백엔드 DB에 저장/사용합니다.

#### 6.0.1 requestId 단일 소스(SSOT)

- 모든 의뢰 `requestId`는 **MongoDB Request 컬렉션**에 저장된 값을 단일 진실 소스로 삼습니다.
- 브리지/백엔드/프론트/배경 시스템은 DB에 저장된 `requestId`와 일치하지 않는 값(예: 파일명 끝에 clinic/patient/tooth가 붙은 문자열)을 자체적으로 생성하거나 저장하지 않습니다.
- 외부 시스템에서 파일 경로나 `bridgePath` 등으로 의뢰를 찾아야 할 때는, 해당 경로를 정규화한 뒤 DB에서 `requestId`를 역으로 조회하여 사용합니다.

### 6.1 요금/결제 안내

- 기본 서비스 금액은 **VAT 별도**, **배송비 별도**입니다.
- 커스텀 어벗 재의뢰(리메이크)는 개당 **10,000원(VAT 별도)** 고정입니다.

### 6.2 크레딧 및 환불

- **크레딧 적립**: 공급가 기준 (충전 결제는 공급가+VAT).
- **환불**:
  - 일부 사용 후 잔액 환불 허용.
  - VAT는 잔액(공급가) 비율대로 비례 환불.
  - 가상계좌 환불 시 은행/계좌/예금주 정보 수집 필요.

### 6.3 CNC 프로그램 번호 및 파일명

- CNC 장비 내부 프로그램 번호 형식: `O` + 네 자리 숫자 (예: `O0001`, `O3001`).
- 브리지 서버/로컬에 저장되는 프로그램 파일명은 `O####.nc` 형식을 사용합니다.
- CNC 장비로 전송할 때는 확장자를 사용하지 않고, 숫자 프로그램 번호만 사용합니다.

### 6.4 CNC Bridge Storage(3-nc) SSOT 정책

- `storage/3-nc`(브리지 서버 파일 시스템)을 **NC 프로그램의 단일 진실 소스(SSOT)** 로 사용합니다.
- **로드**: `bridgePath`가 존재하면 `/api/bridge-store/file`로 즉시 읽고, 없으면 `POST /api/requests/by-request/:requestId/nc-file/ensure-bridge`로 S3 → bridge-store 복구 후 다시 `/api/bridge-store/file`로만 읽습니다. 반복 폴링/중복 요청을 금지하고, 동일 프로그램은 모달이 열린 동안 1회만 로드합니다.
- **저장**: NC 편집기는 항상 `POST /api/bridge-store/file`을 통해 저장하며, S3 presign/PUT 경로를 사용하지 않습니다. S3는 오직 bridge-store 복구용 소스로만 사용합니다.
- **Hi-Link 직접 프로그램**(의뢰와 무관): 기존과 같이 장비 `UpdateProgram` 명령을 사용할 수 있지만, 의뢰/작업 단위 프로그램에는 적용하지 않습니다.
- **자동 저장 금지**: CNC 프로그램 편집 모달/패널은 blur/focus 이벤트로 저장을 트리거하지 않고, 명시적인 `SAVE` 버튼 또는 `Ctrl/Cmd + S` 단축키로만 저장합니다.

### 6.4 로트넘버(생산번호)

- 로트번호는 원소재부터 출고된 제품까지 전 과정에서 추적 관리한다.
- 로트번호는 아래 3단계로 관리한다.
  - 원소재 로트번호: 원소재 공급사가 부여한 **Heat Number** (예: `34123103`)
  - 반제품 로트번호: CNC 가공 시작 시점에 생성되는 **`CAP` + YYMMDD + `-` + `AAA~`** (예: `CAP251120-AAA`)
  - 완제품 로트번호: 포장 승인 시점에 생성되는 **`CA` + YYMMDD + `-` + `AAA~`** (예: `CA251120-AAA`)

### 6.5 다국어(i18n)

- 4개 언어(en/ko/ja/zh) 지원.
- 중복 주석 방지: 각 언어별 리소스의 첫 번째 위치에만 번역 키 삽입.

### 6.6 Draft Request

- `message` 필드 제거 (Request의 messages 배열과 분리).
- 단일 소스: Draft (caseInfos + files) + S3.

### 6.7 슬롯/예약

- 슬롯 소스는 LIVE(원격)만 사용.
- DB는 조회 결과 저장용.

### 6.8 중복 의뢰(파일/정보) 처리 정책

- **중복 의뢰 감지 기준**: 동일 `치과명(clinicName)` + `환자명(patientName)` + `치아번호(tooth)` 조합이 기존 의뢰에 존재하고, 기존 의뢰의 상태가 `취소`가 아닌 경우.
- **UI/UX**: 중복 의뢰로 판단되면 사용자에게 반드시 선택지를 제공한다(브라우저 기본 alert/confirm 사용 금지).
- **정책 분기**
  - 기존 의뢰 상태가 **`완료`가 아닌 경우**
    - 사용자에게 "기존 파일을 삭제하고 재업로드하는 대신, 기존 의뢰를 취소하고 재의뢰로 진행할까요?"를 묻는다.
    - 사용자가 동의하면 **기존 의뢰는 `취소` 처리**하고, **중복 크레딧 지출이 발생하지 않도록** 기존 의뢰의 결제/차감 내역을 상쇄(환불/상계)한 뒤 새 의뢰를 생성한다.
  - 기존 의뢰 상태가 **배송까지 끝난 `완료`인 경우**
    - 사용자에게 "재의뢰(리메이크)로 접수할까요?"를 묻는다.
    - 사용자가 동의하면 **기존 의뢰는 유지**하고, **재의뢰 정책에 따라 크레딧을 소비**하여 새 의뢰를 생성한다.
    - 새 의뢰에는 기존 의뢰를 찾을 수 있도록 **레퍼런스 링크(예: `referenceIds`에 기존 `requestId` 기록)**를 남긴다.

### 6.9 영업자 리퍼럴 수수료

- 직계 의뢰자 매출에 대해 **5%**를 영업자 본인 수수료로 적립한다.
- 직계 1단계(내가 소개한 영업자)가 벌어들인 **본인 수수료(5%)의 50% (=2.5%)**를 추가로 적립한다.
- 계산 시 직계 1단계의 **본인 수수료**만 포함하며, 더 깊은 레벨/중복 수수료는 없다.

### 6.10 의뢰자 리퍼럴 코드/할인(조직 단위)

- 의뢰자(Requestor)의 리퍼럴 코드는 **base36(대문자 영문 + 숫자) 5자리**를 사용한다.
- 영업자(Salesman)의 리퍼럴 코드는 **base36(대문자 영문 + 숫자) 4자리**를 사용한다.
- 리퍼럴로 발생하는 가격 할인/주문량 집계 등 보상은 **조직(RequestorOrganization) 단위**로 적용한다.
  - 직원 이메일로 가입이 발생해도 할인/집계는 직원 개인이 아니라 해당 조직에 귀속된다.

## 7. 배포 및 환경

- **배포**: Elastic Beanstalk 단일 환경 (Frontend 빌드 + Backend API).
- **Frontend Build**: `web/frontend/dist`에 위치.
- **Backend Server**: 정적 파일 서빙 + API 제공.
- **백그라운드 서비스 통합 (`bg/` 폴더)**:
  - `bg/bridge-server`: CNC 장비(Hi-Link) 연동 브리지 서버.
  - `bg/rhino-server`: Rhino Compute 기반 3D 연산 서버.
  - `bg/esprite-addin`: ESPRIT 2025용 CAM 자동화 애드인.
  - `bg/storage`: BG 프로그램 간 파일 공유를 위한 로컬 스토리지.
  - **운영 정책**: 당분간 하나의 로컬 컴퓨터 내에서 통합 운영하며, 부하 증가 시 분리 검토.
  - **공통 인터페이스 (Web Server)**: 모든 BG 프로그램은 아래 엔드포인트를 제공해야 합니다. (Port: Rhino=8000, ESPRIT=8001, Bridge=8002)
    - `GET /health` 또는 `/ping`: 서비스 상태 확인 (Alive).
    - `POST /control/start`: 운영 시작.
    - `POST /control/stop`: 운영 정지.
    - `GET /history/recent`: 최근 처리된 파일 목록 조회.
  - **백엔드 연동 (Web Client)**:
    - 파일 처리 완료 시 `abuts.fit/api`의 관련 엔드포인트를 호출하여 처리 결과를 등록합니다.
    - 백엔드는 이를 DB에 기록하고 다음 공정(File Pipe)이 이어지도록 제어합니다.
  - **워크플로우 (File Pipe)**:
    1. **1-stl**: 의뢰자가 업로드한 원본 STL 파일 저장.
    2. **2-filled (Rhino)**: Rhino-server가 `1-stl`의 파일을 감지하여 홀 메꿈 처리 후 저장.
    3. **3-nc (ESPRIT)**: ESPRIT-addin이 `2-filled`를 감지하여 NC 파일 생성 후 저장.
    4. **3-direct (Manual)**: 제조사가 CNC 대시보드에서 직접 업로드한 NC 파일 저장.
    5. **CNC (Bridge)**: Bridge-server가 `3-nc`/`3-direct` 기반으로 CNC 업로드를 수행하며, 가공 시작은 Now Playing에서 사용자 Start로 진행.
  - **스토리지 경로**: 모든 BG 프로그램은 `/bg/storage` 하위 폴더를 기준으로 파일을 공유하며, 각 단계 완료 시 다음 폴더로 결과물을 이동/복사합니다.

### 11.2 팝빌 처리 아키텍처

- **단일 백그라운드 워커 전담**: 팝빌 관련 작업(세금계산서 발행/취소, 계좌조회, 알림 발송)은 백그라운드 워커(`popbillWorker.js`)가 전담한다.
- **web → MongoDB 큐 → 워커**: 외부 진입(web)에서 팝빌 연동이 필요한 이벤트는 MongoDB 기반 PopbillQueue를 통해 워커로 전달한다. web 인스턴스 다중화 시에도 중복 처리를 피하기 위해 직접 발행하지 않는다.
- **헬스체크 + 모니터링**: 워커는 헬스체크(`healthMonitor.js`) 기반으로 상태를 감시하며, Pushover 알림으로 장애를 통보한다. 워커 장애가 곧 팝빌 기능 중단이므로 필수.
- **아이덴포턴시**: 세금계산서 발행/취소, 계좌조회, 알림 발송 등 모든 처리에 uniqueKey + upsert로 중복 실행을 방지한다.
- **재시도 제한**: 지수 백오프(최대 30분), 6시간 재시도 윈도우, 태스크별 maxAttempts로 무한 루프/과금 폭탄 방지.
- **모니터링/스케일업 준비**: 워커 처리 지연을 감시하는 모니터를 두고, 필요 시 큐 소비 워커를 1→N대로 확장(또는 서버 스케일업)할 수 있도록 한다.

## 8. 채팅 기능 정책

### 8.1 채팅 구조

- **2가지 채팅 타입**:
  - **Request Chat (의뢰 채팅)**: 특정 의뢰(Request)에 종속된 채팅. `Request.messages` 배열에 저장.
  - **Direct Chat (독립 채팅)**: 의뢰와 무관한 일반 소통. `ChatRoom`/`Chat` 모델로 별도 관리.

### 8.2 채팅 참여자 규칙

- **의뢰자(Requestor) ↔ 관리자(Admin)**: 기본 소통 채널
- **관리자(Admin) ↔ 제조사(Manufacturer)**: 필요시 소통
- **의뢰자(Requestor) ↔ 제조사(Manufacturer)**: 직접 소통 불가 (모든 소통은 관리자 경유)
- **의뢰자 간 채팅**: 구현하지 않음

### 8.3 Request Chat

- **용도**: 특정 의뢰와 관련된 질문, 상태 확인, 파일 전달 등
- **저장 위치**: `Request.messages` 배열
- **참여자**: 해당 의뢰의 requestor + manufacturer(할당된 경우) + admin
- **접근 권한**:
  - Requestor: 본인이 생성한 의뢰 또는 같은 조직(RequestorOrganization)의 의뢰
  - Manufacturer: 자신에게 할당된 의뢰
  - Admin: 모든 의뢰
- **메시지 구조**:
  ```javascript
  {
    sender: ObjectId(User),
    content: String,
    attachments: [{ fileName, fileType, fileSize, s3Key, s3Url }],
    isRead: Boolean,
    createdAt: Date
  }
  ```

### 8.4 Direct Chat

- **용도**: 의뢰와 무관한 일반 문의, 결제 상담, 시스템 개선 제안 등
- **저장 위치**: `ChatRoom` 컬렉션(참여자 정보) + `Chat` 컬렉션(메시지)
- **채팅방 생성**:
  - Admin은 모든 사용자와 채팅방 생성 가능
  - Requestor/Manufacturer는 Admin과만 채팅방 생성 가능
  - 같은 참여자 조합의 채팅방은 중복 생성 방지

### 8.5 파일 첨부

- **지원 파일**: STL, 3DM, PDF, 이미지(JPG, PNG), 문서(DOCX) 등
- **파일 크기 제한**: 단일 파일 최대 50MB, 메시지당 최대 5개 파일
- **저장 방식**: S3 업로드 후 메타데이터(s3Key, s3Url)를 메시지에 저장
- **다운로드**: 서명된 URL(presigned URL) 방식으로 제공

### 8.6 읽음 처리 및 알림

- **읽음 상태**: 각 메시지는 `isRead` 필드로 읽음 여부 관리
- **읽음 처리**: 사용자가 채팅방/의뢰를 열 때 자동으로 읽음 처리
- **미읽음 개수**: 대시보드/목록에 표시
- **알림 방식**: 이메일/SMS 알림은 `User.preferences.notifications` 설정을 따름

### 8.7 채팅 관리 (Admin)

- Admin은 모든 Request Chat과 Direct Chat을 조회할 수 있습니다.
- 이슈 발생 시 채팅방 일시정지, 모니터링 태그 설정 등을 지원합니다.

## 9. 회사 정보

- **서비스 제공사**: 어벗츠 주식회사 (대표: 배태완)
- **제조 파트너**: 애크로덴트

### 6.9 회원가입 및 인증

- **대상 경로**
  - 기본 이메일 회원가입: `/signup`
  - 리퍼럴 회원가입: `/signup?ref=...` 또는 `/signup?referredByUserId=...`
  - 소셜 회원가입: `/oauth/callback` → `/signup?mode=social_new|social_complete`

- **회원가입 위저드 (이메일/리퍼럴 전용)**
  - Step 1: 가입 방법 선택 (Google, Kakao, Email 버튼)
  - Step 2: 기본 정보 입력 (필수: `name`, `password`, `confirmPassword`)
  - Step 3: 이메일 + 휴대폰 인증 (둘 다 인증 완료 필수)
  - Step 4: 가입 완료 및 이동

- **비밀번호 정책**
  - 일반 이메일 가입(비소셜) 시: **길이 10자 이상 + 특수문자 1자 이상** 필수.

- **이메일/휴대폰 인증 정책**
  - 대상: `role=requestor` & 일반 회원가입
  - 백엔드 `register` API 호출 전 `email`, `phoneNumber` 인증 완료 상태여야 함.
  - API:
    - 이메일 발송/검증: `POST /api/auth/signup/email-verification/{send,verify}`
    - 휴대폰 발송/검증: `POST /api/auth/signup/phone-verification/{send,verify}` (국내 번호 +82 만 지원)
  - 인증 상태는 `SignupVerification` 모델에 저장되며 가입 시 소비(consumed)됨.

- **환경 변수**
  - 이메일: AWS SES (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM`)
  - SMS: Solapi (`SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`)

## 10. 코드 구조 및 파일 크기 관리

- **파일 크기 제한**: 컴포넌트/훅/컨트롤러는 **800줄 이상**이 되면 반드시 분리.
- **분리 기준**:
  - **페이지 컴포넌트**: 상태 관리 + 레이아웃 와이어링만 담당 (200~400줄)
  - **서브 컴포넌트**: 각 섹션/Step별 UI 로직 분리 (100~300줄)
  - **훅**: 비즈니스 로직 + API 호출 분리 (200~400줄)
  - **컨트롤러**: 엔드포인트별 핸들러 분리 (200~400줄)
- **예시**: `SignupPage.tsx` (440줄) → `SignupWizardStep1~4.tsx` + `SignupSocialForm.tsx` 분리
- **명명 규칙**:
  - 페이지 컴포넌트: `XxxPage.tsx`

## 11. 서버 구성(배포 단위) 및 shared 정책

- 이 저장소는 아래 배포 단위로 분리 운영합니다.
  - `web/`: 백엔드 API + 프론트 서빙
  - `background/`: 백그라운드 워커(잡)
  - `lambda/`: AWS Lambda 함수
- **기본 원칙**: DB 모델(스키마)은 하나의 소스에서 관리하고, 워커는 복사본을 사용합니다.
  - 주 소스: `web/backend/models`
  - 워커 사용: `background/models`에 **복사**하여 사용 (백엔드에서 변경 시 워커로 재복사)
  - lambda 등 다른 프로세스도 동일한 스키마를 복사 사용

### 11.1 DB 모델 복사 원칙

- `web/backend/models`에서 변경 시 `background/models`로 복사하여 스키마 일치 유지
- mongoose 인스턴스는 각 프로세스별로 독립 연결(backend, background)

## 12. 세금계산서(국세청/홈택스) 자동 발행 정책

### 12.1 기본 흐름(충전금 기준)

- **기준**: 충전금(입금) 매칭으로 크레딧이 적립되는 건에 대해 세금계산서를 발행합니다.
- **Draft 생성**: `ChargeOrder`가 `MATCHED`가 되는 시점(자동/관리자 수동 매칭 포함)에 `TaxInvoiceDraft`를 자동 생성합니다.
- **관리자 승인**: 관리자가 `TaxInvoiceDraft`를 검토 후 승인합니다.
- **자동 전송**: 전일(KST) 승인된 건에 대해 **익일 12:00(KST)** 배치로 국세청(홈택스) 전송을 시도합니다.

### 12.2 상태(Status) 규칙

- `PENDING_APPROVAL`: 입금 매칭 시 자동 생성(승인 대기)
- `APPROVED`: 관리자 승인
- `REJECTED`: 관리자 반려(사유 보관)
- `CANCELLED`: 전송 전 취소
- `SENT`: 국세청(홈택스) 전송 성공
- `FAILED`: 전송 실패(재시도 대상)

### 12.3 배치 실행 및 중복 방지

- 배치는 `background/` 워커에서 수행합니다.
- 멀티 인스턴스 실행 가능성을 고려하여, 배치 실행은 `JobLock`(DB 기반 락)을 획득한 경우에만 진행합니다.
- 기본 락 TTL은 15분이며, 환경변수 `TAX_INVOICE_BATCH_LOCK_TTL_MS`로 조절할 수 있습니다.
- 배치 on/off는 환경변수 `TAX_INVOICE_BATCH_ENABLED`로 제어합니다.
