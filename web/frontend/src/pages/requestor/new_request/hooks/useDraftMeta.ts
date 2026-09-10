// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - 2026-08-19: 제출 시작 시 초안 PATCH debounce를 멈춰 from-draft와 겹치지 않게.
// - 2026-09-10: 계정 공용 draft-id 복원 제거 — 타 계정 Draft 403 방지, 캐시는 서버 소유권 확인 후만 재사용.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import type { DraftCaseInfo, CaseInfos, DraftRequest } from "./newRequestTypes";
import { getLocalDraft as getLocalNewRequestDraft } from "../utils/localDraftStorage";

/** @deprecated 계정 공용 키 — 읽지 않음. 레거시 잔여분만 삭제용 */
const DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const DRAFT_META_KEY_PREFIX = "abutsfit:new-request-draft-meta:v1:";
const DRAFT_META_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const API_BASE_URL =
  (import.meta.env.DEV && import.meta.env.VITE_API_BASE_URL) || "/api";

type DraftMeta = {
  draftId: string;
  updatedAt: number;
  caseInfos?: CaseInfos;
};

type LocalDraftSnapshot = {
  files?: Array<unknown>;
  caseInfosMap?: Record<string, CaseInfos>;
};

const emptyMap: Record<string, CaseInfos> = {
  __default__: { workType: "abutment" },
};

export function useDraftMeta() {
  const { token, user } = useAuthStore();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [caseInfosMap, setCaseInfosMap] =
    useState<Record<string, CaseInfos>>(emptyMap);
  const [initialDraftFiles, setInitialDraftFiles] = useState<DraftCaseInfo[]>(
    [],
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const patchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPatchMapRef = useRef<Record<string, CaseInfos> | null>(null);
  const patchesSuspendedRef = useRef(false);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  const getDraftMetaKey = useCallback(() => {
    if (!user?.id) return null;
    return `${DRAFT_META_KEY_PREFIX}${user.id}`;
  }, [user?.id]);

  const clearStoredDraftIdentity = useCallback(() => {
    const metaKey = getDraftMetaKey();
    try {
      localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
      if (metaKey) {
        localStorage.removeItem(metaKey);
      }
    } catch (err) {
      console.warn(
        "[useDraftMeta] Failed to clear stored draft identity:",
        err,
      );
    }
  }, [getDraftMetaKey]);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  const saveDraftMeta = useCallback(
    (id: string, infoMap: Record<string, CaseInfos>) => {
      const metaKey = getDraftMetaKey();
      if (!metaKey) return;

      const meta: DraftMeta & { caseInfosMap: Record<string, CaseInfos> } = {
        draftId: id,
        updatedAt: Date.now(),
        caseInfos: infoMap.__default__ || { workType: "abutment" },
        caseInfosMap: infoMap,
      };

      localStorage.setItem(metaKey, JSON.stringify(meta));
      // 계정 공용 draft-id 키는 더 이상 쓰지 않는다(타 계정 403). 잔여분만 정리.
      try {
        localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
      } catch {
        // ignore
      }
    },
    [getDraftMetaKey],
  );

  const loadDraftMeta = useCallback(():
    | (DraftMeta & { caseInfosMap?: Record<string, CaseInfos> })
    | null => {
    const metaKey = getDraftMetaKey();
    if (!metaKey) return null;

    const stored = localStorage.getItem(metaKey);
    if (!stored) return null;

    try {
      const meta = JSON.parse(stored) as DraftMeta & {
        caseInfosMap?: Record<string, CaseInfos>;
      };
      if (Date.now() - meta.updatedAt > DRAFT_META_TTL_MS) {
        return null;
      }
      return meta;
    } catch {
      return null;
    }
  }, [getDraftMetaKey]);

  const createDraft = useCallback(async (): Promise<DraftRequest | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/requests/drafts`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ caseInfos: [] }),
      });

      if (!res.ok) {
        throw new Error(`Failed to create draft: ${res.status}`);
      }

      const data = await res.json();
      return data.data || data;
    } catch (err) {
      console.error("createDraft error:", err);
      return null;
    }
  }, [getHeaders]);

  const adoptDraft = useCallback(
    (id: string, map: Record<string, CaseInfos>) => {
      const nextMap: Record<string, CaseInfos> = {
        ...(Object.keys(map).length > 0 ? map : emptyMap),
      };
      if (!nextMap.__default__) {
        nextMap.__default__ = { workType: "abutment" };
      }
      setDraftId(id);
      setCaseInfosMap(nextMap);
      setInitialDraftFiles([]);
      saveDraftMeta(id, nextMap);
    },
    [saveDraftMeta],
  );

  const ensureOwnedDraftId = useCallback(
    async (candidateId: string | null | undefined): Promise<boolean> => {
      const id = String(candidateId || "").trim();
      if (!id || !token) return false;
      try {
        const res = await fetch(`${API_BASE_URL}/requests/drafts/${id}`, {
          method: "GET",
          headers: getHeaders(),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [token, getHeaders],
  );

  useEffect(() => {
    if (!token || !user?.id) {
      setStatus("ready");
      return;
    }

    let cancelled = false;

    void (async () => {
      setStatus("loading");
      setError(null);

      try {
        // 레거시 계정 공용 draft-id는 복원하지 않고 제거만 한다.
        try {
          localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
        } catch {
          // ignore
        }

        const localDraft =
          getLocalNewRequestDraft() as LocalDraftSnapshot | null;
        const hasLocalFiles =
          Array.isArray(localDraft?.files) && localDraft.files.length > 0;

        if (hasLocalFiles) {
          const newDraft = await createDraft();
          if (!newDraft) {
            throw new Error("Failed to create new draft");
          }
          if (cancelled) return;

          // updateCaseInfos는 saveDraftMeta만 호출하므로 cachedMeta가 최신 patient/implant 정보를 가짐
          // localDraft.caseInfosMap은 업데이트되지 않으므로 cachedMeta를 우선 사용
          const cachedMeta = loadDraftMeta();
          const initialMap =
            cachedMeta?.caseInfosMap &&
            Object.keys(cachedMeta.caseInfosMap).length > 0
              ? { ...cachedMeta.caseInfosMap }
              : localDraft?.caseInfosMap &&
                  Object.keys(localDraft.caseInfosMap).length > 0
                ? { ...localDraft.caseInfosMap }
                : { ...emptyMap };

          clearStoredDraftIdentity();
          adoptDraft(newDraft._id, initialMap);
          setStatus("ready");
          return;
        }

        const cachedMeta = loadDraftMeta();
        if (cachedMeta?.draftId) {
          const owned = await ensureOwnedDraftId(cachedMeta.draftId);
          if (cancelled) return;
          if (owned) {
            adoptDraft(cachedMeta.draftId, cachedMeta.caseInfosMap || {
              ...emptyMap,
            });
            setStatus("ready");
            return;
          }
          clearStoredDraftIdentity();
        }

        const newDraft = await createDraft();
        if (!newDraft) {
          throw new Error("Failed to create new draft");
        }
        if (cancelled) return;

        adoptDraft(newDraft._id, { ...emptyMap });
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errMsg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    user?.id,
    loadDraftMeta,
    createDraft,
    saveDraftMeta,
    clearStoredDraftIdentity,
    adoptDraft,
    ensureOwnedDraftId,
  ]);

  const createFreshDraftState = useCallback(async () => {
    if (patchTimeoutRef.current) {
      clearTimeout(patchTimeoutRef.current);
      patchTimeoutRef.current = null;
    }
    lastPatchMapRef.current = null;

    if (!token || !user?.id) {
      setDraftId(null);
      setCaseInfosMap({ ...emptyMap });
      setInitialDraftFiles([]);
      return;
    }

    const newDraft = await createDraft();
    if (newDraft) {
      const nextMap = { ...emptyMap };
      setDraftId(newDraft._id);
      setCaseInfosMap(nextMap);
      setInitialDraftFiles([]);
      saveDraftMeta(newDraft._id, nextMap);
      return;
    }

    setDraftId(null);
    setCaseInfosMap({ ...emptyMap });
    setInitialDraftFiles([]);
  }, [token, user?.id, createDraft, saveDraftMeta]);

  const patchDraftImmediately = useCallback(
    async (map: Record<string, CaseInfos>) => {
      if (!draftId || !token || patchesSuspendedRef.current) return;

      try {
        const fileBasedCaseInfos = Object.entries(map)
          .filter(([key]) => key !== "__default__")
          .map(([, caseInfo]) => caseInfo);

        const caseInfosArray =
          fileBasedCaseInfos.length > 0
            ? fileBasedCaseInfos
            : map.__default__
              ? [map.__default__]
              : [];

        const res = await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({ caseInfos: caseInfosArray }),
        });

        if (!res.ok) {
          // 404: 만료/삭제 · 403: 타 계정 Draft 재사용 — 둘 다 버리고 새 Draft로 교체
          if (res.status === 404 || res.status === 403) {
            clearStoredDraftIdentity();
            const replacement = await createDraft();
            if (replacement?._id) {
              setDraftId(replacement._id);
              saveDraftMeta(replacement._id, map);
              // 교체된 Draft에 현재 caseInfos를 한 번 더 반영
              try {
                await fetch(
                  `${API_BASE_URL}/requests/drafts/${replacement._id}`,
                  {
                    method: "PATCH",
                    headers: getHeaders(),
                    body: JSON.stringify({ caseInfos: caseInfosArray }),
                  },
                );
              } catch {
                // ignore
              }
            }
            return;
          }
          throw new Error(`Failed to update draft: ${res.status}`);
        }

        saveDraftMeta(draftId, map);
      } catch {
        return;
      }
    },
    [
      draftId,
      token,
      getHeaders,
      saveDraftMeta,
      clearStoredDraftIdentity,
      createDraft,
    ],
  );

  // Debounced patch: 500ms 동안 변경이 없으면 한 번만 API 호출
  const patchDraftDebounced = useCallback(
    (map: Record<string, CaseInfos>) => {
      if (patchesSuspendedRef.current) return;
      // 이전 patch 타이머 취소
      if (patchTimeoutRef.current) {
        clearTimeout(patchTimeoutRef.current);
      }

      // 새 타이머 설정 (500ms 후 실행)
      patchTimeoutRef.current = setTimeout(() => {
        lastPatchMapRef.current = map;
        void patchDraftImmediately(map);
      }, 500);
    },
    [patchDraftImmediately],
  );

  const updateCaseInfos = useCallback(
    (fileKey: string, newCaseInfos: Partial<CaseInfos>) => {
      setCaseInfosMap((prevMap) => {
        const prev = prevMap[fileKey] || { workType: "abutment" };
        const merged: CaseInfos = {
          ...prev,
          ...newCaseInfos,
          workType: newCaseInfos.workType || prev.workType || "abutment",
          implantBrand: newCaseInfos.implantBrand ?? prev.implantBrand,
        };

        const nextMap = {
          ...prevMap,
          [fileKey]: merged,
        };

        if (draftIdRef.current) {
          saveDraftMeta(draftIdRef.current, nextMap);
        }

        // Debounced patch: 500ms 동안 변경이 없으면 한 번만 API 호출
        patchDraftDebounced(nextMap);

        return nextMap;
      });
    },
    [patchDraftDebounced, saveDraftMeta],
  );

  const removeCaseInfos = useCallback(
    (fileKey: string) => {
      if (!fileKey) return;
      console.log("[useDraftMeta] removeCaseInfos", { fileKey });
      setCaseInfosMap((prev) => {
        if (!prev[fileKey]) {
          console.log("[useDraftMeta] fileKey not found in caseInfosMap", {
            fileKey,
            keys: Object.keys(prev),
          });
          return prev;
        }
        const next = { ...prev };
        delete next[fileKey];
        console.log("[useDraftMeta] removed from caseInfosMap", {
          fileKey,
          remainingKeys: Object.keys(next),
        });
        if (draftIdRef.current) {
          saveDraftMeta(draftIdRef.current, next);
          // Draft API에도 즉시 반영
          patchDraftDebounced(next);
        }
        return next;
      });
    },
    [saveDraftMeta, patchDraftDebounced],
  );

  const deleteDraft = useCallback(async () => {
    try {
      if (draftId && token) {
        await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      }
    } catch (err) {
      console.error("deleteDraft error:", err);
    }

    await createFreshDraftState();
  }, [draftId, token, getHeaders, createFreshDraftState]);

  const resetDraft = useCallback(async () => {
    await createFreshDraftState();
  }, [createFreshDraftState]);

  const suspendDraftPatches = useCallback(() => {
    patchesSuspendedRef.current = true;
    if (patchTimeoutRef.current) {
      clearTimeout(patchTimeoutRef.current);
      patchTimeoutRef.current = null;
    }
  }, []);

  // Cleanup: 컴포넌트 언마운트 시 pending patch 취소
  useEffect(() => {
    return () => {
      if (patchTimeoutRef.current) {
        clearTimeout(patchTimeoutRef.current);
      }
    };
  }, []);

  return {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    removeCaseInfos,
    patchDraftImmediately,
    suspendDraftPatches,
    status,
    error,
    deleteDraft,
    resetDraft,
    initialDraftFiles,
  };
}
