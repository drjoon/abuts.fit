import asyncio
import os
import threading
import time
import uuid
from pathlib import Path

import requests

from . import settings, state
from .logger import log
from .rhino_runner import run_rhino_python


def notify_runtime_status(
    item: dict | None,
    *,
    source: str,
    stage: str,
    status: str,
    label: str,
    tone: str | None = None,
    clear: bool = False,
    metadata: dict | None = None,
) -> bool:
    try:
        backend_url = os.getenv("BACKEND_BASE", "").rstrip("/")
        if not backend_url:
            return False
        request_id = None
        request_mongo_id = None
        if isinstance(item, dict):
            request_id = item.get("requestId") or None
            request_mongo_id = item.get("requestMongoId") or None
        payload = {
            "requestId": request_id,
            "requestMongoId": request_mongo_id,
            "source": source,
            "stage": stage,
            "status": status,
            "label": label,
            "tone": tone,
            "clear": bool(clear),
            "metadata": metadata or {},
        }
        if status == "started":
            payload["startedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        resp = requests.post(
            f"{backend_url}/bg/runtime-status",
            json=payload,
            timeout=10,
            headers=settings.bridge_headers(),
        )
        if resp.status_code not in (200, 201, 202):
            log(
                "runtime-status notify failed: "
                f"status={resp.status_code} stage={stage} state={status} "
                f"requestId={request_id} body={resp.text[:300]}"
            )
            return False
        log(
            "runtime-status notify ok: "
            f"status={resp.status_code} stage={stage} state={status} requestId={request_id}"
        )
        return True
    except Exception as e:
        log(f"runtime-status notify failed: {e}")
        return False


def upload_via_presign(out_path: Path, original_name: str, item: dict) -> bool:
    try:
        backend_url = os.getenv("BACKEND_BASE", "").rstrip("/")
        if not backend_url:
            log("BACKEND_BASE not configured")
            return False
        presign_url = f"{backend_url}/bg/presign-upload"
        req_id = item.get("requestId") or settings.extract_request_id_from_name(
            original_name
        )
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
        log(
            f"Presign ok status={resp.status_code} requestId={req_id} fileName={file_name}"
        )
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
            put_resp = requests.put(
                presigned_url, data=f, headers=put_headers, timeout=30
            )
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
        if req_id:
            register_payload["requestId"] = req_id
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
            log(
                "Presigned upload + register success: "
                f"file={file_name} requestId={req_id} status={reg_resp.status_code}"
            )
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

    backend = os.getenv("BACKEND_BASE", "").rstrip("/")
    if not backend:
        log("pending-stl skipped: BACKEND_BASE not set")
        return []
    url = f"{backend}/bg/pending-stl"
    try:
        headers = settings.bridge_headers()
        log(
            "pending-stl request: "
            f"backend={backend} url={url} "
            f"secret_len={len(str(headers.get('X-Bridge-Secret', '')))}"
        )
        res = requests.get(url, timeout=10, headers=headers)
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


def _compose_input_filename(file_name: str, _: str | None) -> str:
    # 백엔드 파일명을 그대로 사용 (경로/특수문자만 sanitize)
    return settings.sanitize_filename(Path(file_name).name)


def download_original_to_input(item: dict) -> bool:
    import os

    backend = os.getenv("BACKEND_BASE", "").rstrip("/")
    if not backend:
        return False
    file_name = item.get("filePath")
    request_id = item.get("requestId")
    if not file_name:
        return False
    target_name = _compose_input_filename(file_name, request_id)
    target = settings.STORE_IN_DIR / target_name
    if target.exists():
        return True
    params = {"requestId": request_id, "filePath": file_name}
    url = f"{backend}/bg/original-file"
    try:
        res = requests.get(
            url, params=params, timeout=30, headers=settings.bridge_headers()
        )
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


# 임플란트 브랜드별 커넥션 직경 정적 맵
# 백엔드 DB가 connectionTargetDiameter=null 반환 시 폴백으로 사용
# key: (manufacturer, brand, family, type)  — 모두 정규화된 값
# 레퍼런스: connections.seed.js — DB 시드 변경 시 함께 업데이트
_BRAND_DIAMETER_FALLBACK: dict[tuple[str, str, str, str], float] = {
    # NeoBiotech
    ("NEOBIOTECH", "IS", "Regular", "Hex"): 3.35,
    ("NEOBIOTECH", "IS", "Regular", "Non-Hex"): 3.35,
    ("NEOBIOTECH", "IS / ALX", "Regular", "Hex"): 3.35,
    ("NEOBIOTECH", "IS / ALX", "Regular", "Non-Hex"): 3.35,
    ("NEOBIOTECH", "IS / ALX", "Small Narrow", "Hex"): 2.60,
    ("NEOBIOTECH", "IS / ALX", "Small Narrow", "Non-Hex"): 2.60,
    # Dentis
    ("DENTIS", "SQ", "Regular", "Hex"): 3.35,
    ("DENTIS", "SQ", "Regular", "Non-Hex"): 3.35,
    ("DENTIS", "SQ / One-Q", "Regular", "Hex"): 3.35,
    ("DENTIS", "SQ / One-Q", "Regular", "Non-Hex"): 3.35,
    ("DENTIS", "SQ / One-Q", "Mini", "Hex"): 2.80,
    ("DENTIS", "SQ / One-Q", "Mini", "Non-Hex"): 2.80,
    ("DENTIS", "SQ / One-Q", "Narrow", "Hex"): 2.30,
    ("DENTIS", "SQ / One-Q", "Narrow", "Non-Hex"): 2.30,
    ("DENTIS", "Mini", "Mini", "Hex"): 2.8,
    ("DENTIS", "Mini", "Mini", "Non-Hex"): 2.8,
    # Dentium
    ("DENTIUM", "SuperLine", "Regular", "Hex"): 3.33,
    ("DENTIUM", "SuperLine", "Regular", "Non-Hex"): 3.33,
    # DIO
    ("DIO", "UF", "Regular", "Hex"): 3.35,
    ("DIO", "UF", "Regular", "Non-Hex"): 3.35,
    ("DIO", "UF", "Narrow", "Hex"): 2.30,
    ("DIO", "UF", "Narrow", "Non-Hex"): 2.30,
    ("DIO", "Mini", "Mini", "Hex"): 2.3,
    ("DIO", "Mini", "Mini", "Non-Hex"): 2.3,
    # Megagen
    ("MEGAGEN", "AnyOne", "Regular", "Hex"): 3.3,
    ("MEGAGEN", "AnyOne", "Regular", "Non-Hex"): 3.3,
    ("MEGAGEN", "AnyOne", "Mini", "Hex"): 3.10,
    ("MEGAGEN", "AnyOne", "Mini", "Non-Hex"): 3.10,
    ("MEGAGEN", "Mini internal", "Mini internal", "Hex"): 2.30,
    ("MEGAGEN", "Mini internal", "Mini internal", "Non-Hex"): 2.30,
    # Osstem
    ("OSSTEM", "TS", "Regular", "Hex"): 3.35,
    ("OSSTEM", "TS", "Regular", "Non-Hex"): 3.35,
    ("OSSTEM", "TS3", "Regular", "Hex"): 3.35,
    ("OSSTEM", "TS3", "Regular", "Non-Hex"): 3.35,
    ("OSSTEM", "TS3", "Mini", "Hex"): 2.60,
    ("OSSTEM", "TS3", "Mini", "Non-Hex"): 2.60,
    ("OSSTEM", "Mini", "Mini", "Hex"): 2.6,
    ("OSSTEM", "Mini", "Mini", "Non-Hex"): 2.6,
}


def _fallback_diameter_from_case_infos(case_infos: dict) -> float | None:
    """case_infos의 임플란트 필드로 정적 맵에서 직경을 찾아 반환."""
    manufacturer = str(case_infos.get("implantManufacturer") or "").strip()
    brand = str(case_infos.get("implantBrand") or "").strip()
    family = str(case_infos.get("implantFamily") or "").strip()
    implant_type = str(case_infos.get("implantType") or "").strip()
    if not (manufacturer and brand and family and implant_type):
        return None
    return _BRAND_DIAMETER_FALLBACK.get((manufacturer, brand, family, implant_type))


def fetch_request_meta_case_infos(request_id: str | None) -> dict:
    if not request_id:
        return {}

    backend = os.getenv("BACKEND_BASE", "").rstrip("/")
    if not backend:
        return {}

    try:
        res = requests.get(
            f"{backend}/bg/request-meta",
            params={"requestId": request_id},
            timeout=10,
            headers=settings.bridge_headers(),
        )
        if res.status_code != 200:
            log(
                f"request-meta fetch failed: requestId={request_id} status={res.status_code}"
            )
            return {}

        payload = res.json() if res.content else {}
        return ((payload or {}).get("data") or {}).get("caseInfos") or {}
    except Exception as e:
        log(f"request-meta fetch failed: requestId={request_id} error={e}")
        return {}


def fetch_connection_target_diameter(request_id: str | None) -> float | None:
    if not request_id:
        return None

    try:
        case_infos = fetch_request_meta_case_infos(request_id)
        if not case_infos:
            return None

        raw = case_infos.get("connectionTargetDiameter")
        if raw not in (None, ""):
            diameter = float(raw)
            if diameter > 0:
                log(
                    f"[diameter] connectionTargetDiameter={diameter:.4f}mm from backend DB "
                    f"(requestId={request_id} "
                    f"{case_infos.get('implantManufacturer', '')}/{case_infos.get('implantBrand', '')}/"
                    f"{case_infos.get('implantFamily', '')}/{case_infos.get('implantType', '')})"
                )
                return diameter

        # 백엔드가 null 반환 → 직접 커넥션 직경을 알 수 없음 → 정적 맵으로 폴백
        manufacturer = case_infos.get("implantManufacturer", "")
        brand = case_infos.get("implantBrand", "")
        family = case_infos.get("implantFamily", "")
        implant_type = case_infos.get("implantType", "")
        prc = case_infos.get("connectionPrcFileName", "")
        log(
            f"[diameter] connectionTargetDiameter is null in backend response: requestId={request_id} "
            f"implantManufacturer={manufacturer} "
            f"implantBrand={brand} "
            f"implantFamily={family} "
            f"implantType={implant_type} "
            f"connectionPrcFileName={prc}"
        )
        fallback = _fallback_diameter_from_case_infos(case_infos)
        if fallback is not None:
            log(
                f"[diameter] static fallback: {manufacturer}/{brand}/{family}/{implant_type} → {fallback:.4f}mm"
            )
            return fallback
        log(
            f"[diameter] no static fallback found for {manufacturer}/{brand}/{family}/{implant_type}; will use default 3.33"
        )
        return None
    except Exception as e:
        log(f"request-meta diameter parse failed: requestId={request_id} error={e}")

    return None


def canonicalize_input_name(original: str) -> str:
    # 백엔드 파일명을 그대로 사용 (경로/특수문자만 sanitize)
    return settings.sanitize_filename(Path(original).name)


async def process_single_stl(
    p: Path, force_reprocess: bool = False, explicit_request_id: str | None = None
):
    if isinstance(p, str):
        p = Path(p)
    if not p.exists():
        log(f"Process failed: file not found {p}")
        return
    async with state.processing_semaphore:
        force_fill = settings.is_force_fill_mode()
        prefixed_input = canonicalize_input_name(p.name)
        base_stem = Path(prefixed_input).stem
        out_name = settings.sanitize_filename(f"{base_stem}.filled.stl")
        req_id = explicit_request_id or settings.extract_request_id_from_name(
            prefixed_input
        )
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
                    log(
                        "Force-fill 테스트 모드: 기존 out 파일을 삭제하고 다시 생성합니다."
                    )
                    try:
                        out_path.unlink()
                    except Exception as e:
                        log(f"Force-fill delete failed ({out_path}): {e}")
                elif force_reprocess:
                    log("Force reprocess: 기존 out 파일을 삭제하고 다시 생성합니다.")
                    try:
                        out_path.unlink()
                    except Exception as e:
                        log(f"Force reprocess delete failed ({out_path}): {e}")
                else:
                    try:
                        from .stl_metadata import calculate_and_register_metadata

                        log(
                            f"[process_single_stl] Output exists, registering STL metadata for {req_id}"
                        )
                        existing_target = fetch_connection_target_diameter(req_id)
                        calculate_and_register_metadata(
                            out_path,
                            req_id,
                            None,  # requestMongoId는 백엔드에서 찾음
                            None,
                            connection_target_diameter=existing_target,
                        )
                    except Exception as e:
                        log(
                            f"[process_single_stl] Failed to register metadata from existing output: {e}"
                        )
                    if upload_via_presign(
                        out_path,
                        prefixed_input,
                        {"requestId": req_id, "metadata": {}},
                    ):
                        return
                    notify_runtime_status(
                        {"requestId": req_id},
                        source="rhino-server",
                        stage="request",
                        status="failed",
                        label="Filled STL 업로드/등록 실패",
                        tone="rose",
                        metadata={"fileName": p.name, "outputName": out_name},
                    )
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
            notify_runtime_status(
                {"requestId": req_id},
                source="rhino-server",
                stage="request",
                status="started",
                label="Filled STL 생성중",
                tone="blue",
                metadata={"fileName": p.name, "outputName": out_name},
            )
            connection_target_diameter = fetch_connection_target_diameter(req_id)
            case_infos = fetch_request_meta_case_infos(req_id)
            implant_manufacturer = str(
                case_infos.get("implantManufacturer") or ""
            ).strip()
            implant_brand = str(case_infos.get("implantBrand") or "").strip()
            implant_family = str(case_infos.get("implantFamily") or "").strip()
            implant_type = str(case_infos.get("implantType") or "").strip()

            if connection_target_diameter is not None:
                log(
                    f"[align] requestId={req_id} connection target diameter={connection_target_diameter:.4f}mm"
                )
            else:
                log(
                    f"[align] requestId={req_id} connection target diameter not found; using implant profile/default"
                )

            if implant_manufacturer or implant_brand or implant_family or implant_type:
                log(
                    "[align] implant profile: "
                    f"{implant_manufacturer}/{implant_brand}/{implant_family}/{implant_type}"
                )

            log(f"Calling run_rhino_python for: {p.name}")
            log_text, output_info = await run_rhino_python(
                input_stl=p,
                output_stl=out_path,
                connection_target_diameter=connection_target_diameter,
                implant_manufacturer=implant_manufacturer,
                implant_brand=implant_brand,
                implant_family=implant_family,
                implant_type=implant_type,
            )
            log(f"Auto-processing done: {out_name}")
            if log_text:
                seen_forwarded = set()
                for _ln in log_text.split("\n"):
                    stripped = _ln.strip()
                    if not stripped:
                        continue
                    if (
                        "[finishline] module reloaded" in stripped
                        or "Finishline failed:" in stripped
                        or "finishline post url=" in stripped
                        or "finishline post auth " in stripped
                        or "finishline post status=" in stripped
                        or "finishline post response=" in stripped
                        or "finishline post failed:" in stripped
                    ):
                        key = "F|" + stripped
                        if key not in seen_forwarded:
                            seen_forwarded.add(key)
                            log("[rhino-finishline] " + stripped)
                    if "[align]" in stripped:
                        key = "A|" + stripped
                        if key not in seen_forwarded:
                            seen_forwarded.add(key)
                            log("[rhino-align] " + stripped)
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
                        raw = base64.b64decode(m2.group(1)).decode(
                            "utf-8", errors="ignore"
                        )
                        data = json.loads(raw)
                        if isinstance(data, dict):
                            meta["finishLine"] = data
                    except Exception:
                        pass

                m3 = re.search(r"HEX_ROTATION_RESULT:([A-Za-z0-9+/=]+)", text)
                if m3:
                    try:
                        raw = base64.b64decode(m3.group(1)).decode(
                            "utf-8", errors="ignore"
                        )
                        data = json.loads(raw)
                        if isinstance(data, dict):
                            meta["hexRotation"] = data
                    except Exception:
                        pass
                return meta

            metadata = _parse_metadata_from_log(log_text)
            if not metadata.get("finishLine"):
                log(f"[rhino-finishline] FINISHLINE_RESULT missing for {req_id}")
            output_ok = False
            if output_info and isinstance(output_info, dict):
                exists = output_info.get("exists")
                size = output_info.get("size")
                if exists and (size or 0) > 0:
                    output_ok = True
                else:
                    log(
                        f"Rhino reported export incomplete (exists={exists} size={size}) for {out_path}"
                    )
            if not output_ok:
                try:
                    if out_path.exists() and out_path.stat().st_size > 0:
                        output_ok = True
                except Exception as e:
                    log(f"output stat fallback error ({out_path}): {e}")
            if not output_ok:
                log(f"Output file not confirmed after processing: {out_path}")
                notify_runtime_status(
                    {"requestId": req_id},
                    source="rhino-server",
                    stage="request",
                    status="failed",
                    label="Filled STL 생성 실패",
                    tone="rose",
                    metadata={"fileName": p.name, "outputName": out_name},
                )
                if log_text:
                    tail = log_text.strip()
                    if tail:
                        tail_snippet = tail[-2000:]
                        log("[rhino-log tail]\n" + tail_snippet)
                return

            from .stl_metadata import calculate_and_register_metadata

            finish_line_points = None
            if metadata.get("finishLine"):
                finish_line_points = metadata["finishLine"].get("points")

            # [정책] finish line은 현재 Rhino 실행 결과만 신뢰한다.
            # 예전 DB finishLine을 fallback으로 재사용하면 이번 실행이 실패했는데도
            # 메타데이터가 성공한 것처럼 보일 수 있어 상태를 숨기게 된다.
            # 따라서 이번 run에서 finishLine이 없으면 메타데이터 계산/등록을 생략하고
            # 실패 로그만 남긴다. (rules.md §9.2)
            if not finish_line_points:
                log(
                    f"[process_single_stl] finishLine missing for {req_id}; skipping STL metadata calculation/registration"
                )
            else:
                log(f"[process_single_stl] Calculating STL metadata for {req_id}")
                try:
                    stl_metadata = calculate_and_register_metadata(
                        out_path,
                        req_id,
                        None,  # requestMongoId는 백엔드에서 찾음
                        finish_line_points,
                        connection_target_diameter=connection_target_diameter,
                        hex_rotation=metadata.get("hexRotation"),
                    )
                    if stl_metadata:
                        # 메타데이터를 metadata dict에 병합
                        metadata["stlMetadata"] = stl_metadata

                        # taperGuide surfacePoints 요약 로그 (케이스별 가이드 생성 여부 추적)
                        taper_guide = (
                            stl_metadata.get("taperGuide")
                            if isinstance(stl_metadata, dict)
                            else None
                        )
                        guides = (
                            taper_guide.get("multiDirectionGuides")
                            if isinstance(taper_guide, dict)
                            else None
                        )
                        guides = guides if isinstance(guides, list) else []

                        guide_count = len(guides)
                        with_surface_points = 0
                        total_surface_points = 0
                        counts: list[int] = []

                        for g in guides:
                            if not isinstance(g, dict):
                                counts.append(0)
                                continue
                            surface_points = g.get("surfacePoints")
                            if isinstance(surface_points, list):
                                sp_count = len(surface_points)
                                counts.append(sp_count)
                                if sp_count > 0:
                                    with_surface_points += 1
                                    total_surface_points += sp_count
                            else:
                                counts.append(0)

                        summary = (
                            f"taperGuide surfacePoints requestId={req_id} "
                            f"guides={guide_count} withSurfacePoints={with_surface_points} "
                            f"totalSurfacePoints={total_surface_points} counts={counts}"
                        )

                        log(f"[process_single_stl] {summary}")

                        # 운영 로그 뷰에서 [abuts-rhino] 스트림만 보는 경우를 위해 동일 요약을 미러링
                        try:
                            print(f"[abuts-rhino] {summary}", flush=True)
                        except Exception:
                            pass

                        log(
                            f"[process_single_stl] STL metadata calculated and registered for {req_id}"
                        )
                except Exception as e:
                    log(f"[process_single_stl] Failed to calculate STL metadata: {e}")

            if force_fill:
                log(
                    "Force-fill 테스트 모드: presigned 업로드와 백엔드 통지를 생략합니다."
                )
            else:
                upload_ok = upload_via_presign(
                    out_path,
                    prefixed_input,
                    {"requestId": req_id, "metadata": metadata},
                )
                if not upload_ok:
                    log(f"[process_single_stl] upload/register failed for {req_id}")
                    notify_runtime_status(
                        {"requestId": req_id},
                        source="rhino-server",
                        stage="request",
                        status="failed",
                        label="Filled STL 업로드/등록 실패",
                        tone="rose",
                        metadata={"fileName": p.name, "outputName": out_name},
                    )
                    return
                # CAM 완료 통지: 프론트에서 웹소켓으로 받아 경과시간 표시 및 다음 공정 진행
                notify_runtime_status(
                    {"requestId": req_id},
                    source="rhino-server",
                    stage="request",
                    status="completed",
                    label="Filled STL 생성 완료",
                    tone="green",
                    metadata={"fileName": p.name, "outputName": out_name},
                )
        except Exception as e:
            log(f"Auto-processing failed for {p.name}: {e}")
            notify_runtime_status(
                {"requestId": req_id},
                source="rhino-server",
                stage="request",
                status="failed",
                label="Filled STL 생성 실패",
                tone="rose",
                metadata={"fileName": p.name, "error": str(e)},
            )
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
            # [정책] 처리 완료 후 OS temp 임시 파일 즉시 삭제
            # 입력(p)은 S3 원본에서 다운로드한 캐시, 출력(out_path)은 S3에 업로드 완료
            for _tmp in (p, out_path):
                try:
                    if _tmp and _tmp.exists():
                        _tmp.unlink(missing_ok=True)
                        log(f"[cleanup] temp file deleted: {_tmp.name}")
                except Exception as _e:
                    log(f"[cleanup] temp file delete failed ({_tmp}): {_e}")


async def recover_unprocessed_files() -> None:
    try:
        settings.ensure_dirs()
        log("Scanning for unprocessed files on startup...")
        force_fill = settings.is_force_fill_mode()
        if force_fill:
            log(
                "TEST MODE 활성화: 입력 폴더 내 모든 STL에 대해 FillMeshHoles 강제 실행"
            )
        # 강제 테스트 모드: 로컬 입력 폴더 스캔 유지 (디버그용)
        if force_fill:
            in_files = sorted(
                [
                    p
                    for p in settings.STORE_IN_DIR.iterdir()
                    if p.is_file() and p.suffix.lower() == ".stl"
                ]
            )
            log(f"Found {len(in_files)} STL files in input directory")
            for p in in_files:
                with state.in_flight_lock:
                    if p.name in state.in_flight:
                        continue
                log(f"Recover: processing {p.name}")
                await process_single_stl(p)
                log(f"Recover: {p.name} processing completed")
                # 테스트 모드에서는 첫 파일만 처리
                log(
                    "Force-fill 테스트 모드: 디버깅을 위해 첫 파일만 처리하고 중단합니다."
                )
                break
            return
        # 운영 모드: SSOT(백엔드)에서 내려준 목록만 처리
        # rhino-server는 재기동 시 로컬 디렉토리를 임의 재계산하지 않는다.
        # 처리 대상의 canonical 목록은 백엔드 pending-stl 응답이며,
        # 로컬 파일은 그 목록을 실행하기 위한 임시 입력 캐시로만 사용한다.
        pending = fetch_pending_stl_list()
        if not pending:
            log("Pending STL from backend: 0")
            return
        log(f"Pending STL from backend: {len(pending)}")
        for item in pending:
            # 원본 STL을 백엔드에서 복구하여 입력 폴더에 저장
            downloaded = download_original_to_input(item)
            file_path = item.get("filePath") or ""
            safe_name = (
                settings.sanitize_filename(Path(file_path).name) if file_path else ""
            )
            if not downloaded or not safe_name:
                continue
            p = settings.STORE_IN_DIR / safe_name
            # FIFO 큐에 추가 - 큐 워커가 순차 처리
            result = enqueue_stl_job(p, force=False, request_id=item.get("requestId"))
            log(f"Recover: enqueued {p.name} → {result}")
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


# ---------------------------------------------------------------------------
# FIFO STL 처리 큐 (한 번에 하나씩 순차 처리)
# ---------------------------------------------------------------------------
# 동시에 여러 /api/rhino/process-file 요청이 오더라도 기존 작업을 중단하지 않는다.
# 요청은 stl_job_queue에 쌓이고, stl_queue_worker가 하나씩 꺼내 처리한다.
# 중복 요청(같은 파일명이 이미 큐에 있거나 처리 중)은 무시한다.


async def stl_queue_worker() -> None:
    """앱 시작 시 asyncio.create_task로 한 번만 실행되는 영구 워커.

    [fix] per-job 하드 타임아웃(기본 10분)을 두어 한 작업이 어떤 이유로든 멈춰도
    워커가 영구 블록되지 않도록 한다. 예전에는 한 번 hang이 생기면 이후 STL이
    큐에만 쌓이고 서버 전체가 '처리 불능' 상태가 되었다.
    """
    import os as _os

    hard_timeout = float(_os.getenv("RHINO_JOB_HARD_TIMEOUT_SEC", "600"))
    log(f"[stl-queue] Worker started (hard_timeout={hard_timeout}s)")
    while True:
        try:
            item = await state.stl_job_queue.get()
            p: Path = item["path"]
            force: bool = item.get("force", False)
            item_request_id: str | None = item.get("requestId")
            state.last_dequeue_ts = time.time()
            state.current_processing_name = p.name
            state.current_processing_started_ts = state.last_dequeue_ts
            log(
                f"[stl-queue] Dequeued: {p.name} (queue remaining: {state.stl_job_queue.qsize()})"
            )
            try:
                await asyncio.wait_for(
                    process_single_stl(p, force, explicit_request_id=item_request_id),
                    timeout=hard_timeout,
                )
                state.last_success_ts = time.time()
                state.total_jobs_processed += 1
            except asyncio.TimeoutError:
                state.last_failure_ts = time.time()
                state.total_jobs_timeout += 1
                log(
                    f"[stl-queue] HARD TIMEOUT ({hard_timeout}s) for {p.name}, skipping to next"
                )
                # in_flight 정리 (process_single_stl 내부 finally가 못 돌았을 경우 안전망)
                try:
                    with state.in_flight_lock:
                        state.in_flight.discard(p.name)
                except Exception:
                    pass
            except Exception as e:
                state.last_failure_ts = time.time()
                state.total_jobs_failed += 1
                log(f"[stl-queue] Unexpected error for {p.name}: {e}")
            finally:
                state.current_processing_name = None
                state.current_processing_started_ts = None
                state.stl_job_queue.task_done()
                # [fix] state.jobs 무한 증가 방지: 최근 200개만 유지
                try:
                    if len(state.jobs) > 200:
                        items_sorted = sorted(
                            state.jobs.items(),
                            key=lambda kv: kv[1].get("createdAt", 0),
                        )
                        for jid, _ in items_sorted[: len(state.jobs) - 200]:
                            state.jobs.pop(jid, None)
                except Exception:
                    pass
                # [fix] 완료되었거나 오래된 job_futures 정리 (안전망)
                try:
                    stale_tokens = [
                        t for t, f in list(state.job_futures.items()) if f.done()
                    ]
                    for t in stale_tokens:
                        state.job_futures.pop(t, None)
                except Exception:
                    pass
        except asyncio.CancelledError:
            log("[stl-queue] Worker cancelled")
            break
        except Exception as e:
            log(f"[stl-queue] Worker loop error: {e}")
            # 루프 자체 예외 시 잠시 쉬고 계속
            try:
                await asyncio.sleep(1.0)
            except Exception:
                pass


def enqueue_stl_job(p: Path, force: bool = False, request_id: str | None = None) -> str:
    """
    STL 처리 작업을 FIFO 큐에 추가한다. Thread-safe.
    - 이미 in_flight(처리 중)인 파일이면 'in_flight' 반환
    - 이미 큐에 대기 중인 파일이면 'queued_already' 반환
    - 성공적으로 큐에 추가되면 'enqueued' 반환

    asyncio.Queue는 thread-safe하지 않으므로, 메인 이벤트 루프에 등록해야 한다.
    asyncio 루프 안에서 호출되면 put_nowait 직접 사용, 루프 밖(별도 스레드)이면
    main_loop.call_soon_threadsafe를 사용한다.
    """
    if not force:
        with state.in_flight_lock:
            if p.name in state.in_flight:
                log(f"[stl-queue] Skip enqueue (in_flight): {p.name}")
                return "in_flight"

    # 이미 큐에 대기 중인지 확인 (force=False 시)
    if not force:
        try:
            queued_names = {
                item["path"].name for item in list(state.stl_job_queue._queue)
            }
            if p.name in queued_names:
                log(f"[stl-queue] Skip enqueue (already queued): {p.name}")
                return "queued_already"
        except Exception:
            pass

    item = {"path": p, "force": force, "requestId": request_id}
    state.last_enqueue_ts = time.time()
    log(
        f"[stl-queue] Enqueued: {p.name} (queue size after: {state.stl_job_queue.qsize() + 1})"
    )

    # 현재 실행 중인 이벤트 루프가 있으면 직접 put_nowait,
    # 별도 스레드(recovery thread)에서 호출 시 main_loop.call_soon_threadsafe 사용
    try:
        import asyncio as _asyncio

        running_loop = _asyncio.get_running_loop()
        # 같은 루프 안: 직접 put_nowait
        state.stl_job_queue.put_nowait(item)
    except RuntimeError:
        # 이벤트 루프 밖(별도 스레드): thread-safe하게 추가
        if state.main_loop and state.main_loop.is_running():
            state.main_loop.call_soon_threadsafe(state.stl_job_queue.put_nowait, item)
        else:
            # fallback: 직접 put (main_loop 아직 미설정 시)
            state.stl_job_queue.put_nowait(item)

    return "enqueued"
