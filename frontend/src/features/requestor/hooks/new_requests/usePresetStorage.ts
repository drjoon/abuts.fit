import { useEffect, useState, useCallback } from "react";

export type PresetItem = {
  id: string;
  label: string;
};

const PRESET_STORAGE_PREFIX = "abutsfit:presets:v1:";

/**
 * 프리셋 저장소 관리 훅 (LocalStorage 기반)
 * - 프리셋 로드/저장/삭제
 * - 프리셋 추가/삭제
 */
export const usePresetStorage = (presetKey: string) => {
  const [presets, setPresets] = useState<PresetItem[]>([]);

  // 프리셋 로드
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!presetKey) return;

    try {
      const storageKey = `${PRESET_STORAGE_PREFIX}${presetKey}`;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PresetItem[];
      if (Array.isArray(parsed)) {
        setPresets(parsed);
      }
    } catch {}
  }, [presetKey]);

  // 프리셋 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!presetKey) return;

    try {
      const storageKey = `${PRESET_STORAGE_PREFIX}${presetKey}`;
      window.localStorage.setItem(storageKey, JSON.stringify(presets));
    } catch {}
  }, [presetKey, presets]);

  // 프리셋 추가
  const addPreset = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;

    setPresets((prev) => {
      // 중복 확인 (대소문자 무시)
      const exists = prev.some(
        (p) => p.label.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) return prev;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev, { id, label: trimmed }];
    });
  }, []);

  // 프리셋 삭제
  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 모든 프리셋 삭제
  const clearAllPresets = useCallback(() => {
    setPresets([]);
  }, []);

  return {
    presets,
    addPreset,
    deletePreset,
    clearAllPresets,
  };
};
