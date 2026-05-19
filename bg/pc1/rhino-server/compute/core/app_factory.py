import asyncio

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import settings, state
from .logger import log
from .processing import start_recovery_thread, stl_queue_worker
from .rhino_pool import refresh_rhino_pool
from .routes_api import router as api_router
from .routes_basic import router as basic_router


async def _queue_worker_watchdog() -> None:
    """stl_queue_worker 태스크를 감시하고 죽으면 자동 재시작한다.
    CancelledError나 예외로 워커가 종료되면 큐에 STL이 쌓여도 처리가 안 되어 먹통이 됨.
    """
    while True:
        try:
            task = asyncio.create_task(stl_queue_worker())
            log("[watchdog] stl_queue_worker started")
            await task
            # 정상 종료(CancelledError로 break)는 서버 종료 시만 발생
            log("[watchdog] stl_queue_worker exited normally, not restarting")
            break
        except asyncio.CancelledError:
            log("[watchdog] watchdog cancelled, stopping")
            break
        except Exception as e:
            log(f"[watchdog] stl_queue_worker crashed: {e}, restarting in 5s")
            await asyncio.sleep(5)


def _fmt_age(ts) -> str:
    """epoch ts -> '12.3s ago' / 'never'."""
    if ts is None:
        return "never"
    try:
        import time as _t

        delta = _t.time() - float(ts)
        if delta < 0:
            return "future?"
        if delta < 90:
            return f"{delta:.1f}s ago"
        if delta < 5400:
            return f"{delta / 60:.1f}m ago"
        return f"{delta / 3600:.1f}h ago"
    except Exception:
        return "?"


async def _health_heartbeat() -> None:
    """[diag] 60초마다 system health snapshot을 로그로 남긴다.

    먹통이 발생했을 때 마지막 heartbeat 로그가 root cause를 말해준다:
    - queue=N, in_flight=... 인데 last_dequeue_ts가 오래됨 → worker가 멈춤
    - current_processing이 수십 분째 동일 → Rhino 스크립트가 hang
    - rhino_all=0, rhino_avail=0 이 지속 → RhinoCode list 실패 / Rhino 죽음
    - last_subprocess_done_ts vs started_ts 비교로 RhinoCode 자식 hang 감지
    """
    import time as _t

    interval = float(settings.os.getenv("RHINO_HEARTBEAT_SEC", "60"))
    stuck_warn_sec = float(settings.os.getenv("RHINO_STUCK_WARN_SEC", "300"))
    while True:
        try:
            await asyncio.sleep(interval)
            now = _t.time()
            uptime_h = (now - state.server_start_ts) / 3600.0

            try:
                qsize = state.stl_job_queue.qsize()
            except Exception:
                qsize = -1
            try:
                in_flight_snapshot = list(state.in_flight)
            except Exception:
                in_flight_snapshot = []

            cur_name = state.current_processing_name
            cur_started = state.current_processing_started_ts
            cur_dur = (now - cur_started) if cur_started else None

            line = (
                "[heartbeat] "
                f"uptime={uptime_h:.1f}h "
                f"queue={qsize} "
                f"in_flight={len(in_flight_snapshot)}({','.join(in_flight_snapshot) or '-'}) "
                f"rhino_all={len(state.rhino_all)} "
                f"rhino_avail={len(state.rhino_available)} "
                f"jobs_ok={state.total_jobs_processed} "
                f"jobs_fail={state.total_jobs_failed} "
                f"jobs_timeout={state.total_jobs_timeout} "
                f"job_futures={len(state.job_futures)} "
                f"last_enqueue={_fmt_age(state.last_enqueue_ts)} "
                f"last_dequeue={_fmt_age(state.last_dequeue_ts)} "
                f"last_success={_fmt_age(state.last_success_ts)} "
                f"last_failure={_fmt_age(state.last_failure_ts)} "
                f"last_subproc_started={_fmt_age(state.last_rhino_subprocess_started_ts)} "
                f"last_subproc_done={_fmt_age(state.last_rhino_subprocess_done_ts)} "
                f"current={cur_name or '-'}"
                + (f" cur_dur={cur_dur:.0f}s" if cur_dur is not None else "")
            )
            log(line)

            # stuck 감지: 처리 중 작업이 임계치 이상 같은 상태라면 경보 로그
            if cur_started and (now - cur_started) > stuck_warn_sec:
                log(
                    f"[heartbeat][STUCK] '{cur_name}' processing for "
                    f"{(now - cur_started):.0f}s (>{stuck_warn_sec:.0f}s). "
                    "Rhino script may be hung. Check Rhino UI / RhinoCode pipe."
                )
            # subprocess 시작했는데 done_ts가 stale + 처리 중이면 경보
            if (
                state.last_rhino_subprocess_started_ts
                and (
                    state.last_rhino_subprocess_done_ts is None
                    or state.last_rhino_subprocess_done_ts
                    < state.last_rhino_subprocess_started_ts
                )
                and (now - state.last_rhino_subprocess_started_ts) > stuck_warn_sec
            ):
                log(
                    "[heartbeat][STUCK] RhinoCode subprocess started "
                    f"{(now - state.last_rhino_subprocess_started_ts):.0f}s ago without 'done'. "
                    "Likely Rhino-side hang."
                )
            # 큐에는 쌓였는데 worker가 dequeue를 못 하는 경우
            if qsize > 0 and state.last_enqueue_ts and state.last_dequeue_ts:
                if (
                    state.last_enqueue_ts > state.last_dequeue_ts
                    and (now - state.last_enqueue_ts) > stuck_warn_sec
                    and not cur_name
                ):
                    log(
                        f"[heartbeat][STUCK] queue={qsize} but worker idle for "
                        f"{(now - state.last_enqueue_ts):.0f}s. stl_queue_worker may be dead."
                    )
        except asyncio.CancelledError:
            break
        except Exception as e:
            log(f"[heartbeat] error: {e}")
            try:
                await asyncio.sleep(5)
            except Exception:
                break


async def _rhino_pool_refresher() -> None:
    """Rhino pool을 주기적으로 재스캔하는 백그라운드 태스크.

    라이노가 재시작/크래시되면 pipeId가 바뀌는데, 기존 코드는 acquire 시점에서만
    ping/재스캔했다. 요청이 한동안 없다가 오면 첫 요청이 지연/실패할 수 있음.
    여기서 5분마다 선제 재스캔하여 stale pipeId를 자동 정리한다.

    subprocess.run은 이벤트 루프 블로킹을 피하기 위해 executor에서 실행한다.
    """
    rhinocode = settings.get_rhinocode_bin()
    if not rhinocode:
        return
    loop = asyncio.get_event_loop()
    while True:
        try:
            await asyncio.sleep(300)  # 5분
            await loop.run_in_executor(None, refresh_rhino_pool, rhinocode, True)
        except asyncio.CancelledError:
            break
        except Exception as e:
            log(f"[pool-refresher] error: {e}")
            try:
                await asyncio.sleep(30)
            except Exception:
                break


def create_app():
    app = FastAPI(title="abuts.fit rhino worker")

    shared_secret = settings.os.getenv("RHINO_SHARED_SECRET", "").strip()
    if not shared_secret:
        shared_secret = settings.os.getenv("BRIDGE_SHARED_SECRET", "").strip()

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        path = request.url.path
        if path == "/api/rhino/internal/job-callback":
            return await call_next(request)
        is_protected = (
            path.startswith("/api/rhino/")
            or path.startswith("/control/")
            or path.startswith("/history/")
            or path.startswith("/health/diag")
        )

        if not is_protected:
            return await call_next(request)

        # IP 화이트리스트 검증 (매 요청마다 동적으로 로드)
        allow_ips_raw = settings.os.getenv("RHINO_ALLOW_IPS", "").strip()
        allow_ips_set = {
            ip.strip() for ip in allow_ips_raw.split(",") if ip and ip.strip()
        }

        if allow_ips_set:
            xff = request.headers.get("x-forwarded-for")
            ip = (xff.split(",", 1)[0].strip() if xff else "") or (
                request.client.host if request.client else ""
            )
            if ip not in allow_ips_set:
                log(f"[Auth] Forbidden by allowlist: ip={ip}")
                return JSONResponse(
                    status_code=403,
                    content={"ok": False, "error": "forbidden"},
                )

        if shared_secret:
            got = request.headers.get("X-Bridge-Secret", "").strip()
            if got != shared_secret:
                if not got:
                    log(f"[Auth] Unauthorized: missing X-Bridge-Secret path={path}")
                else:
                    log(f"[Auth] Unauthorized: X-Bridge-Secret mismatch path={path}")
                return JSONResponse(
                    status_code=401,
                    content={"ok": False, "error": "unauthorized"},
                )

        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(basic_router)
    app.include_router(api_router)

    sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

    @sio.event
    async def connect(sid, environ):
        log(f"socket connected: {sid}")

    @sio.event
    async def disconnect(sid):
        log(f"socket disconnected: {sid}")

    @sio.event
    async def job_result(sid, data):
        token = data.get("token")
        if token and token in state.job_futures:
            log(f"socket received job_result: token={token}")
            future = state.job_futures[token]
            if not future.done():
                future.set_result(data)
        else:
            log(f"socket received unknown job_result: token={token}")

    socket_app = socketio.ASGIApp(sio, app)

    @app.post("/api/rhino/internal/job-callback")
    async def job_callback(data: dict):
        token = data.get("token")
        if token and token in state.job_futures:
            future = state.job_futures[token]
            if not future.done():
                future.set_result(data)
            return {"ok": True}
        return {"ok": False, "error": "unknown token"}

    @app.on_event("startup")
    def on_startup() -> None:
        state.set_main_loop(asyncio.get_event_loop())

        def _handle_asyncio_exception(loop, context):
            exc = context.get("exception")
            if isinstance(exc, ConnectionResetError):
                return
            if isinstance(exc, OSError) and getattr(exc, "winerror", None) == 10054:
                return
            loop.default_exception_handler(context)

        try:
            state.main_loop.set_exception_handler(_handle_asyncio_exception)
        except Exception:
            pass

        settings.ensure_dirs()
        try:
            settings.purge_old_storage(days=15)
        except Exception:
            pass
        # FIFO STL 큐 워커 시작 - 한 번에 하나씩 순차 처리를 보장한다.
        # watchdog이 워커 태스크를 관리하므로 직접 create_task하지 않는다.
        asyncio.create_task(_queue_worker_watchdog())
        # [fix] 주기적 Rhino pool 재스캔 - Rhino 재시작/크래시로 pipeId가 바뀌어도
        # 요청이 올 때까지 기다리지 않고 선제적으로 갱신한다. 하루 누적되는 stale pipeId로
        # 인한 지연/실패를 예방.
        asyncio.create_task(_rhino_pool_refresher())
        # heartbeat 로그는 기본 비활성화(로그 스팸 방지). 필요 시 env로 활성화.
        if settings.os.getenv("RHINO_HEARTBEAT_ENABLED", "false").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        ):
            asyncio.create_task(_health_heartbeat())
            log("[startup] heartbeat enabled")
        # startup recovery는 backend pending 목록을 읽고 로컬 입력 캐시를 채우는 I/O 작업이라
        # FastAPI 메인 루프를 막지 않도록 별도 thread에서 시작한다.
        start_recovery_thread()

    return app, socket_app
