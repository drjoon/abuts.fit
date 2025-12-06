import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import multer from "multer";
import { extname } from "path";
import { randomBytes } from "crypto";
import { shouldBlockExternalCall } from "./rateGuard.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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
    const upload = new Upload({ client: s3Client, params });
    const result = await upload.done();
    return { key, location: result.Location };
  } catch (error) {
    // 버킷이 존재하지 않을 경우 자동 생성 후 재시도
    if (error.Code === "NoSuchBucket") {
      const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket }));
        // 버킷 생성 후 재시도
        const upload = new Upload({ client: s3Client, params });
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
    await s3Client.send(
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
  return getSignedUrlV3(s3Client, command, { expiresIn: expires });
};

export { s3Upload };

export default {
  s3Upload,
  uploadFileToS3,
  deleteFileFromS3,
  getSignedUrl,
  getFileType,
};
