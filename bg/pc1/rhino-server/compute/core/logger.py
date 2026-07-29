# related files:
# - bg/pc1/rhino-server/rules.md
# - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py
# - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py
# - web/backend/controllers/bg/bg.controller.js
from datetime import datetime


def log(message: str) -> None:
    """Simple stdout logger used across the rhino worker."""
    try:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts}][rhino-pool] {message}", flush=True)
    except Exception:
        pass
