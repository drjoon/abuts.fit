# New Request Draft 리팩터링 노트

## 1. 백엔드 현황 (per-file caseInfos 스키마)

- **최종 Request 모델**: `Request` (`backend/models/request.model.js`)

  - `caseInfos` 스키마 (단일 케이스 + 내장 파일)

    ```ts
    caseInfos: {
      clinicName: String,
      patientName: String,
      tooth: String,
      implantSystem: String,      // 제조사 (예: OSSTEM, Straumann)
      implantType: String,        // 시스템 (예: Regular, Bone Level RC)
      connectionType: String,     // 타입 (예: Hex, Non-hex)
      maxDiameter: Number,
      connectionDiameter: Number,
      workType: String,           // "abutment" | "crown"
      file: {
        fileName: String,
        fileType: String,
        fileSize: Number,
        filePath: String,
        s3Key: String,
        s3Url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    }
    ```

  - `files` 배열 필드는 제거됨 (파일은 `caseInfos.file`에만 존재)
  - `messages` 배열도 현재는 사용하지 않아 스키마에서 제거됨

- **Draft 모델**: `DraftRequest` (`backend/models/draftRequest.model.js`)

  - 필드

    - `requestor: ObjectId(User)`
    - `status: "draft" | "submitted" | "cancelled"` (기본: `"draft"`)
    - `caseInfos: DraftCaseInfo[]` (배열)

      ```ts
      caseInfos: [
        {
          file: {
            fileId?: ObjectId;      // 기존 File 도큐먼트 ID
            originalName: string;
            size: number;
            mimetype: string;
            s3Key?: string;
          };
          clinicName?: string;
          patientName?: string;
          tooth?: string;
          implantSystem?: string;
          implantType?: string;
          connectionType?: string;
          maxDiameter?: number;
          connectionDiameter?: number;
          workType?: "abutment" | "crown";
        },
      ];
      ```

    - `createdAt`, `updatedAt` (timestamps)

  - **중요한 점**
    - 별도 `aiFileInfos` 컬렉션/필드는 두지 않는다.
    - `abutType` 도 사용하지 않는다.
    - AI 는 단지 `clinicName / patientName / tooth` 를 채워주는 **보조 수단**일 뿐, 새로운 스키마를 만들지 않는다.

- **컨트롤러**: `backend/controllers/draftRequest.controller.js`

  - `POST /api/requests/drafts` → Draft 생성 (`createDraft`)
  - `GET /api/requests/drafts/:id` → Draft 조회 (`getDraft`)
  - `PATCH /api/requests/drafts/:id` → `caseInfos` 부분 업데이트 (`updateDraft`)
  - `POST /api/requests/drafts/:id/files` → 파일 + 케이스 정보 추가 (`addFileToDraft`)
    - body: `{ originalName, size, mimetype, fileId?, s3Key?, clinicName?, patientName?, tooth?, implantSystem?, implantType?, connectionType?, maxDiameter?, connectionDiameter?, workType? }`
    - `fileId` 또는 `s3Key` 중 하나는 반드시 존재해야 함
    - Draft 내 `caseInfos.push({ file, clinicName, patientName, ... })` 형태로 저장
  - `DELETE /api/request-drafts/:id/files/:fileId` → Draft.caseInfos 에서 해당 `_id` 제거 (`removeFileFromDraft`)
  - `DELETE /api/request-drafts/:id` → Draft 삭제 (`deleteDraft`)

- **라우트 & 인증**
  - `backend/routes/draftRequest.routes.js` (mounted at `/api/requests/drafts`)
    - `router.use(authenticate);`
    - `router.use(authorize(["requestor", "admin"]));`
    - 위 컨트롤러와 매핑
  - `app.js` 에서 `app.use("/api/requests/drafts", draftRequestRoutes);`
  - dev 환경에서 `token === "MOCK_DEV_TOKEN"` 사용 시, 항상 헤더에 `x-mock-role: "requestor"` 를 붙여서 Draft API 를 호출한다.

---

## 2. 프론트 현황 (Draft + 최소 DraftMeta 캐시)

### 2.1 Draft 생성/조회 & DraftMeta 캐시 (설계 기준)

- 인증

  - `useAuthStore` 에서 mock 로그인 시 `token = "MOCK_DEV_TOKEN"`.

- 로컬 스토리지 키

  - `NEW_REQUEST_DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1"`
    - 현재 연결된 Draft 의 `_id` 저장.
  - `NEW_REQUEST_DRAFT_META_KEY = "abutsfit:new-request-draft-meta:v1:<userId>"`
    - Draft 메타 캐시(DraftMeta)를 저장.

- **DraftMeta 구조 (최소 메타만 캐시)**

  ```ts
  type DraftMeta = {
    draftId: string;
    updatedAt: number; // 캐시 갱신 시각 (ms)
    caseInfos: {
      clinicName?: string;
      patientName?: string;
      tooth?: string;
      implantSystem?: string;
      implantType?: string;
      connectionType?: string;
      maxDiameter?: number;
      connectionDiameter?: number;
      workType?: string;
    };
  };
  ```

  - **파일 메타는 DraftMeta 에 넣지 않는다.**
    - 파일 메타는 항상 서버 Draft 의 `draft.caseInfos[].file` 를 단일 소스로 사용.
  - 실제 STL 바이너리는 S3 에만 있고, URL 은 `fileCache.ts` 로만 캐시한다.

- **신규의뢰 페이지 진입 시 흐름 (설계)**

  1. `NEW_REQUEST_DRAFT_ID_STORAGE_KEY` 와 `NEW_REQUEST_DRAFT_META_KEY` 를 읽는다.
  2. 둘 다 있고, `updatedAt` 이 TTL (기본값: 30분) 이내라면:
     - 서버에 요청하지 않고, DraftMeta 로 `caseInfos` 를 즉시 상태 초기값으로 사용.
  3. DraftMeta 가 없거나 만료된 경우:
     - `draftId` 가 있으면 `GET /api/requests/drafts/:draftId` 시도.
     - 없거나 404/403 이면 `POST /api/requests/drafts` 로 새 Draft 생성 (초기값: `caseInfos` 모두 빈 값, `workType="abutment"`).
     - 응답 Draft 의 `caseInfos` 로 상태를 채우고, 동시에 DraftMeta 로 변환해 localStorage 에 저장.
     - (참고: DraftMeta는 로컬 캐시 대상)
  4. 이 과정에서 항상 `x-mock-role: "requestor"` 헤더를 같이 전송.
  5. **TTL 상수**: `const DRAFT_META_TTL_MS = 30 * 60 * 1000;` (30분)

### 2.2 환자/임플란트 정보 저장 (`useDraftMeta.ts` 역할)

- `existingRequestId` 가 없고 `draftId`/`token` 이 있을 때,

  - `caseInfos` (환자 정보 3 + 임플란트 정보 3 + workType 등) 가 변경되면:

    ```ts
    PATCH /api/request-drafts/:draftId
    body: {
      caseInfos: {
        clinicName,
        patientName,
        tooth,
        implantSystem,
        implantType,
        connectionType,
        maxDiameter,
        connectionDiameter,
        workType,
      },
    }
    ```

- PATCH 성공 후에는 `caseInfos` payload 로 DraftMeta 도 갱신하여 localStorage 에 저장한다.
- AI 가 파일명에서 추론한 `clinicName / patientName / tooth` 도 **최종적으로는 caseInfos 에만 반영**한다.
  - 별도 `aiFileInfos` 배열을 유지하지 않는다.
  - AI 추론 결과는 UI에서 "제안" 형태로 표시되며, 사용자가 수정하면 즉시 caseInfos에 반영된다.

### 2.3 파일 훅 (`useNewRequestFilesV2.ts`) – 단순화된 역할

- 인자 (현재 설계)

  ```ts
  useNewRequestFilesV2({
    draftId: string | null,
    token: string | null,
    draftFiles: DraftCaseInfo[],
    setDraftFiles: React.Dispatch<React.SetStateAction<DraftCaseInfo[]>>,
    files: File[],
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
    selectedPreviewIndex: number | null,
    setSelectedPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>,
  });
  ```

- 역할

  - **업로드**
    1. `/api/files/temp` 로 S3 에 STL 업로드 → `TempUploadedFile[]` 수신.
    2. 각 파일마다 `POST /api/requests/drafts/:draftId/files` 호출하여 Draft.caseInfos 에 `{ file + 기본 케이스 정보 }` 요소 추가.
    3. 응답으로 받은 `Draft.caseInfos` 요소들(DraftCaseInfo[])을 `draftFiles` 상태에 반영.
  - **삭제**
    1. 카드가 가리키는 Draft.caseInfos 요소의 `_id` 를 알아낸 뒤,
    2. `DELETE /api/requests/drafts/:draftId/files/:caseInfoId` 호출.
    3. 성공하면 `draftFiles` 와 프론트 상태의 `files` 에서 해당 항목 제거.
  - **복원**
    - 페이지 재진입 시 `draftFiles`(= Draft.caseInfos[]) 를 기준으로 각 항목의 `file` 메타에서 URL 을 획득:
      - `file.fileId` 가 있으면 `/api/files/:fileId/download-url` 호출
      - `file.fileId` 가 없고 `file.s3Key` 만 있으면 `/api/files/s3/:s3Key/download-url` 호출 (또는 직접 S3 presigned URL 요청)
    - Blob 을 받아 `File` 객체를 생성하여 3D 뷰어/카드 UI 에 사용.
    - 이때 presigned URL 은 `fileCache.ts` 의 `getCachedUrl` / `setCachedUrl` 로 캐시.

- 이 훅은 **파일 + Draft.caseInfos 간의 매핑 및 업로드/삭제/복원 로직만** 담당하고,
  환자/임플란트/AI 텍스트는 모두 `caseInfos` + DraftMeta 가 담당한다.

### 2.4 무한 루프 방지 메커니즘

- **API 호출 방어**

  - `installFetchGuard.ts`: 모든 API 호출을 통과시킴 (GUARDED_PATHS 비움)
  - 무한 루프 방지는 코드 레벨에서 처리:
    1. `updateCaseInfos`: 상태 업데이트와 API 호출을 분리 (setState 콜백 사용)
    2. 의존성 배열 최소화: `draftId`, `token`, `getHeaders`, `saveDraftMeta`만 포함
    3. 조건부 호출: `NewRequestPage.tsx`에서 workType이 실제로 다를 때만 `setCaseInfos` 호출
    4. 동기 함수: `updateCaseInfos`를 동기 함수로 변경하여 즉시 상태 반영

- **무한 루프 발생 원인 (과거)**
  - `updateCaseInfos`의 의존성 배열에 `message` 포함 → 상태 변경 시 함수 재생성
  - `updateMessage`의 의존성 배열에 `caseInfos` 포함 → 순환 의존성
  - UI에서 매번 `setCaseInfos({...caseInfos, ...})` 호출 → 불필요한 PATCH 요청
- **현재 해결책**
  - Draft 모델에서 message 필드 제거 (Request의 messages 배열과 분리)
  - 의존성 배열 정리로 함수 재생성 방지
  - UI에서 조건부 호출로 불필요한 업데이트 방지

---

## 3. 다음 세션에서 마저 할 작업 (새 구조 목표)

> 목표: **"백엔드 DraftRequest (caseInfos + files) + S3" 를 단일 소스로 사용하고, localStorage/IndexedDB 는 캐시 레이어로만 사용**.

1. **IndexedDB 파일 Blob 캐싱 (STL 우선, 향후 확장 가능)**

   - 구현 현황
     - `src/utils/stlIndexedDb.ts` 에 IndexedDB 기반 파일 Blob 캐시 유틸 추가
       - DB 이름: `abutsfit-file-blob-cache`, store: `fileBlobs`
       - 레코드 구조: `{ key, blob, updatedAt }`
       - 공용 API: `getFileBlob`, `setFileBlob`, `cleanupOldEntries`
       - STL 호환용 래퍼: `getStlBlob`, `setStlBlob` (향후 다른 파일에서도 재사용 가능)
     - `useNewRequestFilesV2.restoreFileUrls`에서 Blob 복원 순서
       1. IndexedDB에서 `key=fileId|s3Key` 기준으로 Blob 조회
       2. 없으면 presigned URL (localStorage URL 캐시 → 백엔드 `/download-url`)
       3. 네트워크에서 Blob 다운로드 후 IndexedDB에 저장
   - GC(가비지 컬렉션) 정책
     - 상수: `MAX_ENTRIES = 200`, `MAX_AGE_MS = 7일`
     - 삭제 대상
       - `updatedAt` 기준 7일 초과 레코드
       - 남은 레코드가 200개를 초과하면, 가장 오래된 항목부터 초과분 삭제
     - GC는 `setFileBlob` 성공 시점에 비동기로 수행되어, UI 흐름에 영향을 주지 않음
   - 설계 방침
     - IndexedDB에는 **STL뿐 아니라 임의의 바이너리 파일 Blob**을 저장할 수 있도록 일반화
       - key: `fileId` 또는 `s3Key` (다른 파일 타입도 동일 키 체계 사용 가능)
     - Draft에서 파일이 삭제되더라도 **IndexedDB Blob은 즉시 삭제하지 않고 캐시로 남김**
       - 서버/DB 상태는 Draft 기준으로 정리, 클라이언트 캐시는 GC 정책으로만 정리
     - 이 레이어는 성능/트래픽 최적화용이며, 단일 소스는 계속해서 `DraftRequest(caseInfos + files) + S3` 로 유지

이 파일은 **현재까지의 구조/상태/다음 단계 계획**을 기록하기 위한 메모용입니다.
다음 세션에서는 위 3번 섹션부터 실제 구현을 진행하면 된다.

---

## 4. 현재 세션 진행 상황 (2025-12-07)

### 완료된 작업

1. **파일 캐시 유틸리티 구현** (`src/utils/fileCache.ts`)

   - `getCachedUrl(key)`: 캐시에서 유효한 URL 가져오기
   - `setCachedUrl(key, url, ttlMs)`: URL 캐시 저장 (기본 TTL 50분)
   - `removeCachedUrl(key)`: 특정 키 제거
   - `clearFileCache()`: 전체 캐시 초기화
   - `cleanExpiredCache()`: 만료된 항목 정리

2. **DraftFileMeta 타입 정의** (`newRequestTypes.ts`)

   ```ts
   export type DraftFileMeta = {
     _id: string; // Draft 내 파일 ID
     fileId?: string; // 기존 File 도큐먼트 ID
     originalName: string;
     size: number;
     mimetype: string;
     s3Key?: string;
   };
   ```

3. **useNewRequestPage 업데이트**
   - `draftFiles` 상태 추가
   - Draft.files → `draftFiles` 초기화 로직 변경
   - `useNewRequestFiles`에 `draftFiles`, `setDraftFiles` 전달
   - `draftId` 준비 전 파일 기능 비활성화 (`isReady` 플래그)

### 진행 중인 작업

**useNewRequestFiles 리팩터링** (파일이 890줄로 복잡함)

현재 파일 구조:

- 기존: localStorage 기반 파일 리스트 관리
- 목표: Draft API 기반 파일 관리

주요 변경 필요 사항:

1. 타입 변경: `FileWithTempId` → `FileWithDraftId`
2. `syncDraftToStorage` 함수 제거 (더 이상 localStorage에 파일 리스트 저장 안 함)
3. 업로드 후 로직:
   - S3 업로드 → `POST /api/request-drafts/:draftId/files`
   - 응답의 Draft.files → `setDraftFiles` 업데이트
4. 삭제 로직:
   - `DELETE /api/request-drafts/:draftId/files/:fileId`
   - 성공 후 `draftFiles` 상태 동기화
5. 복원 로직:
   - Draft.files 기준으로 `/api/files/:fileId/download-url` 호출
   - 캐시 활용: `getCachedUrl` → 있으면 사용, 없으면 fetch 후 `setCachedUrl`

### 다음 단계

1. **useNewRequestFiles 완전 재작성**

   - 파일이 너무 복잡하므로 핵심 기능만 남기고 단순화
   - Draft API 기반으로 업로드/삭제/복원 로직 재구현
   - 기존 AI 분석, 임플란트 프리셋 로직은 유지

2. **useNewRequestSubmit Draft 마무리**

   - 제출 시: DraftRequest → Request 전환 (또는 Draft 기반 Request 생성)
   - 취소 시: `DELETE /api/requests/drafts/:draftId`
   - localStorage의 `draftId` 및 파일 캐시 정리

3. **테스트 및 검증**
   - 파일 업로드 → Draft 동기화 확인
   - 페이지 새로고침 → Draft 복원 확인
   - 파일 삭제 → Draft 동기화 확인
   - 제출/취소 → Draft 정리 확인

---

## 5. 현재 세션 진행 상황 (2025-12-07) - 추가 작업

### 완료된 추가 작업

4. **useNewRequestFiles 리팩터링 완료**

   - `FileWithTempId` → `FileWithDraftId` 타입 변경
   - `syncDraftToStorage` 함수 및 모든 호출 제거
   - localStorage 기반 파일 리스트 관리 제거
   - Draft API 기반으로 전환 (업로드 후 백엔드 동기화)
   - 기존 AI 분석, 임플란트 프리셋 로직 유지

5. **useNewRequestSubmit Draft 마무리 완료**

   - `draftId` 파라미터 추가
   - `handleCancel`: Draft 삭제 + localStorage/캐시 정리
   - `handleSubmit`: 성공 시 Draft 삭제
   - `clearFileCache()` 호출로 파일 URL 캐시 정리

6. **useNewRequestPage 통합**
   - `draftFiles` 상태 추가 및 Draft.files 초기화
   - `useNewRequestFiles`에 `draftFiles`, `setDraftFiles` 전달
   - `useNewRequestSubmit`에 `draftId` 전달
   - `draftId` 준비 전 파일 기능 비활성화

---

## 6. 현재 세션 진행 상황 (2025-12-07) - 최종 리팩터링

### 완료된 작업

1. **백엔드 DraftRequest 모델 정리**

   - `aiFileInfos` 스키마 제거
   - `abutType` 필드 제거
   - `caseInfos`에 `maxDiameter`, `connectionDiameter` 필드 추가
   - 단일 `caseInfos` 스키마로 통일

2. **백엔드 draftRequest 컨트롤러 정리**

   - `createDraft`: `aiFileInfos` 제거, `workType="abutment"` 기본값 설정
   - `updateDraft`: `aiFileInfos` 제거
   - 나머지 CRUD 로직 유지

3. **프론트 타입 정의 확장** (`newRequestTypes.ts`)

   - `CaseInfos` 타입 추가
   - `DraftCaseInfo` 타입 추가
   - `DraftRequest` 타입 추가

4. **프론트 useDraftMeta 훅 작성** (새 파일)

   - Draft 생성/조회 (캐시 → GET → POST 플로우)
   - `caseInfos` 변경 시 PATCH + DraftMeta 동시 갱신
   - `message` 변경 시 PATCH만 수행
   - localStorage 기반 DraftMeta 캐시 (TTL: 30분)
   - 출력: `draftId`, `caseInfos`, `setCaseInfos`, `message`, `setMessage`, `status`, `error`, `deleteDraft`

5. **프론트 useNewRequestFilesV2 훅 작성** (새 파일)

   - Draft API 기반 파일 관리
   - 업로드: `/api/files/temp` + `POST /requests/drafts/:id/files`
   - 삭제: `DELETE /requests/drafts/:id/files/:fileId`
   - 복원: Draft.files + `/api/files/:fileId/download-url` + `fileCache.ts`
   - 드래그 앤 드롭 지원
   - 출력: `files`, `draftFiles`, `isDragOver`, `selectedPreviewIndex`, `handleUpload`, `handleRemoveFile`, `handleDragOver`, `handleDragLeave`, `handleDrop`

6. **프론트 useNewRequestPageV2 훅 작성** (새 파일)

   - `useDraftMeta` + `useNewRequestFilesV2` + `useNewRequestImplant` + `useNewRequestClinics` + `useNewRequestSubmitV2` 통합
   - Draft 준비 완료 여부 (`isReady`) 플래그로 파일 기능 활성화/비활성화
   - 기존 의뢰 수정 모드 지원
   - 환자 사례 미리보기 (간단한 구현)

7. **프론트 useNewRequestSubmitV2 훅 작성** (새 파일)
   - Draft → Request 전환 (`POST /requests/from-draft`)
   - 신규 의뢰 제출 시 Draft 자동 삭제
   - 취소 시 Draft 삭제 + localStorage/캐시 정리
   - 기존 의뢰 수정 모드 지원

### 주요 설계 결정

- **단일 소스**: Draft (caseInfos + files) + S3
- **로컬 캐시**: DraftMeta (caseInfos만, message 제외) + 파일 URL (fileCache.ts)
- **AI 분석**: 별도 스키마 없음, caseInfos에만 반영
- **파일 메타**: Draft.caseInfos[].file 를 항상 단일 소스로 사용

### 다음 단계 (테스트 및 마이그레이션)

1. **기존 코드와 동시 지원**

   - 기존 `useNewRequestPage` 유지 (호환성)
   - 새 `useNewRequestPageV2` 병렬 제공
   - UI 컴포넌트는 두 훅 모두 지원하도록 작성

2. **파일 업로드 플로우 테스트**

   - 파일 업로드 → Draft API 동기화 확인
   - 페이지 새로고침 → Draft 복원 확인
   - 파일 삭제 → Draft 동기화 확인

3. **제출/취소 플로우 테스트**

   - 제출 성공 → Draft 삭제 확인
   - 취소 → Draft 삭제 및 캐시 정리 확인

4. **추가 개선 사항** (2차 단계)
   - IndexedDB STL 캐싱 (성능 최적화)
   - AI 분석 결과 UI 개선
   - Draft 자동 저장 간격 조정

---

## 7. 현재 세션 진행 상황 (2025-12-07) - 마이그레이션 완료

### 완료된 마이그레이션

8. **기존 useNewRequestPage 완전 교체**
   - 기존 코드 삭제 후 새로운 구조로 완전 통합
   - `useDraftMeta` + `useNewRequestFilesV2` + `useNewRequestImplant` + `useNewRequestClinics` + `useNewRequestSubmitV2` 조합
   - 기존 의뢰 수정 모드 지원
   - Draft 준비 완료 여부 (`isReady`) 플래그로 파일 기능 활성화/비활성화

### 다음 단계 (테스트 및 최적화)

1. **파일 업로드 플로우 테스트**

   - 파일 업로드 → Draft API 동기화 확인
   - 페이지 새로고침 → Draft 복원 확인
   - 파일 삭제 → Draft 동기화 확인

2. **제출/취소 플로우 테스트**

   - 제출 성공 → Draft 삭제 확인
   - 취소 → Draft 삭제 및 캐시 정리 확인

3. **추가 개선 사항** (2차 단계)
   - IndexedDB STL 캐싱 (성능 최적화)
   - AI 분석 결과 UI 개선
   - Draft 자동 저장 간격 조정

### 리팩터링 완료 요약

**변경된 파일:**

- 백엔드: `draftRequest.model.js`, `draftRequest.controller.js`
- 프론트: `newRequestTypes.ts`, `useDraftMeta.ts`, `useNewRequestFilesV2.ts`, `useNewRequestSubmitV2.ts`, `useNewRequestPage.ts`, `NewRequestPage.tsx`

**제거된 파일:**

- `useNewRequestPageV2.ts` (기존 useNewRequestPage로 통합)

**핵심 변경:**

- Draft API 기반 단일 소스 (caseInfos + files)
- localStorage는 DraftMeta 캐시 + 파일 URL 캐시만 관리
- AI 분석 결과는 별도 스키마 없이 caseInfos에만 반영
- UI: `aiFileInfos` 제거, `caseInfos` 직접 사용으로 단순화

### UI 리팩터링 상세

**NewRequestPage.tsx 변경:**

1. `aiFileInfos` 제거 → `caseInfos` 직접 관리
2. 파일별 메타데이터는 Draft.files에서만 관리
3. 환자명/치아번호 옵션은 caseInfos에서 파생
4. workType 변경 시 caseInfos에 직접 반영
5. 임플란트 정보 변경 시 caseInfos에 동기화

**useNewRequestPage 훅 반환값 정리:**

- 제거: `selectedRequest`, `setSelectedRequest`, `patientCasesPreview`, `handleRenameClinic`, `selectedConnectionId`, `setSelectedConnectionId`
- 유지: `caseInfos`, `setCaseInfos`, `message`, `setMessage`, `files`, `handleUpload`, `handleRemoveFile` 등
- 명확화: 각 반환값을 용도별로 그룹화 (사용자 정보, Draft 상태, Case 정보, 파일 관리, 임플란트 정보, 클리닉 프리셋, 제출/취소)

---

## 8. per-file caseInfos 설계 및 구현 현황 (카드별 임플란트/크라운 데이터)

### 8.1 요구사항 정리

- **카드(파일)별로 6개 필드**를 독립적으로 저장/제출해야 함.
  - 어벗 관련 3개: `implantSystem`(제조사), `implantType`(시스템), `connectionType`(유형)
  - 크라운 관련 3개: (예: 보철 타입, 소재, 특이사항 등 – 구체 스키마는 추후 확정)
- 과거에는 Draft/Request 모두 단일 `caseInfos`만 존재해서
  - 한 카드에서 설정한 임플란트 값이 다른 카드에도 공유되는 문제가 있었음.
  - 서버에도 request 단위로 한 번만 저장되어, 카드별 정보 분리가 불가능.
- 현재는 **Draft 단계에서 파일별(case) 메타에 caseInfos-like 정보를 붙이고**, Request 생성 시 각 `caseInfos` 요소가 독립된 Request로 변환되도록 백엔드 구현을 완료.

### 8.2 백엔드 구현 요약

- `DraftRequest`
  - `caseInfos: DraftCaseInfo[]` 구조로 이미 전환 완료.
  - 각 요소는 `file + clinicName + patientName + tooth + 임플란트 정보 + workType` 한 세트.
  - 별도 `files` 배열은 존재하지 않음.
- `Request`
  - `caseInfos`는 여전히 단일 객체지만, 해당 케이스의 파일 메타가 `caseInfos.file`로 함께 저장됨.
  - `files` 배열 필드는 제거됨.
  - 메시지 기능은 향후 별도 구조로 재설계할 수 있도록 스키마에서 제거.

### 8.3 Request 생성 플로우 (Draft → Request)

- `createRequestsFromDraft` (`backend/controllers/request.controller.js`)

  - `draft.caseInfos` 배열에서 **workType = "abutment"** 인 케이스만 추려서 실제 Request 생성.
  - 각 `caseInfos` 요소마다 **별도의 Request 한 건**을 생성.
    - `Request.caseInfos` ← 해당 `caseInfos` 전체 복사.
    - `Request.caseInfos.file` ← `caseInfos.file`에서 `fileName/fileType/fileSize/s3Key` 등을 옮겨 저장.
  - 기존 가격/중복 검사(최근 90일 내 동일 케이스 10,000원, 그 외 15,000원) 로직 유지.
  - 각 Request 저장 후, `ClinicImplantPreset` 업데이트 로직도 케이스별로 수행.

- `referenceIds` 구성
  - 같은 **치과이름 + 환자이름** 조합을 가진 Request 들의 `requestId`를 서로 `referenceIds`에 기록.
  - 자기 자신의 `requestId`는 제외.

### 8.4 컨트롤러 변경 계획

- `draftRequest.controller.updateDraft`

  - 현재: `caseInfos` 필드만 PATCH.
  - 추가: per-file caseInfos 를 PATCH 하기 위한 별도 엔드포인트 도입:
    - `PATCH /api/requests/drafts/:id/files/:fileId/case-infos`
    - body: `caseInfos` (implantSystem/implantType/connectionType/workType 등).

- `draftRequest.controller.addFileToDraft`

  - body 에 `caseInfos?` 를 허용 (초기 값 함께 등록 가능).
  - 응답 시 해당 파일의 `caseInfos` 포함.

- `request.controller.createRequestsFromDraft`
  - 위 8.3 의 매핑 규칙에 따라 Draft.files[].caseInfos → Request.files[].caseInfos 로 복사.
  - 기존 단일 `caseInfos` 검증/가격 로직은
    - 대표 파일 기준으로 수행하거나,
    - 최초 버전에서는 "여전히 Draft.caseInfos 기준"으로 두고 점진적으로 고도화.

### 8.5 프론트 설계 (NewRequestPage 중심, 구현 예정)

- 현재 구조

  - `caseInfos`: Draft 전체 공통 정보 (clinicName/patientName/tooth/공통 workType 등).
  - `implantManufacturer/implantSystem/implantType`: 전역 임플란트 상태.
  - 카드별로는 `fileWorkTypes` 정도만 별도 관리.

- 목표 구조

  - **Draft.caseInfos = 카드(파일)별 caseInfos** 이므로, 프론트에서는 이 배열을 그대로 사용.
  - 각 카드 선택 시 해당 index의 `caseInfos`를 로딩해 폼에 바인딩.
  - 폼 변경 시:
    - `caseInfos[index]`를 수정하고,
    - 필요 시 `PATCH /api/requests/drafts/:id` 또는 전용 per-case 업데이트 엔드포인트로 동기화.

- 상태/훅 변경

  - `useNewRequestPage`에서:

    - `perFileCaseInfos` state 추가 (Draft.files 및 서버 응답으로 초기화).
    - 카드 클릭 시:
      - 해당 파일의 per-file caseInfos 를 읽어와 폼에 반영.
      - 없으면 Draft 공통 `caseInfos`를 기본값으로 사용.
    - 폼 변경 시:
      - 선택된 파일 키 기준으로 `perFileCaseInfos` 업데이트.
      - 동시에 `PATCH /api/requests/drafts/:id/files/:fileId/case-infos` 호출 (디바운스 적용).

  - `useDraftMeta`는 여전히 Draft 공통 `caseInfos`만 관리.
  - 임플란트 전역 상태(`implantManufacturer/implantSystem/implantType`)는
    - "현재 선택된 카드의 per-file caseInfos"를 뷰 모델로 보여주기 위한 값으로만 사용.
    - 카드 전환 시 per-file 값을 읽어와 전역 임시 상태로 set, UI 바인딩.

### 8.6 제출 플로우 (`useNewRequestSubmitV2`) 변경

- 현재: `POST /api/requests/from-draft` 호출 시, 백엔드가 Draft.caseInfos 배열을 순회하며
  - `workType="abutment"` 인 각 요소마다 Request 한 건을 생성.
  - 프론트는 Draft에 **카드별 caseInfos만 정확히 반영**하면 됨 (별도 payload 구조 변경 불필요).

### 8.7 마이그레이션/호환성 전략

- 1단계: 백엔드 스키마/컨트롤러 확장만 먼저 적용
  - 기존 클라이언트는 영향 없음 (새 필드는 optional).
- 2단계: 프론트에서 per-file caseInfos 읽기/쓰기 기능 추가
  - UI에서 카드별 임플란트/크라운 설정이 분리되어 보이지만, 기존 데이터도 정상 표시.
- 3단계: 제조사/관리자 워크시트에서 per-file 정보 활용
  - 필요 시 Request.files[].caseInfos 를 사용해 UI/로직 확장.

---

## 9. 배송 정책 설계 (기공소/제조사 관점 초안)

> 목표: **기공소 입장에서 배송비(착불 4,000원/박스)와 납기(속도) 사이의 트레이드오프를 최소 고민으로 선택**할 수 있게 하고,
> 백엔드에서는 `Request`와 별도의 `Shipment`(또는 DailyShipment) 개념으로 확장 가능하게 설계.

### 9.1 비즈니스 전제

- **단가/배송비**
  - 커스텀 어벗 1개당 10,000~15,000원 (기존 가격 로직 유지)
  - 택배 1박스당 4,000원, **착불** (기공소 부담)
- **생산/출고 패턴**
  - 기공소: 하루에 여러 건을 의뢰할 수 있음 (없는 날도 있음).
  - 제조사: 하루에 한 번 택배차 방문 → **그날 생산된 건을 모아서 출고**.
- **기본 전략**
  - 묶음 배송을 기본으로 하고, **정말 급한 케이스만 예외적으로 급송(사실상 단일/소량 박스)** 처리.

### 9.2 기공소별 배송 정책 (랩 프로필 설정)

기공소는 *랩 단위*로 기본 배송 정책을 한 번만 설정하고, 개별 의뢰에서는 `일반/급송` 정도만 선택하는 구조를 목표로 한다.

- **옵션 A: n개 모이면 자동 묶음 배송**

  - 예: `n = 3`, `최대 대기일 = 3일`.
  - 룰 예시:
    - 동일 기공소의 "일반(비급송)" 의뢰가 n개 이상 모이면 → 묶음 출고 그룹 생성.
    - n개가 안 되더라도, 가장 오래된 의뢰가 `최대 대기일`을 초과하면 그 시점에 출고.

- **옵션 B: 매주 X/Y/Z 요일 자동 묶음 배송**

  - 예: 화/금요일 자동 출고.
  - 룰 예시:
    - 지정 요일 아침 기준으로, 해당 기공소의 "일반" 의뢰를 한 박스(또는 소수 박스)로 묶어서 출고 계획 생성.

- **옵션 A + B 병합** (권장)

  - 둘 중 더 빠른 조건이 만족되면 출고:
    - n개 모임, 또는
    - 지정 요일 도달, 또는
    - 최대 대기일 초과.

- **저장 위치(초안)**
  - `LabProfile` (또는 `User`의 랩 설정) 확장:
    - `shippingPolicy: {
  autoBatchThreshold?: number;      // n개 모이면 출고
  maxWaitDays?: number;             // 최대 대기일 (선택)
  weeklyBatchDays?: string[];       // ["tue", "fri"] 등
}`

### 9.3 개별 의뢰에서의 배송 옵션 (New Request 연계)

New Request 화면에서, 각 케이스(파일) 또는 요청 단위로 기공소가 **간단한 옵션만 선택**하게 한다.

- **기본 배송 모드** (케이스 생성 시)

  - `일반 (랩 기본 정책 따름)`
  - `급송 (출고 날짜 지정)`

- **급송 설정**

  - 사용자는 "출고 희망일"을 지정:
    - 예: `a일(b요일)까지 출고 요청`.
  - 시스템 안내 텍스트:
    - "a일 출고 → 일반 택배 기준 다음날 도착 예상".
  - 내부 룰:
    - `shippingMode = "express"`, `requestedShipDate = a일`.
    - 해당 날짜까지 반드시 출고 그룹에 포함되도록 스케줄링.
    - 같은 날짜의 다른 급송 케이스가 있으면 함께 묶고, 없으면 사실상 단일 박스.

- **필드(초안)**
  - Draft/Request 공통으로 사용 가능한 최소 필드만 정의 (실제 구현 시 장소는 Request/Shipment로 조정 가능):
    - `shippingMode: "normal" | "express"` // 기본 normal
    - `requestedShipDate?: Date` // express일 때만 의미

### 9.4 Shipment(출고 묶음) 개념 초안 (백엔드)

기존 `Request` 모델은 **케이스(작업 단위)** 중심이므로, 배송을 명확히 표현하기 위해 별도 `Shipment`(또는 `DailyShipment`) 개념을 도입하는 것을 고려한다.

- **Shipment 스키마 초안** (새 모델)

  ```ts
  Shipment: {
    lab: ObjectId(Lab | User),        // 대상 기공소
    shipDate: Date,                   // 실제 출고일 (택배 픽업 기준)
    requests: ObjectId[];             // 포함된 Request 목록
    shippingType: "batch" | "express"; // 묶음 / 급송 그룹
    status: "planned" | "shipped" | "delivered";
    trackingNumber?: string;          // 송장번호
    boxCount?: number;                // 박스 수 (필요 시)
    createdAt, updatedAt,
  }
  ```

- **생성/갱신 흐름(개요)**
  - 매일 제조사 측 배치 또는 이벤트 기반으로:
    - 각 기공소별로, 랩 정책(A/B) + 개별 요청의 `shippingMode/ requestedShipDate`를 고려해 출고 그룹(Shipment) 생성.
    - "일반" 요청들은 auto-batch 규칙에 따라 묶어서 `shippingType = "batch"` Shipment에 할당.
    - "급송" 요청들은 `requestedShipDate` 기준으로 `shippingType = "express"` Shipment에 우선 할당.

### 9.5 프론트 UX 초안 (기공소 대시보드)

- **랩 설정 화면**

  - 섹션: "배송 정책"
    - `n개 모이면 자동 묶음` (슬라이더/입력)
    - `최대 대기일` (선택)
    - `주간 묶음 요일 선택` (체크박스: 월~금)

- **New Request (의뢰 생성) 화면**

  - 각 케이스(파일)별 카드 또는 공통 영역에:
    - `배송 모드`: `일반(추천)` / `급송`
  - 내부적으로 Draft/Request에 `shippingMode`를 저장.

- **기공소용 요청/배송 대시보드 (향후)**
  - 섹션: "이번 주 출고 예정"
    - 날짜별, `batch/express` 그룹별로 포함된 Request 리스트 + 예상 박스/배송비 요약.
    - 예: "화요일: 묶음 1박스(4케이스), 급송 1박스(1케이스) → 총 8,000원 착불".

### 9.6 New Request 흐름과의 연결 포인트

- **Draft 단계**

  - Draft 수준에서는 `shippingMode`, `requestedShipDate`를 함께 저장해두고,
  - 제출 시 `createRequestsFromDraft`에서 Request로 그대로 복사.

- **Request 생성 후**

  - Shipment 배치는 Request 기준으로 수행하되,
  - Request.caseInfos 자체는 **제조/가격/임플란트 정보**에 집중하고,
  - 배송 관련 필드는 Request 상단/별도 필드(`shippingMode`, `requestedShipDate`) 또는 Shipment 참조로 관리.

- **현 시점 결정**
  - 이 문서에서는 **비즈니스 룰/필드 초안**까지만 정의하고,
  - 다음 세션에서 실제 모델(`Request`, `DraftRequest`, `Shipment`)에 어떤 필드를 둘지와
    New Request UI에 어떤 형태로 노출할지 구체 구현을 진행한다.
