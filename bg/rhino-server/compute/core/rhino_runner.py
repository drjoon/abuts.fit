import asyncio
import os
import subprocess
import time
import traceback
import uuid
from pathlib import Path

from . import settings
from . import state
from .logger import log
from .rhino_pool import acquire_rhino_id
from .rhino_wrapper import write_wrapper_script


async def run_rhino_python(
    *,
    input_stl: Path,
    output_stl: Path,
    timeout_sec: float = settings.DEFAULT_TIMEOUT_SEC,
) -> tuple[str, dict | None]:
    rhinocode = settings.get_rhinocode_bin()
    if not rhinocode:
        raise RuntimeError("rhinocode(Rhino.Code CLI)를 찾을 수 없습니다.")

    token = uuid.uuid4().hex
    settings.TMP_DIR.mkdir(parents=True, exist_ok=True)

    env_log_path = os.getenv("ABUTS_LOG_PATH", "").strip()

    if env_log_path:
        log_path = Path(env_log_path)
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
    else:
        log_path = settings.TMP_DIR / f"log_{token}.txt"

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    state.job_futures[token] = future

    wrapper_path = write_wrapper_script(
        token=token, input_stl=input_stl, output_stl=output_stl, log_path=log_path
    )

    try:
        async with state.global_rhino_lock:
            start_time = time.time()
            rhino_id = None
            process = None
            process_task = None
            done = set()
            pending = set()

            try:
                async with acquire_rhino_id(timeout_sec=5.0) as rid:
                    rhino_id = rid

                    log(
                        f"run: pipeId={rhino_id} input={input_stl.name} out={output_stl.name}"
                    )

                    process = await asyncio.create_subprocess_exec(
                        rhinocode,
                        "--rhino",
                        str(rhino_id),
                        "script",
                        str(wrapper_path),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=settings.dotnet_rollforward_env(),
                    )

                    process_task = asyncio.create_task(process.communicate())
                    done, pending = await asyncio.wait(
                        [future, process_task],
                        timeout=timeout_sec,
                        return_when=asyncio.FIRST_COMPLETED,
                    )

            except Exception as e:
                log(
                    "no active Rhino instances found via RhinoCode list; running script without --rhino. "
                    + f"reason={e}"
                )

                process = await asyncio.create_subprocess_exec(
                    rhinocode,
                    "script",
                    str(wrapper_path),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=settings.dotnet_rollforward_env(),
                )

                process_task = asyncio.create_task(process.communicate())
                done, pending = await asyncio.wait(
                    [future, process_task],
                    timeout=timeout_sec,
                    return_when=asyncio.FIRST_COMPLETED,
                )

            if process_task is None:
                raise RuntimeError("RhinoCode 프로세스를 시작하지 못했습니다.")

            try:
                if future.done():
                    payload = future.result()
                elif process_task.done():
                    try:
                        wait_sec = min(60.0, float(timeout_sec))
                        payload = await asyncio.wait_for(future, timeout=wait_sec)
                    except asyncio.TimeoutError:
                        stdout, stderr = process_task.result()
                        rc = getattr(process, "returncode", None)
                        out_text = (
                            stdout.decode(errors="ignore").strip() if stdout else ""
                        )
                        err_text = (
                            stderr.decode(errors="ignore").strip() if stderr else ""
                        )
                        raise RuntimeError(
                            "RhinoCode 프로세스가 종료되었으나 결과(callback)를 받지 못했습니다.\n"
                            + f"waited={wait_sec}s returncode={rc}\n"
                            + f"stdout={out_text}\n"
                            + f"stderr={err_text}"
                        )
                else:
                    try:
                        process.kill()
                    except Exception:
                        pass
                    await process.wait()
                    raise RuntimeError(f"Rhino 스크립트 실행 타임아웃 ({timeout_sec}s)")
            finally:
                for p in pending:
                    p.cancel()

            if not payload:
                raise RuntimeError("Rhino 스크립트로부터 결과를 받지 못했습니다.")

            if not payload.get("ok"):
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
            if rhino_id:
                log(f"done: pipeId={rhino_id} elapsed={elapsed:.2f}s")
            else:
                log(f"done: no-pipe elapsed={elapsed:.2f}s")

            payload_log = str(payload.get("log") or "")
            payload_output = payload.get("output")
            file_log = ""
            try:
                if log_path.exists():
                    file_log = log_path.read_text(encoding="utf-8", errors="ignore")
            except Exception as e:
                log(f"log file read failed ({log_path}): {e}")

            if file_log:
                if payload_log:
                    payload_log = payload_log.rstrip() + "\n" + file_log
                else:
                    payload_log = file_log

            return payload_log, payload_output

    except Exception as e:
        log(f"run exception: {e}\n{traceback.format_exc()}")
        raise
    finally:
        state.job_futures.pop(token, None)
        try:
            if wrapper_path.exists():
                wrapper_path.unlink()
            if not env_log_path and log_path.exists():
                log_path.unlink()
        except Exception:
            pass
