import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, Check, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { cn } from "@/shared/ui/cn";

interface ProfileStepProps {
  defaultCompleted?: boolean;
  onComplete?: () => void;
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
}

type ProfileDraft = {
  name?: string;
  profileImage?: string;
};

const PROFILE_DRAFT_KEY = "wizard.profileDraft";

const readProfileDraft = (): ProfileDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        name: typeof parsed.name === "string" ? parsed.name : "",
        profileImage:
          typeof parsed.profileImage === "string" ? parsed.profileImage : "",
      };
    }
    return null;
  } catch {
    return null;
  }
};

const saveProfileDraft = (draft: ProfileDraft | null) => {
  if (typeof window === "undefined") return;
  if (!draft || (!draft.name && !draft.profileImage)) {
    window.localStorage.removeItem(PROFILE_DRAFT_KEY);
    return;
  }
  window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
};

export const ProfileStep = ({
  defaultCompleted,
  onComplete,
  registerGoNextAction,
}: ProfileStepProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const initialDraft = useMemo(() => readProfileDraft(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState("");
  const [profileImage, setProfileImage] = useState(
    initialDraft?.profileImage ?? "",
  );
  const [avatarNonce, setAvatarNonce] = useState(0);
  const [completed, setCompleted] = useState(Boolean(defaultCompleted));
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (defaultCompleted) {
      setCompleted(true);
    }
  }, [defaultCompleted]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const res = await request<any>({
          path: "/api/users/profile",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const body: any = res.data || {};
        const data = body.data || body;
        if (cancelled) return;
        setName((prev) =>
          prev.trim().length > 0 ? prev : String(data?.name || ""),
        );
        setEmail(String(data?.email || ""));
        setProfileImage((prev) =>
          prev ? prev : String(data?.profileImage || ""),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const avatarOptions = useMemo(() => {
    const seedBase = (email || name || "user").trim().slice(0, 30);
    const seeds = [1, 2, 3, 4].map(
      (idx) => `${seedBase}-${avatarNonce}-${idx}`,
    );
    return seeds.map(
      (seed) =>
        `https://robohash.org/${encodeURIComponent(seed)}?set=set4&bgset=bg1`,
    );
  }, [email, name, avatarNonce]);

  const handleSave = useCallback(async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return false;
    }
    if (!name.trim()) {
      setNameError("이름을 입력해주세요");
      nameInputRef.current?.focus();
      return false;
    }
    setSaving(true);
    try {
      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          name: name.trim(),
          profileImage: profileImage || undefined,
        },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        throw new Error(body?.message || "저장에 실패했습니다.");
      }
      toast({ title: "저장되었습니다" });
      saveProfileDraft(null);
      if (!completed) {
        setCompleted(true);
        onComplete?.();
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
  }, [
    completed,
    name,
    onComplete,
    profileImage,
    request,
    saving,
    token,
    toast,
  ]);

  useEffect(() => {
    registerGoNextAction?.(() => handleSave());
    return () => registerGoNextAction?.(null);
  }, [handleSave, registerGoNextAction]);

  useEffect(() => {
    if (loading) return;
    const trimmedName = name.trim();
    if (!trimmedName && !profileImage) {
      saveProfileDraft(null);
      return;
    }
    saveProfileDraft({ name: trimmedName, profileImage });
  }, [loading, name, profileImage]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 프로필 정보를 불러오는
        중…
      </div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSave();
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="flex flex-col items-center text-center">
        <Avatar className="h-20 w-20 border border-white shadow-sm">
          <AvatarImage src={profileImage || undefined} alt={name} />
          <AvatarFallback className="bg-slate-50">
            <Camera className="h-6 w-6 text-slate-400" />
          </AvatarFallback>
        </Avatar>
        <p className="mt-3 text-xs text-slate-500">
          프로필 이미지를 골라주세요.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 justify-items-center">
        {avatarOptions.slice(0, 4).map((url) => (
          <button
            key={url}
            type="button"
            className={cn(
              "rounded-full border p-0.5 transition",
              profileImage === url
                ? "border-slate-900"
                : "border-slate-200 hover:border-slate-300",
            )}
            onClick={() => setProfileImage(url)}
          >
            <img src={url} alt="avatar" className="h-12 w-12 rounded-full" />
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-500"
          onClick={() => setAvatarNonce((v) => v + 1)}
          aria-label="다른 이미지 불러오기"
        >
          <RefreshCcw className="h-4 w-4" /> 다른 이미지
        </button>
      </div>
    </form>
  );
};
