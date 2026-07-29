// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// IndexedDB 기반 바이너리 파일 Blob 캐시 유틸리티
// key: fileId 또는 s3Key

export {
  getFileBlob,
  setFileBlob,
  getStlBlob,
  setStlBlob,
} from "./fileBlobCache";
