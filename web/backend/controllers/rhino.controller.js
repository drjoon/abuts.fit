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

  const resp = await axios.post(
    `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
    { name: safeName },
    { responseType: "arraybuffer", timeout: 1000 * 60 * 5 }
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

  const resp = await axios.post(
    `${RHINO_COMPUTE_BASE_URL}/api/rhino/store/fillhole`,
    { name: safeName },
    { responseType: "arraybuffer", timeout: 1000 * 60 * 5 }
  );

  const contentType = resp.headers?.["content-type"] || "application/sla";
  const disposition = resp.headers?.["content-disposition"];

  res.setHeader("Content-Type", contentType);
  if (disposition) {
    res.setHeader("Content-Disposition", disposition);
  }

  return res.status(200).send(Buffer.from(resp.data));
});
