import os
import re
import shutil
import subprocess
import uuid
import time
import sys
import json
import asyncio
import threading
import traceback
import socketio
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Optional, Iterable, Tuple, List, Dict, Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


# Rhino 전역 락 (순차 처리 강제)
_global_rhino_lock = asyncio.Lock()
_main_loop: Optional[asyncio.AbstractEventLoop] = None


APP_ROOT = Path(__file__).resolve().parent
SCRIPT_DIR = APP_ROOT / "scripts"
# bg/storage 구조로 변경
BG_STORAGE_ROOT = APP_ROOT.parent.parent / "storage"
STORE_IN_DIR = BG_STORAGE_ROOT / "1-stl"
STORE_OUT_DIR = BG_STORAGE_ROOT / "2-filled"
TMP_DIR = APP_ROOT / ".tmp"

DEFAULT_TIMEOUT_SEC = int(os.getenv("RHINO_TIMEOUT_SEC", "180"))
DEFAULT_RHINO_APP_MAC = Path("/Applications/Rhino 8.app/Contents/MacOS/Rhino")
DEFAULT_RHINOCODE_MAC = Path("/Applications/Rhino 8.app/Contents/Resources/bin/rhinocode")
MAX_RHINO_CONCURRENCY = 1  # 라이노 인스턴스 1개만 사용

EXECUTOR = ThreadPoolExecutor(max_workers=MAX_RHINO_CONCURRENCY)
JOBS: dict[str, dict] = {}

_RHINO_POOL_LOCK = threading.Lock()
_RHINO_POOL_COND = threading.Condition(_RHINO_POOL_LOCK)
_RHINO_ALL: set[str] = set()
_RHINO_AVAILABLE: deque[str] = deque()
_RHINO_LAST_EXPAND_TS = 0.0
_BASE_FW_LOCK = threading.Lock()

# 재기동 스캔 및 watcher 동시 실행에서 중복 처리 방지
_IN_FLIGHT: set[str] = set()
_IN_FLIGHT_LOCK = threading.Lock()


def _log(msg: str) -> None:
    try:
        print(f"[rhino-pool] {msg}", flush=True)
    except Exception:
        pass


app = FastAPI(title="abuts.fit rhino worker")

# Socket.io 서버 초기화
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# 작업 결과를 기다리기 위한 Future 저장소
# {job_token: asyncio.Future}
_job_futures: Dict[str, asyncio.Future] = {}

@sio.event
async def connect(sid, environ):
    _log(f"socket connected: {sid}")

@sio.event
async def disconnect(sid):
    _log(f"socket disconnected: {sid}")

@sio.event
async def job_result(sid, data):
    """Rhino 스크립트에서 결과를 보내는 이벤트"""
    token = data.get("token")
    if token and token in _job_futures:
        _log(f"socket received job_result: token={token}")
        future = _job_futures[token]
        if not future.done():
            future.set_result(data)
    else:
        _log(f"socket received unknown job_result: token={token}")

@app.post("/api/rhino/internal/job-callback")
async def job_callback(data: Dict[str, Any]):
    """Rhino 스크립트(C# HttpClient)로부터 결과를 받는 내부 엔드포인트"""
    token = data.get("token")
    if token and token in _job_futures:
        _log(f"callback received job-callback: token={token}")
        future = _job_futures[token]
        if not future.done():
            future.set_result(data)
        return {"ok": True}
    else:
        _log(f"callback received unknown token: token={token}")
        return {"ok": False, "error": "unknown token"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_dirs() -> None:
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    STORE_IN_DIR.mkdir(parents=True, exist_ok=True)
    STORE_OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)


def _get_rhinocode_bin() -> str:
    rhinocode = os.getenv("RHINOCODE_BIN", "").strip().strip('"')
    if not rhinocode:
        rhinocode = shutil.which("rhinocode") or ""
    if not rhinocode and DEFAULT_RHINOCODE_MAC.exists():
        rhinocode = str(DEFAULT_RHINOCODE_MAC)
    return rhinocode


def _dotnet_rollforward_env() -> dict:
    env = os.environ.copy()
    env.setdefault("DOTNET_ROLL_FORWARD", "Major")
    env.setdefault("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
    return env


def _list_rhino_pipe_ids(rhinocode: str) -> list[str]:
    try:
        listed = subprocess.run(
            [rhinocode, "list", "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_dotnet_rollforward_env(),
            timeout=10,
        )
        if listed.returncode != 0:
            return []
        data = json.loads(listed.stdout or "[]")
        out: list[str] = []
        for item in data if isinstance(data, list) else []:
            pid = item.get("pipeId") or item.get("id")
            if pid:
                out.append(str(pid))
        return out
    except Exception:
        return []


def _launch_rhino_instance_mac() -> bool:
    return False


def _dismiss_rhino_dialogs_mac() -> None:
    return None


def _run_new_document(rhinocode: str, rhino_id: str) -> bool:
    tmp_dir = TMP_DIR
    tmp_dir.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    script_path = tmp_dir / f"newdoc_{token}.py"
    script_path.write_text(
        "import Rhino\n"
        "try:\n"
        "  Rhino.RhinoApp.RunScript('!_-New _Enter', False)\n"
        "except Exception:\n"
        "  pass\n",
        encoding="utf-8",
    )
    try:
        completed = subprocess.run(
            [rhinocode, "--rhino", str(rhino_id), "script", str(script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_dotnet_rollforward_env(),
            timeout=30,
        )
        return completed.returncode == 0
    except Exception:
        return False
    finally:
        try:
            script_path.unlink()
        except Exception:
            pass


def _ping_rhino_instance(rhinocode: str, rhino_id: str) -> bool:
    try:
        # Rhino가 바쁠 때 list 명령어가 지연될 수 있으므로 타임아웃을 10초로 연장
        completed = subprocess.run(
            [rhinocode, "list"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=_dotnet_rollforward_env(),
            timeout=10,
        )
        return rhino_id in completed.stdout
    except subprocess.TimeoutExpired:
        # 타임아웃 발생 시, 현재 라이노가 작업 중일 가능성이 높으므로 
        # 일단 살아있는 것으로 간주하고 진행 (안전책)
        _log(f"ping timeout: pipeId={rhino_id}, assuming busy but alive")
        return True
    except Exception as e:
        _log(f"ping exception: pipeId={rhino_id} err={e}")
        return False


def _refresh_rhino_pool(rhinocode: str) -> None:
    # 잦은 리프레시 방지 (10초 간격)
    global _RHINO_LAST_EXPAND_TS
    now = time.time()
    if _RHINO_ALL and (now - _RHINO_LAST_EXPAND_TS < 10.0):
        return

    existing = set(_list_rhino_pipe_ids(rhinocode))
    if not existing:
        return

    with _RHINO_POOL_LOCK:
        _RHINO_LAST_EXPAND_TS = now
        # 새로운 pipeId 추가
        for pid in existing:
            if pid not in _RHINO_ALL:
                _RHINO_ALL.add(pid)
                _RHINO_AVAILABLE.append(pid)
                _log(f"discovered pipeId={pid} (all={len(_RHINO_ALL)}, avail={len(_RHINO_AVAILABLE)})")
        
        # 사라진 pipeId 제거
        to_remove = _RHINO_ALL - existing
        for pid in to_remove:
            _RHINO_ALL.discard(pid)
            if pid in _RHINO_AVAILABLE:
                _RHINO_AVAILABLE.remove(pid)
            _log(f"removed inactive pipeId={pid}")


def _expand_rhino_pool_once(rhinocode: str) -> bool:
    return False

def _ensure_rhino_pool() -> None:
    rhinocode = _get_rhinocode_bin()
    if not rhinocode:
        return
    _refresh_rhino_pool(rhinocode)


# Rhino 마지막 성공 시간을 기록하여 30초 이내면 ping 생략
_last_ping_success_ts = 0.0

@asynccontextmanager
async def _acquire_rhino_id(timeout_sec: float = 60.0) -> Iterable[str]:
    global _last_ping_success_ts
    _ensure_rhino_pool()
    rhinocode = _get_rhinocode_bin()
    start = time.time()
    rid: Optional[str] = None

    while True:
        with _RHINO_POOL_COND:
            while not _RHINO_AVAILABLE:
                if time.time() - start > timeout_sec:
                    raise RuntimeError(
                        "사용 가능한 Rhino 인스턴스가 없습니다. Rhino를 실행한 뒤 다시 시도하세요."
                    )
                _RHINO_POOL_COND.wait(timeout=0.5)

            rid = _RHINO_AVAILABLE.popleft()

        # 30초 이내에 성공한 적이 있다면 ping 체크 생략 (성능 최적화)
        now = time.time()
        should_ping = (now - _last_ping_success_ts) > 30.0

        if not should_ping or (rhinocode and rid and _ping_rhino_instance(rhinocode, rid)):
            if should_ping:
                _last_ping_success_ts = now
            _log(f"acquire: pipeId={rid} (avail={len(_RHINO_AVAILABLE)}/{len(_RHINO_ALL)})")
            break

        with _RHINO_POOL_COND:
            if rid in _RHINO_ALL:
                _RHINO_ALL.discard(rid)
            _RHINO_POOL_COND.notify_all()

    try:
        yield rid
    finally:
        with _RHINO_POOL_COND:
            _RHINO_AVAILABLE.append(rid)
            _RHINO_POOL_COND.notify_all()
            _log(f"release: pipeId={rid} (avail={len(_RHINO_AVAILABLE)}/{len(_RHINO_ALL)})")


def _prune_tmp(max_items: int = 100) -> None:
    try:
        TMP_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        return

    try:
        items = list(TMP_DIR.iterdir())
    except Exception:
        return

    if len(items) <= max_items:
        return

    try:
        items.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    except Exception:
        return

    for p in items[max_items:]:
        try:
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
        except Exception:
            pass


def _sanitize_filename(name: str) -> str:
    base = Path(name).name
    base = re.sub(r"[^a-zA-Z0-9._\-가-힣]", "_", base)
    if not base.lower().endswith(".stl"):
        base = base + ".stl"
    return base


def _build_fw_output_name(input_name: str) -> str:
    p = Path(input_name)
    return f"{p.stem}.fw{p.suffix}"


def _build_output_name(input_name: str) -> str:
    p = Path(input_name)
    # base.stl -> base.cam.stl
    return f"{p.stem}.cam{p.suffix}"


def _build_rhino_output_name(input_name: str) -> str:
    p = Path(input_name)
    return f"{p.stem}.rhino{p.suffix}"


def _run_rhino_python(input_stl: Path, output_stl: Path, timeout_sec: int) -> None:
    rhinocode = _get_rhinocode_bin()
    if not rhinocode:
        raise RuntimeError(
            "rhinocode를 사용할 수 없습니다. local.env에 RHINOCODE_BIN을 설정하세요."
        )

    rhino_app = os.getenv("RHINO_APP", "").strip().strip('"')

    candidates = []
    base = Path("/Applications")
    if base.exists():
        for exe_name in ("Rhino", "Rhinoceros"):
            for p in sorted(base.glob(f"Rhino*.app/Contents/MacOS/{exe_name}")):
                if p.exists():
                    candidates.append(str(p))

    # 기존 기본값도 후보에 추가 (존재하면)
    if DEFAULT_RHINO_APP_MAC.exists():
        candidates.insert(0, str(DEFAULT_RHINO_APP_MAC))

    # RHINO_APP가 지정되어 있으면 우선 사용하되, 경로가 틀리면 후보로 fallback
    if rhino_app:
        if not Path(rhino_app).exists():
            if candidates:
                rhino_app = candidates[0]
            else:
                raise RuntimeError(
                    "RHINO_APP 경로가 존재하지 않습니다.\n"
                    + f"RHINO_APP={rhino_app}\n"
                    + "local.env의 RHINO_APP를 실제 실행 파일로 수정하세요.\n"
                    + "예: RHINO_APP=\"/Applications/Rhino 8.app/Contents/MacOS/Rhinoceros\""
                )
    else:
        if candidates:
            rhino_app = candidates[0]
        else:
            raise RuntimeError(
                "Rhino 실행 파일을 찾지 못했습니다.\n"
                + "1) Rhino가 설치되어 있는지 확인하거나\n"
                + "2) local.env에 RHINO_APP를 지정하세요.\n"
                + "예: RHINO_APP=\"/Applications/Rhino 8.app/Contents/MacOS/Rhinoceros\""
            )

async def _run_rhino_python(
    input_stl: Path,
    output_stl: Path,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
) -> str:
    rhinocode = _get_rhinocode_bin()
    if not rhinocode:
        raise RuntimeError("rhinocode(Rhino.Code CLI)를 찾을 수 없습니다.")

    token = uuid.uuid4().hex
    tmp_dir = TMP_DIR
    tmp_dir.mkdir(parents=True, exist_ok=True)

    wrapper_path = tmp_dir / f"job_{token}.py"
    log_path = tmp_dir / f"log_{token}.txt"

    # Future 생성 및 저장
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    _job_futures[token] = future

    try:
        wrapper_path.write_text(
            "import json\n"
            "import os\n"
            "import Rhino\n"
            "import traceback\n"
            "import time\n"
            "import importlib\n"
            "def _cleanup_doc():\n"
            "  try:\n"
            "    doc = Rhino.RhinoDoc.ActiveDoc\n"
            "    if doc is None: return\n"
            "    try:\n"
            "      Rhino.RhinoApp.RunScript('!_SelAll _Delete', True)\n"
            "    except Exception: pass\n"
            "    ids = [o.Id for o in list(doc.Objects)]\n"
            "    for oid in ids:\n"
            "      try:\n"
            "        doc.Objects.Delete(oid, True)\n"
            "      except Exception:\n"
            "        pass\n"
            "  except Exception:\n"
            "    pass\n"
            "def _read_log(p):\n"
            "  try:\n"
            "    with open(p, 'r', encoding='utf-8', errors='ignore') as f:\n"
            "      return f.read()\n"
            "  except Exception:\n"
            "    return ''\n"
            "def _send_result_via_socket(data):\n"
            "  for i in range(3):\n"
            "    try:\n"
            "      import json\n"
            "      import System.Net.Http\n"
            "      client = System.Net.Http.HttpClient()\n"
            "      content = System.Net.Http.StringContent(json.dumps(data), System.Text.Encoding.UTF8, 'application/json')\n"
            "      response = client.PostAsync('http://127.0.0.1:8000/api/rhino/internal/job-callback', content).Result\n"
            "      if response.IsSuccessStatusCode: return\n"
            "      time.sleep(0.5)\n"
            "    except Exception as e:\n"
            "      if i == 2: print('callback failed after 3 retries: ' + str(e))\n"
            "      time.sleep(0.5)\n"
            f"os.environ['ABUTS_INPUT_STL'] = r\"{str(input_stl)}\"\n"
            f"os.environ['ABUTS_OUTPUT_STL'] = r\"{str(output_stl)}\"\n"
            f"os.environ['ABUTS_LOG_PATH'] = r\"{str(log_path)}\"\n"
            f"import System.Diagnostics\n"
            f"import sys\n"
            f"sys.path.append(r\"{str(SCRIPT_DIR)}\")\n"
            f"import process_abutment_stl\n"
            f"process_abutment_stl = importlib.reload(process_abutment_stl)\n"
            "try:\n"
            "  print('JOB_PID=' + str(System.Diagnostics.Process.GetCurrentProcess().Id))\n"
            "  _cleanup_doc()\n"
            f"  process_abutment_stl.main(input_path_arg=r\"{str(input_stl)}\", output_path_arg=r\"{str(output_stl)}\", log_path_arg=r\"{str(log_path)}\")\n"
            f"  _send_result_via_socket({{'token': '{token}', 'ok': True, 'log': _read_log(r\"{str(log_path)}\")}})\n"
            "except Exception as e:\n"
            f"  _send_result_via_socket({{'token': '{token}', 'ok': False, 'error': str(e), 'traceback': traceback.format_exc(), 'log': _read_log(r\"{str(log_path)}\")}})\n"
            "  raise\n",
            encoding="utf-8",
        )

        async with _global_rhino_lock:
            start_time = time.time()
            async with _acquire_rhino_id() as rhino_id:
                # 래퍼 스크립트 작성 오버헤드 최적화 (필요한 경우만 작성하거나 캐싱 고려 가능)
                # 여기서는 실행 속도에 집중하여 폴링 간격을 극한으로 최적화
                _log(f"run: pipeId={rhino_id} input={input_stl.name} out={output_stl.name}")
                
                process = await asyncio.create_subprocess_exec(
                    rhinocode, "--rhino", str(rhino_id), "script", str(wrapper_path),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=_dotnet_rollforward_env()
                )
                
                # stdout/stderr를 읽으면서 결과 대기
                try:
                    # 프로세스 실행
                    process_task = asyncio.create_task(process.communicate())
                    
                    # Future(결과) 또는 프로세스 종료 중 먼저 오는 것 대기
                    done, pending = await asyncio.wait(
                        [future, process_task],
                        timeout=timeout_sec,
                        return_when=asyncio.FIRST_COMPLETED
                    )

                    if future.done():
                        payload = future.result()
                    elif process_task.done():
                        # 프로세스가 먼저 끝났는데 결과가 아직 안 왔다면 좀 더 넉넉히 대기
                        try:
                            payload = await asyncio.wait_for(future, timeout=10.0)
                        except asyncio.TimeoutError:
                            stdout, stderr = process_task.result()
                            err_text = stderr.decode().strip()
                            raise RuntimeError(f"Rhino 프로세스가 종료되었으나 결과를 받지 못했습니다(10s timeout).\nstderr={err_text}")
                    else:
                        # 타임아웃
                        try:
                            process.kill()
                        except:
                            pass
                        await process.wait()
                        raise RuntimeError(f"Rhino 스크립트 실행 타임아웃 ({timeout_sec}s)")

                except Exception as e:
                    if isinstance(e, RuntimeError):
                        raise
                    raise RuntimeError(f"실행 중 오류 발생: {e}")
                finally:
                    # 펜딩된 태스크 정리
                    for p in pending:
                        p.cancel()

                if not payload:
                    raise RuntimeError("Rhino 스크립트로부터 결과를 받지 못했습니다.")

                if not payload.get("ok"):
                    _log(f"script failed: pipeId={rhino_id} error={payload.get('error')}")
                    err_msg = str(payload.get("error") or "")
                    tb = str(payload.get("traceback") or "")
                    log_txt = str(payload.get("log") or "")
                    
                    full_err = "Rhino 스크립트 실패\n"
                    if err_msg:
                        full_err += f"error={err_msg}\n"
                    if tb:
                        full_err += f"traceback=\n{tb}\n"
                    if log_txt:
                        full_err += f"log=\n{log_txt}\n"
                    raise RuntimeError(full_err)

                elapsed = time.time() - start_time
                _log(f"done: pipeId={rhino_id} elapsed={elapsed:.2f}s")
                log_text = payload.get("log")
                return log_text or ""
    except Exception as e:
        _log(f"run exception: {e}\n{traceback.format_exc()}")
        raise
    finally:
        # Future 정리
        _job_futures.pop(token, None)
        try:
            if wrapper_path.exists():
                wrapper_path.unlink()
            if log_path.exists():
                log_path.unlink()
        except Exception:
            pass


async def _run_rhino_python_in_executor(
    *,
    input_stl: Path,
    output_stl: Path,
    timeout_sec: int,
) -> str:
    return await _run_rhino_python(input_stl=input_stl, output_stl=output_stl, timeout_sec=timeout_sec)


class CreateJobResponse(BaseModel):
    ok: bool
    jobId: str


class JobStatusResponse(BaseModel):
    ok: bool
    jobId: str
    status: str
    createdAt: float
    startedAt: Optional[float] = None
    finishedAt: Optional[float] = None
    inputName: Optional[str] = None
    outputName: Optional[str] = None
    error: Optional[str] = None
    total: Optional[int] = None
    processed: Optional[int] = None


class StlHandler(FileSystemEventHandler):
    def on_created(self, event):
        self._handle(event)

    def on_moved(self, event):
        self._handle(event, is_move=True)

    def _handle(self, event, is_move=False):
        if event.is_directory:
            return
        if not _is_running:
            return
        
        target_path = event.dest_path if is_move else event.src_path
        if target_path.lower().endswith(".stl"):
            p = Path(target_path)
            # 이미 처리 중이거나 완료된 파일인지 확인 (파일명 규칙 기반)
            if ".filled" in p.name or ".cam" in p.name or ".rhino" in p.name:
                return
            
            # 파일이 완전히 써질 때까지 잠시 대기
            time.sleep(0.5)
            if _main_loop:
                _main_loop.call_soon_threadsafe(lambda: asyncio.create_task(_process_single_stl(p)))

async def _process_single_stl(p: Path):
    if not p.exists():
        return
        
    out_name = _sanitize_filename(f"{p.stem}.filled.stl")
    out_path = STORE_OUT_DIR / out_name
    
    with _IN_FLIGHT_LOCK:
        if p.name in _IN_FLIGHT:
            return
        _IN_FLIGHT.add(p.name)

    if not out_path.exists():
        _log(f"Auto-processing new file (Watcher/Recover): {p.name}")
        job_id = f"auto_{uuid.uuid4().hex[:8]}"
        JOBS[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "createdAt": time.time(),
            "inputName": p.name,
            "outputName": out_name,
        }
        
        try:
            await _run_rhino_python(input_stl=p, output_stl=out_path)
            _log(f"Auto-processing done: {out_name}")
            
            # 히스토리 추가
            _recent_history.append({
                "file": p.name,
                "output": out_name,
                "timestamp": time.time(),
                "status": "success"
            })
            
            # 백엔드 호출 (결과 등록)
            try:
                backend_url = os.getenv("BACKEND_URL", "https://abuts.fit/api")
                callback_url = f"{backend_url}/bg/register-file"
                payload = {
                    "sourceStep": "2-filled",
                    "fileName": out_name,
                    "originalFileName": p.name,
                    "status": "success",
                    "metadata": {
                        "jobId": job_id
                    }
                }
                response = requests.post(callback_url, json=payload, timeout=5)
                if response.status_code == 200:
                    _log(f"Backend notified successfully: {out_name}")
                else:
                    _log(f"Backend notification returned status {response.status_code}")
            except Exception as be:
                _log(f"Backend notification failed: {be}")
                
        except Exception as e:
            _log(f"Auto-processing failed for {p.name}: {e}")
            _recent_history.append({
                "file": p.name,
                "timestamp": time.time(),
                "status": "failed",
                "error": str(e)
            })
            # 실패 시에도 백엔드 알림 시도 가능
            try:
                backend_url = os.getenv("BACKEND_URL", "https://abuts.fit/api")
                requests.post(f"{backend_url}/bg/register-file", json={
                    "sourceStep": "2-filled",
                    "fileName": p.name,
                    "status": "failed",
                    "metadata": {"error": str(e)}
                }, timeout=5)
            except:
                pass

    with _IN_FLIGHT_LOCK:
        _IN_FLIGHT.discard(p.name)


def _backend_should_process(file_name: str, source_step: str) -> bool:
    """백엔드에 처리 상태를 확인하여 미처리일 때만 True 반환"""
    try:
        backend_url = os.getenv("BACKEND_URL", "https://abuts.fit/api")
        # BACKEND_URL은 기본이 https://abuts.fit/api 형태이므로 /api가 포함된 경우가 있다.
        base = backend_url.rstrip("/")
        # bg.routes는 /api/bg 이므로, base가 .../api면 그대로 /bg/.., 아니면 /api/bg/.. 로 맞춰준다.
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
        # ApiResponse 래핑이 아닌 경우도 방어
        return bool(body.get("shouldProcess"))
    except Exception as e:
        _log(f"Recover status check failed: {e}")
        return False


def _recover_unprocessed_files() -> None:
    """재기동 시 input/output 폴더를 비교하고, 백엔드가 미처리로 판단한 파일만 재처리 큐에 등록"""
    try:
        _ensure_dirs()

        in_files = [p for p in STORE_IN_DIR.iterdir() if p.is_file()]
        for p in in_files:
            try:
                out_name = _sanitize_filename(f"{p.stem}.filled.stl")
                out_path = STORE_OUT_DIR / out_name
                if out_path.exists():
                    continue

                # 백엔드가 미처리라고 확인해준 경우에만 처리
                if not _backend_should_process(p.name, "1-stl"):
                    continue

                _log(f"Recover: enqueue {p.name}")

                # startup은 sync 컨텍스트이므로 main loop에 코루틴 등록
                if _main_loop:
                    asyncio.run_coroutine_threadsafe(_process_single_stl(p), _main_loop)
            except Exception as inner:
                _log(f"Recover error for {p.name}: {inner}")
                continue
    except Exception as e:
        _log(f"Recover failed: {e}")

def _start_watcher():
    _log(f"Starting native watcher (watchdog) for {STORE_IN_DIR}")
    event_handler = StlHandler()
    observer = Observer()
    observer.schedule(event_handler, str(STORE_IN_DIR), recursive=False)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

@app.on_event("startup")
def on_startup() -> None:
    global _main_loop
    _main_loop = asyncio.get_event_loop()
    _ensure_dirs()
    # 파일 감시 스레드 시작 (watchdog)
    threading.Thread(target=_start_watcher, daemon=True).start()

    # 재기동 시점 미처리 파일 복구 스캔
    threading.Thread(target=_recover_unprocessed_files, daemon=True).start()

# 운영 상태 및 히스토리 관리
_is_running = True
_recent_history = deque(maxlen=50)  # 최근 50개 처리 기록

@app.get("/health")
@app.get("/ping")
async def health_check():
    return {"status": "ok", "is_running": _is_running, "service": "rhino-server"}

@app.post("/control/start")
async def start_service():
    global _is_running
    _is_running = True
    _log("Service started by control API")
    return {"ok": True, "message": "Service started"}

@app.post("/control/stop")
async def stop_service():
    global _is_running
    # 서비스 정지 상태로 변경
    _is_running = False
    _log("Service stopped by control API")
    return {"ok": True, "message": "Service stopped"}

@app.get("/history/recent")
async def get_recent_history():
    return {"ok": True, "history": list(_recent_history)}



@app.get("/")
def root():
    return {
        "ok": True,
        "service": "rhino-fastapi",
        "storeInDir": str(STORE_IN_DIR),
        "storeOutDir": str(STORE_OUT_DIR),
    }


async def _run_job(job_id: str, input_path: Path, output_name: str, output_path: Path) -> None:
    JOBS[job_id]["status"] = "running"
    JOBS[job_id]["startedAt"] = time.time()

    try:
        await _run_rhino_python(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=DEFAULT_TIMEOUT_SEC,
        )

        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["finishedAt"] = time.time()
        JOBS[job_id]["resultPath"] = str(output_path)
    except subprocess.TimeoutExpired:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["finishedAt"] = time.time()
        JOBS[job_id]["error"] = "Rhino 실행 타임아웃"
    except Exception as e:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["finishedAt"] = time.time()
        JOBS[job_id]["error"] = str(e)


async def _run_batch_job(job_id: str) -> None:
    JOBS[job_id]["status"] = "running"
    JOBS[job_id]["startedAt"] = time.time()

    # INPUT_DIR 대신 STORE_IN_DIR 사용 (필요시 수정)
    stl_files = sorted([p for p in STORE_IN_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".stl"])
    JOBS[job_id]["total"] = len(stl_files)
    JOBS[job_id]["processed"] = 0
    tmp_dir = APP_ROOT / ".tmp" / f"batch_{job_id}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        for p in stl_files:
            out_name = _build_rhino_output_name(p.name)
            out_path = STORE_OUT_DIR / out_name

            # Rhino/CLI 조합에서 유니코드 경로가 깨지는 케이스가 있어 ASCII 파일명으로 우회
            tmp_in = tmp_dir / f"in_{uuid.uuid4().hex}.stl"
            tmp_out = tmp_dir / f"out_{uuid.uuid4().hex}.stl"
            shutil.copyfile(p, tmp_in)

            try:
                await _run_rhino_python(
                    input_stl=tmp_in,
                    output_stl=tmp_out,
                    timeout_sec=DEFAULT_TIMEOUT_SEC,
                )

                if not tmp_out.exists() or tmp_out.stat().st_size == 0:
                    raise RuntimeError("결과 STL이 생성되지 않았습니다")

                shutil.copyfile(tmp_out, out_path)
                JOBS[job_id]["processed"] += 1
            except Exception as e:
                raise RuntimeError(f"file={p.name}: {e}")
            finally:
                try:
                    tmp_in.unlink()
                except Exception:
                    pass
                try:
                    tmp_out.unlink()
                except Exception:
                    pass

        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["finishedAt"] = time.time()
    except subprocess.TimeoutExpired:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["finishedAt"] = time.time()
        JOBS[job_id]["error"] = "Rhino 실행 타임아웃"
    except Exception as e:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["finishedAt"] = time.time()
        JOBS[job_id]["error"] = str(e)
    finally:
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass


@app.post("/api/rhino/upload-stl")
async def upload_stl(file: UploadFile = File(...)):
    """S3 전송량 최적화를 위해 클라이언트/백엔드에서 직접 파일을 받아 1-stl에 저장하는 엔드포인트"""
    _ensure_dirs()
    safe_name = _sanitize_filename(file.filename or "uploaded.stl")
    target_path = STORE_IN_DIR / safe_name
    
    try:
        data = await file.read()
        target_path.write_bytes(data)
        _log(f"Direct upload saved to 1-stl: {safe_name} ({len(data)} bytes)")
        return {"ok": True, "fileName": safe_name, "path": str(target_path)}
    except Exception as e:
        _log(f"Failed to save uploaded file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rhino/process-stl", response_model=CreateJobResponse)
async def process_stl(file: UploadFile = File(...)):
    _ensure_dirs()
    _prune_tmp(max_items=100)

    safe_name = _sanitize_filename(file.filename or "input.stl")
    job_id = uuid.uuid4().hex

    created_at = time.time()
    JOBS[job_id] = {
        "jobId": job_id,
        "status": "queued",
        "createdAt": created_at,
        "startedAt": None,
        "finishedAt": None,
        "inputName": safe_name,
        "outputName": _build_output_name(safe_name),
        "error": None,
        "resultPath": None,
    }

    output_name = _build_output_name(safe_name)
    # TMP_DIR를 사용하여 임시 저장
    persisted_input = TMP_DIR / f"{job_id}.{safe_name}"
    persisted_output = TMP_DIR / f"{job_id}.{output_name}"

    data = await file.read()
    persisted_input.write_bytes(data)

    def _work():
        _run_job(
            job_id=job_id,
            input_path=persisted_input,
            output_name=output_name,
            output_path=persisted_output,
        )

    future: Future = EXECUTOR.submit(_work)
    JOBS[job_id]["_future"] = future

    return {"ok": True, "jobId": job_id}


@app.get("/api/rhino/jobs/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job을 찾을 수 없습니다")

    return {
        "ok": True,
        "jobId": job["jobId"],
        "status": job["status"],
        "createdAt": job["createdAt"],
        "startedAt": job.get("startedAt"),
        "finishedAt": job.get("finishedAt"),
        "inputName": job.get("inputName"),
        "outputName": job.get("outputName"),
        "error": job.get("error"),
        "total": job.get("total"),
        "processed": job.get("processed"),
    }


@app.post("/api/rhino/process-input-folder", response_model=CreateJobResponse)
def process_input_folder():
    _ensure_dirs()

    job_id = uuid.uuid4().hex
    created_at = time.time()

    JOBS[job_id] = {
        "jobId": job_id,
        "status": "queued",
        "createdAt": created_at,
        "startedAt": None,
        "finishedAt": None,
        "inputName": None,
        "outputName": None,
        "error": None,
        "total": None,
        "processed": None,
    }

    def _work():
        _run_batch_job(job_id)

    future: Future = EXECUTOR.submit(_work)
    JOBS[job_id]["_future"] = future

    return {"ok": True, "jobId": job_id}


@app.get("/api/rhino/jobs/{job_id}/result")
def download_result(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job을 찾을 수 없습니다")

    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"아직 완료되지 않았습니다(status={job['status']})")

    result_path = job.get("resultPath")
    if not result_path or not Path(result_path).exists():
        raise HTTPException(status_code=500, detail="결과 파일이 없습니다")

    return FileResponse(
        path=result_path,
        media_type="application/sla",
        filename=job.get("outputName") or "result.stl",
    )


@app.post("/api/rhino/custom-abutment/explode")
async def custom_abutment_explode(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    _ensure_dirs()
    _prune_tmp(max_items=100)

    safe_name = _sanitize_filename(file.filename or "input.stl")
    token = uuid.uuid4().hex
    tmp_dir = APP_ROOT / ".tmp" / f"api_{token}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    input_path = tmp_dir / f"in_{safe_name}"
    output_path = tmp_dir / f"out_{_build_output_name(safe_name)}"

    data = await file.read()
    input_path.write_bytes(data)

    try:
        await _run_rhino_python_in_executor(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=DEFAULT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Rhino 실행 타임아웃")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="결과 STL이 생성되지 않았습니다")

    background_tasks.add_task(shutil.rmtree, tmp_dir)

    return FileResponse(
        path=str(output_path),
        media_type="application/sla",
        filename=_build_output_name(safe_name),
    )


@app.post("/api/rhino/fillhole/direct")
async def fillhole_direct(file: UploadFile = File(...)):
    """버퍼를 직접 받아 홀을 메우고 분석 결과를 반환 (Background Worker 전용)"""
    _ensure_dirs()
    _prune_tmp(max_items=100)

    safe_name = _sanitize_filename(file.filename or "input.stl")
    token = uuid.uuid4().hex
    tmp_dir = APP_ROOT / ".tmp" / f"direct_{token}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    input_path = tmp_dir / f"in_{safe_name}"
    output_path = tmp_dir / f"out_{_build_output_name(safe_name)}"

    data = await file.read()
    input_path.write_bytes(data)

    try:
        log_text = await _run_rhino_python(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=DEFAULT_TIMEOUT_SEC,
        )

        # 로그에서 직경 정보 추출 시도 (process_abutment_stl.py가 로그를 남긴다고 가정)
        # 만약 스크립트가 아직 직경 정보를 계산하지 않는다면, 스크립트 수정이 필요할 수 있음.
        # 일단은 로그 파싱 로직을 간단히 넣어둠.
        max_diameter = 0.0
        conn_diameter = 0.0
        
        # 로그 예시: "DIAMETER_RESULT:max=8.5 conn=4.2"
        match = re.search(r"DIAMETER_RESULT:max=([\d.]+) conn=([\d.]+)", log_text)
        if match:
            max_diameter = float(match.group(1))
            conn_diameter = float(match.group(2))

        import base64
        filled_base64 = ""
        if output_path.exists():
            filled_base64 = base64.b64encode(output_path.read_bytes()).decode("utf-8")

        return {
            "ok": True,
            "maxDiameter": max_diameter,
            "connectionDiameter": conn_diameter,
            "filledStlBase64": filled_base64,
            "log": log_text
        }
    except Exception as e:
        _log(f"direct fillhole failed: {e}")
        return {"ok": False, "error": str(e)}
    finally:
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass


class StoreFillHoleRequest(BaseModel):
    name: str


@app.post("/api/rhino/store/fillhole")
async def store_fillhole(req: StoreFillHoleRequest):
    _ensure_dirs()
    _prune_tmp(max_items=100)

    safe_name = _sanitize_filename(req.name or "input.stl")
    input_path = STORE_IN_DIR / safe_name
    if not input_path.exists() or not input_path.is_file():
        raise HTTPException(status_code=404, detail=f"input 파일을 찾을 수 없습니다: {safe_name}")

    token = uuid.uuid4().hex
    in_base = Path(safe_name).stem or "base"
    out_name = _sanitize_filename(f"{in_base}.filled.stl")
    output_path = STORE_OUT_DIR / out_name

    _log(f"job start: in={safe_name} out={out_name}")

    try:
        await _run_rhino_python_in_executor(
            input_stl=input_path,
            output_stl=output_path,
            timeout_sec=DEFAULT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Rhino 실행 타임아웃")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="결과 STL이 생성되지 않았습니다")

    _log(f"job latest: wrote {out_name}")
    return FileResponse(
        path=output_path,
        filename=out_name,
        media_type="application/sla",
        headers={"Cache-Control": "no-store"}
    )
