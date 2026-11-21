// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/implantProducerMatch.controller.js
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ManufacturerOption = {
  anchorId: string;
  name: string;
  operatingStatus: "running" | "paused";
  productionControl: "platform" | "self";
  approved: boolean;
};

type BrandRow = {
  brandKey: string;
  implantManufacturer: string;
  implantBrand: string;
  label: string;
  defaultManufacturerAnchorId: string;
  alternateManufacturerAnchorId: string;
};

type MatchPayload = {
  brands: BrandRow[];
  manufacturers: ManufacturerOption[];
};

export function ImplantBrandProducerMatchDialog({
  open,
  token,
  onOpenChange,
}: {
  open: boolean;
  token: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void apiFetch<{ success: boolean; data: MatchPayload }>({
      path: "/api/admin/implant-producer-matches",
      method: "GET",
      token,
    }).then((res) => {
      if (cancelled || !res.ok || !res.data?.data) return;
      setBrands(res.data.data.brands || []);
      setManufacturers(res.data.data.manufacturers || []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  const grouped = useMemo(() => {
    const map = new Map<string, BrandRow[]>();
    for (const brand of brands) {
      const key = brand.implantManufacturer || "기타";
      const list = map.get(key) || [];
      list.push(brand);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [brands]);

  const platformId =
    manufacturers.find((row) => row.productionControl === "platform")?.anchorId ||
    "";

  const setPlatform = (anchorId: string) => {
    setManufacturers((current) =>
      current.map((row) => ({
        ...row,
        productionControl: row.anchorId === anchorId ? "platform" : "self",
      })),
    );
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    const res = await apiFetch<{ success: boolean; message?: string; data?: MatchPayload }>({
      path: "/api/admin/implant-producer-matches",
      method: "PUT",
      token,
      jsonBody: {
        matches: brands.map((brand) => ({
          brandKey: brand.brandKey,
          defaultManufacturerAnchorId: brand.defaultManufacturerAnchorId,
          alternateManufacturerAnchorId: brand.alternateManufacturerAnchorId,
        })),
        operating: manufacturers.map((row) => ({
          anchorId: row.anchorId,
          operatingStatus: row.operatingStatus,
        })),
        platformAnchorId: platformId,
      },
    });
    setSaving(false);
    if (!res.ok || !res.data?.success) {
      toast({
        title: "저장하지 못했습니다",
        description: res.data?.message || "다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    if (res.data.data) {
      setBrands(res.data.data.brands || []);
      setManufacturers(res.data.data.manufacturers || []);
    }
    toast({ title: "생산 제조사 매칭을 저장했습니다" });
  };

  const manufacturerLabel = (row: ManufacturerOption) => {
    const state = [
      row.approved ? "승인" : "승인 전",
      row.operatingStatus === "paused" ? "중단" : "가동",
      row.productionControl === "platform" ? "플랫폼" : "자체",
    ].join(" · ");
    return `${row.name} (${state})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>임플란트 브랜드 · 생산 제조사</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-1.5 py-1.5">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            플랫폼 제어 제조사
            <select
              className="h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={platformId}
              onChange={(event) => setPlatform(event.target.value)}
            >
              <option value="">선택</option>
              {manufacturers.map((row) => (
                <option key={row.anchorId} value={row.anchorId}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">제조사 가동</p>
            {manufacturers.map((row) => (
              <div key={row.anchorId} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm">{manufacturerLabel(row)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setManufacturers((current) =>
                      current.map((item) =>
                        item.anchorId === row.anchorId
                          ? {
                              ...item,
                              operatingStatus:
                                item.operatingStatus === "paused"
                                  ? "running"
                                  : "paused",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {row.operatingStatus === "paused" ? "가동" : "중단"}
                </Button>
              </div>
            ))}
          </div>
          {grouped.map(([manufacturer, rows]) => (
            <div key={manufacturer} className="space-y-2">
              <p className="text-sm font-medium text-slate-800">{manufacturer}</p>
              {rows.map((brand) => (
                <div
                  key={brand.brandKey}
                  className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[8rem_1fr_1fr]"
                >
                  <span className="text-sm text-slate-700">{brand.label}</span>
                  <select
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                    value={brand.defaultManufacturerAnchorId}
                    onChange={(event) =>
                      setBrands((current) =>
                        current.map((item) =>
                          item.brandKey === brand.brandKey
                            ? {
                                ...item,
                                defaultManufacturerAnchorId: event.target.value,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">플랫폼 제조사</option>
                    {manufacturers.map((row) => (
                      <option key={row.anchorId} value={row.anchorId}>
                        {manufacturerLabel(row)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                    value={brand.alternateManufacturerAnchorId}
                    onChange={(event) =>
                      setBrands((current) =>
                        current.map((item) =>
                          item.brandKey === brand.brandKey
                            ? {
                                ...item,
                                alternateManufacturerAnchorId: event.target.value,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">대체 없음</option>
                    {manufacturers.map((row) => (
                      <option key={row.anchorId} value={row.anchorId}>
                        {manufacturerLabel(row)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
