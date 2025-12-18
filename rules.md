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

시스템은 **Role(역할)**과 **Position(직위)**의 2계층 구조로 권한을 관리합니다.

### 3.1 역할(Role) 및 직위(Position)

| Role                         | Position (En)    | Position (Ko) | 설명                                               |
| :--------------------------- | :--------------- | :------------ | :------------------------------------------------- |
| **Requestor**<br>(기공소)    | `principal`      | 주대표        | 조직 소유자, 모든 권한                             |
|                              | `vice_principal` | 부대표        | 주대표와 거의 동일한 권한 (결제, 설정 등)          |
|                              | `staff`          | 직원          | 의뢰 생성/조회, 채팅 가능. 결제/설정/직원관리 불가 |
| **Manufacturer**<br>(제조사) | `master`         | 대표          | 제조사 소유자, 모든 권한                           |
|                              | `manager`        | 매니저        | 제조 관리, 직원 관리 등 운영 권한                  |
|                              | `staff`          | 직원          | 작업(Worksheet) 처리, 공정 진행만 가능             |
| **Admin**<br>(어벗츠핏)      | `master`         | 대표          | 시스템 전체 관리자 (Super Admin)                   |
|                              | `manager`        | 매니저        | 운영 총괄                                          |
|                              | `staff`          | 스탭          | 모니터링, 고객지원(채팅) 업무만 수행               |

### 3.2 권한 상세

#### Requestor (기공소)

- **Principal / Vice Principal**:
  - 조직 정보 수정
  - 결제 수단 관리 및 결제 내역 조회
  - 직원(Staff) 초대 및 관리
  - 의뢰 생성/수정/삭제/조회
- **Staff**:
  - 의뢰 생성/수정(자신이 작성한 것)/조회
  - 채팅

#### Manufacturer (제조사)

- **Master / Manager**:
  - 제조사 설정 관리
  - 전체 의뢰 할당 및 관리
  - 매출/정산 조회
- **Staff**:
  - 할당된 의뢰의 공정 단계(Worksheet) 처리
  - 공정 관련 파일 업로드/다운로드

#### Admin (관리자)

- **Master / Manager**:
  - 시스템 설정, 보안
  - 전체 사용자/조직 관리
  - 전체 통계 및 매출 조회
- **Staff**:
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

## 5. UI/UX 공통 정책

- **Alert/Confirm/Prompt 금지**: 브라우저 기본 팝업 대신 전역 토스트(`useToast`) 또는 UI 컴포넌트를 사용합니다.
- **토스트 정책**:
  - 기본 자동 닫힘 시간 3초.
  - 로그인 성공 시에는 띄우지 않고, 실패/에러 상황에만 사용.
- **에러 처리**: 인라인 에러 텍스트보다는 Error State + 전역 토스트 사용을 권장합니다.

## 6. 비즈니스 규칙

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

### 6.4 로트넘버(생산번호)

- **Prefix**: `AB`(Custom Abutment), `CR`(Crown)
- **Format**: `[Prefix][YYYYMMDD]-[AAA~]` (예: `AB20251206-AAA`)
- 부여 시점: 상태가 `가공전`으로 변경될 때 백엔드에서 자동 부여.

### 6.5 다국어(i18n)

- 4개 언어(en/ko/ja/zh) 지원.
- 중복 주석 방지: 각 언어별 리소스의 첫 번째 위치에만 번역 키 삽입.

### 6.6 Draft Request

- `message` 필드 제거 (Request의 messages 배열과 분리).
- 단일 소스: Draft (caseInfos + files) + S3.

### 6.7 슬롯/예약

- 슬롯 소스는 LIVE(원격)만 사용.
- DB는 조회 결과 저장용.

## 7. 배포 및 환경

- **배포**: Elastic Beanstalk 단일 환경 (Frontend 빌드 + Backend API).
- **Frontend Build**: `web/frontend/dist`에 위치.
- **Backend Server**: 정적 파일 서빙 + API 제공.

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
