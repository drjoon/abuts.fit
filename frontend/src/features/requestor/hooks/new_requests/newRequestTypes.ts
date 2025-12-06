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
