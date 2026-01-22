import json
import subprocess
import time
from contextlib import asynccontextmanager
from typing import Optional, Iterable

from . import settings
from . import state
from .logger import log


def list_rhino_pipe_ids(rhinocode: str) -> list[str]:
    try:
        listed = subprocess.run(
            [rhinocode, "list", "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=settings.dotnet_rollforward_env(),
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


def ping_rhino_instance(rhinocode: str, rhino_id: str) -> bool:
    try:
        completed = subprocess.run(
            [rhinocode, "list"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=settings.dotnet_rollforward_env(),
            timeout=10,
        )
        return rhino_id in completed.stdout
    except subprocess.TimeoutExpired:
        log(f"ping timeout: pipeId={rhino_id}, assuming busy but alive")
        return True
    except Exception as e:
        log(f"ping exception: pipeId={rhino_id} err={e}")
        return False


def refresh_rhino_pool(rhinocode: str) -> None:
    now = time.time()
    if state.rhino_all and (now - state.rhino_last_expand_ts < 10.0):
        return

    existing = set(list_rhino_pipe_ids(rhinocode))
    if not existing:
        return

    with state.rhino_pool_lock:
        state.rhino_last_expand_ts = now
        for pid in existing:
            if pid not in state.rhino_all:
                state.rhino_all.add(pid)
                state.rhino_available.append(pid)
                log(
                    f"discovered pipeId={pid} (all={len(state.rhino_all)}, avail={len(state.rhino_available)})"
                )

        to_remove = state.rhino_all - existing
        for pid in to_remove:
            state.rhino_all.discard(pid)
            if pid in state.rhino_available:
                state.rhino_available.remove(pid)
            log(f"removed inactive pipeId={pid}")


def ensure_rhino_pool() -> None:
    rhinocode = settings.get_rhinocode_bin()
    if not rhinocode:
        return
    refresh_rhino_pool(rhinocode)


@asynccontextmanager
async def acquire_rhino_id(timeout_sec: float = 60.0) -> Iterable[str]:
    ensure_rhino_pool()
    rhinocode = settings.get_rhinocode_bin()
    start = time.time()
    rid: Optional[str] = None

    while True:
        with state.rhino_pool_cond:
            while not state.rhino_available:
                if time.time() - start > timeout_sec:
                    raise RuntimeError(
                        "사용 가능한 Rhino 인스턴스가 없습니다. Rhino를 실행한 뒤 다시 시도하세요."
                    )
                state.rhino_pool_cond.wait(timeout=0.5)

            rid = state.rhino_available.popleft()

        now = time.time()
        should_ping = (now - state.last_ping_success_ts) > 30.0

        if not should_ping or (
            rhinocode and rid and ping_rhino_instance(rhinocode, rid)
        ):
            if should_ping:
                state.last_ping_success_ts = now
            log(
                f"acquire: pipeId={rid} (avail={len(state.rhino_available)}/{len(state.rhino_all)})"
            )
            break

        with state.rhino_pool_cond:
            if rid in state.rhino_all:
                state.rhino_all.discard(rid)
            state.rhino_pool_cond.notify_all()

    try:
        yield rid
    finally:
        with state.rhino_pool_cond:
            state.rhino_available.append(rid)
            state.rhino_pool_cond.notify_all()
            log(
                f"release: pipeId={rid} (avail={len(state.rhino_available)}/{len(state.rhino_all)})"
            )
