import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RHINO_STORE_IN_DIR = resolve(__dirname, "../../../rhino/Stl-Stores/in");
const RHINO_COMPUTE_BASE_URL = String(
  process.env.RHINO_COMPUTE_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// [추가] 과도한 병렬 요청 방지를 위한 세마포어/큐 관리
const MAX_CONCURRENT_FILLHOLE = 1; // Rhino가 1대이므로 1개씩 순차 처리
let activeRequests = 0;
const requestQueue = [];

const processQueue = async () => {
  if (activeRequests >= MAX_CONCURRENT_FILLHOLE || requestQueue.length === 0)
    return;

  const { resolve: qResolve, reject: qReject, task } = requestQueue.shift();
  activeRequests++;

  try {
    const result = await task();
    qResolve(result);
  } catch (err) {
    qReject(err);
  } finally {
    activeRequests--;
    processQueue();
  }
};

const enqueueTask = (task) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, task });
    processQueue();
  });
};

const sanitizeStlName = (name) => {
  const base =
    String(name || "input.stl")
      .split(/[\\/]/)
      .pop() || "input.stl";
  const cleaned = base.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
  return cleaned.toLowerCase().endsWith(".stl") ? cleaned : `${cleaned}.stl`;
};

export const fillholeFromUpload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new ApiError(400, "file is required");
  }

  const originalName =
    typeof file.originalname === "string" ? file.originalname : "input.stl";
  let safeName;
  try {
    safeName = sanitizeStlName(originalName.normalize("NFC"));
  } catch {
    safeName = sanitizeStlName(originalName);
  }

  fs.mkdirSync(RHINO_STORE_IN_DIR, { recursive: true });
  const inPath = resolve(RHINO_STORE_IN_DIR, safeName);

  const buf = file.buffer;
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new ApiError(400, "empty file");
  }

  fs.writeFileSync(inPath, buf);

  // [변경] Rhino Compute 서버로의 요청을 큐에 넣어 순차 처리하도록 보장
  const resp = await enqueueTask(() =>
    axios.post(
      `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
      { name: safeName },
      { responseType: "arraybuffer", timeout: 1000 * 60 * 5 }
    )
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});

export const fillholeFromStoreName = asyncHandler(async (req, res) => {
  const rawName = req.body?.name;
  if (!rawName) {
    throw new ApiError(400, "name is required");
  }

  const safeName = sanitizeStlName(String(rawName));

  // [변경] Rhino Compute 서버로의 요청을 큐에 넣어 순차 처리하도록 보장
  const resp = await enqueueTask(() =>
    axios.post(
      `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
      { name: safeName },
      { responseType: "arraybuffer", timeout: 1000 * 60 * 5 }
    )
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});
