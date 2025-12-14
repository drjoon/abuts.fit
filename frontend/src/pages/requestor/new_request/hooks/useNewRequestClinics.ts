import { useEffect, useState } from "react";
import {
  type ClinicFavoriteImplant,
  type ClinicPreset,
} from "./newRequestTypes";

export type UseNewRequestClinicsParams = {
  clinicStorageKey: string | null;
  implant: ClinicFavoriteImplant;
};

export const useNewRequestClinics = ({
  clinicStorageKey,
  implant,
}: UseNewRequestClinicsParams) => {
  const [clinicPresets, setClinicPresets] = useState<ClinicPreset[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!clinicStorageKey) return;

    try {
      const raw = window.localStorage.getItem(clinicStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);

      if (Array.isArray(saved?.clinicPresets)) {
        setClinicPresets(saved.clinicPresets);
      }
      if (
        typeof saved?.selectedClinicId === "string" ||
        saved?.selectedClinicId === null
      ) {
        setSelectedClinicId(saved.selectedClinicId);
      }
    } catch {}
  }, [clinicStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!clinicStorageKey) return;

    const payload = {
      clinicPresets,
      selectedClinicId,
    };

    try {
      window.localStorage.setItem(clinicStorageKey, JSON.stringify(payload));
    } catch {}
  }, [clinicStorageKey, clinicPresets, selectedClinicId]);

  useEffect(() => {
    if (!selectedClinicId) return;
    if (!implant.manufacturer || !implant.system || !implant.type) return;

    setClinicPresets((prev) => {
      const idx = prev.findIndex((c) => c.id === selectedClinicId);
      if (idx === -1) return prev;

      const target = prev[idx];
      const prevFav = target.favorite;

      if (
        prevFav &&
        prevFav.manufacturer === implant.manufacturer &&
        prevFav.system === implant.system &&
        prevFav.type === implant.type
      ) {
        return prev;
      }

      const next = [...prev];
      next[idx] = {
        ...target,
        favorite: implant,
      };
      return next;
    });
  }, [selectedClinicId, implant.manufacturer, implant.system, implant.type]);

  const handleSelectClinic = (id: string | null) => {
    setSelectedClinicId(id);
  };

  const handleAddOrSelectClinic = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setClinicPresets((prev) => {
      const existing = prev.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        setSelectedClinicId(existing.id);
        return prev;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const favoriteImplant: ClinicFavoriteImplant | undefined =
        implant.manufacturer && implant.system && implant.type
          ? implant
          : undefined;

      const created: ClinicPreset = {
        id,
        name: trimmed,
        favorite: favoriteImplant,
      };

      setSelectedClinicId(id);
      return [...prev, created];
    });
  };

  const handleRenameClinic = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setClinicPresets((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = {
        ...next[idx],
        name: trimmed,
      };
      return next;
    });
  };

  const handleDeleteClinic = (id: string) => {
    setClinicPresets((prev) => prev.filter((c) => c.id !== id));
    setSelectedClinicId((current) => (current === id ? null : current));
  };

  return {
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleRenameClinic,
    handleDeleteClinic,
  };
};
