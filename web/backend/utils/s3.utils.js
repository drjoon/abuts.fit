// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/files/file.controller.js
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl as presignV3 } from "@aws-sdk/s3-request-presigner";
import multer from "multer";
import { extname } from "path";
import { randomBytes } from "crypto";
import { createGunzip, gunzipSync } from "zlib";
import { PassThrough } from "stream";
import { shouldBlockExternalCall } from "./rateGuard.js";

const getBucket = () => process.env.AWS_S3_BUCKET_NAME || "abuts-fit";

const normalizeContentEncoding = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw === "gzip" ? "gzip" : "";
};

let _s3Client = null;

const getS3Client = () => {
  if (_s3Client) return _s3Client;

  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || "",
  ).trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || "").trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "S3 업로드 설정(AWS 자격증명)이 불완전합니다. AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY를 둘 다 설정하거나, 둘 다 제거한 뒤 AWS_PROFILE(~/.aws/credentials)을 사용해주세요.",
    );
  }

  const resolvedCredentials =
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {}),
        }
      : undefined;

  _s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-northeast-2",
    ...(resolvedCredentials ? { credentials: resolvedCredentials } : {}),
  });

  return _s3Client;
};

const fileFilter = (req, file, cb) => {
  const allowedFileTypes = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".stl",
    ".ply",
    ".obj",
    ".fbx",
    ".3ds",
    ".blend",
    ".zip",
    ".rar",
    ".7z",
  ];
  const ext = extname(file.originalname).toLowerCase();
  if (allowedFileTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

// presigned PUT URL 생성 (백그라운드 앱이 직접 업로드하도록)
export const getPresignedPutUrl = async (
  key,
  contentType = "application/octet-stream",
  expiresIn = 3600,
) => {
  const Bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  const command = new PutObjectCommand({
    Bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await presignV3(getS3Client(), command, { expiresIn });
  return { url, key, bucket: Bucket };
};

// presigned GET URL 생성 (브리지/프론트가 직접 다운로드하도록)
export const getPresignedGetUrl = async (key, expiresIn = 3600) => {
  const Bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  const command = new GetObjectCommand({
    Bucket,
    Key: key,
  });
  const url = await presignV3(getS3Client(), command, { expiresIn });
  return { url, key, bucket: Bucket };
};

const getFileType = (filename) => {
  const ext = extname(filename).toLowerCase();
  const imageTypes = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];
  const documentTypes = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
  ];
  const modelTypes = [".stl", ".ply", ".obj", ".fbx", ".3ds", ".blend"];
  if (imageTypes.includes(ext)) return "image";
  if (documentTypes.includes(ext)) return "document";
  if (modelTypes.includes(ext)) return "3d_model";
  return "other";
};

const s3Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter,
});

const streamToBuffer = async (stream) => {
  if (!stream) return Buffer.from("");
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const getObjectBufferFromS3 = async (key) => {
  const guardKey = `s3-getObject:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getObjectBufferFromS3: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 파일 조회가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const resp = await getS3Client().send(command);
  const body = resp?.Body;
  let buffer = await streamToBuffer(body);
  if (normalizeContentEncoding(resp?.ContentEncoding) === "gzip") {
    buffer = gunzipSync(buffer);
  }
  return buffer;
};

export const getObjectStreamFromS3 = async (key) => {
  const guardKey = `s3-getObject:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getObjectStreamFromS3: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 파일 조회가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const resp = await getS3Client().send(command);
  const contentEncoding = normalizeContentEncoding(resp?.ContentEncoding);
  const rawBody = resp?.Body || null;
  let body = rawBody;
  let contentLength = Number(resp?.ContentLength || 0);

  // gzip으로 올린 3D 모델은 다운로드 시 원본 바이트로 풀어 CAD 호환을 유지한다.
  if (rawBody && contentEncoding === "gzip") {
    const gunzip = createGunzip();
    const pass = new PassThrough();
    rawBody.pipe(gunzip).pipe(pass);
    body = pass;
    contentLength = 0;
  }

  return {
    body,
    contentType: String(resp?.ContentType || "application/octet-stream"),
    contentLength,
    contentEncoding,
    eTag: String(resp?.ETag || "").trim(),
    lastModified: resp?.LastModified || null,
  };
};

export const objectExistsInS3 = async (key) => {
  const guardKey = `s3-headObject:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] objectExistsInS3: rate guard blocked", { key, count });
    return false;
  }

  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
        Key: key,
      }),
    );
    return true;
  } catch (e) {
    const code = String(e?.Code || e?.name || "").trim();
    if (code === "NotFound" || code === "NoSuchKey") return false;
    return false;
  }
};

// S3 직접 업로드 함수 (컨트롤러에서 호출)
export const uploadFileToS3 = async (fileBuffer, key, contentType) => {
  const guardKey = `s3-upload:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] uploadFileToS3: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 업로드가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }
  const Bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  const params = {
    Bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    // ACL: "public-read",
  };
  try {
    const upload = new Upload({ client: getS3Client(), params });
    const result = await upload.done();
    return { key, location: result.Location };
  } catch (error) {
    const msg = String(error?.message || "");
    if (
      msg.toLowerCase().includes("could not load credentials") ||
      msg.toLowerCase().includes("missing credentials")
    ) {
      throw new Error(
        "S3 업로드 설정(AWS 자격증명)을 찾을 수 없습니다. backend/local.env에 AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY를 설정하거나, 로컬 AWS 프로파일(~/.aws/credentials)을 설정해주세요.",
      );
    }
    if (msg.includes("Resolved credential object is not valid")) {
      throw new Error(
        "S3 업로드 설정(AWS 자격증명)이 올바르지 않습니다. AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY 또는 로컬 AWS 프로파일 설정을 확인해주세요.",
      );
    }
    // 버킷이 존재하지 않을 경우 자동 생성 후 재시도
    if (error.Code === "NoSuchBucket") {
      const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
      try {
        await getS3Client().send(new CreateBucketCommand({ Bucket }));
        // 버킷 생성 후 재시도
        const upload = new Upload({ client: getS3Client(), params });
        const result = await upload.done();
        return { key, location: result.Location };
      } catch (createErr) {
        throw createErr;
      }
    }
    throw error;
  }
};

const deleteFileFromS3 = async (key, bucketOverride) => {
  const guardKey = `s3-delete:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] deleteFileFromS3: rate guard blocked", {
      key,
      count,
    });
    return false;
  }
  try {
    const Bucket =
      bucketOverride || process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket,
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    console.error("S3 파일 삭제 오류:", error);
    return false;
  }
};

// 다운로드용 서명 URL (기존 명칭 충돌 방지 위해 download 전용으로 명확히)
const getDownloadSignedUrl = async (
  key,
  expires = 3600,
  { responseDisposition, responseContentType } = {},
) => {
  const guardKey = `s3-signedUrl:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getSignedUrl: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 다운로드 URL 생성이 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
    Key: key,
    ...(responseDisposition
      ? { ResponseContentDisposition: responseDisposition }
      : {}),
    ...(responseContentType
      ? { ResponseContentType: responseContentType }
      : {}),
  });
  const { getSignedUrl: getSignedUrlV3 } =
    await import("@aws-sdk/s3-request-presigner");
  return getSignedUrlV3(getS3Client(), command, { expiresIn: expires });
};

const getUploadSignedUrl = async (
  key,
  contentType,
  expires = 900,
  { contentEncoding } = {},
) => {
  const guardKey = `s3-uploadSignedUrl:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getUploadSignedUrl: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 업로드 URL 생성이 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const encoding = normalizeContentEncoding(contentEncoding);
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: String(contentType || "application/octet-stream"),
    ...(encoding ? { ContentEncoding: encoding } : {}),
  });
  const { getSignedUrl: getSignedUrlV3 } =
    await import("@aws-sdk/s3-request-presigner");
  return getSignedUrlV3(getS3Client(), command, { expiresIn: expires });
};

const createMultipartUpload = async (
  key,
  contentType,
  { contentEncoding } = {},
) => {
  const encoding = normalizeContentEncoding(contentEncoding);
  const resp = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: String(contentType || "application/octet-stream"),
      ...(encoding ? { ContentEncoding: encoding } : {}),
    }),
  );
  const uploadId = String(resp?.UploadId || "").trim();
  if (!uploadId) {
    throw new Error("S3 multipart uploadId 생성에 실패했습니다.");
  }
  return { uploadId };
};

const getUploadPartSignedUrl = async (
  key,
  uploadId,
  partNumber,
  expires = 900,
) => {
  const part = Math.floor(Number(partNumber) || 0);
  if (!Number.isFinite(part) || part < 1) {
    throw new Error("S3 multipart partNumber가 올바르지 않습니다.");
  }

  const guardKey = `s3-uploadPartSignedUrl:${key}:${part}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getUploadPartSignedUrl: rate guard blocked", {
      key,
      part,
      count,
    });
    throw new Error(
      "S3 파트 업로드 URL 생성이 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const command = new UploadPartCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: String(uploadId || "").trim(),
    PartNumber: part,
  });
  const { getSignedUrl: getSignedUrlV3 } =
    await import("@aws-sdk/s3-request-presigner");
  return getSignedUrlV3(getS3Client(), command, { expiresIn: expires });
};

const completeMultipartUpload = async (key, uploadId, parts) => {
  const normalizedParts = (Array.isArray(parts) ? parts : [])
    .map((row) => ({
      ETag: String(row?.ETag || row?.etag || "").trim(),
      PartNumber: Math.floor(Number(row?.PartNumber || row?.partNumber || 0)),
    }))
    .filter((row) => row.ETag && row.PartNumber >= 1)
    .sort((a, b) => a.PartNumber - b.PartNumber);

  if (!normalizedParts.length) {
    throw new Error("S3 multipart 완료에 필요한 파트 정보가 없습니다.");
  }

  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: String(uploadId || "").trim(),
      MultipartUpload: { Parts: normalizedParts },
    }),
  );
  return true;
};

const abortMultipartUpload = async (key, uploadId) => {
  try {
    await getS3Client().send(
      new AbortMultipartUploadCommand({
        Bucket: getBucket(),
        Key: key,
        UploadId: String(uploadId || "").trim(),
      }),
    );
    return true;
  } catch (error) {
    console.error("S3 multipart abort 오류:", error);
    return false;
  }
};

export { s3Upload };
export { deleteFileFromS3 };

export default {
  s3Upload,
  uploadFileToS3,
  getObjectBufferFromS3,
  getObjectStreamFromS3,
  objectExistsInS3,
  deleteFileFromS3,
  getDownloadSignedUrl,
  getSignedUrl: getDownloadSignedUrl,
  getUploadSignedUrl,
  createMultipartUpload,
  getUploadPartSignedUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  getFileType,
};

export { getUploadSignedUrl };
export {
  createMultipartUpload,
  getUploadPartSignedUrl,
  completeMultipartUpload,
  abortMultipartUpload,
};

export { getDownloadSignedUrl as getSignedUrl };
