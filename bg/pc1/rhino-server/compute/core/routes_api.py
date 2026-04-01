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
from .stl_metadata import calculate_and_register_metadata


router = APIRouter()


class ProcessFileRequest(BaseModel):
    filePath: Optional[str] = None
    fileName: Optional[str] = None
    requestId: Optional[str] = None
    force: Optional[bool] = False


@router.post("/api/rhino/process-file")
async def process_file_api(req: ProcessFileRequest, background_tasks: BackgroundTasks):
    if not state.is_running:
        raise HTTPException(status_code=503, detail="Service is stopped")

    name = (req.filePath or req.fileName or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="filePath or fileName is required")

    safe_name = settings.sanitize_filename(name)
    p = settings.STORE_IN_DIR / safe_name
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {safe_name}")

    with state.in_flight_lock:
        if safe_name in state.in_flight and not (req.force or False):
            return {"ok": True, "message": "Already processing", "jobId": "existing"}

    background_tasks.add_task(process_single_stl, p, bool(req.force or False))
    return {"ok": True, "message": "Processing started", "filePath": safe_name}


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


class RecalculateMetadataRequest(BaseModel):
    requestId: str


@router.post("/recalculate-metadata")
async def recalculate_metadata(req: RecalculateMetadataRequest, background_tasks: BackgroundTasks):
    """
    프론트엔드에서 메타데이터 재계산 요청 시 호출
    """
    try:
        import os
        import requests
        
        # 백엔드에서 원본 STL 파일 경로 및 finish line 조회
        backend_url = os.getenv("BACKEND_BASE", "https://abuts.fit/api").rstrip("/")
        
        # Request 메타 정보 조회
        meta_url = f"{backend_url}/bg/request-meta"
        headers = {}
        secret = os.getenv("RHINO_SHARED_SECRET") or os.getenv("BRIDGE_SHARED_SECRET", "")
        if secret:
            headers["X-Bridge-Secret"] = secret
        
        log(f"[recalculate-metadata] Fetching meta from: {meta_url}?requestId={req.requestId}")
        
        meta_resp = requests.get(
            meta_url,
            params={"requestId": req.requestId},
            headers=headers,
            timeout=10,
        )
        
        log(f"[recalculate-metadata] Response status: {meta_resp.status_code}")
        
        if meta_resp.status_code != 200:
            log(f"[recalculate-metadata] Failed to get request meta: {meta_resp.status_code}")
            log(f"[recalculate-metadata] Response text: {meta_resp.text[:500]}")
            raise HTTPException(status_code=404, detail="Request not found")
        
        # JSON 응답 파싱
        try:
            response_json = meta_resp.json()
            log(f"[recalculate-metadata] Response JSON keys: {list(response_json.keys()) if response_json else 'None'}")
        except Exception as json_err:
            log(f"[recalculate-metadata] Failed to parse JSON response: {json_err}")
            log(f"[recalculate-metadata] Response text: {meta_resp.text[:500]}")
            raise HTTPException(status_code=500, detail="Invalid JSON response from backend")
        
        if not response_json:
            log(f"[recalculate-metadata] Empty response from backend")
            raise HTTPException(status_code=500, detail="Empty response from backend")
        
        # ApiResponse 형식: { statusCode, data, message, success }
        meta_data = response_json.get("data") or {}
        log(f"[recalculate-metadata] meta_data keys: {list(meta_data.keys()) if isinstance(meta_data, dict) else 'Not a dict'}")
        
        case_infos = meta_data.get("caseInfos") or {}
        log(f"[recalculate-metadata] caseInfos keys: {list(case_infos.keys()) if isinstance(case_infos, dict) else 'Not a dict'}")
        
        cam_file = case_infos.get("camFile") or {}
        file_path = cam_file.get("filePath")
        log(f"[recalculate-metadata] camFile filePath: {file_path}")
        
        finish_line = case_infos.get("finishLine") or {}
        finish_line_points = finish_line.get("points")
        log(f"[recalculate-metadata] finishLine points count: {len(finish_line_points) if finish_line_points else 0}")
        
        if not file_path:
            raise HTTPException(status_code=400, detail="STL file path not found in request")
        
        # 로컬 STL 파일 경로 확인 (filled.stl 우선)
        safe_name = settings.sanitize_filename(Path(file_path).name)
        stl_path = settings.STORE_OUT_DIR / safe_name
        
        if not stl_path.exists():
            # 원본 파일 확인
            original_name = safe_name.replace(".filled.stl", ".stl")
            stl_path = settings.STORE_IN_DIR / original_name
            
            if not stl_path.exists():
                raise HTTPException(status_code=404, detail=f"STL file not found: {file_path}")
        
        # 백그라운드에서 메타데이터 계산 및 등록
        def _calculate():
            calculate_and_register_metadata(
                stl_path,
                req.requestId,
                None,  # requestMongoId는 백엔드에서 찾음
                finish_line_points,
            )
        
        background_tasks.add_task(_calculate)
        
        log(f"[recalculate-metadata] Started for {req.requestId}")
        
        return {
            "ok": True,
            "message": "Metadata recalculation started",
            "requestId": req.requestId,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log(f"[recalculate-metadata] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
