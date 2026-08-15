// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
import { Building2, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type ParentBusinessPayload = {
  data?: {
    divisionName?: string | null;
    parentBusiness?: {
      id?: string;
      name?: string;
      businessType?: string;
    } | null;
  };
  divisionName?: string | null;
  parentBusiness?: {
    id?: string;
    name?: string;
    businessType?: string;
  } | null;
};

/** 어벗츠기공소 설정 — 법인(어벗츠 주식회사) · 하위조직(기공사업부) 안내 */
export function InternalLabOrgBanner() {
  const { token, user } = useAuthStore();
  const enabled = user?.role === "internalLab" && Boolean(token);

  const { data } = useQuery({
    queryKey: ["internalLab-org-banner", user?.id],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await request<ParentBusinessPayload>({
        path: "/api/businesses/me?businessType=internalLab",
        method: "GET",
        token: token || undefined,
      });
      if (!res.ok) return null;
      const body = res.data || {};
      return body.data || body;
    },
  });

  if (!enabled) return null;

  const parentName = String(data?.parentBusiness?.name || "어벗츠 주식회사").trim();
  const divisionName = String(data?.divisionName || "기공사업부").trim();

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <Layers className="h-4 w-4 text-primary-strong" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">조직</p>
          <p className="text-xs text-muted-foreground">
            동일 사업자등록 · 하위 사업부
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs text-muted-foreground">법인</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {parentName}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
          <p className="text-xs text-muted-foreground">사업부</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {divisionName}
          </p>
        </div>
      </div>
    </div>
  );
}
