import threading
import time
import uuid
from pathlib import Path
import os

import requests

from . import settings
from . import state
from .logger import log
from .rhino_runner import run_rhino_python


def upload_via_presign(out_path: Path, original_name: str, item: dict) -> bool:
    try:
        backend_url = os.getenv("BACKEND_URL", "https://abuts.fit/api").rstrip("/")

        presign_url = f"{backend_url}/bg/presign-upload"
        req_id = item.get("requestId") or settings.extract_request_id_from_name(original_name)
        file_name = out_path.name
        payload = {
            "sourceStep": "2-filled",
            "fileName": file_name,
            "requestId": req_id or None,
        }
        resp = requests.post(
            presign_url, json=payload, timeout=10, headers=settings.bridge_headers()
        )
        if resp.status_code != 200:
            log(f"Presign failed status={resp.status_code} body={resp.text}")
            return False
        data = resp.json().get("data") or {}
        presigned_url = data.get("url")
        key = data.get("key")
        bucket = data.get("bucket") or ""
        content_type = data.get("contentType") or settings.guess_content_type(out_path)
        if not presigned_url or not key:
            log("Presign response missing url/key")
            return False

        file_size = out_path.stat().st_size
        with open(out_path, "rb") as f:
            put_headers = {"Content-Type": content_type}
            put_resp = requests.put(presigned_url, data=f, headers=put_headers, timeout=30)
            if put_resp.status_code not in (200, 201):
                log(
                    f"Presigned PUT failed status={put_resp.status_code} body={put_resp.text}"
                )
                return False

        register_url = f"{backend_url}/bg/register-file"
        s3_url = settings.build_s3_url(bucket, key) if bucket else None
        register_payload = {
            "sourceStep": "2-filled",
            "fileName": file_name,
            "originalFileName": original_name,
            "status": "success",
            "s3Key": key,
            "s3Url": s3_url,
            "fileSize": file_size,
        }

        metadata = item.get("metadata") if isinstance(item, dict) else None
        if isinstance(metadata, dict) and metadata:
            register_payload["metadata"] = metadata

        reg_resp = requests.post(
            register_url,
            json=register_payload,
            timeout=10,
            headers=settings.bridge_headers(),
        )
        if reg_resp.status_code == 200:
            log(f"Presigned upload + register success: {file_name}")
            return True
        log(
            f"Register after presign failed status={reg_resp.status_code} body={reg_resp.text}"
        )
        return False
    except Exception as e:
        log(f"Presign upload exception: {e}")
        return False


def fetch_pending_stl_list() -> list[dict]:
    import os

    backend = os.getenv("BACKEND_URL", "").rstrip("/")
    if not backend:
        log("pending-stl skipped: BACKEND_URL not set")
        return []
    url = f"{backend}/bg/pending-stl"
    try:
        res = requests.get(url, timeout=10, headers=settings.bridge_headers())
        if res.status_code != 200:
            log(f"pending-stl fetch failed: status={res.status_code} body={res.text}")
            return []
        data = res.json().get("data") or {}
        items = data.get("items") or []
        items = items if isinstance(items, list) else []
        log(f"pending-stl fetched: {len(items)} items")
        return items
    except Exception as e:
        log(f"pending-stl fetch error: {e}")
        return []


def download_original_to_input(item: dict) -> bool:
    import os

    backend = os.getenv("BACKEND_URL", "").rstrip("/")
    if not backend:
        return False

    file_name = item.get("fileName")
    request_id = item.get("requestId")
    if not file_name:
        return False

    target = settings.STORE_IN_DIR / settings.sanitize_filename(file_name)
    if target.exists():
        return True

    params = {"requestId": request_id} if request_id else {"fileName": file_name}
    url = f"{backend}/bg/original-file"
    try:
        res = requests.get(url, params=params, timeout=30, headers=settings.bridge_headers())
        if res.status_code != 200:
            log(f"original-file fetch failed: status={res.status_code}")
            return False
        content = res.content
        target.write_bytes(content)
        log(f"original-file restored to input: {target.name} ({len(content)} bytes)")
        return True
    except Exception as e:
        log(f"original-file fetch error: {e}")
        return False


def backend_should_process(file_name: str, source_step: str) -> bool:
    """백엔드에 처리 상태를 확인하여 미처리일 때만 True 반환"""
    try:
        recover_always = os.getenv("RHINO_RECOVER_ALWAYS", "").lower() in ("1", "true", "yes")
        if recover_always:
            return True

        backend_url = os.getenv("BACKEND_URL", "https://abuts.fit/api")
        base = backend_url.rstrip("/")
        if base.endswith("/api"):
            url = f"{base}/bg/file-status"
        else:
            url = f"{base}/api/bg/file-status"

        res = requests.get(
            url,
            params={"sourceStep": source_step, "fileName": file_name, "force": "true"},
            timeout=5,
        )
        if res.status_code != 200:
            return False
        body = res.json() if res.content else {}
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, dict):
            return bool(data.get("shouldProcess"))
        return bool(body.get("shouldProcess"))
    except Exception as e:
        log(f"Recover status check failed: {e}")
        return False


def prefix_with_request_id(original: str) -> str:
    try:
        rid = settings.extract_request_id_from_name(original)
        if rid:
            base = Path(original).name
            if base.startswith(f"{rid}."):
                return base
            return settings.sanitize_filename(f"{rid}.{base}")
    except Exception:
        pass
    return settings.sanitize_filename(Path(original).name)


async def process_single_stl(p: Path):
    if isinstance(p, str):
        p = Path(p)
    if not p.exists():
        log(f"Process failed: file not found {p}")
        return

    async with state.processing_semaphore:
        force_fill = settings.is_force_fill_mode()
        prefixed_input = prefix_with_request_id(p.name)
        base_stem = Path(prefixed_input).stem
        out_name = settings.sanitize_filename(f"{base_stem}.filled.stl")
        req_id = settings.extract_request_id_from_name(prefixed_input)
        out_path = settings.STORE_OUT_DIR / out_name

        with state.in_flight_lock:
            if p.name in state.in_flight:
                log(f"Already in flight: {p.name}")
                return
            state.in_flight.add(p.name)

        try:
            log(f"Checking output path: {out_path}")
            if out_path.exists():
                log(
                    f"Output already exists for: {p.name}, attempting presigned upload re-sync."
                )
                if force_fill:
                    log("Force-fill 테스트 모드: 기존 out 파일을 삭제하고 다시 생성합니다.")
                    try:
                        out_path.unlink()
                    except Exception as e:
                        log(f"Force-fill delete failed ({out_path}): {e}")
                else:
                    if upload_via_presign(out_path, prefixed_input, {"requestId": req_id}):
                        return
                    return

            log(f"Auto-processing starting: {p.name}")
            job_id = f"auto_{uuid.uuid4().hex[:8]}"
            state.jobs[job_id] = {
                "jobId": job_id,
                "status": "queued",
                "createdAt": time.time(),
                "inputName": p.name,
                "outputName": out_name,
            }

            log(f"Calling run_rhino_python for: {p.name}")
            log_text = await run_rhino_python(input_stl=p, output_stl=out_path)
            log(f"Auto-processing done: {out_name}")

            state.recent_history.append(
                {
                    "file": p.name,
                    "output": out_name,
                    "timestamp": time.time(),
                    "status": "success",
                }
            )

            def _parse_metadata_from_log(text: str) -> dict:
                if not text:
                    return {}
                import base64
                import json
                import re

                meta: dict = {}
                m = re.search(r"DIAMETER_RESULT:max=([\d.]+) conn=([\d.]+)", text)
                if m:
                    try:
                        meta["diameter"] = {
                            "max": float(m.group(1)),
                            "connection": float(m.group(2)),
                        }
                    except Exception:
                        pass

                m2 = re.search(r"FINISHLINE_RESULT:([A-Za-z0-9+/=]+)", text)
                if m2:
                    try:
                        raw = base64.b64decode(m2.group(1)).decode("utf-8", errors="ignore")
                        data = json.loads(raw)
                        if isinstance(data, dict):
                            meta["finishLine"] = data
                    except Exception:
                        pass

                return meta

            metadata = _parse_metadata_from_log(log_text)

            if force_fill:
                log("Force-fill 테스트 모드: presigned 업로드와 백엔드 통지를 생략합니다.")
            else:
                upload_via_presign(
                    out_path,
                    prefixed_input,
                    {"requestId": req_id, "metadata": metadata},
                )
        except Exception as e:
            log(f"Auto-processing failed for {p.name}: {e}")
            state.recent_history.append(
                {
                    "file": p.name,
                    "timestamp": time.time(),
                    "status": "failed",
                    "error": str(e),
                }
            )
        finally:
            with state.in_flight_lock:
                state.in_flight.discard(p.name)


async def recover_unprocessed_files() -> None:
    try:
        settings.ensure_dirs()
        log("Scanning for unprocessed files on startup...")

        force_fill = settings.is_force_fill_mode()
        if force_fill:
            log("TEST MODE 활성화: 입력 폴더 내 모든 STL에 대해 FillMeshHoles 강제 실행")

        pending = fetch_pending_stl_list()
        pending_names: set[str] = set()
        if pending:
            log(f"Pending STL from backend: {len(pending)}")
            for item in pending:
                if download_original_to_input(item):
                    safe_name = settings.sanitize_filename(item.get("fileName") or "")
                    if safe_name:
                        pending_names.add(safe_name)

        in_files = sorted(
            [p for p in settings.STORE_IN_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".stl"]
        )
        log(f"Found {len(in_files)} STL files in input directory")

        for p in in_files:
            with state.in_flight_lock:
                if p.name in state.in_flight:
                    continue

            should_process = True if force_fill else (
                p.name in pending_names or backend_should_process(p.name, "1-stl")
            )

            if should_process:
                log(f"Recover: processing {p.name}")
                await process_single_stl(p)
                log(f"Recover: {p.name} processing completed")
                if force_fill:
                    log("Force-fill 테스트 모드: 디버깅을 위해 첫 파일만 처리하고 중단합니다.")
                    break
            else:
                log(f"Recover: skipping {p.name} (already processed or not needed)")
    except Exception as e:
        log(f"Recover failed: {e}")


def run_recovery_in_thread():
    loop = __import__("asyncio").new_event_loop()
    __import__("asyncio").set_event_loop(loop)
    loop.run_until_complete(recover_unprocessed_files())
    loop.close()


def start_recovery_thread():
    t = threading.Thread(target=run_recovery_in_thread, daemon=True)
    t.start()
    return t
