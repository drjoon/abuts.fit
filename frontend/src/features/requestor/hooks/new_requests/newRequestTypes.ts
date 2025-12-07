export type ClinicFavoriteImplant = {
  manufacturer: string;
  system: string;
  type: string;
};

export type ClinicPreset = {
  id: string;
  name: string;
  favorite?: ClinicFavoriteImplant;
};

export type AiFileInfo = {
  filename: string;
  clinicName: string;
  patientName: string;
  tooth: string;
  workType: string;
  abutType: string;
};

export type DraftFileMeta = {
  _id: string; // Draft 내 파일 ID
  fileId?: string; // 기존 File 도큐먼트 ID
  originalName: string;
  size: number;
  mimetype: string;
  s3Key?: string;
};
