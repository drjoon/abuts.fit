import asyncio
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict

from . import settings


global_rhino_lock = asyncio.Lock()
processing_semaphore = asyncio.Semaphore(1)
main_loop: Optional[asyncio.AbstractEventLoop] = None

# FIFO STL 처리 큐 - 한 번에 하나씩 순차 처리
# 동시에 여러 재생성 요청이 와도 앞의 작업이 끝난 뒤 다음 작업을 시작한다.
stl_job_queue: asyncio.Queue = asyncio.Queue()

executor = ThreadPoolExecutor(max_workers=settings.MAX_RHINO_CONCURRENCY)

jobs: Dict[str, dict] = {}

rhino_pool_lock = threading.Lock()
rhino_pool_cond = threading.Condition(rhino_pool_lock)
rhino_all: set[str] = set()
rhino_available: deque[str] = deque()
rhino_last_expand_ts = 0.0

last_ping_success_ts = 0.0

in_flight: set[str] = set()
in_flight_lock = threading.Lock()

job_futures: Dict[str, asyncio.Future] = {}

is_running = True
recent_history = deque(maxlen=50)


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global main_loop
    main_loop = loop
