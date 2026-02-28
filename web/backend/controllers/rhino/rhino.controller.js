import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import Request from "../../models/request.model.js";
import { getObjectBufferFromS3 } from "../../utils/s3.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RHINO_STORE_IN_DIR = resolve(__dirname, "../../../rhino/Stl-Stores/in");
const RHINO_COMPUTE_BASE_URL = String(
  process.env.RHINO_COMPUTE_BASE_URL || "http://127.0.0.1:8000",
).replace(/\/+$/, "");
const RHINO_SERVER_UPLOAD_BASE_URL = String(
  process.env.RHINO_SERVER_URL || RHINO_COMPUTE_BASE_URL,
).replace(/\/+$/, "");

const RHINO_SHARED_SECRET = String(
  process.env.BRIDGE_SHARED_SECRET || "",
).trim();

const rhinoAuthHeaders = () => {
  if (!RHINO_SHARED_SECRET) return {};
  return { "X-Bridge-Secret": RHINO_SHARED_SECRET };
};

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

const uploadBufferToRhino = async (buffer, fileName) => {
  if (!buffer || buffer.length === 0) return false;
  try {
    const formData = new FormData();
    formData.append("file", buffer, { filename: fileName });

    const resp = await axios.post(
      `${RHINO_SERVER_UPLOAD_BASE_URL}/api/rhino/upload-stl`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          ...rhinoAuthHeaders(),
        },
        timeout: 1000 * 30,
      },
    );
    return resp?.data?.ok === true;
  } catch (error) {
    console.error(
      "[Rhino] uploadBufferToRhino failed",
      error?.message || error,
    );
    return false;
  }
};

const ensureStlOnRhinoStore = async (safeName) => {
  try {
    const targetPath = resolve(RHINO_STORE_IN_DIR, safeName);
    if (fs.existsSync(targetPath)) return true;

    const request = await Request.findOne({
      $or: [
        { "caseInfos.file.filePath": safeName },
        { "caseInfos.file.originalName": safeName },
        { "caseInfos.file.fileName": safeName },
      ],
    })
      .select("caseInfos.file.s3Key")
      .lean();

    const s3Key = request?.caseInfos?.file?.s3Key;
    if (!s3Key) {
      console.warn(`[Rhino] Unable to locate STL in DB for ${safeName}`);
      return false;
    }

    const buffer = await getObjectBufferFromS3(s3Key);
    const uploaded = await uploadBufferToRhino(buffer, safeName);
    if (!uploaded) {
      console.warn(`[Rhino] Failed to re-upload STL to Rhino for ${safeName}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[Rhino] ensureStlOnRhinoStore error for ${safeName}`, error);
    return false;
  }
};

export const processFileByName = asyncHandler(async (req, res) => {
  const rawName = req.body?.filePath || req.body?.fileName || req.body?.name;
  if (!rawName) {
    throw new ApiError(400, "fileName is required");
  }

  const safeName = sanitizeStlName(String(rawName));
  const force = Boolean(req.body?.force);

  const ensured = await ensureStlOnRhinoStore(safeName);
  if (!ensured) {
    throw new ApiError(
      404,
      "원본 STL 파일을 찾을 수 없습니다. S3 업로드 상태를 확인해주세요.",
    );
  }

  const resp = await enqueueTask(() =>
    axios.post(
      `${RHINO_COMPUTE_BASE_URL}/api/rhino/process-file`,
      { filePath: safeName, fileName: safeName, force },
      {
        timeout: 1000 * 60 * 1,
        headers: rhinoAuthHeaders(),
      },
    ),
  );

  return res.status(200).json({
    success: true,
    data: resp.data,
  });
});

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
      {
        responseType: "arraybuffer",
        timeout: 1000 * 60 * 5,
        headers: rhinoAuthHeaders(),
      },
    ),
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
      {
        responseType: "arraybuffer",
        timeout: 1000 * 60 * 5,
        headers: rhinoAuthHeaders(),
      },
    ),
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});
