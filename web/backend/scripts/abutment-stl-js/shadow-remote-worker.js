// related files:
// - web/backend/controllers/bg/abutmentStlShadow.controller.js (/api/bg/abutment-stl-shadow/*)
// - bg/pc1/abutment-stl-shadow/shadow-worker.cmd
// - web/backend/scripts/abutment-stl-js/build-pc1-shadow-package.mjs
//
// PC1 섀도 워커. 백엔드만 호출한다(Atlas·AWS 자격증명 없음).
// 설정은 rhino-server와 같은 env(BACKEND_BASE, RHINO_SHARED_SECRET 또는 BRIDGE_SHARED_SECRET)를 쓴다.
//   ENV_FILE=<rhino-server\compute\local.env> node shadow-remote-worker.js
import "../../bootstrap/env.js";
import { evaluateAgainstRhinoInWorker } from "../../services/abutmentStl/runPipelineInWorker.js";

const IDLE_MS = Number(process.env.ABUTMENT_STL_SHADOW_IDLE_MS || 30 * 1000);
const ERROR_BACKOFF_MS = 60 * 1000;

function backendApiBase() {
  let base = String(process.env.BACKEND_BASE || process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("BACKEND_BASE가 필요합니다.");
  if (!base.toLowerCase().endsWith("/api")) base += "/api";
  return base;
}

function secretHeaders() {
  const secret = String(process.env.RHINO_SHARED_SECRET || process.env.BRIDGE_SHARED_SECRET || "").trim();
  if (!secret) throw new Error("RHINO_SHARED_SECRET 또는 BRIDGE_SHARED_SECRET이 필요합니다.");
  return { "X-Bridge-Secret": secret, "Content-Type": "application/json" };
}

const API = backendApiBase();
const HEADERS = secretHeaders();
const log = (...args) => console.log(`[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}] [shadow-remote]`, ...args);

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body || {}) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function runOnce() {
  const claimed = await postJson("/bg/abutment-stl-shadow/claim");
  const job = claimed?.data?.job;
  if (!job) return false;
  log(`claimed ${job.requestId} run=${job.runId}`);
  let payload;
  try {
    const [inputBuffer, rhinoFilledBuffer] = await Promise.all([
      download(job.downloads.original),
      download(job.downloads.rhinoFilled),
    ]);
    const record = await evaluateAgainstRhinoInWorker({
      inputBuffer,
      rhinoFilledBuffer,
      rhino: job.rhino,
      inputs: job.inputs,
      screwholeParams: job.screwholeParams,
    });
    let jsOutputS3Key = null;
    if (record.outputBuffer && job.upload?.url) {
      const put = await fetch(job.upload.url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: record.outputBuffer,
      });
      if (put.ok) jsOutputS3Key = job.upload.key;
      else log(`upload failed ${put.status}`);
    }
    delete record.outputBuffer;
    payload = { record, jsOutputS3Key };
    log(`done ${job.requestId} align=${record.align?.kind} finishLine=${record.finishLine?.kind} total=${record.js?.perf?.total}s`);
  } catch (error) {
    payload = { error: String(error?.message || error) };
    log(`failed ${job.requestId}: ${payload.error}`);
  }
  await postJson(`/bg/abutment-stl-shadow/${job.runId}/complete`, payload);
  return true;
}

log(`started api=${API}`);
while (true) {
  let wait = 0;
  try {
    if (!(await runOnce())) wait = IDLE_MS;
  } catch (error) {
    log(`error: ${error?.message || error}`);
    wait = ERROR_BACKOFF_MS;
  }
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}
