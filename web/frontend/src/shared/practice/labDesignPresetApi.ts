// 기공소 디자인 프리셋 조회·저장. 기공소 BA에 두어 PC가 달라도 같다.
// related files:
// - web/backend/controllers/labDesignPresets/labDesignPreset.controller.js
// - web/frontend/src/shared/practice/labDesignPresets.ts

import { useCallback, useEffect, useState } from "react";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import {
  BUILTIN_DESIGN_LIBRARY,
  normalizeDesignPresetLibrary,
  type DesignPresetLibrary,
} from "@/shared/practice/labDesignPresets";

const BASE = "/api/lab-design-presets";

/** 의뢰를 옮겨 다시 열어도 기본 프리셋이 먼저 보이지 않게 둔다. */
let lastLibrary: DesignPresetLibrary | null = null;

export function useLabDesignPresets(enabled: boolean) {
  const [library, setLibrary] = useState<DesignPresetLibrary>(
    () => lastLibrary ?? BUILTIN_DESIGN_LIBRARY,
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void apiFetch<{ data: unknown }>({ path: BASE, cacheTtlMs: 30_000 }).then((res) => {
      if (cancelled || !res.ok) return;
      const next = normalizeDesignPresetLibrary(res.data?.data);
      lastLibrary = next;
      setLibrary(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const save = useCallback(async (next: DesignPresetLibrary) => {
    const before = lastLibrary ?? BUILTIN_DESIGN_LIBRARY;
    lastLibrary = next;
    setLibrary(next);
    const res = await apiFetch<{ data: unknown; message?: string }>({
      path: BASE,
      method: "PUT",
      jsonBody: next,
    });
    invalidateApiGetCache(BASE);
    if (!res.ok) {
      lastLibrary = before;
      setLibrary(before);
      throw new Error(String(res.data?.message || "디자인 프리셋을 저장하지 못했습니다."));
    }
    const saved = normalizeDesignPresetLibrary(res.data?.data);
    lastLibrary = saved;
    setLibrary(saved);
  }, []);

  return { library, save };
}
