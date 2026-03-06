import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export type FilePreviewInfo = {
  originalName: string;
  url: string;
};

export type PreviewFiles = {
  original?: File | null;
  cam?: File | null;
  title?: string;
  request?: ManufacturerRequest | null;
};

export type PackingCaptureStageFile = {
  fileName?: string;
  fileType?: string | null;
  fileSize?: number | null;
  filePath?: string;
  s3Key?: string;
  s3Url?: string;
  source?: "manual" | "worker";
  uploadedAt?: string | Date | null;
};
