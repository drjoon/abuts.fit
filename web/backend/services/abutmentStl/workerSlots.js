// related files:
// - web/backend/services/abutmentStl/cuffBlend.service.js
// - web/backend/services/abutmentStl/runPipelineInWorker.js
// - web/backend/utils/screwHoleFill.service.js
//
// 무거운 메시 worker(커프 보정·나사홀 채움·abutment STL 파이프라인)는 한 프로세스에서 슬롯을 나눠 쓴다.
// 동시 개수 MESH_WORKER_CONCURRENCY(기본 2 — shadow 파이프라인 1건이 register-file 커프 보정을 막지 않게), worker 힙 MESH_WORKER_MAX_OLD_GENERATION_MB(기본 1024).
// 실행 timeout은 슬롯을 얻고 worker를 띄운 시점부터 센다. 대기 한도는 queueTimeoutMs로 따로 준다.
import { Worker } from "worker_threads";

const readPositiveInt = (value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const getMeshWorkerConcurrency = () => readPositiveInt(process.env.MESH_WORKER_CONCURRENCY, 2);

export const getMeshWorkerResourceLimits = () => ({
  maxOldGenerationSizeMb: readPositiveInt(process.env.MESH_WORKER_MAX_OLD_GENERATION_MB, 1024),
});

export class MeshWorkerQueueTimeoutError extends Error {
  constructor(label, waitMs) {
    super(`${label} 대기 시간 초과(${waitMs}ms, 메시 worker 슬롯 없음)`);
    this.name = "MeshWorkerQueueTimeoutError";
    this.code = "MESH_WORKER_QUEUE_TIMEOUT";
  }
}

export class MeshWorkerTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} timeout ${timeoutMs}ms`);
    this.name = "MeshWorkerTimeoutError";
    this.code = "MESH_WORKER_TIMEOUT";
  }
}

let active = 0;
const waiters = [];

const makeRelease = () => {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(makeRelease());
      return;
    }
    active = Math.max(0, active - 1);
  };
};

/** @returns {Promise<() => void>} release */
export function acquireMeshWorkerSlot({ queueTimeoutMs = 0, label = "mesh-worker" } = {}) {
  if (active < getMeshWorkerConcurrency()) {
    active += 1;
    return Promise.resolve(makeRelease());
  }
  return new Promise((resolve, reject) => {
    const waiter = { resolve, timer: null };
    if (queueTimeoutMs > 0) {
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new MeshWorkerQueueTimeoutError(label, queueTimeoutMs));
      }, queueTimeoutMs);
    }
    waiters.push(waiter);
  });
}

export const getMeshWorkerSlotStats = () => ({ active, waiting: waiters.length });

/**
 * 슬롯을 얻은 뒤 worker를 띄우고 첫 메시지를 돌려준다.
 * buildWorkerData는 슬롯을 얻은 뒤 부른다(대기 중에 입력 사본을 들고 있지 않게).
 * error·비정상 exit·timeout은 reject, worker는 항상 terminate하고 종료 뒤 슬롯을 반납한다.
 * @param {URL} workerUrl
 * @param {{ buildWorkerData: () => { workerData: any, transferList?: any[] }, timeoutMs: number, queueTimeoutMs?: number, label?: string }} opts
 */
export async function runMeshWorker(workerUrl, { buildWorkerData, timeoutMs, queueTimeoutMs = 0, label = "mesh-worker" }) {
  const release = await acquireMeshWorkerSlot({ queueTimeoutMs, label });
  let worker;
  try {
    const { workerData, transferList = [] } = buildWorkerData();
    worker = new Worker(workerUrl, {
      workerData,
      transferList,
      resourceLimits: getMeshWorkerResourceLimits(),
    });
  } catch (error) {
    release();
    throw error;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker
        .terminate()
        .catch(() => null)
        .finally(release);
      settle(value);
    };
    const timer = setTimeout(() => finish(reject, new MeshWorkerTimeoutError(label, timeoutMs)), timeoutMs);
    worker.once("message", (msg) => finish(resolve, msg));
    worker.once("error", (error) => finish(reject, error));
    worker.once("exit", (code) => {
      finish(reject, new Error(`${label} worker exited (code ${code}) without result`));
    });
  });
}
