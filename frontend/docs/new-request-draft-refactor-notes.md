# New Request Draft 리팩터링 노트

## 1. 백엔드 현황 (단일 caseInfos 스키마)

- **최종 Request 모델**: `Request` (`backend/models/request.model.js`)

  - `caseInfos` 스키마

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
    }
    ```

- **Draft 모델**: `DraftRequest` (`backend/models/draftRequest.model.js`)

  - 필드

    - `requestor: ObjectId(User)`
    - `status: "draft" | "submitted" | "cancelled"` (기본: `"draft"`)
    - `message: string`
    - `caseInfos`: **위 Request 의 `caseInfos` 와 동일 구조**
      - `clinicName`, `patientName`, `tooth`
      - `implantSystem`, `implantType`, `connectionType`
      - `maxDiameter`, `connectionDiameter`, `workType`
    - `files: DraftFileMeta[]`
      - `_id: ObjectId` (Draft 내 파일 ID)
      - `fileId?: ObjectId` (기존 `File` 도큐먼트 ID)
      - `originalName: string`
      - `size: number`
      - `mimetype: string`
      - `s3Key?: string`
    - `createdAt`, `updatedAt` (timestamps)

  - **중요한 점**
    - 별도 `aiFileInfos` 컬렉션/필드는 두지 않는다.
    - `abutType` 도 사용하지 않는다.
    - AI 는 단지 `clinicName / patientName / tooth` 를 채워주는 **보조 수단**일 뿐, 새로운 스키마를 만들지 않는다.

- **컨트롤러**: `backend/controllers/draftRequest.controller.js`

  - `POST /api/request-drafts` → Draft 생성 (`createDraft`)
  - `GET /api/request-drafts/:id` → Draft 조회 (`getDraft`)
  - `PATCH /api/request-drafts/:id` → `message`, `caseInfos` 부분 업데이트 (`updateDraft`)
  - `POST /api/request-drafts/:id/files` → 파일 메타 추가 (`addFileToDraft`)
    - body: `{ originalName, size, mimetype, fileId?, s3Key? }`
    - `fileId` 또는 `s3Key` 중 하나는 반드시 존재해야 함
  - `DELETE /api/request-drafts/:id/files/:fileId` → Draft.files 에서 해당 `_id` 제거 (`removeFileFromDraft`)
  - `DELETE /api/request-drafts/:id` → Draft 삭제 (`deleteDraft`)

- **라우트 & 인증**
  - `backend/routes/draftRequest.routes.js`
    - `router.use(authenticate);`
    - `router.use(authorize(["requestor", "admin"]));`
    - 위 컨트롤러와 매핑
  - `app.js` 에서 `app.use("/api/request-drafts", draftRequestRoutes);`
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
    message: string;
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

  - **파일 메타(`files`)는 DraftMeta 에 넣지 않는다.**
    - 파일 메타는 항상 서버 Draft 의 `draft.files` 를 단일 소스로 사용.
  - 실제 STL 바이너리는 S3 에만 있고, URL 은 `fileCache.ts` 로만 캐시한다.

- **신규의뢰 페이지 진입 시 흐름 (설계)**

  1. `NEW_REQUEST_DRAFT_ID_STORAGE_KEY` 와 `NEW_REQUEST_DRAFT_META_KEY` 를 읽는다.
  2. 둘 다 있고, `updatedAt` 이 TTL (예: 30분) 이내라면:
     - 서버에 요청하지 않고, DraftMeta 로 `message` 와 `caseInfos` 를 즉시 상태 초기값으로 사용.
  3. DraftMeta 가 없거나 만료된 경우:
     - `draftId` 가 있으면 `GET /api/request-drafts/:draftId` 시도.
     - 없거나 404/403 이면 `POST /api/request-drafts` 로 새 Draft 생성.
     - 응답 Draft 의 `message` / `caseInfos` 로 상태를 채우고, 동시에 DraftMeta 로 변환해 localStorage 에 저장.
  4. 이 과정에서 항상 `x-mock-role: "requestor"` 헤더를 같이 전송.

### 2.2 메시지/임플란트/환자 정보 저장 (`useNewRequestDraft.ts` 새 역할)

- `existingRequestId` 가 없고 `draftId`/`token` 이 있을 때,

  - `message` 나 `caseInfos` (환자 정보 3 + 임플란트 정보 3 + workType 등) 가 변경되면:

    ```ts
    PATCH /api/request-drafts/:draftId
    body: {
      message,
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

- PATCH 성공 후에는 같은 payload 로 DraftMeta 도 갱신하여 localStorage 에 저장한다.
- AI 가 파일명에서 추론한 `clinicName / patientName / tooth` 도 **최종적으로는 caseInfos 에만 반영**한다.
  - 별도 `aiFileInfos` 배열을 유지하지 않는다.

### 2.3 파일 훅 (`useNewRequestFiles.ts`) – 단순화된 역할

- 인자 (목표 설계)

  ```ts
  useNewRequestFiles({
    draftId: string,
    token: string | null,
    draftFiles: DraftFileMeta[],
    setDraftFiles: (next: DraftFileMeta[]) => void,
  });
  ```

- 역할

  - **업로드**
    1. `/api/files/temp` 로 S3 에 STL 업로드 → `TempUploadedFile[]` 수신.
    2. 각 파일마다 `POST /api/request-drafts/:draftId/files` 호출하여 Draft.files 에 메타 추가.
    3. 응답 또는 `GET /api/request-drafts/:draftId` 결과를 기반으로 `draftFiles` 와 `uploadedFiles`/`files` 상태를 동기화.
  - **삭제**
    1. 카드가 가리키는 Draft 파일의 `_id` 를 알아낸 뒤,
    2. `DELETE /api/request-drafts/:draftId/files/:fileId` 호출.
    3. 성공하면 `draftFiles` 와 프론트 상태에서 해당 파일 제거.
  - **복원**
    - 페이지 재진입 시 `draftFiles` 를 기준으로 `/api/files/:fileId/download-url` 을 호출해 blob 을 가져오고,
    - `File` 객체를 만들어 3D 뷰어/카드 UI 에 사용.
    - 이때 presigned URL 은 `fileCache.ts` 의 `getCachedUrl` / `setCachedUrl` 로 캐시.

- 이 훅은 **파일 관련 로직만** 담당하고, 환자/임플란트/메시지/AI 텍스트는 모두 `caseInfos` + DraftMeta 가 담당한다.

---

## 3. 다음 세션에서 마저 할 작업 (새 구조 목표)

> 목표: **"백엔드 DraftRequest (caseInfos + files) + S3" 를 단일 소스로 사용하고, localStorage 는 DraftMeta(메시지 + caseInfos) 와 파일 URL 캐시만 최소한으로 관리**.

1. **DraftMeta 관리 훅 작성 (`useDraftMeta` 가칭)**

   - 책임
     - Draft 생성/조회 (캐시 → GET → POST 플로우)
     - `message` / `caseInfos` 변경 시 PATCH + DraftMeta 동시 갱신
   - 출력
     - `draftId`, `message`, `setMessage`, `caseInfos`, `setCaseInfos`, `status(loading/ready)` 등.

2. **`useNewRequestFiles` 간소화/재작성**

   - 상단 설계에 맞게
     - 업로드: `/api/files/temp` + `POST /request-drafts/:id/files`
     - 삭제: `DELETE /request-drafts/:id/files/:fileId`
     - 복원: Draft.files + `/api/files/:fileId/download-url` + `fileCache.ts`
   - 환자/임플란트/AI 텍스트는 건드리지 않도록 분리.

3. **제어 코드(훅) 전면 교체 + UI 재사용 방침**

   - 기존 제어 훅들인 `useNewRequestPage`, `useNewRequestDraft`, (구) `useNewRequestFiles` 는
     "부분 수정"이 아니라 **삭제/폐기(deprecate) 후 새 훅으로 교체**한다.
   - 새 구조에서는 `useDraftMeta` + 새 `useNewRequestFiles` + `useNewRequestImplant` 를 조합하는 방식으로만 동작한다.
   - UI 컴포넌트인 `NewRequestPage.tsx` 는 **기존 JSX 레이아웃과 스타일을 최대한 유지**하고,
     내부에서 사용하는 props/핸들러만 새 훅에서 오는 것들로 교체하여 재사용한다.

4. **IndexedDB STL 캐싱 (2차 최적화 단계에서 도입)**

   - 1차 리팩터링 목표는 **Draft + S3 + URL 캐시(fileCache)** 기반 플로우를 완전히 안정화하는 것.
   - 이후 실제 사용 중에 성능 이슈가 명확할 때(예: 해외 S3, 다수 대용량 STL 반복 열람) 2차 단계에서 IndexedDB STL 캐싱 레이어를 추가한다.
   - 설계 방침:
     - IndexedDB 에는 `fileId`(또는 `s3Key`) 를 key 로 STL blob 을 저장한다.
     - Draft 에서 파일이 삭제되더라도 **IndexedDB 에서 즉시 삭제하지 않고 그대로 둔다.**
       - 즉, Draft 삭제/파일 삭제는 서버 상태만 정리하고, 로컬 blob 은 캐시로 남겨둔다.
     - IndexedDB 캐시는 **LRU 또는 최근 N일 이내 파일만 유지**하는 정책으로 주기적으로 정리한다.
   - 이 레이어는 순수한 성능/트래픽 최적화용이며, 단일 소스는 계속해서 `DraftRequest(caseInfos + files) + S3` 로 유지한다.

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
   - 취소 시: `DELETE /api/request-drafts/:draftId`
   - localStorage의 `draftId` 및 파일 캐시 정리

3. **테스트 및 검증**
   - 파일 업로드 → Draft 동기화 확인
   - 페이지 새로고침 → Draft 복원 확인
   - 파일 삭제 → Draft 동기화 확인
   - 제출/취소 → Draft 정리 확인

---

## 4. 현재 세션 진행 상황 (2025-12-07)

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

### 다음 단계 (테스트 및 검증)

1. **파일 업로드 플로우 테스트**

   - 파일 업로드 → Draft API 동기화 확인
   - 페이지 새로고침 → Draft 복원 확인
   - 파일 삭제 → Draft 동기화 확인

2. **제출/취소 플로우 테스트**

   - 제출 성공 → Draft 삭제 확인
   - 취소 → Draft 삭제 및 캐시 정리 확인

3. **추가 개선 사항** (선택)
   - Draft 파일 복원 시 캐시 활용 (`getCachedUrl`)
   - 파일 삭제 시 백엔드 Draft API 호출
   - 업로드 진행 중 Draft 동기화 최적화
