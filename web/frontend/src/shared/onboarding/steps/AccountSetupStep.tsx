import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import type { SharedAccountDraft } from "../types";

interface AccountSetupStepProps {
  token: string;
  draft: SharedAccountDraft;
  onDraftChange: (next: SharedAccountDraft) => void;
  registerSubmitAction?: (action: (() => Promise<boolean>) | null) => void;
}

export const AccountSetupStep = ({
  token,
  draft,
  onDraftChange,
  registerSubmitAction,
}: AccountSetupStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await request<any>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const body = res.data || {};
        const data = body.data || body;
        onDraftChange({
          name: String(data?.name || draft.name || ""),
          email: String(data?.email || draft.email || ""),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async () => {
    if (!draft.name.trim()) {
      setNameError("이름을 입력해주세요");
      nameRef.current?.focus();
      return false;
    }
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          name: draft.name.trim(),
        },
      });
      if (!res.ok) {
        const body = res.data || {};
        throw new Error(String(body?.message || "계정 저장에 실패했습니다."));
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

  useEffect(() => {
    registerSubmitAction?.(() => handleSubmit());
    return () => registerSubmitAction?.(null);
  }, [draft, registerSubmitAction]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 계정 정보를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          이름
          {nameError && <span className="ml-2 text-xs text-destructive">{nameError}</span>}
        </Label>
        <Input
          ref={nameRef}
          value={draft.name}
          onChange={(e) => {
            onDraftChange({ ...draft, name: e.target.value });
            if (nameError) setNameError("");
          }}
          placeholder="홍길동"
          className="placeholder:text-slate-300"
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <Label>이메일</Label>
        <Input value={draft.email} disabled className="placeholder:text-slate-300" />
      </div>
    </div>
  );
};
