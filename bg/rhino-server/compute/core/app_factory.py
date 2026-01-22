import asyncio

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import settings
from . import state
from .logger import log
from .processing import start_recovery_thread
from .routes_basic import router as basic_router
from .routes_api import router as api_router


def create_app():
    app = FastAPI(title="abuts.fit rhino worker")

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
        settings.ensure_dirs()
        start_recovery_thread()

    return app, socket_app
