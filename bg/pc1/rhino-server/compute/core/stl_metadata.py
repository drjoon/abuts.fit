"""
STL 메타데이터 계산 모듈
Node.js Three.js 기반 계산 서비스를 호출하여 STL 메타데이터를 계산하고 백엔드에 등록
"""
import subprocess
import json
import os
import requests
from pathlib import Path
from .logger import log
from . import settings


def calculate_and_register_metadata(
    stl_file_path: Path,
    request_id: str,
    request_mongo_id: str | None,
    finish_line_points: list | None = None,
) -> dict | None:
    """
    Node.js STL 메타데이터 계산 서비스를 호출하고 백엔드에 등록
    
    Args:
        stl_file_path: STL 파일 경로
        request_id: 의뢰 ID
        request_mongo_id: MongoDB ID
        finish_line_points: Finish line 좌표 (선택)
        
    Returns:
        계산된 메타데이터 dict 또는 None (실패 시)
    """
    try:
        # 1. Node.js 메타데이터 계산 서비스 호출
        metadata = _call_nodejs_calculator(stl_file_path, finish_line_points)
        
        if not metadata:
            log(f"[stl_metadata] Failed to calculate metadata for {stl_file_path.name}")
            return None
        
        # 2. 백엔드에 메타데이터 등록
        success = _register_metadata_to_backend(
            metadata,
            request_id,
            request_mongo_id,
        )
        
        if success:
            log(
                f"[stl_metadata] Registered metadata for {request_id}: "
                f"maxDiameter={metadata.get('maxDiameter', 0):.2f}mm "
                f"connectionDiameter={metadata.get('connectionDiameter', 0):.2f}mm "
                f"totalLength={metadata.get('totalLength', 0):.2f}mm "
                f"taperAngle={metadata.get('taperAngle', 0):.2f}°"
            )
            return metadata
        else:
            log(f"[stl_metadata] Failed to register metadata to backend for {request_id}")
            return None
            
    except Exception as e:
        log(f"[stl_metadata] Error calculating metadata: {e}")
        return None


def _call_nodejs_calculator(
    stl_file_path: Path,
    finish_line_points: list | None = None,
) -> dict | None:
    """
    Node.js STL 메타데이터 계산 서비스 호출
    
    Args:
        stl_file_path: STL 파일 경로
        finish_line_points: Finish line 좌표 (선택)
        
    Returns:
        계산된 메타데이터 dict 또는 None
    """
    try:
        # stl-metadata 디렉토리 경로
        script_dir = Path(__file__).parent.parent.parent / "stl-metadata"
        node_script = script_dir / "index.js"
        
        if not node_script.exists():
            log(f"[stl_metadata] Node.js script not found: {node_script}")
            return None
        
        # 명령어 구성
        cmd = ["node", str(node_script), str(stl_file_path)]
        
        # Finish line points가 있으면 JSON으로 전달
        if finish_line_points:
            finish_line_json = json.dumps(finish_line_points)
            cmd.append(finish_line_json)
        
        # Node.js 실행
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(script_dir),
        )
        
        if result.returncode != 0:
            log(f"[stl_metadata] Node.js calculation failed: {result.stderr}")
            return None
        
        # JSON 파싱
        metadata = json.loads(result.stdout)
        return metadata
        
    except subprocess.TimeoutExpired:
        log(f"[stl_metadata] Node.js calculation timeout")
        return None
    except json.JSONDecodeError as e:
        log(f"[stl_metadata] Failed to parse Node.js output: {e}")
        return None
    except Exception as e:
        log(f"[stl_metadata] Node.js calculation error: {e}")
        return None


def _register_metadata_to_backend(
    metadata: dict,
    request_id: str,
    request_mongo_id: str | None,
) -> bool:
    """
    백엔드에 메타데이터 등록
    
    Args:
        metadata: 계산된 메타데이터
        request_id: 의뢰 ID
        request_mongo_id: MongoDB ID
        
    Returns:
        성공 여부
    """
    try:
        backend_url = os.getenv("BACKEND_BASE", "https://abuts.fit/api").rstrip("/")
        register_url = f"{backend_url}/bg/register-stl-metadata"
        
        payload = {
            "requestId": request_id,
            "requestMongoId": request_mongo_id,
            "maxDiameter": metadata.get("maxDiameter"),
            "connectionDiameter": metadata.get("connectionDiameter"),
            "totalLength": metadata.get("totalLength"),
            "taperAngle": metadata.get("taperAngle"),
            "tiltAxisVector": metadata.get("tiltAxisVector"),
            "frontPoint": metadata.get("frontPoint"),
            "taperGuide": metadata.get("taperGuide"),
        }
        
        response = requests.post(
            register_url,
            json=payload,
            timeout=10,
            headers=settings.bridge_headers(),
        )
        
        if response.status_code == 200:
            return True
        else:
            log(
                f"[stl_metadata] Backend registration failed: "
                f"status={response.status_code} body={response.text}"
            )
            return False
            
    except Exception as e:
        log(f"[stl_metadata] Backend registration error: {e}")
        return False
