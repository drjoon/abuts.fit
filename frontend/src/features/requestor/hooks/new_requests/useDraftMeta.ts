import { useEffect, useState, useCallback, useRef } from "react";
import { useAuthStore } from "../../../../store/useAuthStore";
import {
  CaseInfos,
  DraftCaseInfo,
  DraftMeta,
  DraftRequest,
} from "./newRequestTypes";

const DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const DRAFT_META_KEY_PREFIX = "abutsfit:new-request-draft-meta:v1:";
const DRAFT_META_TTL_MS = 30 * 60 * 1000; // 30분

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

/**
 * Draft 메타 캐시 관리 및 Draft API 통신 훅
 * - Draft 생성/조회 (캐시 → GET → POST 플로우)
 * - caseInfos 변경 시 PATCH + DraftMeta 동시 갱신
 */
export function useDraftMeta() {
  const { token, user } = useAuthStore();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [caseInfos, setCaseInfos] = useState<CaseInfos>({
    workType: "abutment",
  });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);

  // Draft PATCH 디바운스를 위한 타이머 Ref
  const patchTimeoutRef = useRef<number | null>(null);

  // localStorage 키 생성
  const getDraftMetaKey = useCallback(() => {
    if (!user?.id) return null;
    return `${DRAFT_META_KEY_PREFIX}${user.id}`;
  }, [user?.id]);

  // 헤더 생성 (mock dev 토큰 지원)
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token === "MOCK_DEV_TOKEN") {
      headers["x-mock-role"] = "requestor";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // DraftMeta 저장
  const saveDraftMeta = useCallback(
    (id: string, info: CaseInfos) => {
      const metaKey = getDraftMetaKey();
      if (!metaKey) return;

      const meta: DraftMeta = {
        draftId: id,
        updatedAt: Date.now(),
        caseInfos: info,
      };
      localStorage.setItem(metaKey, JSON.stringify(meta));
      localStorage.setItem(DRAFT_ID_STORAGE_KEY, id);
    },
    [getDraftMetaKey]
  );

  // DraftMeta 로드
  const loadDraftMeta = useCallback((): DraftMeta | null => {
    const metaKey = getDraftMetaKey();
    if (!metaKey) return null;

    const stored = localStorage.getItem(metaKey);
    if (!stored) return null;

    try {
      const meta = JSON.parse(stored) as DraftMeta;
      const age = Date.now() - meta.updatedAt;
      if (age > DRAFT_META_TTL_MS) {
        return null; // TTL 만료
      }
      return meta;
    } catch {
      return null;
    }
  }, [getDraftMetaKey]);

  // Draft 조회
  const fetchDraft = useCallback(
    async (id: string): Promise<DraftRequest | null> => {
      try {
        const res = await fetch(`${API_BASE_URL}/requests/drafts/${id}`, {
          method: "GET",
          headers: getHeaders(),
        });

        if (!res.ok) {
          if (res.status === 404 || res.status === 403) {
            return null;
          }
          throw new Error(`Failed to fetch draft: ${res.status}`);
        }

        const data = await res.json();
        return data.data || data;
      } catch (err) {
        console.error("fetchDraft error:", err);
        return null;
      }
    },
    [getHeaders]
  );

  // Draft 생성
  const createDraft = useCallback(async (): Promise<DraftRequest | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/requests/drafts`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          caseInfos: [],
        }),
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

  // Draft 초기화 (페이지 진입 시)
  useEffect(() => {
    if (!token || !user?.id) {
      setStatus("ready");
      return;
    }

    (async () => {
      setStatus("loading");
      setError(null);

      try {
        // 1. DraftMeta 캐시 확인 (서버 존재 여부 + status 검증)
        const cachedMeta = loadDraftMeta();
        if (cachedMeta) {
          const draftFromCache = await fetchDraft(cachedMeta.draftId);
          if (draftFromCache && draftFromCache.status === "draft") {
            const draftCaseInfos = Array.isArray(draftFromCache.caseInfos)
              ? draftFromCache.caseInfos
              : [];
            const firstCase: DraftCaseInfo | undefined = draftCaseInfos[0];

            const initialCaseInfos: CaseInfos = firstCase || {
              workType: "abutment",
            };

            setDraftId(draftFromCache._id);
            setCaseInfos(initialCaseInfos);
            saveDraftMeta(draftFromCache._id, initialCaseInfos);
            setStatus("ready");
            return;
          } else {
            // 캐시된 Draft가 서버에 없거나 더 이상 draft 상태가 아니면 로컬 캐시 정리 후 새 Draft 생성 플로우로 진행
            const metaKey = getDraftMetaKey();
            if (metaKey) {
              try {
                localStorage.removeItem(metaKey);
              } catch {}
            }
            try {
              localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
            } catch {}
          }
        }

        // 2. localStorage의 draftId 확인 (별도 Meta 없이 ID만 있는 경우)
        const storedDraftId = localStorage.getItem(DRAFT_ID_STORAGE_KEY);
        if (storedDraftId) {
          const draft = await fetchDraft(storedDraftId);
          if (draft && draft.status === "draft") {
            const draftCaseInfos = Array.isArray(draft.caseInfos)
              ? draft.caseInfos
              : [];
            const firstCase: DraftCaseInfo | undefined = draftCaseInfos[0];

            const initialCaseInfos: CaseInfos = firstCase || {
              workType: "abutment",
            };

            setDraftId(draft._id);
            setCaseInfos(initialCaseInfos);
            saveDraftMeta(draft._id, initialCaseInfos);
            setStatus("ready");
            return;
          } else {
            // draftId만 있고 서버에는 없거나 이미 submitted/cancelled 상태인 경우 로컬 ID 정리
            try {
              localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
            } catch {}
          }
        }

        // 3. 새 Draft 생성
        const newDraft = await createDraft();
        if (newDraft) {
          const draftCaseInfos = Array.isArray(newDraft.caseInfos)
            ? newDraft.caseInfos
            : [];
          const firstCase: DraftCaseInfo | undefined = draftCaseInfos[0];

          const initialCaseInfos: CaseInfos = firstCase || {
            workType: "abutment",
          };

          setDraftId(newDraft._id);
          setCaseInfos(initialCaseInfos);
          saveDraftMeta(newDraft._id, initialCaseInfos);
          setStatus("ready");
        } else {
          throw new Error("Failed to create new draft");
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errMsg);
        setStatus("error");
      }
    })();
  }, [token, user?.id, loadDraftMeta, fetchDraft, createDraft, saveDraftMeta]);

  // caseInfos 업데이트 (즉시 상태 반영 + 비동기 PATCH)
  const updateCaseInfos = useCallback(
    (newCaseInfos: Partial<CaseInfos>) => {
      setCaseInfos((prev) => {
        const updated: CaseInfos = { ...prev, ...newCaseInfos };

        // 변경 사항이 전혀 없으면 상태/패치 모두 스킵하여 불필요한 리렌더를 방지
        let hasDiff = false;
        const keys = new Set<keyof CaseInfos>([
          "clinicName",
          "patientName",
          "tooth",
          "implantSystem",
          "implantType",
          "connectionType",
          "maxDiameter",
          "connectionDiameter",
          "workType",
          "shippingMode",
          "requestedShipDate",
        ]);
        keys.forEach((key) => {
          if (prev[key] !== updated[key]) {
            hasDiff = true;
          }
        });

        if (!hasDiff) {
          return prev;
        }

        // 비동기 PATCH 요청 (디바운스 적용)
        if (draftId && token) {
          if (patchTimeoutRef.current !== null) {
            window.clearTimeout(patchTimeoutRef.current);
          }

          patchTimeoutRef.current = window.setTimeout(async () => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/requests/drafts/${draftId}`,
                {
                  method: "PATCH",
                  headers: getHeaders(),
                  body: JSON.stringify({
                    // 현재는 대표 caseInfos 하나만 사용하므로 배열 1개로 덮어쓴다.
                    caseInfos: [updated],
                  }),
                }
              );

              if (!res.ok) {
                throw new Error(`Failed to update draft: ${res.status}`);
              }

              // 캐시 갱신
              saveDraftMeta(draftId, updated);
            } catch (err) {
              console.error("updateCaseInfos error:", err);
            }
          }, 1000);
        }

        return updated;
      });
    },
    [draftId, token, getHeaders, saveDraftMeta]
  );

  // 언마운트 시 디바운스 타이머 정리
  useEffect(() => {
    return () => {
      if (patchTimeoutRef.current !== null) {
        window.clearTimeout(patchTimeoutRef.current);
      }
    };
  }, []);

  // Draft 삭제
  const deleteDraft = useCallback(async () => {
    if (!draftId || !token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to delete draft: ${res.status}`);
      }

      // localStorage 정리
      const metaKey = getDraftMetaKey();
      if (metaKey) {
        localStorage.removeItem(metaKey);
      }
      localStorage.removeItem(DRAFT_ID_STORAGE_KEY);

      setDraftId(null);
      setCaseInfos({ workType: "abutment" });
    } catch (err) {
      console.error("deleteDraft error:", err);
    }
  }, [draftId, token, getHeaders, getDraftMetaKey]);

  return {
    draftId,
    caseInfos,
    setCaseInfos: updateCaseInfos,
    status,
    error,
    deleteDraft,
  };
}
