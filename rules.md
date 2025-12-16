# Project Rules for abuts.fit

이 문서는 `abuts.fit` 프로젝트의 전체 공통 규칙을 정의합니다.
프로젝트 전반에 걸쳐 적용되는 원칙, 권한, 비즈니스 로직, 그리고 메모리 된 중요 사항들을 포함합니다.

## 1. 기본 원칙 (Global Principles)

- **언어**: 한국어 사용을 원칙으로 합니다.
- **코드 스타일**: 간결하게 필수적인 기능만 구현하며, 사용자가 별도로 요구하면 추가 기능을 구현합니다.
- **기술 스택 (Web Project)**:
  - Frontend: React, TypeScript, Vite, ESLint, Prettier, Tailwind
  - Backend: Node.js, Express, MongoDB
  - (프로젝트 상황에 따라 달라질 수 있음)

## 2. 프로젝트 구조 및 역할

- **역할 정의**:
  - **Requestor**: 치과기공소 (Dental Labs) - 의뢰자
  - **Manufacturer**: 애크로덴트 (Acrodent) - 제조사
  - **Admin**: 웹사이트 관리 (사이트 이슈, 개선 사항 처리)
- **주요 워크플로우**: Requestor(의뢰) -> Manufacturer(생산) -> Shipping(배송)

## 3. 코드 품질 및 유지보수

### 3.1 파일 크기 제한

- 모든 소스 파일(Frontend 컴포넌트, Backend 컨트롤러 등)은 **800줄**을 넘지 않도록 유지합니다.
- 파일이 커지면 로직을 분리하여 모듈화합니다. (Hook, Service, Component 분리)

### 3.2 레거시 제거 원칙 (Legacy Removal)

- 기능/필드/타입/응답 스펙을 제거하기로 결정했으면, "남겨두는 레거시"는 두지 않습니다.
  - 프론트 타입/컴포넌트 props
  - 백엔드 컨트롤러 계산 로직
  - API 응답 payload
  - DB 스키마/테스트/문서
  - 위 항목에서 함께 제거하여 단일 소스로 유지합니다.

## 4. UI/UX 공통 정책

- **Alert/Confirm/Prompt 금지**: 브라우저 기본 팝업 대신 전역 토스트(`useToast`) 또는 UI 컴포넌트를 사용합니다.
- **토스트 정책**:
  - 기본 자동 닫힘 시간 3초.
  - 로그인 성공 시에는 띄우지 않고, 실패/에러 상황에만 사용.
- **에러 처리**: 인라인 에러 텍스트보다는 Error State + 전역 토스트 사용을 권장합니다.
- **상호작용**: 복잡한 정보는 모달/토글/타임라인 등 HUD 스타일 컴포넌트로 표현합니다.

## 5. 비즈니스 로직 및 메모리 사항

### 5.1 크레딧 및 결제

- **크레딧 적립**: 공급가 기준 (충전 결제는 공급가+VAT).
- **환불**:
  - 일부 사용 후 잔액 환불 허용.
  - VAT는 잔액(공급가) 비율대로 비례 환불.
  - 가상계좌 환불 시 은행/계좌/예금주 정보 수집 필요.

### 5.2 다국어 (i18n)

- 4개 언어(en/ko/ja/zh) 지원.
- 중복 주석 방지: 각 언어별 리소스의 첫 번째 위치에만 번역 키 삽입.

### 5.3 파일 및 데이터 처리

- **CNC 파일명**: `O####.nc` 형식 정규화 (Fanuc 스타일).
- **Draft Request**:
  - `message` 필드 제거 (Request의 messages 배열과 분리).
  - 단일 소스: Draft (caseInfos + files) + S3.
- **슬롯/예약**:
  - 슬롯 소스는 LIVE(원격)만 사용.
  - DB는 조회 결과 저장용.

## 6. 배포 및 환경

- **배포**: Elastic Beanstalk 단일 환경 (Frontend 빌드 + Backend API).
- **Frontend Build**: `web/frontend/dist`에 위치.
- **Backend Server**: 정적 파일 서빙 + API 제공.

## 7. 회사 정보

- **서비스 제공사**: 어벗츠 주식회사 (대표: 배태완)
- **제조 파트너**: 애크로덴트
