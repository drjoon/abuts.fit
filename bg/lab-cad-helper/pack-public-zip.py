#!/usr/bin/env python3
"""Pack lab-cad-helper into web/frontend/public download zip."""
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT.parent.parent / "web" / "frontend" / "public" / "downloads" / "lab-cad-helper"
ZIP_NAME = "AbutsCad연결_설치.zip"
FILES = [
    "여기를_더블클릭_설치.cmd",
    "run-hidden.vbs",
    "lab-cad-helper.ps1",
    "config.example.json",
    "읽어보세요.txt",
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / ZIP_NAME
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in FILES:
            src = ROOT / name
            if not src.is_file():
                raise SystemExit(f"missing: {src}")
            zf.write(src, arcname=name)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
