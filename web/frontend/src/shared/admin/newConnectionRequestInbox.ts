import { apiFetch } from "@/shared/api/apiClient";

export type NewConnectionGroupWorkflowFlags = {
  read?: boolean;
  inDevelopment?: boolean;
  developmentComplete?: boolean;
};

export async function updateAdminNewConnectionGroupWorkflow(
  groupKey: string,
  flags: NewConnectionGroupWorkflowFlags,
): Promise<boolean> {
  const key = String(groupKey || "").trim();
  if (!key) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/dashboard/new-connection-groups/${encodeURIComponent(key)}/workflow`,
      method: "PATCH",
      jsonBody: flags,
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function updateAdminNewConnectionGroupCanonical(
  groupKey: string,
  payload: {
    canonicalManufacturer?: string;
    canonicalBrand?: string;
    mergeAlias?: { manufacturer: string; brand: string };
  },
): Promise<boolean> {
  const key = String(groupKey || "").trim();
  if (!key) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/dashboard/new-connection-groups/${encodeURIComponent(key)}/canonical`,
      method: "PATCH",
      jsonBody: payload,
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function mergeAdminNewConnectionGroups(
  fromGroupKey: string,
  toGroupKey: string,
): Promise<boolean> {
  const fromKey = String(fromGroupKey || "").trim();
  const toKey = String(toGroupKey || "").trim();
  if (!fromKey || !toKey) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: "/api/admin/dashboard/new-connection-groups/merge",
      method: "POST",
      jsonBody: { fromGroupKey: fromKey, toGroupKey: toKey },
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function updateAdminNewConnectionRequestImplant(
  requestMongoId: string,
  payload: {
    implantManufacturer: string;
    implantBrand: string;
    implantFamily?: string;
    implantType?: string;
    mergeAlias?: { manufacturer: string; brand: string };
    targetGroupKey?: string;
  },
): Promise<boolean> {
  const id = String(requestMongoId || "").trim();
  if (!id) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/dashboard/new-connection-requests/${encodeURIComponent(id)}/implant`,
      method: "PATCH",
      jsonBody: payload,
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export type ImplantNameSuggestion = {
  manufacturer: string;
  brand: string;
};

export async function suggestImplantNameRegistry(params: {
  field: "manufacturer" | "brand";
  q: string;
  manufacturer?: string;
}): Promise<ImplantNameSuggestion[]> {
  const q = String(params.q || "").trim();
  if (!q) return [];
  const search = new URLSearchParams({
    field: params.field,
    q,
  });
  if (params.manufacturer) {
    search.set("manufacturer", params.manufacturer);
  }
  try {
    const res = await apiFetch<{
      success?: boolean;
      data?: { items?: ImplantNameSuggestion[] };
    }>({
      path: `/api/implant-name-registry/suggest?${search.toString()}`,
    });
    if (!res.ok) return [];
    const items = res.data?.data?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}
