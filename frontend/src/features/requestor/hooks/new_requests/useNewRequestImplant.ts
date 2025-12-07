import { useEffect, useState } from "react";

export type UseNewRequestImplantParams = {
  token: string | null;
};

export const useNewRequestImplant = ({ token }: UseNewRequestImplantParams) => {
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [implantManufacturer, setImplantManufacturer] = useState("");
  const [implantSystem, setImplantSystem] = useState("");
  const [implantType, setImplantType] = useState("");

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const connRes = await fetch("/api/connections");
        if (!connRes.ok) return;
        const connBody = await connRes.json().catch(() => ({}));
        const list: any[] = Array.isArray(connBody.data) ? connBody.data : [];
        setConnections(list);

        // NOTE: 자동 임플란트 설정은 useNewRequestFiles에서 처리하므로,
        // 여기서는 즐겨찾기 또는 기본값으로 초기화만 수행한다.
        // 단, 이미 값이 있는 경우 (예: draft에서 로드)에는 덮어쓰지 않는다.
        if (implantManufacturer || implantSystem || implantType) {
          return;
        }

        let favorite: {
          implantManufacturer?: string;
          implantSystem?: string;
          implantType?: string;
        } | null = null;

        if (token) {
          const favRes = await fetch("/api/requests/my/favorite-implant", {
            headers: {
              Authorization: `Bearer ${token}`,
              "x-mock-role": "requestor",
            },
          });

          if (favRes.ok) {
            const favBody = await favRes.json().catch(() => ({}));
            if (favBody && favBody.data) {
              favorite = favBody.data;
            }
          }
        }

        // 기본값은 하드코딩(OSSTEM)이 아니라, 실제 connections 목록의 첫 번째 항목을 기준으로 잡는다.
        // 즐겨찾기(favorite)가 있으면 그 값을 우선 사용하고, 없으면 첫 커넥션을 기본값으로.
        const first = list[0] as
          | { manufacturer?: string; system?: string; type?: string }
          | undefined;

        const baseManufacturer = first?.manufacturer || "OSSTEM";
        const baseSystem = first?.system || "Regular";
        const baseType = first?.type || "Hex";

        const nextManufacturer =
          favorite?.implantManufacturer || baseManufacturer;
        const nextSystem = favorite?.implantSystem || baseSystem;
        const nextType = favorite?.implantType || baseType;

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
      } catch {}
    };

    loadInitialData();
  }, [token]);

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
