import base64
import subprocess
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import settings
from . import state
from .logger import log
from .processing import process_single_stl
from .rhino_runner import run_rhino_python


router = APIRouter()


class ProcessFileRequest(BaseModel):
    fileName: str
    requestId: Optional[str] = None
    force: Optional[bool] = False


@router.post("/api/rhino/process-file")
async def process_file_api(req: ProcessFileRequest, background_tasks: BackgroundTasks):
    if not state.is_running:
        raise HTTPException(status_code=503, detail="Service is stopped")

    p = settings.STORE_IN_DIR / req.fileName
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.fileName}")

    with state.in_flight_lock:
        if req.fileName in state.in_flight and not (req.force or False):
            return {"ok": True, "message": "Already processing", "jobId": "existing"}

    background_tasks.add_task(process_single_stl, p, bool(req.force or False))
    return {"ok": True, "message": "Processing started", "fileName": req.fileName}


@router.post("/api/rhino/upload-stl")
async def upload_stl(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    settings.ensure_dirs()
    safe_name = settings.sanitize_filename(file.filename or "uploaded.stl")
    target_path = settings.STORE_IN_DIR / safe_name

    try:
        data = await file.read()
        target_path.write_bytes(data)
        log(f"Direct upload saved to 1-stl: {safe_name} ({len(data)} bytes)")

        if state.is_running:
            background_tasks.add_task(process_single_stl, target_path)

        return JSONResponse(
            status_code=202,
            content={"ok": True, "status": "STARTED", "fileName": safe_name},
        )
    except Exception as e:
        log(f"Failed to save uploaded file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/rhino/fillhole/direct")
async def fillhole_direct(file: UploadFile = File(...)):
    settings.ensure_dirs()
    settings.prune_tmp(max_items=100)

    safe_name = settings.sanitize_filename(file.filename or "input.stl")
    token = uuid.uuid4().hex
    tmp_dir = settings.TMP_DIR / f"direct_{token}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    input_path = tmp_dir / f"in_{safe_name}"
    output_path = tmp_dir / f"out_{settings.build_output_name(safe_name)}"

    data = await file.read()
    input_path.write_bytes(data)

    try:
        log_text = await run_rhino_python(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=settings.DEFAULT_TIMEOUT_SEC,
        )

        max_diameter = 0.0
        conn_diameter = 0.0

        import re

        match = re.search(r"DIAMETER_RESULT:max=([\d.]+) conn=([\d.]+)", log_text)
        if match:
            max_diameter = float(match.group(1))
            conn_diameter = float(match.group(2))

        filled_base64 = ""
        if output_path.exists():
            filled_base64 = base64.b64encode(output_path.read_bytes()).decode("utf-8")

        return {
            "ok": True,
            "maxDiameter": max_diameter,
            "connectionDiameter": conn_diameter,
            "filledStlBase64": filled_base64,
            "log": log_text,
        }
    except Exception as e:
        log(f"direct fillhole failed: {e}")
        return {"ok": False, "error": str(e)}
    finally:
        try:
            import shutil

            shutil.rmtree(tmp_dir)
        except Exception:
            pass


class StoreFillHoleRequest(BaseModel):
    name: str


@router.post("/api/rhino/store/fillhole")
async def store_fillhole(req: StoreFillHoleRequest):
    settings.ensure_dirs()
    settings.prune_tmp(max_items=100)

    safe_name = settings.sanitize_filename(req.name or "input.stl")
    input_path = settings.STORE_IN_DIR / safe_name
    if not input_path.exists() or not input_path.is_file():
        raise HTTPException(status_code=404, detail=f"input 파일을 찾을 수 없습니다: {safe_name}")

    in_base = Path(safe_name).stem or "base"
    out_name = settings.sanitize_filename(f"{in_base}.filled.stl")
    output_path = settings.STORE_OUT_DIR / out_name

    try:
        await run_rhino_python(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=settings.DEFAULT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Rhino 실행 타임아웃")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="결과 STL이 생성되지 않았습니다")

    return FileResponse(
        path=output_path,
        filename=out_name,
        media_type="application/sla",
        headers={"Cache-Control": "no-store"},
    )
