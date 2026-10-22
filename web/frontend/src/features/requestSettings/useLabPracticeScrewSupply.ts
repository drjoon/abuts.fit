// related files:
// - web/backend/controllers/businesses/labPracticeScrewSupply.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferScrewSupply.controller.js
// - web/frontend/src/shared/practice/screwSupply.ts
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  findLabPracticeScrewSupply,
  normalizeScrewSupply,
  resolveScrewSupply,
  toPracticeNameKey,
  type LabPracticeScrewSupplyRow,
  type ScrewSupply,
} from "@/shared/practice/screwSupply";

type SaveInput = {
  screwSupply: ScrewSupply;
  practiceName?: string | null;
  practiceAnchorId?: string | null;
  transferId?: string | null;
};

type SupplyBody = {
  success?: boolean;
  message?: string;
  data?: {
    supplies?: LabPracticeScrewSupplyRow[];
    screwSupply?: ScrewSupply;
    preference?: LabPracticeScrewSupplyRow | null;
    practiceAnchorId?: string | null;
    practiceNameKey?: string;
  };
};

function readSupplies(body: SupplyBody | null): LabPracticeScrewSupplyRow[] {
  const rows = body?.data?.supplies;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const screwSupply = normalizeScrewSupply(row?.screwSupply);
      if (!screwSupply) return null;
      return {
        practiceAnchorId: String(row.practiceAnchorId || "").trim() || null,
        practiceNameKey: toPracticeNameKey(row.practiceNameKey),
        screwSupply,
      };
    })
    .filter((row): row is LabPracticeScrewSupplyRow => Boolean(row));
}

function mergeRow(
  rows: LabPracticeScrewSupplyRow[],
  next: LabPracticeScrewSupplyRow | null,
): LabPracticeScrewSupplyRow[] {
  if (!next) return rows;
  const id = String(next.practiceAnchorId || "").trim();
  const key = toPracticeNameKey(next.practiceNameKey);
  const idx = rows.findIndex((row) => {
    if (id && row.practiceAnchorId === id) return true;
    return Boolean(key) && row.practiceNameKey === key;
  });
  if (idx < 0) return [...rows, next];
  const copy = rows.slice();
  copy[idx] = {
    practiceAnchorId: id || copy[idx].practiceAnchorId,
    practiceNameKey: key || copy[idx].practiceNameKey,
    screwSupply: next.screwSupply,
  };
  return copy;
}

export function useLabPracticeScrewSupply(enabled = true) {
  const token = useAuthStore((s) => s.token);
  const [rows, setRows] = useState<LabPracticeScrewSupplyRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || !token) {
      setLoaded(true);
      return;
    }
    let cancel = false;
    void apiFetch<SupplyBody>({
      path: "/api/businesses/me/lab-practice-screw-supplies",
      token,
    }).then((res) => {
      if (cancel) return;
      if (res.ok) setRows(readSupplies(res.data));
      setLoaded(true);
    });
    return () => {
      cancel = true;
    };
  }, [enabled, token]);

  const lookup = useCallback(
    (input: { practiceAnchorId?: string | null; practiceName?: string | null }) =>
      findLabPracticeScrewSupply(rows, input) || "abuts",
    [rows],
  );

  const save = useCallback(
    async (input: SaveInput) => {
      const screwSupply = normalizeScrewSupply(input.screwSupply);
      if (!screwSupply || !token) return false;
      const transferId = String(input.transferId || "").trim();
      const practiceName = String(input.practiceName || "").trim();
      const practiceAnchorId = String(input.practiceAnchorId || "").trim();
      if (!transferId && !practiceName && !practiceAnchorId) return false;

      setSaving(true);
      try {
        const res = await apiFetch<SupplyBody>({
          path: transferId
            ? `/api/practice/transfers/${encodeURIComponent(transferId)}/screw-supply`
            : "/api/businesses/me/lab-practice-screw-supplies",
          method: "PUT",
          token,
          jsonBody: transferId
            ? { screwSupply }
            : { screwSupply, practiceName, practiceAnchorId: practiceAnchorId || undefined },
        });
        if (!res.ok) return false;
        const preference = res.data?.data?.preference;
        const saved = normalizeScrewSupply(
          preference?.screwSupply || res.data?.data?.screwSupply,
        );
        if (saved) {
          setRows((prev) =>
            mergeRow(prev, {
              practiceAnchorId:
                String(preference?.practiceAnchorId || practiceAnchorId || "").trim() ||
                null,
              practiceNameKey: toPracticeNameKey(
                preference?.practiceNameKey || practiceName,
              ),
              screwSupply: saved,
            }),
          );
        }
        return true;
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  return {
    loaded,
    saving,
    lookup,
    save,
    resolve: (
      explicit: unknown,
      input: { practiceAnchorId?: string | null; practiceName?: string | null },
    ) => resolveScrewSupply(explicit, findLabPracticeScrewSupply(rows, input)),
  };
}
