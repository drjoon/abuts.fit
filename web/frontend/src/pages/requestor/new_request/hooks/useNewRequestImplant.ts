// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/practice/implantPresetsCache.ts
// - web/backend/controllers/requests/creation.from-draft.controller.js
// change-log:
// - 2026-11-03: 카탈로그 캐시는 보여준 뒤 서버 버전과 비교해 갱신(로그인 세션 유지).
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { ROUND_BAR_REQUEST_UPDATED_EVENT } from "@/shared/practice/roundBarAbutment";
import {
  clearImplantPresetsCache,
  parseImplantPresetsServerUpdatedAt,
  readImplantPresetsCache,
  shouldReplaceImplantPresetsCache,
  writeImplantPresetsCache,
} from "@/shared/practice/implantPresetsCache";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import type { Connection } from "./newRequestTypes";

export type UseNewRequestImplantParams = {
  token: string | null;
  clinicName?: string;
  onDefaultImplantChange?: (fields: {
    implantFamily: string;
    implantType: string;
  }) => void;
};

export const useNewRequestImplant = ({
  token,
  clinicName,
  onDefaultImplantChange,
}: UseNewRequestImplantParams) => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [implantManufacturer, setImplantManufacturer] = useState("");
  const [implantBrand, setImplantBrand] = useState("");
  const [implantFamily, setImplantFamily] = useState("");
  const [implantType, setImplantType] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useAppEventDebouncedReload({
    enabled: Boolean(token),
    eventTypes: [ROUND_BAR_REQUEST_UPDATED_EVENT],
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: () => {
      clearImplantPresetsCache();
      setReloadNonce((value) => value + 1);
    },
  });

  // 캐시를 먼저 보여 주고, 서버 카탈로그 버전이 바뀌면 localStorage만 갱신한다(세션 유지).
  useEffect(() => {
    let cancelled = false;

    const loadImplantPresets = async () => {
      const cached = readImplantPresetsCache<Connection>();
      if (cached?.data?.length && !cancelled) {
        setConnections(cached.data);
      }

      try {
        const res = await apiFetch<{
          data?: Connection[];
          serverUpdatedAt?: number | null;
        }>({
          path: "/api/implant-presets",
          method: "GET",
          token,
          skipCache: true,
        });
        if (!res.ok || cancelled) return;
        const list: Connection[] = Array.isArray(res.data?.data)
          ? (res.data.data as Connection[])
          : [];
        if (list.length === 0) return;

        const serverUpdatedAt = parseImplantPresetsServerUpdatedAt(
          res.data?.serverUpdatedAt,
        );
        const shouldReplace = shouldReplaceImplantPresetsCache(
          cached?.serverUpdatedAt,
          serverUpdatedAt,
        );
        if (shouldReplace || !cached?.data?.length) {
          setConnections(list);
          writeImplantPresetsCache(list, serverUpdatedAt);
        }
      } catch {
        // ignore — 캐시가 있으면 그대로 둔다
      }
    };

    void loadImplantPresets();
    return () => {
      cancelled = true;
    };
  }, [token, reloadNonce]);

  // clinicName 입력 시 Family(Regular)와 Type(Hex)만 초기값으로 설정
  // Manufacturer와 Brand는 사용자가 선택하도록 함
  useEffect(() => {
    // 이미 모든 임플란트 정보가 설정되어 있다면 덮어쓰지 않는다.
    if (implantFamily && implantType) {
      return;
    }

    const applyDefaults = async () => {
      try {
        if (!clinicName) {
          // clinicName이 없으면 모든 필드를 초기화 (비활성화)
          if (
            implantManufacturer ||
            implantBrand ||
            implantFamily ||
            implantType
          ) {
            setImplantManufacturer("");
            setImplantBrand("");
            setImplantFamily("");
            setImplantType("");
            setSelectedConnectionId(null);
          }
          return;
        }

        // clinicName이 입력되면 Family와 Type만 초기값으로 설정
        // Manufacturer와 Brand는 사용자가 선택하도록 함
        const nextFamily = "Regular";
        const nextType = "Hex";

        setImplantFamily(nextFamily);
        setImplantType(nextType);

        if (onDefaultImplantChange) {
          onDefaultImplantChange({
            implantFamily: nextFamily,
            implantType: nextType,
          });
        }

        // Manufacturer와 Brand는 설정하지 않음 (사용자 선택 대기)
        // 이미 설정되어 있다면 유지
      } catch {}
    };

    applyDefaults();
  }, [
    token,
    clinicName,
    connections,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
  ]);

  const syncSelectedConnection = (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => {
    const found = connections.find(
      (c) =>
        c.manufacturer === manufacturer &&
        c.brand === brand &&
        c.family === family &&
        c.type === type,
    );
    setSelectedConnectionId(found?._id ? String(found._id) : null);
  };

  const familyOptions = connections
    .filter(
      (c) =>
        (!implantManufacturer || c.manufacturer === implantManufacturer) &&
        (!implantBrand || c.brand === implantBrand),
    )
    .map((c) => c.family as string)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  const typeOptions = connections
    .filter(
      (c) =>
        (!implantManufacturer || c.manufacturer === implantManufacturer) &&
        (!implantBrand || c.brand === implantBrand) &&
        (!implantFamily || c.family === implantFamily),
    )
    .map((c) => c.type as string)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  return {
    connections,
    selectedConnectionId,
    setSelectedConnectionId,
    implantManufacturer,
    setImplantManufacturer,
    implantBrand,
    setImplantBrand,
    implantFamily,
    setImplantFamily,
    implantType,
    setImplantType,
    syncSelectedConnection,
    familyOptions,
    typeOptions,
  };
};
