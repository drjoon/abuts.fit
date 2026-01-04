import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import type { Connection } from "./newRequestTypes";

const CONNECTIONS_STORAGE_KEY = "abutsfit:connections:v1";
const CONNECTIONS_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1년

export type UseNewRequestImplantParams = {
  token: string | null;
  clinicName?: string;
  onDefaultImplantChange?: (fields: {
    implantManufacturer: string;
    implantSystem: string;
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
  const [implantSystem, setImplantSystem] = useState("");
  const [implantType, setImplantType] = useState("");

  // connections 목록은 토큰 기준으로 한 번만 조회
  useEffect(() => {
    const loadConnections = async () => {
      try {
        // 1) localStorage 캐시 확인
        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage.getItem(CONNECTIONS_STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored) as {
                data: any[];
                serverUpdatedAt?: number | null;
                cachedAt: number;
              };
              const age = Date.now() - parsed.cachedAt;
              if (age <= CONNECTIONS_TTL_MS && Array.isArray(parsed.data)) {
                setConnections(parsed.data);
                return;
              }
            }
          } catch {}
        }

        // 2) 캐시가 없거나 만료된 경우 서버에서 조회 후 캐시 저장
        const res = await apiFetch<any>({
          path: "/api/connections",
          method: "GET",
          token,
        });
        if (!res.ok) return;
        const connBody = res.data || {};
        const list: Connection[] = Array.isArray(connBody.data)
          ? (connBody.data as Connection[])
          : [];
        setConnections(list);

        if (typeof window !== "undefined") {
          try {
            const payload = {
              data: list,
              serverUpdatedAt:
                typeof (connBody as any).serverUpdatedAt === "number"
                  ? (connBody as any).serverUpdatedAt
                  : null,
              cachedAt: Date.now(),
            };
            window.localStorage.setItem(
              CONNECTIONS_STORAGE_KEY,
              JSON.stringify(payload)
            );
          } catch {}
        }
      } catch {}
    };

    loadConnections();
  }, [token]);

  // clinicName / connections 에 따라 기본 임플란트 선택
  useEffect(() => {
    // 이미 임플란트 정보가 구체적으로 설정되어 있다면 덮어쓰지 않는다.
    if (implantManufacturer && implantSystem && implantType) {
      return;
    }

    const applyDefaults = async () => {
      try {
        if (!clinicName) {
          return;
        }

        const list = connections;

        // 기본값은
        // 1) OSSTEM / Regular / Hex
        // 2) 전체 목록의 첫 항목
        const preferred = list.find(
          (c) =>
            c.manufacturer === "OSSTEM" &&
            c.system === "Regular" &&
            c.type === "Hex"
        ) as
          | { manufacturer?: string; system?: string; type?: string }
          | undefined;

        const fallbackFirst = list[0] as
          | { manufacturer?: string; system?: string; type?: string }
          | undefined;

        const baseManufacturer =
          preferred?.manufacturer || fallbackFirst?.manufacturer || "OSSTEM";
        const baseSystem =
          preferred?.system || fallbackFirst?.system || "Regular";
        const baseType = preferred?.type || fallbackFirst?.type || "Hex";

        const nextManufacturer = baseManufacturer;
        const nextSystem = baseSystem;
        const nextType = baseType;

        setImplantManufacturer(nextManufacturer);
        setImplantSystem(nextSystem);
        setImplantType(nextType);

        if (list.length > 0) {
          const found = list.find(
            (c) =>
              c.manufacturer === nextManufacturer &&
              c.system === nextSystem &&
              c.type === nextType
          );
          setSelectedConnectionId(found?._id ? String(found._id) : null);
        }

        // 기본 임플란트가 설정되었을 때 caseInfos에도 반영
        if (onDefaultImplantChange) {
          onDefaultImplantChange({
            implantManufacturer: nextManufacturer,
            implantSystem: nextSystem,
            implantType: nextType,
          });
        }
      } catch {}
    };

    applyDefaults();
  }, [
    token,
    clinicName,
    connections,
    implantManufacturer,
    implantSystem,
    implantType,
  ]);

  const syncSelectedConnection = (
    manufacturer: string,
    system: string,
    type: string
  ) => {
    const found = connections.find(
      (c) =>
        c.manufacturer === manufacturer &&
        c.system === system &&
        c.type === type
    );
    setSelectedConnectionId(found?._id ? String(found._id) : null);
  };

  const typeOptions = connections
    .filter(
      (c) =>
        (!implantManufacturer || c.manufacturer === implantManufacturer) &&
        (!implantSystem || c.system === implantSystem)
    )
    .map((c) => c.type as string)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  return {
    connections,
    selectedConnectionId,
    setSelectedConnectionId,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    syncSelectedConnection,
    typeOptions,
  };
};
