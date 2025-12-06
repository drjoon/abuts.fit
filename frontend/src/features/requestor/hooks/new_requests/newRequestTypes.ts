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
