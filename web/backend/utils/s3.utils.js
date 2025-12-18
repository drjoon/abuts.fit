import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import multer from "multer";
import { extname } from "path";
import { randomBytes } from "crypto";
import { shouldBlockExternalCall } from "./rateGuard.js";

let _s3Client = null;

const getS3Client = () => {
  if (_s3Client) return _s3Client;

  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || ""
  ).trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || "").trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "S3 업로드 설정(AWS 자격증명)이 불완전합니다. AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY를 둘 다 설정하거나, 둘 다 제거한 뒤 AWS_PROFILE(~/.aws/credentials)을 사용해주세요."
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
    cb(new Error("지원하지 않는 파일 형식입니다."), false);
  }
};

const getFileType = (filename) => {
  const ext = extname(filename).toLowerCase();
  const imageTypes = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg"];
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
  const modelTypes = [".stl", ".obj", ".fbx", ".3ds", ".blend"];
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
      "S3 파일 조회가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요."
    );
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
    Key: key,
  });

  const resp = await getS3Client().send(command);
  const body = resp?.Body;
  const buffer = await streamToBuffer(body);
  return buffer;
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
      })
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
      "S3 업로드가 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요."
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
        "S3 업로드 설정(AWS 자격증명)을 찾을 수 없습니다. backend/local.env에 AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY를 설정하거나, 로컬 AWS 프로파일(~/.aws/credentials)을 설정해주세요."
      );
    }
    if (msg.includes("Resolved credential object is not valid")) {
      throw new Error(
        "S3 업로드 설정(AWS 자격증명)이 올바르지 않습니다. AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY 또는 로컬 AWS 프로파일 설정을 확인해주세요."
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

const deleteFileFromS3 = async (key) => {
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
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
        Key: key,
      })
    );
    return true;
  } catch (error) {
    console.error("S3 파일 삭제 오류:", error);
    return false;
  }
};

const getSignedUrl = async (key, expires = 3600) => {
  const guardKey = `s3-signedUrl:${key}`;
  const { blocked, count } = shouldBlockExternalCall(guardKey);
  if (blocked) {
    console.error("[S3] getSignedUrl: rate guard blocked", {
      key,
      count,
    });
    throw new Error(
      "S3 다운로드 URL 생성이 짧은 시간에 과도하게 호출되어 잠시 차단되었습니다. 잠시 후 다시 시도해주세요."
    );
  }
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
    Key: key,
  });
  const { getSignedUrl: getSignedUrlV3 } = await import(
    "@aws-sdk/s3-request-presigner"
  );
  return getSignedUrlV3(getS3Client(), command, { expiresIn: expires });
};

export { s3Upload };

export default {
  s3Upload,
  uploadFileToS3,
  getObjectBufferFromS3,
  objectExistsInS3,
  deleteFileFromS3,
  getSignedUrl,
  getFileType,
};
