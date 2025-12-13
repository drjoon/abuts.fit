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
const PATCH_DEBOUNCE_MS = 2000; // 2초 디바운스 (동시성 문제 방지)

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

/**
 * Draft 메타 캐시 관리 및 Draft API 통신 훅
 * - Draft 생성/조회 (캐시 → GET → POST 플로우)
 * - caseInfos 변경 시 PATCH + DraftMeta 동시 갱신
 */
export function useDraftMeta() {
  const { token, user } = useAuthStore();
  const [draftId, setDraftId] = useState<string | null>(null);
  // 파일별 독립적인 정보 관리: fileKey -> CaseInfos
  const [caseInfosMap, setCaseInfosMap] = useState<Record<string, CaseInfos>>({
    __default__: { workType: "abutment" },
  });
  const [initialDraftFiles, setInitialDraftFiles] = useState<DraftCaseInfo[]>(
    []
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);

  // Draft PATCH 디바운스를 위한 타이머 Ref
  const patchTimeoutRef = useRef<number | null>(null);

  // 현재 draftId를 추적하는 Ref (setTimeout 콜백에서 draftId 변경 감지용)
  const draftIdRef = useRef<string | null>(null);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

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

  // DraftMeta 저장 (caseInfosMap 전체 저장)
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
    [getDraftMetaKey]
  );

  // DraftMeta 로드 (caseInfosMap 포함)
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

            // 캐시된 caseInfosMap 또는 새로 생성
            const initialMap = cachedMeta.caseInfosMap || {};
            if (Object.keys(initialMap).length === 0) {
              initialMap.__default__ = { workType: "abutment" };
            }

            setDraftId(draftFromCache._id);
            setCaseInfosMap(initialMap);
            setInitialDraftFiles(draftCaseInfos);
            saveDraftMeta(draftFromCache._id, initialMap);
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

            const initialMap: Record<string, CaseInfos> = {
              __default__: { workType: "abutment" },
            };

            setDraftId(draft._id);
            setCaseInfosMap(initialMap);
            setInitialDraftFiles(draftCaseInfos);
            saveDraftMeta(draft._id, initialMap);
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

          const initialMap: Record<string, CaseInfos> = {
            __default__: { workType: "abutment" },
          };

          setDraftId(newDraft._id);
          setCaseInfosMap(initialMap);
          setInitialDraftFiles(draftCaseInfos);
          saveDraftMeta(newDraft._id, initialMap);
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

  // 즉시 PATCH 요청 (디바운스 없음)
  const patchDraftImmediately = useCallback(
    async (map: Record<string, CaseInfos>) => {
      if (!draftId || !token) return;

      try {
        // __default__를 제외한 파일별 caseInfos 추출
        const fileBasedCaseInfos = Object.entries(map)
          .filter(([key]) => key !== "__default__")
          .map(([, caseInfo]) => caseInfo);

        // __default__도 포함 (파일이 없는 경우 대비)
        const caseInfosArray =
          fileBasedCaseInfos.length > 0
            ? fileBasedCaseInfos
            : map.__default__
            ? [map.__default__]
            : [];

        console.log("[patchDraftImmediately] Sending caseInfos:", {
          draftId,
          mapKeys: Object.keys(map),
          fileBasedCaseInfos,
          caseInfosArray,
        });

        const res = await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({
            caseInfos: caseInfosArray,
          }),
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
    [draftId, token, getHeaders, saveDraftMeta]
  );

  // caseInfos 업데이트 (파일별 독립적 관리)
  // fileKey: 파일의 고유 키 (name:size)
  const updateCaseInfos = useCallback(
    (fileKey: string, newCaseInfos: Partial<CaseInfos>) => {
      setCaseInfosMap((prevMap) => {
        const prev = prevMap[fileKey] || { workType: "abutment" };
        // clinicName도 사용자가 X 버튼이나 직접 입력으로 비울 수 있어야 하므로
        // 더 이상 빈 문자열을 강제로 무시하지 않는다.
        const updated: CaseInfos = { ...prev, ...newCaseInfos };

        // 변경 사항이 전혀 없으면 상태/패치 모두 스킵
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
          return prevMap;
        }

        const newMap = { ...prevMap, [fileKey]: updated };
        // 비동기 PATCH 요청 (디바운스 적용)
        if (draftId && token) {
          if (patchTimeoutRef.current !== null) {
            window.clearTimeout(patchTimeoutRef.current);
          }

          const currentDraftId = draftId;

          patchTimeoutRef.current = window.setTimeout(async () => {
            if (currentDraftId !== draftIdRef.current) {
              return;
            }

            try {
              // 전체 caseInfosMap을 배열로 변환해서 보냄
              // (__default__ 제외, 실제 파일 정보만)
              const caseInfosArray = Object.entries(newMap)
                .filter(([key]) => key !== "__default__")
                .map(([, caseInfo]) => caseInfo);

              const res = await fetch(
                `${API_BASE_URL}/requests/drafts/${currentDraftId}`,
                {
                  method: "PATCH",
                  headers: getHeaders(),
                  body: JSON.stringify({
                    caseInfos: caseInfosArray,
                  }),
                }
              );

              if (!res.ok) {
                throw new Error(`Failed to update draft: ${res.status}`);
              }

              saveDraftMeta(currentDraftId, newMap);
            } catch (err) {
              console.error("updateCaseInfos error:", err);
            }
          }, PATCH_DEBOUNCE_MS);
        }

        return newMap;
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

  // Draft 삭제 (현재 Draft만 정리)
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

      localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
      const metaKey = getDraftMetaKey();
      if (metaKey) localStorage.removeItem(metaKey);

      setDraftId(null);
      setCaseInfosMap({ __default__: { workType: "abutment" } });
      setInitialDraftFiles([]);
    } catch (err) {
      console.error("deleteDraft error:", err);
    }
  }, [draftId, token, getHeaders, getDraftMetaKey]);

  // Draft 완전 리셋: 기존 Draft 정리 후 새 Draft 생성
  const resetDraft = useCallback(async () => {
    // 펀딩 중인 PATCH 요청 취소 (이전 draftId로의 업데이트 방지)
    if (patchTimeoutRef.current !== null) {
      window.clearTimeout(patchTimeoutRef.current);
      patchTimeoutRef.current = null;
    }

    // 기존 Draft 정리 (실패해도 무시하고 계속 진행)
    try {
      if (draftId && token) {
        await fetch(`${API_BASE_URL}/requests/drafts/${draftId}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
      }
    } catch (err) {
      console.error("resetDraft: delete current draft failed (ignored)", err);
    }

    // 로컬 캐시 정리
    localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
    const metaKeyReset = getDraftMetaKey();
    if (metaKeyReset) localStorage.removeItem(metaKeyReset);

    const emptyMap: Record<string, CaseInfos> = {
      __default__: {
        clinicName: "",
        patientName: "",
        tooth: "",
        implantSystem: "",
        implantType: "",
        connectionType: "",
        maxDiameter: undefined,
        connectionDiameter: undefined,
        shippingMode: undefined,
        requestedShipDate: undefined,
        workType: "abutment",
      },
    };

    // 토큰 없으면 클라이언트 상태만 초기화
    if (!token || !user?.id) {
      setDraftId(null);
      setCaseInfosMap(emptyMap);
      setInitialDraftFiles([]);
    } else {
      // 새 Draft 생성
      const newDraft = await createDraft();
      if (newDraft) {
        setDraftId(newDraft._id);
        setCaseInfosMap(emptyMap);
        setInitialDraftFiles([]);
        saveDraftMeta(newDraft._id, emptyMap);
      } else {
        // 새 Draft 생성 실패 시 최소한 클라이언트 상태만 초기화
        setDraftId(null);
        setCaseInfosMap(emptyMap);
        setInitialDraftFiles([]);
      }
    }
  }, [
    draftId,
    token,
    user?.id,
    getHeaders,
    getDraftMetaKey,
    createDraft,
    saveDraftMeta,
  ]);

  return {
    draftId,
    caseInfosMap,
    setCaseInfosMap,
    updateCaseInfos,
    patchDraftImmediately,
    status,
    error,
    deleteDraft,
    resetDraft,
    initialDraftFiles,
  };
}
