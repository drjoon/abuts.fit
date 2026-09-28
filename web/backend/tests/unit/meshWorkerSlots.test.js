// related files:
// - web/backend/services/abutmentStl/workerSlots.js
// - web/backend/utils/screwHoleFill.service.js
import { afterAll, afterEach, describe, expect, it } from "@jest/globals";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pathToFileURL } from "url";
import {
  MeshWorkerQueueTimeoutError,
  MeshWorkerTimeoutError,
  acquireMeshWorkerSlot,
  getMeshWorkerSlotStats,
  runMeshWorker,
} from "../../services/abutmentStl/workerSlots.js";

const dir = mkdtempSync(path.join(tmpdir(), "mesh-worker-"));
const writeWorker = (name, body) => {
  const file = path.join(dir, name);
  writeFileSync(file, `import { parentPort, workerData } from "worker_threads";\n${body}\n`);
  return pathToFileURL(file);
};
const ECHO = writeWorker("echo.mjs", "setTimeout(() => parentPort.postMessage({ n: workerData.n }), workerData.delay || 0);");
const HANG = writeWorker("hang.mjs", "setInterval(() => {}, 1000);");
const EXIT = writeWorker("exit.mjs", "process.exit(3);");

const prevConcurrency = process.env.MESH_WORKER_CONCURRENCY;
afterEach(() => {
  if (prevConcurrency === undefined) delete process.env.MESH_WORKER_CONCURRENCY;
  else process.env.MESH_WORKER_CONCURRENCY = prevConcurrency;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const waitIdle = async () => {
  for (let i = 0; i < 100 && getMeshWorkerSlotStats().active > 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("mesh worker slots", () => {
  it("동시 개수를 넘지 않고 순서대로 처리한다", async () => {
    process.env.MESH_WORKER_CONCURRENCY = "1";
    let running = 0;
    let peak = 0;
    const jobs = [1, 2, 3].map((n) =>
      runMeshWorker(ECHO, {
        timeoutMs: 5000,
        buildWorkerData: () => {
          running += 1;
          peak = Math.max(peak, running);
          return { workerData: { n, delay: 50 } };
        },
      }).then((msg) => {
        running -= 1;
        return msg.n;
      }),
    );
    expect(await Promise.all(jobs)).toEqual([1, 2, 3]);
    expect(peak).toBe(1);
    await waitIdle();
    expect(getMeshWorkerSlotStats()).toEqual({ active: 0, waiting: 0 });
  });

  it("대기 한도를 넘으면 MeshWorkerQueueTimeoutError", async () => {
    process.env.MESH_WORKER_CONCURRENCY = "1";
    const release = await acquireMeshWorkerSlot();
    await expect(
      runMeshWorker(ECHO, { timeoutMs: 5000, queueTimeoutMs: 50, buildWorkerData: () => ({ workerData: { n: 1 } }) }),
    ).rejects.toBeInstanceOf(MeshWorkerQueueTimeoutError);
    release();
    expect(getMeshWorkerSlotStats()).toEqual({ active: 0, waiting: 0 });
  });

  it("실행 timeout이면 terminate하고 슬롯을 돌려준다", async () => {
    await expect(
      runMeshWorker(HANG, { timeoutMs: 100, buildWorkerData: () => ({ workerData: {} }) }),
    ).rejects.toBeInstanceOf(MeshWorkerTimeoutError);
    await waitIdle();
    expect(getMeshWorkerSlotStats().active).toBe(0);
  });

  it("결과 없이 exit하면 reject", async () => {
    await expect(
      runMeshWorker(EXIT, { timeoutMs: 5000, buildWorkerData: () => ({ workerData: {} }) }),
    ).rejects.toThrow(/exited \(code 3\)/);
    await waitIdle();
    expect(getMeshWorkerSlotStats().active).toBe(0);
  });
});
