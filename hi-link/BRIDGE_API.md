# CNC Bridge & Control 설계 문서

## 1. 전체 구조

- **프론트엔드** (React/Vite)
  - `CncDashboardPage.tsx` : CNC 대시보드 메인 페이지
  - `MachineCard.tsx`, `CncMachineGrid.tsx` : 장비 카드/그리드 UI
  - `useCncMachines.ts`, `useCncWorkBoard.ts` : 장비 목록/워크보드 데이터 훅
- **코어 백엔드 (Node/Express)**
  - `backend/controllers/machine.controller.js`
  - `backend/routes/machine.routes.js`
- **Hi-Link 브리지 (C# Web API .NET 4.8)**
  - `HiLinkMode2Client.cs` : Mode2 DLL 단일 워커 스레드 클라이언트
  - `Controllers/BridgeController.cs`, `Controllers/MachinesController.cs`
  - `MachinesConfigStore.cs`, `MachinesInitializer.cs`

데이터 흐름:

프론트 → `/api/machines`(Node) → `/api/cnc`(C# 브리지) → Hi-Link Mode2 DLL

---

## 2. 권한/역할 정책

### 2.1 사용자 역할

`frontend/src/store/useAuthStore.ts` 기준

- `requestor` : 발주자 (랩)
- `manufacturer` : 제조사 (CNC 제어 권한 보유)
- `admin` : 서비스 관리자 (CNC 직접 제어/조회 없음)

### 2.2 CNC 접근 제약

#### 프론트 라우팅

`frontend/src/App.tsx`

- 대시보드 전체: 로그인 필요
  - `/dashboard` → `ProtectedRoute`
- CNC 대시보드: **manufacturer 전용**
  - `/dashboard/cnc` → `RoleProtectedRoute roles=["manufacturer"]`

```tsx
const RoleProtectedRoute = ({
  roles,
  children,
}: {
  roles: ("requestor" | "manufacturer" | "admin")[];
  children: React.ReactNode;
}) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !roles.includes(user.role))
    return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
```

#### 백엔드 라우팅

`backend/routes/machine.routes.js`

모든 CNC 관련 라우트는 **manufacturer만** 접근 허용.

```js
router.get("/", maybeAuth(["manufacturer"]), getMachines);
router.post("/", maybeAuth(["manufacturer"]), upsertMachine);
router.delete("/:uid", maybeAuth(["manufacturer"]), deleteMachine);

router.get("/:uid/status", maybeAuth(["manufacturer"]), getMachineStatusProxy);
router.post("/:uid/reset", maybeAuth(["manufacturer"]), resetMachineProxy);
router.post("/:uid/raw", maybeAuth(["manufacturer"]), callRawProxy);
```

- `requestor`, `admin` 은 CNC 장비 조회/제어 API 모두 차단.

---

## 3. Hi-Link 브리지 API (C# /api/cnc)

루트: `dev/abuts.fit/hi-link/bridge-service/HiLinkBridgeWebApi48`

### 3.1 HiLinkMode2Client

`HiLinkMode2Client.cs`

- 목적: Mode2 DLL의 스레드 불안정성을 피하기 위해 **단일 워커 스레드**에서 모든 요청 직렬 처리.
- 핵심 구조:
  - `BlockingCollection<RequestItem> RequestQueue`
  - `ProcessQueue()` 내에서
    - `new MessageHandler()` 한 번 생성 → DLL 내부 스레드 초기화
    - `MessageHandler.RequestFIFO.Enqueue(request)`
    - `MessageHandler.ResponseFIFO` 에서 UID/DataType 일치 응답만 소비
- 주요 메서드
  - `Task<object> RequestRawAsync(string uid, CollectDataType type, object data, int timeoutMs = 3000)`
  - `Task<(bool success, int? resultCode)> AddMachineAsync(string uid, string ip, int port)`
  - `Task<List<MachineIPInfo>> GetMachineListAsync()`

### 3.2 MachinesController (장비 등록/조회)

`Controllers/MachinesController.cs`

- `POST /api/cnc/machines`
  - Body: `{ uid, ip, port }`
  - DLL `AddMachine` 호출 → 성공 시 `MachinesConfigStore.Upsert` 로 `machines.json` 동기화
- `GET /api/cnc/machines`
  - DLL `GetMachineList` 호출 결과 반환

### 3.3 BridgeController (핵심 API)

`Controllers/BridgeController.cs`

#### 3.3.1 상태/장비 관리

- `GET /api/cnc/machines/{uid}/status`
  - `CollectDataType.GetOPStatus` 호출
  - `result == 0` → `status: "OK"`, 그 외 `"Error"`
- `DELETE /api/cnc/machines/{uid}`
  - `CollectDataType.DeleteMachine` 호출, 성공 여부만 반환

#### 3.3.2 Reset 명령 (유일한 제어 명령)

- `POST /api/cnc/machines/{uid}/reset`
  - DLL `CollectDataType.ResetButton` 호출
  - 5초 쿨다운 적용:
    - `ConcurrentDictionary<string, DateTime> ControlCooldowns`
    - key: `"reset:{uid}"`
    - 5초 내 중복 요청 시 HTTP 429 반환

#### 3.3.3 RAW 게이트웨이

- `POST /api/cnc/raw`
  - Body: `RawHiLinkRequest { uid, dataType, payload, timeoutMilliseconds? }`
  - `dataType` 문자열을 `CollectDataType` enum 으로 파싱
  - `payload` 를 적절한 타입으로 변환 후 `HiLinkMode2Client.RequestRawAsync` 에 전달
  - 다음 타입에 대해서는 **DTO 변환**을 수행해 프론트 친화적 구조로 변환:
    - `GetProgListInfo`
    - `GetActivateProgInfo`
    - `GetOPStatus`
    - `GetToolLifeInfo`
    - `GetMotorTemperature`
    - `GetProgDataInfo`
  - 그 외 모든 타입(읽기/쓰기 포함)은 DLL 객체를 JSON 직렬화하여 `data` 로 반환.

**→ Mode2 DLL이 제공하는 모든 CollectDataType(읽기/쓰기 포함)을 이 엔드포인트 하나로 호출 가능.**

---

## 4. 코어 백엔드 API (Node /api/machines, /api/core/machines)

### 4.1 장비 관리

`backend/controllers/machine.controller.js`

- `GET /api/machines`
  - MongoDB 에 저장된 장비 목록 반환 (manufacturer 기준 필터 가능)
- `POST /api/machines`
  - Body: `{ uid, name, ip, port, ... }`
  - MongoDB `upsert` 후, 브리지 `/api/cnc/machines` 호출로 Hi-Link에도 등록 시도
- `DELETE /api/machines/:uid`
  - MongoDB 삭제 + (구 bridge-node 기준) 설정 파일에서 제거 시도

### 4.2 상태/Reset 프록시

- `GET /api/machines/:uid/status`
  - 브리지 `/api/cnc/machines/{uid}/status` 호출 프록시
- `POST /api/machines/:uid/reset`
  - 브리지 `/api/cnc/machines/{uid}/reset` 호출 프록시
  - 5초 쿨다운:
    - `Map lastControlCall`에 `"uid:reset"` 키로 마지막 호출 시각 저장
    - 5초 내 재호출 시 429 반환

### 4.3 RAW 프록시 (읽기/쓰기 공용)

- `POST /api/machines/:uid/raw`

  - Body 예:

  ```json
  {
    "dataType": "GetOPStatus",
    "payload": null
  }
  ```

  - Node → 브리지 `/api/cnc/raw` 로 그대로 전달
  - **Read 계열**(상태, 프로그램 리스트, 온도, 툴 수명 등)과
    **Write 계열**(UpdateToolLife, UpdateToolOffset, UpdateProgram 등) 모두 지원

---

## 5. 프론트 CNC 대시보드 동작

### 5.1 페이지 구조 (`CncDashboardPage.tsx`)

- 장비 목록/CRUD: `useCncMachines()`
- 워크보드(상태/프로그램/툴/온도): `useCncWorkBoard()`
- 장비 카드 그리드: `CncMachineGrid` + `MachineCard`
- 모달들:
  - 장비 추가/수정
  - 프로그램 상세
  - 공구 상태
  - 온도 상세
  - 장비 Reset 확인
  - manufacturer 전용 CNC PIN 설정/확인

### 5.2 워크보드 조회 (읽기 계열)

`useCncWorkBoard.ts`

- `refreshWorkBoard()` :
  - `GetOPStatus`, `GetProgListInfo`, `GetActivateProgInfo` 병렬 호출
- `fetchMotorTemp()` : `GetMotorTemperature`
- `fetchToolLife()` : `GetToolLifeInfo`
- `fetchProgramList()` : `GetProgListInfo` + `GetActivateProgInfo`

모두 다음 엔드포인트를 통해 호출:

```ts
POST /api/core/machines/:uid/raw
Body: { uid, dataType: string, payload: any }
```

### 5.3 Reset 단일 명령

- MachineCard: 하단에 **Reset 버튼만 노출**
- 클릭 흐름:

  1. 카드 → 상위로 `onSendControl(uid, "reset")` 콜백
  2. `CncDashboardPage` 에서 Reset 대상 장비를 `resetTarget`에 저장하고 `resetConfirmOpen` 열기
  3. `ConfirmDialog`에서 사용자 확인 시 `sendControlCommand(uid, "reset")` 호출
  4. `sendControlCommand` 내부에서:
     - manufacturer 4자리 PIN 확인 (`ensureCncWriteAllowed`)
     - 5초 쿨다운 검사
     - `/api/machines/:uid/reset` 호출 후 상태 재조회

---

## 6. manufacturer 전용 4자리 PIN 정책

### 6.1 대상 및 목적

- 대상 역할: **manufacturer만**
  - `requestor`, `admin` 은 CNC 페이지/백엔드 접근 자체가 불가
- 목적: Reset 및 기타 "쓰기" 계열 CNC 명령 실행 전에, 계정별/하루 1회 4자리 PIN을 재확인

### 6.2 저장 방식

- 저장 위치: 브라우저 `localStorage`
- 키 설계:
  - PIN 값 : `cnc_pin_{userId}` → 예: `"1234"`
  - 하루 1회 검증 여부 : `cnc_write_verified_{userId}_{YYYYMMDD}` → 예: `"1"`

### 6.3 가드 함수: `ensureCncWriteAllowed()`

`CncDashboardPage.tsx` 내 구현

```ts
const ensureCncWriteAllowed = async (): Promise<boolean> => {
  if (!user || user.role !== "manufacturer") {
    return false;
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateKey = `${yyyy}${mm}${dd}`;

  const userId = user.id;
  const pinKey = `cnc_pin_${userId}`;
  const verifiedKey = `cnc_write_verified_${userId}_${dateKey}`;

  if (localStorage.getItem(verifiedKey)) {
    return true;
  }

  const existingPin = localStorage.getItem(pinKey);
  setPinInput("");
  setPinConfirmInput("");
  setPinError(null);
  setPinMode(existingPin ? "verify" : "setup");
  setPinModalOpen(true);

  return await new Promise<boolean>((resolve) => {
    pinResolveRef.current = resolve;
  });
};
```

### 6.4 PIN 모달 동작

- Reset(및 향후 쓰기 명령) 실행 직전 `ensureCncWriteAllowed()` 호출.
- 오늘 첫 호출이고 manufacturer일 경우:
  - PIN 미설정: **설정 모드** (`pinMode = "setup"`)
    - PIN, PIN 확인 둘 다 4자리 숫자 & 일치할 때만 저장
    - `localStorage.setItem(pinKey, pinInput)`
    - `localStorage.setItem(verifiedKey, "1")`
  - PIN 이미 있음: **검증 모드** (`pinMode = "verify"`)
    - 입력 PIN 이 저장된 PIN 과 일치 시 `verifiedKey` 저장
- 성공 시 Promise resolve(true), 취소/실패 시 resolve(false)

### 6.5 적용 대상 명령

현재 구현된 쓰기 명령은 **Reset** 뿐이지만, 정책상 다음과 같이 적용:

- Reset: 이미 `sendControlCommand` 내부에서 `ensureCncWriteAllowed()` 호출
- 향후 추가될 쓰기 계열(API 예시):
  - `UpdateToolLife`
  - `UpdateToolOffset`
  - `UpdateProgram`

이들 호출 앞에도 동일하게:

```ts
const ok = await ensureCncWriteAllowed();
if (!ok) return;
// 여기서 /api/machines/:uid/raw 로 UpdateXXX 호출
```

---

## 7. 쓰기 계열 RAW 호출 예시

### 7.1 공구 수명 업데이트 (UpdateToolLife)

```ts
await fetch(`/api/machines/${encodeURIComponent(uid)}/raw`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dataType: "UpdateToolLife",
    payload: [
      {
        toolNum: 1,
        useCount: 100,
        configCount: 200,
        warningCount: 180,
        use: true,
      },
    ],
  }),
});
```

### 7.2 툴 오프셋 업데이트 (UpdateToolOffset)

```ts
await fetch(`/api/machines/${encodeURIComponent(uid)}/raw`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dataType: "UpdateToolOffset",
    payload: {
      toolGeoOffsetArray: [{ no: 1, x: 1000, y: 0, z: 0, r: 0 }],
      toolWearOffsetArray: [{ x: 0, y: 0, z: 0, r: 0 }],
      toolTipOffsetArray: [0],
    },
  }),
});
```

### 7.3 프로그램 업데이트 (UpdateProgram)

```ts
await fetch(`/api/machines/${encodeURIComponent(uid)}/raw`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dataType: "UpdateProgram",
    payload: {
      headType: 0, // MAIN
      programNo: 100,
      programData: "N10 G0 X0 Z0\nN20 G1 X100 F200\n",
      isNew: false,
    },
  }),
});
```

이 예시들은 Hi-Link Mode2 예제(Form1.cs)의 데이터 구조를 JSON 으로 옮긴 형태이며, 실제 장비/환경에 맞게 필드를 조정할 수 있습니다.
