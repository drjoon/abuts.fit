import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/shared/ui/cn";
import { BusinessTab } from "../../BusinessTab";

interface OrganizationWizardProps {
  user: any;
}

export const OrganizationWizard = ({ user }: OrganizationWizardProps) => {
  const [roleChoice, setRoleChoice] = useState<"owner" | "member" | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-xs font-semibold text-slate-500">
        {["대표 · 신규 등록", "직원 · 조직 검색"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-white/80 bg-white/70 px-3 py-1"
          >
            {chip}
          </span>
        ))}
      </div>

      <Card className="rounded-3xl border border-slate-100/80 bg-white/95 shadow-xl shadow-slate-900/5">
        <CardHeader className="space-y-2 border-b border-slate-100/80 pb-4">
          <CardTitle className="text-xl font-semibold text-slate-900">
            역할 선택 & 조직 연결
          </CardTitle>
          <p className="text-sm text-slate-500">
            역할을 먼저 선택하세요. 필요 카드만 남겨드릴게요.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                roleChoice === "owner"
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
              )}
              onClick={() => setRoleChoice("owner")}
            >
              <p className="text-sm font-semibold">대표</p>
              <p className="mt-1 text-xs">사업자 등록</p>
            </button>
            <button
              type="button"
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                roleChoice === "member"
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
              )}
              onClick={() => setRoleChoice("member")}
            >
              <p className="text-sm font-semibold">직원</p>
              <p className="mt-1 text-xs">기존 조직 가입</p>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <BusinessTab userData={user} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
