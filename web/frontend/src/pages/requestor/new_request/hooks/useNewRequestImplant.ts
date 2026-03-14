import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import type { Connection } from "./newRequestTypes";

const IMPLANT_PRESETS_STORAGE_KEY = "abutsfit:implant-presets:v1";
const IMPLANT_PRESETS_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1년

export type UseNewRequestImplantParams = {
  token: string | null;
  clinicName?: string;
  onDefaultImplantChange?: (fields: {
    implantManufacturer: string;
    implantBrand: string;
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

  // implant preset 목록은 토큰 기준으로 한 번만 조회
  useEffect(() => {
    const loadImplantPresets = async () => {
      try {
        // 1) localStorage 캐시 확인
        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage.getItem(
              IMPLANT_PRESETS_STORAGE_KEY,
            );
            if (stored) {
              const parsed = JSON.parse(stored) as {
                data: any[];
                serverUpdatedAt?: number | null;
                cachedAt: number;
              };
              const age = Date.now() - parsed.cachedAt;
              if (
                age <= IMPLANT_PRESETS_TTL_MS &&
                Array.isArray(parsed.data) &&
                parsed.data.length > 0
              ) {
                setConnections(parsed.data);
                return;
              }
            }
          } catch {}
        }

        // 2) 캐시가 없거나 만료된 경우 서버에서 조회 후 캐시 저장
        const res = await apiFetch<any>({
          path: "/api/implant-presets",
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
              IMPLANT_PRESETS_STORAGE_KEY,
              JSON.stringify(payload),
            );
          } catch {}
        }
      } catch {}
    };

    loadImplantPresets();
  }, [token]);

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
            implantManufacturer,
            implantBrand,
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
