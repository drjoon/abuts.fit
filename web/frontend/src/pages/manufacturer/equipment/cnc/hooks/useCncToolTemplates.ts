import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * useCncToolTemplates
 *
 * 공구 슬롯 템플릿 (toolNum + toolName 목록) CRUD + 다중 장비 적용 훅.
 * 슬롯 메타는 슬롯번호(필수) + 공구이름(선택)만 사용한다.
 */

export interface ToolTemplateSlot {
  toolNum: number;
  toolName: string;
}

export interface ToolTemplate {
  _id: string;
  name: string;
  description: string;
  slots: ToolTemplateSlot[];
  createdByName?: string;
  updatedAt?: string;
}

export interface ToolTemplateMachineRef {
  machineId: string;
  name: string;
  status?: string;
}

export interface ApplyToolTemplateResult {
  machineId: string;
  success: boolean;
  appliedCount?: number;
  totalSlots?: number;
  message?: string;
}

const BASE_PATH = "/api/cnc-tool-templates";

export const useCncToolTemplates = () => {
  const { token } = useAuthStore();
  const [templates, setTemplates] = useState<ToolTemplate[]>([]);
  const [machines, setMachines] = useState<ToolTemplateMachineRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch({
        path: BASE_PATH,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("템플릿 조회 실패");
      const list: ToolTemplate[] = res.data?.data ?? [];
      setTemplates(list);
      return list;
    } catch (e: any) {
      setError(e?.message ?? "템플릿 조회 실패");
      return [] as ToolTemplate[];
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMachines = useCallback(async () => {
    try {
      const res = await apiFetch({
        path: `${BASE_PATH}/machines`,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("장비 목록 조회 실패");
      const list: ToolTemplateMachineRef[] = res.data?.data ?? [];
      setMachines(list);
      return list;
    } catch (e: any) {
      setError(e?.message ?? "장비 목록 조회 실패");
      return [] as ToolTemplateMachineRef[];
    }
  }, [token]);

  const createTemplate = useCallback(
    async (payload: {
      name: string;
      description?: string;
      slots: ToolTemplateSlot[];
    }) => {
      const res = await apiFetch({
        path: BASE_PATH,
        method: "POST",
        token,
        jsonBody: payload,
      });
      if (!res.ok) {
        const msg = (res.data as any)?.message ?? "템플릿 생성 실패";
        throw new Error(msg);
      }
      await loadTemplates();
      return (res.data as any)?.data as ToolTemplate;
    },
    [token, loadTemplates],
  );

  const updateTemplate = useCallback(
    async (
      id: string,
      payload: {
        name?: string;
        description?: string;
        slots?: ToolTemplateSlot[];
      },
    ) => {
      const res = await apiFetch({
        path: `${BASE_PATH}/${id}`,
        method: "PUT",
        token,
        jsonBody: payload,
      });
      if (!res.ok) {
        const msg = (res.data as any)?.message ?? "템플릿 수정 실패";
        throw new Error(msg);
      }
      await loadTemplates();
      return (res.data as any)?.data as ToolTemplate;
    },
    [token, loadTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const res = await apiFetch({
        path: `${BASE_PATH}/${id}`,
        method: "DELETE",
        token,
      });
      if (!res.ok) {
        const msg = (res.data as any)?.message ?? "템플릿 삭제 실패";
        throw new Error(msg);
      }
      await loadTemplates();
    },
    [token, loadTemplates],
  );

  /**
   * 템플릿을 다중 장비에 Merge upsert로 적용한다.
   * 기존 슬롯의 통계/이력은 유지된다.
   */
  const applyTemplate = useCallback(
    async (id: string, machineIds: string[]) => {
      const res = await apiFetch({
        path: `${BASE_PATH}/${id}/apply`,
        method: "POST",
        token,
        jsonBody: { machineIds },
      });
      if (!res.ok) {
        const msg = (res.data as any)?.message ?? "템플릿 적용 실패";
        throw new Error(msg);
      }
      const results = ((res.data as any)?.data?.results ??
        []) as ApplyToolTemplateResult[];
      return results;
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    void loadTemplates();
    void loadMachines();
  }, [token, loadTemplates, loadMachines]);

  return {
    templates,
    machines,
    loading,
    error,
    loadTemplates,
    loadMachines,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
  };
};
