import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import type { SharedOrganizationDraft } from "../types";

interface OrganizationResult {
  _id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
}

interface OrganizationSetupStepProps {
  token: string;
  organizationType: string;
  draft: SharedOrganizationDraft;
  onDraftChange: (next: SharedOrganizationDraft) => void;
  registerSubmitAction?: (action: (() => Promise<boolean>) | null) => void;
}

export const OrganizationSetupStep = ({
  token,
  organizationType,
  draft,
  onDraftChange,
  registerSubmitAction,
}: OrganizationSetupStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<OrganizationResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (draft.membershipRole !== "member") {
      setResults([]);
      return;
    }
    const keyword = draft.searchKeyword.trim();
    if (!keyword) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await request<any>({
          path: `/api/requestor-organizations/search?q=${encodeURIComponent(keyword)}&organizationType=${encodeURIComponent(organizationType)}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = res.data || {};
        const data = body.data || body;
        setResults(Array.isArray(data) ? data : []);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [draft.membershipRole, draft.searchKeyword, organizationType, token]);

  const saveOwner = async () => {
    if (!draft.organizationName.trim()) {
      toast({ title: "기공소 이름을 입력해주세요", variant: "destructive" });
      return false;
    }
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/requestor-organizations/me",
        method: "PUT",
        token,
        jsonBody: {
          organizationType,
          name: draft.organizationName.trim(),
          representativeName: draft.representativeName.trim(),
          businessNumber: draft.businessNumber.replace(/\D/g, ""),
          phoneNumber: draft.phoneNumber.trim(),
          email: draft.email.trim(),
          address: draft.address.trim(),
        },
      });
      if (!res.ok) {
        const body = res.data || {};
        throw new Error(String(body?.message || "조직 저장 실패"));
      }
      return true;
    } catch (error: any) {
      toast({
        title: "저장 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async () => {
    if (!draft.selectedOrganizationId) {
      setSearchError("조직을 선택해주세요");
      searchRef.current?.focus();
      return false;
    }
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/requestor-organizations/join-requests",
        method: "POST",
        token,
        jsonBody: {
          organizationId: draft.selectedOrganizationId,
          organizationType,
        },
      });
      if (!res.ok) {
        const body = res.data || {};
        throw new Error(String(body?.message || "조직 가입 신청 실패"));
      }
      return true;
    } catch (error: any) {
      toast({
        title: "신청 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    registerSubmitAction?.(() =>
      draft.membershipRole === "owner" ? saveOwner() : saveMember(),
    );
    return () => registerSubmitAction?.(null);
  }, [draft, registerSubmitAction]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant={draft.membershipRole === "owner" ? "default" : "outline"}
          onClick={() =>
            onDraftChange({
              ...draft,
              membershipRole: "owner",
              selectedOrganizationId: "",
            })
          }
          disabled={saving}
        >
          대표
        </Button>
        <Button
          type="button"
          variant={draft.membershipRole === "member" ? "default" : "outline"}
          onClick={() => onDraftChange({ ...draft, membershipRole: "member" })}
          disabled={saving}
        >
          직원
        </Button>
      </div>

      {draft.membershipRole === "owner" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            value={draft.organizationName}
            onChange={(e) =>
              onDraftChange({ ...draft, organizationName: e.target.value })
            }
            placeholder="기공소 이름"
            className="placeholder:text-slate-300"
          />
          <Input
            value={draft.representativeName}
            onChange={(e) =>
              onDraftChange({ ...draft, representativeName: e.target.value })
            }
            placeholder="대표자 이름"
            className="placeholder:text-slate-300"
          />
          <Input
            value={draft.businessNumber}
            onChange={(e) =>
              onDraftChange({ ...draft, businessNumber: e.target.value })
            }
            placeholder="사업자등록번호"
            className="placeholder:text-slate-300"
          />
          <Input
            value={draft.phoneNumber}
            onChange={(e) => onDraftChange({ ...draft, phoneNumber: e.target.value })}
            placeholder="대표 전화번호"
            className="placeholder:text-slate-300"
          />
          <Input
            value={draft.email}
            onChange={(e) => onDraftChange({ ...draft, email: e.target.value })}
            placeholder="세금계산서 이메일"
            className="placeholder:text-slate-300 sm:col-span-2"
          />
          <Input
            value={draft.address}
            onChange={(e) => onDraftChange({ ...draft, address: e.target.value })}
            placeholder="사업장 주소"
            className="placeholder:text-slate-300 sm:col-span-2"
          />
        </div>
      )}

      {draft.membershipRole === "member" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>
              조직 검색
              {searchError && (
                <span className="ml-2 text-xs text-destructive">{searchError}</span>
              )}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={searchRef}
                value={draft.searchKeyword}
                onChange={(e) => {
                  onDraftChange({
                    ...draft,
                    searchKeyword: e.target.value,
                    selectedOrganizationId: "",
                  });
                  if (searchError) setSearchError("");
                }}
                placeholder="조직명, 대표자명, 사업자번호 검색"
                className={cn("pl-9 placeholder:text-slate-300", searchError ? "border-destructive" : "")}
              />
            </div>
            {searching && (
              <p className="text-xs text-slate-400">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> 검색 중...
              </p>
            )}
          </div>

          <div className="space-y-2">
            {results.map((org) => {
              const selected = draft.selectedOrganizationId === org._id;
              return (
                <button
                  key={org._id}
                  type="button"
                  onClick={() =>
                    onDraftChange({ ...draft, selectedOrganizationId: org._id })
                  }
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left text-sm",
                    selected
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <p className="font-medium text-slate-900">{org.name}</p>
                  <p className="text-xs text-slate-500">
                    {[org.representativeName, org.businessNumber, org.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {saving && <p className="text-xs text-slate-400">저장 중...</p>}
    </div>
  );
};
