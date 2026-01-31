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


@router.get("/")
def root():
    return {
        "ok": True,
        "service": "rhino-fastapi",
        "storeInDir": str(settings.STORE_IN_DIR),
        "storeOutDir": str(settings.STORE_OUT_DIR),
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
