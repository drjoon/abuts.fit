import { useEffect, useState } from "react";

const CONNECTIONS_STORAGE_KEY = "abutsfit:connections:v1";
const CONNECTIONS_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1년

export type UseNewRequestImplantParams = {
  token: string | null;
  clinicName?: string;
  onDefaultImplantChange?: (fields: {
    implantSystem: string;
    implantType: string;
    connectionType: string;
  }) => void;
};

export const useNewRequestImplant = ({
  token,
  clinicName,
  onDefaultImplantChange,
}: UseNewRequestImplantParams) => {
  const [connections, setConnections] = useState<any[]>([]);
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
        const connRes = await fetch("/api/connections");
        if (!connRes.ok) return;
        const connBody = await connRes.json().catch(() => ({}));
        const list: any[] = Array.isArray(connBody.data) ? connBody.data : [];
        setConnections(list);

        if (typeof window !== "undefined") {
          try {
            const payload = {
              data: list,
              serverUpdatedAt:
                typeof connBody.serverUpdatedAt === "number"
                  ? connBody.serverUpdatedAt
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
    const applyDefaults = async () => {
      try {
        // NOTE: 자동 임플란트 설정은 useNewRequestFiles에서 처리하므로,
        // 여기서는 즐겨찾기 또는 기본값으로 초기화만 수행한다.
        // 단, 이미 값이 있는 경우 (예: draft에서 로드)에는 덮어쓰지 않는다.
        if (implantManufacturer || implantSystem || implantType) {
          return;
        }

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
          setSelectedConnectionId(found ? (found._id as string) : null);
        }

        // 기본 임플란트가 설정되었을 때 caseInfos에도 반영
        if (onDefaultImplantChange) {
          onDefaultImplantChange({
            // backend 스키마 기준: implantSystem = manufacturer, implantType = system, connectionType = type
            implantSystem: nextManufacturer,
            implantType: nextSystem,
            connectionType: nextType,
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
    setSelectedConnectionId(found ? (found._id as string) : null);
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
