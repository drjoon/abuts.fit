import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound,
  Save,
  User,
  Camera,
  Link2,
  RefreshCcw,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isValidE164,
  normalizeE164FromParts,
  splitE164ToParts,
  COUNTRY_DIAL_CODES,
} from "@/features/components/InternationalPhoneInput";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface AccountTabProps {
  userData: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

export const AccountTab = ({ userData }: AccountTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const [avatarNonce, setAvatarNonce] = useState(0);

  const [authMethods, setAuthMethods] = useState({
    email: true,
    google: false,
    kakao: false,
  });

  const getFriendlySaveError = (status: number, message: string) => {
    if (status === 401) {
      return {
        title: "로그인이 만료되었어요",
        description: "다시 로그인한 뒤 저장을 시도해주세요.",
      };
    }
    if (status === 403) {
      return {
        title: "권한이 없어요",
        description: "이 계정에서는 해당 설정을 변경할 수 없습니다.",
      };
    }
    if (status === 409) {
      return {
        title: "이미 사용 중인 정보예요",
        description: message,
      };
    }
    return {
      title: "저장에 실패했어요",
      description: message,
    };
  };

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
  }>({});

  const [profile, setProfile] = useState(() => {
    const initialPhone = splitE164ToParts((user as any)?.phoneNumber || "");
    return {
      name: userData?.name || "",
      email: userData?.email || "",
      phoneDialCode: initialPhone.dialCode,
      phoneNationalNumber: initialPhone.nationalNumber,
      organization: (user as any)?.organization || "",
      profileImage: "",
    };
  });

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "manufacturer") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || profile.organization || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [
    profile.organization,
    token,
    user?.email,
    user?.name,
    user?.role,
    userData?.email,
    userData?.name,
    userData?.role,
  ]);

  const avatarOptions = useMemo(() => {
    const seedBase = (profile.email || profile.name || "user")
      .trim()
      .slice(0, 30);
    const seeds = [
      `${seedBase}-${avatarNonce}-1`,
      `${seedBase}-${avatarNonce}-2`,
      `${seedBase}-${avatarNonce}-3`,
      `${seedBase}-${avatarNonce}-4`,
    ];
    return seeds.map(
      (seed) =>
        `https://robohash.org/${encodeURIComponent(seed)}?set=set4&bgset=bg1`
    );
  }, [avatarNonce, profile.email, profile.name]);

  useEffect(() => {
    try {
      if (!token) return;
      request<any>({
        path: "/api/users/profile",
        method: "GET",
        token,
        headers: mockHeaders,
      }).then((res) => {
        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;

        setProfile((prev) => {
          const nextPhone = splitE164ToParts(data?.phoneNumber ?? "");
          return {
            ...prev,
            name: data?.name ?? prev.name,
            email: data?.email ?? prev.email,
            phoneDialCode: nextPhone.dialCode,
            phoneNationalNumber: nextPhone.nationalNumber,
            organization: data?.organization ?? prev.organization,
            profileImage: data?.profileImage ?? prev.profileImage,
          };
        });

        setPhoneVerifiedAt(
          data?.phoneVerifiedAt ? String(data.phoneVerifiedAt) : null
        );

        const nextAuthMethods = (data as any)?.authMethods;
        if (nextAuthMethods && typeof nextAuthMethods === "object") {
          setAuthMethods((prev) => ({
            ...prev,
            email: nextAuthMethods.email !== false,
            google: !!nextAuthMethods.google,
            kakao: !!nextAuthMethods.kakao,
          }));
        }
      });
    } catch {
      // ignore
    }
  }, [mockHeaders, token, userData?.email]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
  });

  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState<
    "idle" | "sending" | "verifying"
  >("idle");
  const [verificationSent, setVerificationSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countryOpen, setCountryOpen] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const phoneValidation = useMemo(() => {
    const normalized = normalizeE164FromParts(
      profile.phoneDialCode,
      profile.phoneNationalNumber
    );
    const ok = isValidE164(normalized);
    return {
      ok,
      normalized,
      message:
        !profile.phoneNationalNumber.trim() || ok
          ? ""
          : "국제번호 포함 전화번호를 입력해주세요. 예: +821012345678",
    };
  }, [profile.phoneDialCode, profile.phoneNationalNumber]);

  const canSendPhoneVerification =
    phoneValidation.ok &&
    !!phoneValidation.normalized &&
    phoneVerificationLoading === "idle";

  const handleSendPhoneVerification = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (!phoneValidation.ok || !phoneValidation.normalized) {
      toast({
        title: "휴대폰번호를 확인해주세요",
        description: "휴대폰번호 형식이 올바르지 않습니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setPhoneVerificationLoading("sending");
    try {
      const res = await request<any>({
        path: "/api/users/phone-verification/send",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { phoneNumber: phoneValidation.normalized },
      });

      if (!res.ok) {
        const body: any = res.data || {};
        const msg =
          body?.message ||
          body?.error ||
          (typeof body === "string" ? body : "인증번호 발송에 실패했습니다.");
        toast({
          title: "인증번호 발송 실패",
          description: String(msg),
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const body: any = res.data || {};
      const data = body.data || body;

      setPhoneVerificationCode("");
      setPhoneVerifiedAt(null);
      setVerificationSent(true);
      setTimeLeft(180); // 3분 타이머

      toast({
        title: "인증번호를 발송했어요",
        description: "문자로 받은 인증번호를 입력해주세요.",
        duration: 3000,
      });

      if (data?.devCode) {
        toast({
          title: "개발용 인증번호",
          description: String(data.devCode),
          duration: 3000,
        });
      }
    } catch {
      toast({
        title: "인증번호 발송 실패",
        description: "인증번호 발송 요청을 보내지 못했어요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setPhoneVerificationLoading("idle");
    }
  };

  const handleVerifyPhoneVerification = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const code = phoneVerificationCode.trim();
    if (!/^\d{4,8}$/.test(code)) {
      toast({
        title: "인증번호를 확인해주세요",
        description: "4~8자리 숫자를 입력해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setPhoneVerificationLoading("verifying");
    try {
      const res = await request<any>({
        path: "/api/users/phone-verification/verify",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { code },
      });

      if (!res.ok) {
        const body: any = res.data || {};
        const msg =
          body?.message ||
          body?.error ||
          (typeof body === "string" ? body : "인증번호 확인에 실패했습니다.");
        toast({
          title: "인증 실패",
          description: String(msg),
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const body: any = res.data || {};
      const data = body.data || body;
      setPhoneVerifiedAt(
        data?.phoneVerifiedAt ? String(data.phoneVerifiedAt) : null
      );
      setVerificationSent(false);
      setTimeLeft(0);
      toast({
        title: "전화번호 인증 완료",
        duration: 2000,
      });
    } catch {
      toast({
        title: "인증 실패",
        description: "인증 요청을 보내지 못했어요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setPhoneVerificationLoading("idle");
    }
  };

  const handleSave = async () => {
    const nextErrors: { name?: string; phone?: string } = {};
    if (!profile.name.trim()) {
      nextErrors.name = "이름을 입력해주세요";
    }
    if (!profile.phoneNationalNumber.trim()) {
      nextErrors.phone = "전화번호를 입력해주세요";
    } else if (!phoneValidation.ok) {
      nextErrors.phone =
        phoneValidation.message || "전화번호 형식을 확인해주세요";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast({
        title: "입력값을 확인해주세요",
        description: "빨간색으로 표시된 항목을 확인해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        headers: mockHeaders,
        jsonBody: {
          name: profile.name,
          phoneNumber: phoneValidation.normalized,
          organization: profile.organization,
          profileImage: profile.profileImage,
        },
      });

      if (!res.ok) {
        const body: any = res.data || {};
        const message =
          body?.message ||
          body?.error ||
          (typeof body === "string" ? body : "프로필 저장에 실패했습니다.");

        const serverErrors: { name?: string; phone?: string } = {};
        const msg = String(message);
        if (msg.includes("이름")) serverErrors.name = msg;
        if (msg.includes("전화") || msg.toLowerCase().includes("phone")) {
          serverErrors.phone = msg;
        }
        if (Object.keys(serverErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
        }

        const friendly = getFriendlySaveError(res.status, msg);
        toast({
          title: friendly.title,
          description: friendly.description,
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "저장되었습니다" });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const msg =
        raw &&
        (raw.includes("Failed to fetch") ||
          raw.includes("Failed to execute 'fetch'") ||
          raw.toLowerCase().includes("fetch"))
          ? "네트워크 또는 브라우저 설정 문제로 저장 요청을 보내지 못했어요. 잠시 후 다시 시도해주세요."
          : raw || "프로필 정보를 저장하지 못했습니다.";
      toast({
        title: "저장에 실패했어요",
        description: msg,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      if (!passwordData.currentPassword || !passwordData.newPassword) {
        toast({
          title: "비밀번호를 입력해주세요",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const res = await request<any>({
        path: "/api/auth/change-password",
        method: "PUT",
        token,
        headers: mockHeaders,
        jsonBody: {
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        },
      });

      if (!res.ok) {
        toast({ title: "변경 실패", variant: "destructive", duration: 3000 });
        return;
      }

      toast({ title: "비밀번호가 변경되었습니다" });
      setPasswordData({ currentPassword: "", newPassword: "" });
    } catch {
      toast({ title: "변경 실패", variant: "destructive", duration: 3000 });
    }
  };

  const selectedCountry = useMemo(() => {
    return (
      COUNTRY_DIAL_CODES.find((c) => c.dialCode === profile.phoneDialCode) ||
      COUNTRY_DIAL_CODES[0]
    );
  }, [profile.phoneDialCode]);

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          계정
        </CardTitle>
        <CardDescription>제조사 계정 정보를 관리하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>프로필 이미지</Label>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage
                src={profile.profileImage || undefined}
                alt={profile.name}
              />
              <AvatarFallback className="bg-primary/10">
                <Camera className="h-8 w-8 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="grid grid-cols-5 gap-2">
                {avatarOptions.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className={cn(
                      "rounded-full border bg-white/80 p-0.5 transition-colors",
                      profile.profileImage === url
                        ? "border-primary"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                    onClick={() =>
                      setProfile((prev) => ({
                        ...prev,
                        profileImage: url,
                      }))
                    }
                  >
                    <img
                      src={url}
                      alt="avatar"
                      className="h-10 w-10 rounded-full"
                    />
                  </button>
                ))}

                <button
                  type="button"
                  className={cn(
                    "rounded-full border bg-white/80 p-0.5 transition-colors",
                    "border-border hover:border-muted-foreground/40"
                  )}
                  onClick={() => setAvatarNonce((v) => v + 1)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80">
                    <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={profile.name}
              className={cn(
                fieldErrors.name
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              )}
              onChange={(e) =>
                setProfile((p) => ({ ...p, name: e.target.value }))
              }
              onChangeCapture={() =>
                setFieldErrors((prev) => ({ ...prev, name: undefined }))
              }
            />
            {!!fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" value={profile.email} disabled />
          </div>
          <div className="hidden md:block" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1열: 국제 코드 */}
          <div className="space-y-2">
            <Label>국가</Label>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryOpen}
                  className="w-full justify-between"
                >
                  <span className="truncate">
                    {selectedCountry.country} (+{selectedCountry.dialCode})
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0">
                <Command>
                  <CommandInput placeholder="국가 검색..." />
                  <CommandList>
                    <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                    <CommandGroup>
                      {COUNTRY_DIAL_CODES.map((c) => (
                        <CommandItem
                          key={`${c.country}-${c.dialCode}`}
                          value={`${c.country} ${c.dialCode}`}
                          onSelect={() => {
                            setProfile((prev) => ({
                              ...prev,
                              phoneDialCode: c.dialCode,
                            }));
                            setCountryOpen(false);
                            // 전화번호 변경 간주 -> 인증 초기화
                            setPhoneVerifiedAt(null);
                            setVerificationSent(false);
                            setTimeLeft(0);
                            setPhoneVerificationCode("");
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              profile.phoneDialCode === c.dialCode
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {c.country} (+{c.dialCode})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* 2열: 휴대폰 번호 */}
          <div className="space-y-2">
            <Label htmlFor="phone">휴대폰번호</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="01012345678"
              value={profile.phoneNationalNumber}
              className={cn(
                "h-10",
                fieldErrors.phone || !phoneValidation.ok
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              )}
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                setProfile((prev) => ({
                  ...prev,
                  phoneNationalNumber: e.target.value,
                }));
                // 번호 변경 시 인증 초기화
                setPhoneVerifiedAt(null);
                setVerificationSent(false);
                setTimeLeft(0);
                setPhoneVerificationCode("");
              }}
            />
          </div>

          {/* 3열: 인증번호/확인 */}
          <div className="space-y-2">
            <Label>확인</Label>

            <div className="h-10">
              {phoneVerifiedAt ? (
                <Button
                  variant="outline"
                  className="w-full h-10 cursor-default border-green-200 bg-white text-green-600 hover:bg-white hover:text-green-600 disabled:opacity-100"
                  disabled
                >
                  <Check className="mr-2 h-4 w-4" />
                  <span>인증 완료</span>
                </Button>
              ) : verificationSent ? (
                <div className="flex gap-2 h-10">
                  <Input
                    value={phoneVerificationCode}
                    onChange={(e) => setPhoneVerificationCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      handleVerifyPhoneVerification();
                    }}
                    inputMode="numeric"
                    placeholder="인증번호"
                    className="flex-1 h-10"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="default"
                      onClick={handleVerifyPhoneVerification}
                      className="h-10"
                      disabled={
                        phoneVerificationLoading !== "idle" ||
                        !phoneVerificationCode.trim()
                      }
                    >
                      {phoneVerificationLoading === "verifying"
                        ? "..."
                        : "확인"}
                    </Button>
                    {timeLeft > 0 && (
                      <span className="text-xs text-destructive font-mono">
                        {formatTime(timeLeft)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10"
                  onClick={handleSendPhoneVerification}
                  disabled={!canSendPhoneVerification}
                >
                  {phoneVerificationLoading === "sending"
                    ? "발송 중..."
                    : "인증번호 발송"}
                </Button>
              )}
            </div>
          </div>
        </div>
        {!!phoneValidation.message && !phoneValidation.ok && (
          <p className="text-xs text-destructive -mt-4">
            {phoneValidation.message}
          </p>
        )}

        {authMethods.email && (
          <div className="rounded-lg border bg-white/60 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" />
              비밀번호 변경
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">현재 비밀번호</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) =>
                    setPasswordData((p) => ({
                      ...p,
                      currentPassword: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (
                      !passwordData.currentPassword ||
                      !passwordData.newPassword
                    )
                      return;
                    handleChangePassword();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">새 비밀번호</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) =>
                    setPasswordData((p) => ({
                      ...p,
                      newPassword: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (
                      !passwordData.currentPassword ||
                      !passwordData.newPassword
                    )
                      return;
                    handleChangePassword();
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleChangePassword}
                disabled={
                  !passwordData.currentPassword || !passwordData.newPassword
                }
              >
                <KeyRound className="mr-2 h-4 w-4" />
                변경하기
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
