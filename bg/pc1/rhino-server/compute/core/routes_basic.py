from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pathlib import Path

from . import settings
from . import state


router = APIRouter()


@router.get("/health")
@router.get("/ping")
async def health_check():
    return {"status": "ok", "is_running": state.is_running, "service": "rhino-server"}


@router.post("/control/start")
async def start_service():
    state.is_running = True
    return {"ok": True, "message": "Service started"}


@router.post("/control/stop")
async def stop_service():
    state.is_running = False
    return {"ok": True, "message": "Service stopped"}


@router.get("/history/recent")
async def get_recent_history():
    return {"ok": True, "history": list(state.recent_history)}


@router.get("/health/diag")
async def health_diag():
    """[diag] 먹통 의심 시 외부에서 GET 호출해 현재 상태를 즉시 확인.

    인증된 경로(/health/...)지만 본 라우트는 routes_basic이므로
    auth_middleware의 'is_protected' 분기를 따른다 → /history/* 와 동일하게 보호됨.
    """
    import time as _t
    now = _t.time()

    def age(ts):
        if ts is None:
            return None
        return round(now - float(ts), 2)

    try:
        qsize = state.stl_job_queue.qsize()
    except Exception:
        qsize = -1

    return {
        "ok": True,
        "isRunning": state.is_running,
        "uptimeSec": round(now - state.server_start_ts, 1),
        "queueSize": qsize,
        "inFlight": list(state.in_flight),
        "rhinoAll": list(state.rhino_all),
        "rhinoAvail": list(state.rhino_available),
        "totals": {
            "ok": state.total_jobs_processed,
            "failed": state.total_jobs_failed,
            "timeout": state.total_jobs_timeout,
        },
        "openFutures": len(state.job_futures),
        "current": {
            "name": state.current_processing_name,
            "durationSec": age(state.current_processing_started_ts),
        },
        "ageSec": {
            "lastEnqueue": age(state.last_enqueue_ts),
            "lastDequeue": age(state.last_dequeue_ts),
            "lastSuccess": age(state.last_success_ts),
            "lastFailure": age(state.last_failure_ts),
            "lastSubprocStarted": age(state.last_rhino_subprocess_started_ts),
            "lastSubprocDone": age(state.last_rhino_subprocess_done_ts),
            "lastPingSuccess": age(state.last_ping_success_ts) if state.last_ping_success_ts else None,
        },
    }


@router.get("/")
def root():
    return {
        "ok": True,
        "service": "rhino-fastapi",
        "tempInDir": str(settings.STORE_IN_DIR),
        "tempOutDir": str(settings.STORE_OUT_DIR),
    }


@router.get("/favicon.ico")
@router.get("/.well-known/security.txt")
@router.get("/security.txt")
@router.get("/robots.txt")
@router.get("/sitemap.xml")
def ignore_scanner_requests():
    return Response(status_code=204)


@router.get("/files/{name}")
async def get_filled_file(name: str):
    safe_name = Path(name).name
    target = settings.STORE_OUT_DIR / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(
        target,
        filename=safe_name,
        media_type="application/octet-stream",
    )
