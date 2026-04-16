# Bridge Server Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `bg/pc1/bridge-server` 폴더의 로컬 메모만 남깁니다.

## 1. 구현 메모

- 브리지는 Hi-Link DLL 호출을 단일 워커 스레드에서 직렬화합니다.
- 프로그램 파일명은 `O####.nc`, 장비 전송 시에는 `O####`만 사용합니다.
- 장비 식별은 `UID` 기준으로 처리합니다.
- 브리지 큐는 백엔드 스냅샷 push를 우선 기준으로 동기화합니다.
- CNC 제어는 기본 1회 시도이며, 업로드의 `EW_BUSY(-1)`만 짧은 재시도를 허용합니다.

## 2. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 브리지 내부 동작, 에러 처리 메모, 트러블슈팅만 남깁니다.
- 긴 에러 코드 표나 과거 설계 설명은 필요할 때 코드/별도 문서로 확인합니다.

## 3. IO_R_YELLOW(CncBusyIoUid=65) 신호 패턴

이 장비의 IO_R_YELLOW 신호는 **물리 신호가 반전**되어 있습니다.

| IO_R_YELLOW 값 | `isBusy` (코드) | 실제 상태                     |
| -------------- | --------------- | ----------------------------- |
| 0              | True            | 절삭 중 (가공 진행)           |
| 1              | False           | 사이클 완료 / 다음 start 대기 |

- 반전 매핑은 `CncMachineSignalUtils.TryGetMachineBusy` 에서 `io.Status == 0 → isBusy=true` 로 처리합니다.
- 이름(`IO_R_YELLOW`)과 의미가 반전이므로, 관련 코드를 수정할 때 반드시 주석을 먼저 확인하세요.

### 완료 감지 흐름 (`CheckJobCompleted`)

```
가공 중   IO_R_YELLOW=0  → isBusy=True  → SawBusy=True 플래그
완료 후   IO_R_YELLOW=1  → isBusy=False → SawBusy && !busy → 생산 카운트 +1 확인 → 완료
```

### settle-check 로직 (`CncContinuousMachining.cs`)

완료 후 다음 건 시작 전 안전 확인:

- `minSettleSec`(기본 6초) 동안 무조건 대기
- 이후 tick마다 `!isBusy && !hasAlarm && isNotAlarm` 충족 시 즉시 통과 (settle-pass)
- IO_R_YELLOW=1(대기) 상태 → `isBusy=False` → `!isBusy=True` → 알람 없으면 즉시 통과 ✓
- 조건 미충족 시 최대 `maxSettleSec`(기본 60초) 후 강제 진행 (settle-timeout)

**예상 인터벌**: minSettleSec(6초) + 다음 tick(~3초) ≈ 약 9초

## 4. Hi-Link DLL 에러 코드 처리 정책

`Mode1Api.cs` 의 모든 API 함수는 다음 두 에러 코드에서 **핸들 폐기(Invalidate) + 1회 재시도**를 수행합니다:

| 코드  | 의미                      | 처리                                      |
| ----- | ------------------------- | ----------------------------------------- |
| `-8`  | EW_HANDLE — 핸들 무효     | Invalidate → TryGetHandle(재연결) → retry |
| `-16` | EW_SOCKET — TCP 소켓 끊김 | Invalidate → TryGetHandle(재연결) → retry |

**`-16` 발생 시나리오**:

- 장비 전원 OFF 또는 재부팅
- 네트워크 연결 단절 (스위치/케이블 문제)
- 장시간 유휴 후 TCP 세션 만료 (~20분 이상 미사용)

**`-16` 미처리 시 증상**: 죽은 핸들이 캐시에 남아 이후 모든 API 호출이 `elapsedMs=0`으로 즉시 실패, 브리지 재시작 전까지 복구 불가.

재연결 성공 조건: 장비가 네트워크상 접근 가능한 상태로 복구되면 다음 tick에서 자동 재연결됩니다.

## 5. 환경변수 설정 우선순위

`Config.TryLoadLocalEnv()` 가 `local.env` 파일을 로드하며, **`local.env` 값이 shell 환경변수를 덮어씁니다**.

- 설정 변경은 `local.env` 파일을 직접 수정하세요.
- shell `set` 명령으로 설정한 값은 `local.env` 로드 후 덮어써집니다.
