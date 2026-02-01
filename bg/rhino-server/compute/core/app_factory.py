import asyncio

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import settings
from . import state
from .logger import log
from .processing import start_recovery_thread
from .routes_basic import router as basic_router
from .routes_api import router as api_router


def create_app():
    app = FastAPI(title="abuts.fit rhino worker")

    allow_ips_raw = settings.os.getenv("RHINO_ALLOW_IPS", "").strip()
    allow_ips = {
        ip.strip()
        for ip in allow_ips_raw.split(",")
        if ip and ip.strip()
    }
    shared_secret = settings.os.getenv("BRIDGE_SHARED_SECRET", "").strip()

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        path = request.url.path
        is_protected = path.startswith("/api/rhino/") or path.startswith(
            "/control/"
        ) or path.startswith("/history/")

        if not is_protected:
            return await call_next(request)

        # IP 화이트리스트 검증 (매 요청마다 동적으로 로드)
        allow_ips_raw = settings.os.getenv("RHINO_ALLOW_IPS", "").strip()
        allow_ips_set = {
            ip.strip()
            for ip in allow_ips_raw.split(",")
            if ip and ip.strip()
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
        start_recovery_thread()

    return app, socket_app
