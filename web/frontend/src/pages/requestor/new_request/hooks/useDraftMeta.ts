import { useEffect, useState, useCallback, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CaseInfos,
  DraftCaseInfo,
  DraftMeta,
  DraftRequest,
} from "./newRequestTypes";

const DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const DRAFT_META_KEY_PREFIX = "abutsfit:new-request-draft-meta:v1:";
const DRAFT_META_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const API_BASE_URL =
  (import.meta.env.DEV && import.meta.env.VITE_API_BASE_URL) || "/api";

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

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  const getDraftMetaKey = useCallback(() => {
    if (!user?.id) return null;
    return `${DRAFT_META_KEY_PREFIX}${user.id}`;
  }, [user?.id]);

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
      localStorage.setItem(DRAFT_ID_STORAGE_KEY, id);
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

  useEffect(() => {
    if (!token || !user?.id) {
      setStatus("ready");
      return;
    }

    void (async () => {
      setStatus("loading");
      setError(null);

      try {
        const cachedMeta = loadDraftMeta();
        if (cachedMeta) {
          const initialMap = cachedMeta.caseInfosMap || { ...emptyMap };
          if (Object.keys(initialMap).length === 0) {
            initialMap.__default__ = { workType: "abutment" };
          }

          setDraftId(cachedMeta.draftId);
          setCaseInfosMap(initialMap);
          setInitialDraftFiles([]);
          saveDraftMeta(cachedMeta.draftId, initialMap);
          setStatus("ready");
          return;
        }

        const storedDraftId = localStorage.getItem(DRAFT_ID_STORAGE_KEY);
        if (storedDraftId) {
          const initialMap: Record<string, CaseInfos> = {
            __default__: { workType: "abutment" },
          };

          setDraftId(storedDraftId);
          setCaseInfosMap(initialMap);
          setInitialDraftFiles([]);
          saveDraftMeta(storedDraftId, initialMap);
          setStatus("ready");
          return;
        }

        const newDraft = await createDraft();
        if (!newDraft) {
          throw new Error("Failed to create new draft");
        }

        const initialMap: Record<string, CaseInfos> = {
          __default__: { workType: "abutment" },
        };

        setDraftId(newDraft._id);
        setCaseInfosMap(initialMap);
        setInitialDraftFiles([]);
        saveDraftMeta(newDraft._id, initialMap);
        setStatus("ready");
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errMsg);
        setStatus("error");
      }
    })();
  }, [token, user?.id, loadDraftMeta, createDraft, saveDraftMeta]);

  const patchDraftImmediately = useCallback(
    async (map: Record<string, CaseInfos>) => {
      if (!draftId || !token) return;

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
          const errData = await res.json().catch(() => ({}));
          console.error("[patchDraftImmediately] Server error:", {
            status: res.status,
            errData,
          });
          throw new Error(`Failed to update draft: ${res.status}`);
        }

        saveDraftMeta(draftId, map);
      } catch (err) {
        console.error("patchDraftImmediately error:", err);
      }
    },
    [draftId, token, getHeaders, saveDraftMeta],
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

        void patchDraftImmediately(nextMap);

        return nextMap;
      });
    },
    [patchDraftImmediately, saveDraftMeta],
  );

  const removeCaseInfos = useCallback(
    (fileKey: string) => {
      if (!fileKey) return;
      setCaseInfosMap((prev) => {
        if (!prev[fileKey]) return prev;
        const next = { ...prev };
        delete next[fileKey];
        if (draftIdRef.current) {
          saveDraftMeta(draftIdRef.current, next);
        }
        return next;
      });
    },
    [saveDraftMeta],
  );

  const createFreshDraftState = useCallback(async () => {
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

  return {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    removeCaseInfos,
    patchDraftImmediately,
    status,
    error,
    deleteDraft,
    resetDraft,
    initialDraftFiles,
  };
}
