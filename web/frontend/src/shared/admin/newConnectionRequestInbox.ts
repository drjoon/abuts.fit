import { apiFetch } from "@/shared/api/apiClient";

export async function acknowledgeAdminNewConnectionRequest(
  requestMongoId: string,
): Promise<boolean> {
  const id = String(requestMongoId || "").trim();
  if (!id) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/dashboard/new-connection-requests/${encodeURIComponent(id)}/acknowledge`,
      method: "POST",
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function restoreAdminNewConnectionRequest(
  requestMongoId: string,
): Promise<boolean> {
  const id = String(requestMongoId || "").trim();
  if (!id) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/dashboard/new-connection-requests/${encodeURIComponent(id)}/restore`,
      method: "POST",
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}
