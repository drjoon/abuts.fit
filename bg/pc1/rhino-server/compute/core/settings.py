import os
import re
import shutil
import mimetypes
from pathlib import Path

from dotenv import load_dotenv


APP_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=APP_ROOT / "local.env", override=False)

SCRIPT_DIR = APP_ROOT / "scripts"
_env_storage_root = os.getenv("BG_STORAGE_ROOT", "").strip()
if _env_storage_root:
    BG_STORAGE_ROOT = Path(_env_storage_root)
else:
    BG_STORAGE_ROOT = APP_ROOT.parent.parent / "storage"

STORE_IN_DIR = BG_STORAGE_ROOT / "1-stl"
STORE_OUT_DIR = BG_STORAGE_ROOT / "2-filled"
TMP_DIR = APP_ROOT / ".tmp"

DEFAULT_TIMEOUT_SEC = int(os.getenv("RHINO_TIMEOUT_SEC", "180"))
OUTPUT_WAIT_TIMEOUT_SEC = float(os.getenv("ABUTS_OUTPUT_WAIT_SEC", "5"))
OUTPUT_WAIT_POLL_SEC = float(os.getenv("ABUTS_OUTPUT_WAIT_POLL_SEC", "0.2"))
DEFAULT_RHINOCODE_MAC = Path(
    "/Applications/Rhino 8.app/Contents/Resources/bin/rhinocode"
)
MAX_RHINO_CONCURRENCY = 1

JOB_CALLBACK_URL = os.getenv(
    "RHINO_JOB_CALLBACK_URL",
    "http://127.0.0.1:8000/api/rhino/internal/job-callback",
)


def ensure_dirs() -> None:
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    STORE_IN_DIR.mkdir(parents=True, exist_ok=True)
    STORE_OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)


def prune_tmp(max_items: int = 100) -> None:
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


def purge_old_storage(days: int = 15) -> None:
    try:
        import time

        threshold = time.time() - (abs(int(days)) * 86400)
    except Exception:
        threshold = None

    if threshold is None:
        return

    def _purge_dir(root: Path) -> None:
        try:
            if not root.exists():
                return
            for p in root.rglob("*"):
                try:
                    if not p.is_file():
                        continue
                    st = p.stat()
                    if st.st_mtime < threshold:
                        p.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception:
            return

    try:
        _purge_dir(STORE_IN_DIR)
        _purge_dir(STORE_OUT_DIR)
    except Exception:
        pass


def guess_content_type(path: Path) -> str:
    ct, _ = mimetypes.guess_type(str(path))
    return ct or "application/octet-stream"


def build_s3_url(bucket: str, key: str) -> str:
    bucket = bucket.strip()
    if not bucket:
        return ""
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def extract_request_id_from_name(name: str):
    try:
        base = Path(name).name
        m = re.search(r"(\d{8}-[A-Za-z0-9]{4,})", base)
        if m:
            rid = m.group(1)
            return rid if rid else None

        head = base.split(".", 1)[0]
        return head if head else None
    except Exception:
        return None


def sanitize_filename(name: str) -> str:
    base = Path(name).name
    base = re.sub(r"[^a-zA-Z0-9._\-가-힣]", "_", base)
    if not base.lower().endswith(".stl"):
        base = base + ".stl"
    return base


def build_output_name(input_name: str) -> str:
    p = Path(input_name)
    return f"{p.stem}.cam{p.suffix}"


def is_force_fill_mode() -> bool:
    return os.getenv("ABUTS_FORCE_FILL_ALL", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def get_rhinocode_bin() -> str:
    rhinocode = os.getenv("RHINOCODE_BIN", "").strip().strip('"')
    if not rhinocode:
        # Common Windows paths
        win_paths = [
            r"C:\Program Files\Rhino 8\System\RhinoCode.exe",
            r"C:\Program Files\Rhino 7\System\RhinoCode.exe",
        ]
        for p in win_paths:
            if os.path.exists(p):
                rhinocode = p
                break
    
    if not rhinocode:
        rhinocode = shutil.which("RhinoCode.exe") or shutil.which("rhinocode") or ""
        
    if not rhinocode and DEFAULT_RHINOCODE_MAC.exists():
        rhinocode = str(DEFAULT_RHINOCODE_MAC)
    return rhinocode


def dotnet_rollforward_env() -> dict:
    env = os.environ.copy()
    env.setdefault("DOTNET_ROLL_FORWARD", "Major")
    env.setdefault("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
    return env


def bridge_headers() -> dict:
    headers = {}
    secret = os.getenv("BRIDGE_SHARED_SECRET", "").strip()
    if secret:
        headers["X-Bridge-Secret"] = secret
    return headers
