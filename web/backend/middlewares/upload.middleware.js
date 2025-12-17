import multer from "multer";
import path from "path";
import fs from "fs";

// uploads 디렉토리가 없으면 생성
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // uploads 폴더에 저장
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${Date.now()}${ext}`);
  },
});

// 파일 필터 (이미지, PDF, 문서 파일 허용)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // 이미지
    "image/jpeg", "image/png", "image/gif", "image/svg+xml", "image/webp",
    // PDF
    "application/pdf",
    // 문서
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "application/zip"
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("허용되지 않는 파일 형식입니다."), false);
  }
};

// 용량 제한 (10MB)
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
};

// 기본 multer 인스턴스
const multerInstance = multer({ storage, fileFilter, limits });

// 단일 파일 및 다중 파일 업로드 모두 지원
export const upload = {
  single: multerInstance.single("file"),
  array: multerInstance.array("files"),
  fields: multerInstance.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 10 }
  ])
};
