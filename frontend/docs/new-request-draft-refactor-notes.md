# New Request Draft 리팩터링 노트

## 1. 백엔드 현황

- **모델**: `DraftRequest` (`backend/models/draftRequest.model.js`)

  - 필드
    - `requestor: ObjectId(User)`
    - `status: "draft" | "submitted" | "cancelled"` (기본: `"draft"`)
    - `message: string`
    - `caseInfos`:
      - `clinicName?`, `patientName?`, `tooth?`
      - `workType?: "abutment" | "prosthesis"`
      - `abutType?`
      - `implantSystem?`, `implantType?`, `connectionType?`
    - `files: DraftFileMeta[]`
      - `_id: ObjectId` (Draft 내 파일 ID)
      - `fileId?: ObjectId` (기존 `File` 도큐먼트 ID)
      - `originalName: string`
      - `size: number`
      - `mimetype: string`
      - `s3Key?: string`
    - `createdAt`, `updatedAt` (timestamps)

- **컨트롤러**: `backend/controllers/draftRequest.controller.js`

  - `POST /api/request-drafts` → Draft 생성 (`createDraft`)
  - `GET /api/request-drafts/:id` → Draft 조회 (`getDraft`)
  - `PATCH /api/request-drafts/:id` → `message`, `caseInfos` 부분 업데이트 (`updateDraft`)
  - `POST /api/request-drafts/:id/files` → 파일 메타 추가 (`addFileToDraft`)
    - body: `{ originalName, size, mimetype, fileId?, s3Key? }`
    - `fileId` 또는 `s3Key` 중 하나는 반드시 존재해야 함
  - `DELETE /api/request-drafts/:id/files/:fileId` → Draft.files 에서 해당 `_id` 제거 (`removeFileFromDraft`)
  - `DELETE /api/request-drafts/:id` → Draft 삭제 (`deleteDraft`)

- **라우트**: `backend/routes/draftRequest.routes.js`

  - `router.use(authenticate);`
  - `router.use(authorize(["requestor", "admin"]));`
  - 위 컨트롤러와 매핑

- **app.js 연결**

  - `app.use("/api/request-drafts", draftRequestRoutes);`

- **MOCK 토큰 처리** (`auth.middleware.js`)
  - dev 환경에서 `token === "MOCK_DEV_TOKEN"` 이면 `x-mock-role` 기반으로 `req.user.role` 설정.
  - Draft API 사용 시 프론트에서 항상 `x-mock-role: "requestor"` 를 같이 넘겨야 함.

---

## 2. 프론트 현황

### 2.1 인증 & Draft 생성/조회 (`useNewRequestPage.ts`)

- `useAuthStore` 에서 mock 로그인 시 `token = "MOCK_DEV_TOKEN"`.
- `NEW_REQUEST_DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1"` 사용.
- 진입 시 흐름
  1. localStorage 에서 `draftId` 읽기.
  2. 있으면 `GET /api/request-drafts/:draftId` 시도.
  3. 없거나 실패하면 `POST /api/request-drafts` 로 새 Draft 생성.
  4. 성공한 `_id` 를 state(`draftId`)와 localStorage에 저장.
- Draft 응답을 **초기 1회**에 한해 상태로 주입
  - `draft.message` → `setMessage`.
  - `draft.caseInfos` → `setImplantManufacturer/System/Type`.
  - `draft.files` → `uploadedFiles` 초기값으로 변환:
    ```ts
    const nextUploaded: TempUploadedFile[] = draft.files.map((f: any) => ({
      _id: f.fileId ?? f._id,
      originalName: f.originalName,
      mimetype: f.mimetype,
      size: f.size,
      fileType: "3d_model",
    }));
    setUploadedFiles(nextUploaded);
    ```
- Draft 관련 fetch 헤더(403 방지):
  ```ts
  headers: {
    "Content-Type": "application/json", // POST 시
    Authorization: `Bearer ${token}`,
    "x-mock-role": "requestor",
  }
  ```
- `useNewRequestFiles` 호출 시 `draftId` 함께 전달:
  ```ts
  useNewRequestFiles({
    draftId,
    token,
    implantManufacturer,
    implantSystem,
    implantType,
    ...
  });
  ```

### 2.2 메시지/임플란트 저장 (`useNewRequestDraft.ts`)

- 예전 localStorage(`NEW_REQUEST_DRAFT_STORAGE_KEY`) 기반 복원/저장 로직 제거.
- `existingRequestId` 가 없고 `draftId`/`token` 이 있을 때,
  - `message` 또는 임플란트 정보가 변경되면:
    ```ts
    PATCH /api/request-drafts/:draftId
    body: {
      message,
      caseInfos: {
        implantSystem: implantManufacturer,
        implantType: implantSystem,
        connectionType: implantType,
      }
    }
    ```

### 2.3 파일 훅 (`useNewRequestFiles.ts`) – 현재 상태

- 파라미터 타입에 `draftId?: string` 추가됨.
- 여전히 `uploadedFiles`/`aiFileInfos`/`localStorage(NEW_REQUEST_DRAFT_STORAGE_KEY)` 를 일부 사용하고 있으나,
  **업로드 성공 후 Draft에도 파일 메타를 추가로 등록하기 시작한 상태**.

- 업로드 후(공통 패턴):

  ```ts
  const uploaded = await uploadFilesWithToast(unique);
  const uploadedActive = uploaded.filter(...);

  if (uploadedActive.length > 0) {
    if (draftId && token) {
      try {
        await Promise.all(
          uploadedActive.map((u) =>
            fetch(`/api/request-drafts/${draftId}/files`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "x-mock-role": "requestor",
              },
              body: JSON.stringify({
                originalName: u.originalName,
                size: u.size,
                mimetype: u.mimetype,
                fileId: u._id,
              }),
            }).catch(() => undefined)
          )
        );
      } catch {
        // Draft 동기화 실패는 치명적이지 않으므로 무시
      }
    }

    // 이후 기존 nextUploadedFiles / setUploadedFiles / syncDraftToStorage ...
  }
  ```

- 삭제/복원/로컬스토리지 관련 부분은 **옛 구조가 그대로 남아 있는 중간 상태**.
  - `removeFile` 은 아직 DraftRequest.delete 를 호출하지 않음.
  - localStorage(`NEW_REQUEST_DRAFT_STORAGE_KEY`) 에 여전히 `uploadedFiles`/`aiFileInfos`/`selectedPreviewIndex` 를 쓰는 코드가 남아 있음.

---

## 3. 다음 세션에서 마저 할 작업 (새 구조 목표)

> 목표: "백엔드 DraftRequest + S3" 를 단일 소스로, localStorage 는 **파일 캐시 전용**으로 사용.

1. **`useNewRequestFiles` 완전 개편**

   - props 변경:
     - `draftId: string` (필수로 승격)
     - `draftFiles: DraftFileMeta[]` 와 `setDraftFiles` 추가 검토
   - 업로드:
     1. `/api/files/temp` → `TempUploadedFile[]` (S3 업로드)
     2. 각 파일마다 `POST /api/request-drafts/:draftId/files`
     3. 응답 Draft.files 를 기반으로 `setDraftFiles`/`uploadedFiles`/UI 최신화
   - 삭제:
     1. 카드가 어떤 Draft 파일인지 식별 (예: `File._tempId = draftFile._id`)
     2. `DELETE /api/request-drafts/:draftId/files/:fileId`
     3. 성공 후 Draft.files/상태 동기화
   - 복원:
     - 항상 Draft.files 기준으로 `/api/files/:fileId/download-url` → blob → `File` 재생성.

2. **localStorage 를 캐시 전용으로 단순화**

   - `NEW_REQUEST_DRAFT_STORAGE_KEY` 기반의 파일 리스트/AI 정보/selectedPreviewIndex 저장 제거.
   - 대신 별도 캐시 키 설계:
     - 예: `abutsfit:file-cache:v1`
     - 구조:
       ```ts
       {
         [fileIdOrS3Key: string]: {
           url: string;
           expiresAt: number;
           // 선택: blob 을 serialize 할 수 있으면 추가
         };
       }
       ```
   - 헬퍼 유틸 예:
     - `getCachedUrl(key): string | null`
     - `setCachedUrl(key, url, ttlMs)`

3. **`useNewRequestSubmit`에서 Draft 마무리** (아직 손대지 않음)
   - 제출 시:
     - DraftRequest 를 바탕으로 `/api/requests` 생성 or Draft → 정식 Request 전환.
   - 취소 시:
     - `DELETE /api/request-drafts/:draftId` 호출.
     - localStorage 의 `draftId` 및 파일 캐시 일부 정리.

이 파일은 **현재까지의 구조/상태/다음 단계 계획**을 기록하기 위한 메모용입니다.
다음 세션에서 이 노트를 열고, 3번 "다음 세션에서 마저 할 작업" 부분부터 이어서 구현하면 됩니다.
