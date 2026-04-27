# Rhino-server 먹통 진단 가이드

> 하루 이상 운영 후 STL 처리가 안되는 문제(=먹통) 발생 시 root cause를 빠르게 식별하기 위한 절차.
> 2026-04-27 추가된 heartbeat / `/health/diag` 기반.

## 1. 즉시 확인할 것

### A. 마지막 heartbeat 로그 (60초 주기)
서버 콘솔에서 가장 최근의 `[heartbeat]` 줄을 찾는다. 형태:

```
[heartbeat] uptime=27.4h queue=2 in_flight=1(20260425-XXXX...stl) rhino_all=1 rhino_avail=0
  jobs_ok=384 jobs_fail=2 jobs_timeout=1 job_futures=1
  last_enqueue=12.3s ago last_dequeue=180.0s ago last_success=185.0s ago
  last_subproc_started=180.0s ago last_subproc_done=24.5h ago
  current=20260425-XXXX...stl cur_dur=180s
```

### B. 외부에서 진단 엔드포인트 호출
```
curl -H "X-Bridge-Secret: $RHINO_SHARED_SECRET" http://<rhino-host>:8000/health/diag
```

JSON으로 같은 정보를 받을 수 있음.

## 2. 증상별 진단 매트릭스

| 증상 | heartbeat 패턴 | Root cause | 조치 |
|------|---------------|------------|------|
| **A. Rhino 스크립트 hang** | `current=<name>` 가 5분 이상 동일, `last_subproc_started`만 점점 커지고 `last_subproc_done` 은 오래된 값 | Rhino 내부 hang. RhinoCode pipe는 살아있어 subprocess는 시작했지만 `process_abutment_stl.main()` 이 안 끝남 | Rhino.exe 강제종료 → 자동/수동 재시작. `RHINO_JOB_HARD_TIMEOUT_SEC`(기본 600) 이내에 워커가 timeout 하고 다음 작업으로 넘어감 |
| **B. RhinoCode pipe stale** | `rhino_all=0` 또는 `rhino_avail=0` 이 5분 이상 지속, `last_enqueue`는 최신인데 `last_dequeue`는 오래됨, current=- | `rhinocode list` 가 빈 결과 반환. Rhino 자체가 죽었거나 RhinoCode 서버가 응답불가 | Rhino UI 상태 확인 → 죽었다면 재시작. `_rhino_pool_refresher`가 5분마다 재스캔하므로 라이노 살아나면 자동 복구 |
| **C. Worker dead** | `queue>0` 인데 current=-, `last_dequeue` 가 `last_enqueue` 보다 훨씬 오래됨, `[heartbeat][STUCK] queue=N but worker idle` 알람 | `stl_queue_worker` 가 죽었는데 watchdog 도 못 돌림 | rhino-server 프로세스 재시작. (이 경우는 watchdog 로그 `[watchdog] stl_queue_worker crashed` 가 나와야 정상) |
| **D. FastAPI/uvicorn hang** | heartbeat 자체가 안 찍힘 (60초 내내 새 줄 없음) | 이벤트 루프 dead-lock 또는 메모리 부족 | rhino-server 강제 재시작. asyncio task 누수 의심. `psutil` 로 메모리 확인 |
| **E. 정상이지만 백엔드가 STL 안 보냄** | heartbeat 정상, queue=0, in_flight=0, last_enqueue 가 1시간 이상 전 | rhino-server 문제 아님. backend → rhino 라우팅 문제 | backend `/bg/pending-stl` / `original-file` 응답 확인. `pending-stl request` 로그 5분마다 찍히는지 확인 |

## 3. 핵심 환경변수

```bash
RHINO_HEARTBEAT_SEC=60         # heartbeat 주기 (초)
RHINO_STUCK_WARN_SEC=300       # stuck 판정 임계 (초). 5분 동안 동일 상태면 [STUCK] 알람
RHINO_JOB_HARD_TIMEOUT_SEC=600 # 작업 1건 hard timeout (초). 이 시간 지나면 워커가 다음 작업으로 진행
```

## 4. 다음 발생 시 수집할 것

1. **먹통 직전~직후 60분 로그 전체** (heartbeat 줄들 빠짐없이)
2. **`/health/diag` JSON 응답** (인증 헤더 포함하여)
3. **Windows 작업관리자**에서:
   - `Rhino.exe` 메모리/CPU/응답상태
   - `RhinoCode.exe` 자식 프로세스 개수 (1~2개여야 정상)
4. **수동으로 `rhinocode list --json` 실행 결과** (서버 호스트에서)

이 4가지가 있으면 5가지 시나리오 중 어느 것인지 즉시 판정 가능.

## 5. 자동 복구 가능한 시나리오

- **시나리오 A (Rhino 스크립트 hang)**: 600초(=`RHINO_JOB_HARD_TIMEOUT_SEC`) 후 워커가 timeout 처리하고 다음 작업으로 넘어감. 단 같은 Rhino 인스턴스가 계속 hang이면 모든 후속 작업도 timeout. 이 경우 시나리오 B로 전환됨 (Rhino를 다시 사용 가능하게 만들려면 외부 개입 필요).
- **시나리오 B (pipe stale)**: 5분마다 자동 재스캔. 그 사이 Rhino를 살리면 자동 복구.
- **시나리오 C (worker dead)**: watchdog 가 5초 후 재기동.

## 6. 향후 개선 후보 (아직 미구현)

- 시나리오 A 자동 복구: hard timeout 발생 시 `taskkill /F /IM Rhino.exe` 후 Rhino 재기동 스크립트 호출
- 시나리오 D 방지: uvicorn `--workers 2` 또는 Windows 서비스 레이어에서 메모리 임계 시 재기동
