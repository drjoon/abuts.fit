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
        const baseManufacturer = "OSSTEM";
        const baseSystem = "Regular";
        const baseType = "Hex";

        const connRes = await fetch("/api/connections");
        if (!connRes.ok) return;
        const connBody = await connRes.json().catch(() => ({}));
        const list: any[] = Array.isArray(connBody.data) ? connBody.data : [];
        setConnections(list);

        const hasDraftImplantValues = Boolean(
          implantManufacturer || implantSystem || implantType
        );

        let favorite: {
          implantManufacturer?: string;
          implantSystem?: string;
          implantType?: string;
        } | null = null;

        if (token) {
          const favRes = await fetch("/api/requests/my/favorite-implant", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (favRes.ok) {
            const favBody = await favRes.json().catch(() => ({}));
            if (favBody && favBody.data) {
              favorite = favBody.data;
            }
          }
        }

        if (hasDraftImplantValues) {
          if (list.length > 0) {
            const found = list.find(
              (c) =>
                c.manufacturer === implantManufacturer &&
                c.system === implantSystem &&
                c.type === implantType
            );
            setSelectedConnectionId(found ? (found._id as string) : null);
          }
          return;
        }

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

          if (found) {
            setSelectedConnectionId(found._id as string);
          } else {
            const first = list[0];
            setSelectedConnectionId(first._id as string);
          }
        }
      } catch {}
    };

    loadInitialData();
  }, [token, implantManufacturer, implantSystem, implantType]);

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
