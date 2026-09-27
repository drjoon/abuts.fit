#!/usr/bin/env python3
"""Pack lab-cad-helper (Windows + macOS) into web/frontend/public download zips.

- Windows: .ps1 → UTF-8 BOM (PowerShell 5.1), .cmd/.vbs/.ps1/.txt → CRLF.
- macOS: mac/build.sh 결과(mac/dist/abuts-lab-helper) + .command, 실행 권한 유지.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT.parent.parent / "web" / "frontend" / "public" / "downloads" / "lab-cad-helper"
WIN_ZIP = "AbutsCad연결_설치.zip"
MAC_ZIP = "AbutsCad연결_설치_Mac.zip"
WIN_FILES = [
    "여기를_더블클릭_설치.cmd",
    "install.ps1",
    "lab-cad-helper.ps1",
    "run-hidden.vbs",
    "config.example.json",
    "읽어보세요.txt",
]
MAC_FILES = [
    ("mac/Abuts연결_설치.command", "Abuts연결_설치.command", True),
    ("mac/dist/abuts-lab-helper", "abuts-lab-helper", True),
    ("mac/읽어보세요.txt", "읽어보세요.txt", False),
]
BOM = b"\xef\xbb\xbf"


def windows_bytes(name: str, raw: bytes) -> bytes:
    suffix = Path(name).suffix.lower()
    if suffix in {".cmd", ".vbs", ".ps1", ".txt"}:
        if raw.startswith(BOM):
            raw = raw[len(BOM):]
        text = raw.decode("utf-8").replace("\r\n", "\n").replace("\n", "\r\n")
        if suffix in {".cmd", ".vbs"} and not text.isascii():
            raise SystemExit(f"{name}: must be ASCII-only (cmd/wscript read the ANSI code page)")
        raw = text.encode("utf-8")
        if suffix in {".ps1", ".txt"}:
            raw = BOM + raw
    return raw


def add_file(zf: zipfile.ZipFile, arcname: str, data: bytes, executable: bool) -> None:
    info = zipfile.ZipInfo(arcname)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.flag_bits |= 0x800  # UTF-8 file names
    info.create_system = 3  # unix, so external_attr permissions apply
    mode = 0o755 if executable else 0o644
    info.external_attr = (0o100000 | mode) << 16
    zf.writestr(info, data)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    win_out = OUT_DIR / WIN_ZIP
    with zipfile.ZipFile(win_out, "w") as zf:
        for name in WIN_FILES:
            src = ROOT / name
            if not src.is_file():
                raise SystemExit(f"missing: {src}")
            add_file(zf, name, windows_bytes(name, src.read_bytes()), False)
    print(f"wrote {win_out} ({win_out.stat().st_size} bytes)")

    mac_out = OUT_DIR / MAC_ZIP
    with zipfile.ZipFile(mac_out, "w") as zf:
        for rel, arcname, executable in MAC_FILES:
            src = ROOT / rel
            if not src.is_file():
                raise SystemExit(f"missing: {src} (run mac/build.sh first)")
            add_file(zf, arcname, src.read_bytes(), executable)
    print(f"wrote {mac_out} ({mac_out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
