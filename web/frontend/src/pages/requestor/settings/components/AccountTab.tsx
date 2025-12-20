import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { cn } from "@/lib/utils";
import { MultiActionDialog } from "@/components/MultiActionDialog";
import {
  User,
  Save,
  Camera,
  KeyRound,
  Link2,
  RefreshCcw,
  Check,
  ChevronsUpDown,
  UserX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";

interface AccountTabProps {
  userData: {
    name?: string;
    email?: string;
    role?: string;
    companyName?: string;
  } | null;
}

export const AccountTab = ({ userData }: AccountTabProps) => {
  const { toast } = useToast();
  const { token, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { isStepActive, completeStep } = useGuideTour();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();

  const [avatarNonce, setAvatarNonce] = useState(0);

  const [authMethods, setAuthMethods] = useState({
    email: false,
    google: false,
    kakao: false,
  });

  const [withdrawForm, setWithdrawForm] = useState({
    bank: "",
    accountNumber: "",
    holderName: "",
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [paidBalance, setPaidBalance] = useState<number>(0);
  const [loadingPaidBalance, setLoadingPaidBalance] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  useEffect(() => {
    if (!reason) return;

    if (reason === "missing_phone") {
      toast({
        title: "휴대폰 인증이 필요합니다",
        description: "파일 업로드 전에 휴대폰 인증을 완료해주세요.",
        duration: 3000,
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("reason");
    navigate({ search: `?${nextParams.toString()}` }, { replace: true });
  }, [navigate, reason, searchParams, toast]);

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

  const [accountData, setAccountData] = useState({
    name: userData?.name || "",
    email: userData?.email || "",
    phoneDialCode: "82",
    phoneNationalNumber: "",
    profileImage: "",
  });

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

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "requestor") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || userData?.companyName || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role, userData]);

  const fetchPaidBalance = useCallback(async () => {
    if (!token) return 0;
    setLoadingPaidBalance(true);
    try {
      const res = await request<any>({
        path: "/api/credits/balance",
        method: "GET",
        token,
        headers: mockHeaders,
      });

      if (!res.ok) {
        setPaidBalance(0);
        return 0;
      }

      const body: any = res.data || {};
      const data = body.data || body;
      const next = Number(data?.paidBalance || 0);
      setPaidBalance(Number.isFinite(next) ? next : 0);
      return Number.isFinite(next) ? next : 0;
    } catch {
      setPaidBalance(0);
      return 0;
    } finally {
      setLoadingPaidBalance(false);
    }
  }, [mockHeaders, token]);

  useEffect(() => {
    void fetchPaidBalance();
  }, [fetchPaidBalance]);

  const handleWithdraw = async () => {
    if (!token) return;
    if (withdrawing) return;

    setWithdrawing(true);
    try {
      const currentPaidBalance = await fetchPaidBalance();

      const bank = withdrawForm.bank.trim();
      const accountNumber = withdrawForm.accountNumber.trim();
      const holderName = withdrawForm.holderName.trim();

      if (currentPaidBalance > 0) {
        if (!bank || !accountNumber || !holderName) {
          toast({
            title: "환불 계좌 정보를 입력해주세요",
            description: "은행/계좌번호/예금주가 필요합니다.",
            variant: "destructive",
          });
          return;
        }
      }

      const withdrawRes = await request<any>({
        path: "/api/auth/withdraw",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody:
          currentPaidBalance > 0
            ? {
                refundReceiveAccount: {
                  bank,
                  accountNumber,
                  holderName,
                },
              }
            : undefined,
      });

      if (!withdrawRes.ok) {
        const body: any = withdrawRes.data || {};
        throw new Error(body?.message || "해지 처리에 실패했습니다.");
      }

      toast({
        title: "해지 완료",
        description: "해지가 완료되었습니다.",
        duration: 3000,
      });

      setTimeout(() => {
        logout();
        navigate("/", { replace: true });
      }, 500);
    } catch (e: any) {
      toast({
        title: "해지 처리 실패",
        description: String(e?.message || "해지 처리에 실패했습니다."),
        variant: "destructive",
      });
    } finally {
      setWithdrawing(false);
      setWithdrawDialogOpen(false);
    }
  };

  const avatarOptions = useMemo(() => {
    const seedBase = (accountData.email || accountData.name || "user")
      .trim()
      .slice(0, 30);
    const seeds = [
      `${seedBase}-${avatarNonce}-1`,
      `${seedBase}-${avatarNonce}-2`,
      `${seedBase}-${avatarNonce}-3`,
      `${seedBase}-${avatarNonce}-4`,
    ];
    // RoboHash set4 (cats)
    return seeds.map(
      (seed) =>
        `https://robohash.org/${encodeURIComponent(seed)}?set=set4&bgset=bg1`
    );
  }, [accountData.email, accountData.name, avatarNonce]);

  useEffect(() => {
    // 이메일이 바뀌는 경우를 대비해 재로딩
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
        setAccountData((prev) => {
          const nextPhone = splitE164ToParts(data?.phoneNumber ?? "");
          return {
            ...prev,
            name: data?.name ?? prev.name,
            email: data?.email ?? prev.email,
            phoneDialCode: nextPhone.dialCode,
            phoneNationalNumber: nextPhone.nationalNumber,
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

  const phoneValidation = useMemo(() => {
    const normalized = normalizeE164FromParts(
      accountData.phoneDialCode,
      accountData.phoneNationalNumber
    );
    const ok = isValidE164(normalized);
    return {
      ok,
      normalized,
      message:
        !accountData.phoneNationalNumber.trim() || ok
          ? ""
          : "국제번호 포함 휴대폰번호를 입력해주세요. 예: +821012345678",
    };
  }, [accountData.phoneDialCode, accountData.phoneNationalNumber]);

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
      setVerificationSent(false); // 인증 완료되면 입력창 숨기고 완료 상태로 전환
      setTimeLeft(0);
      toast({
        title: "전화번호 인증 완료",
        duration: 2000,
      });

      if (isStepActive("requestor.phone")) {
        completeStep("requestor.phone");
      }

      if (nextPath) {
        try {
          if (userData?.role === "requestor") {
            const orgRes = await request<any>({
              path: "/api/requestor-organizations/me",
              method: "GET",
              token,
              headers: mockHeaders,
            });

            if (orgRes.ok) {
              const body: any = orgRes.data || {};
              const data2 = body.data || body;
              if (!data2?.hasBusinessNumber) {
                navigate(
                  `/dashboard/settings?tab=business&next=${encodeURIComponent(
                    nextPath
                  )}`
                );
                return;
              }
            }
          }
        } catch {
          // ignore
        }

        navigate(nextPath);
      }
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
    if (!accountData.name.trim()) {
      nextErrors.name = "이름을 입력해주세요";
    }
    if (!accountData.phoneNationalNumber.trim()) {
      nextErrors.phone = "휴대폰번호를 입력해주세요";
    } else if (!phoneValidation.ok) {
      nextErrors.phone =
        phoneValidation.message || "휴대폰번호 형식을 확인해주세요";
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

      if (!phoneValidation.ok) {
        toast({
          title: "휴대폰번호 형식을 확인해주세요",
          description:
            "국제번호 포함(+..), 숫자만 7~15자리 범위로 입력해주세요.",
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
          name: accountData.name,
          phoneNumber: phoneValidation.normalized,
          profileImage: accountData.profileImage,
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
      return;
    }

    toast({
      title: "설정이 저장되었습니다",
      description: "계정 설정이 성공적으로 업데이트되었습니다.",
    });
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
        throw new Error("비밀번호 변경에 실패했습니다.");
      }

      setPasswordData({ currentPassword: "", newPassword: "" });
      toast({
        title: "비밀번호가 변경되었습니다",
        duration: 2000,
      });
    } catch {
      toast({
        title: "비밀번호 변경 실패",
        description: "현재 비밀번호를 확인해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const selectedCountry = useMemo(() => {
    return (
      COUNTRY_DIAL_CODES.find(
        (c) => c.dialCode === accountData.phoneDialCode
      ) || COUNTRY_DIAL_CODES[0]
    );
  }, [accountData.phoneDialCode]);

  const hasAnyAuthMethod = useMemo(() => {
    return !!(authMethods.email || authMethods.google || authMethods.kakao);
  }, [authMethods.email, authMethods.google, authMethods.kakao]);

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          계정 설정
          <div className="flex items-center gap-2">
            <Badge
              variant={userData?.role === "admin" ? "destructive" : "default"}
            >
              {userData?.role === "requestor"
                ? "의뢰자"
                : userData?.role === "manufacturer"
                ? "제조사"
                : "어벗츠.핏"}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Image */}
        <div className="space-y-2">
          <Label>프로필 이미지</Label>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage
                src={accountData.profileImage || undefined}
                alt={accountData.name}
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
                      accountData.profileImage === url
                        ? "border-primary"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                    onClick={() =>
                      setAccountData((prev) => ({
                        ...prev,
                        profileImage: url,
                      }))
                    }
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-10 w-10 rounded-full bg-slate-100"
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
              value={accountData.name}
              className={cn(
                fieldErrors.name
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              )}
              onChange={(e) =>
                setAccountData((prev) => ({ ...prev, name: e.target.value }))
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
            <Input id="email" type="email" value={accountData.email} readOnly />
          </div>
          <div className="hidden md:block" />
        </div>

        <GuideFocus stepId="requestor.phone">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                              setAccountData((prev) => ({
                                ...prev,
                                phoneDialCode: c.dialCode,
                              }));
                              setCountryOpen(false);
                              setPhoneVerifiedAt(null);
                              setVerificationSent(false);
                              setTimeLeft(0);
                              setPhoneVerificationCode("");
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                accountData.phoneDialCode === c.dialCode
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

            <div className="space-y-2">
              <Label htmlFor="phone">휴대폰번호</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="01012345678"
                value={accountData.phoneNationalNumber}
                className={cn(
                  "h-10",
                  fieldErrors.phone || !phoneValidation.ok
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                )}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  setAccountData((prev) => ({
                    ...prev,
                    phoneNationalNumber: e.target.value,
                  }));
                  setPhoneVerifiedAt(null);
                  setVerificationSent(false);
                  setTimeLeft(0);
                  setPhoneVerificationCode("");
                }}
              />
            </div>

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
        </GuideFocus>
        {!!phoneValidation.message && !phoneValidation.ok && (
          <p className="text-xs text-destructive -mt-4">
            {phoneValidation.message}
          </p>
        )}

        {hasAnyAuthMethod && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-3">
              <Label>로그인 방식</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {authMethods.email && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <Link2 className="h-3 w-3" />
                    이메일
                  </Badge>
                )}
                {authMethods.google && <Badge variant="outline">Google</Badge>}
                {authMethods.kakao && <Badge variant="outline">카카오</Badge>}
                {!authMethods.email &&
                  !authMethods.google &&
                  !authMethods.kakao && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Link2 className="h-3 w-3" />
                      이메일
                    </Badge>
                  )}
              </div>
            </div>

            {authMethods.email && (
              <form
                className="contents"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !passwordData.currentPassword ||
                    !passwordData.newPassword
                  )
                    return;
                  handleChangePassword();
                }}
              >
                <input
                  type="text"
                  name="username"
                  value={accountData.email}
                  readOnly
                  autoComplete="username"
                  className="sr-only"
                  tabIndex={-1}
                />
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">현재 비밀번호</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">새 비밀번호</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="opacity-0">변경</Label>
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full h-10"
                    disabled={
                      !passwordData.currentPassword || !passwordData.newPassword
                    }
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    비밀번호 변경
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="flex justify-between">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-red-400 text-red-400 hover:bg-red-50 hover:text-red-700"
              onClick={() => setWithdrawDialogOpen(true)}
              disabled={withdrawing}
            >
              <UserX className="h-4 w-4" />
              {withdrawing ? "처리 중..." : "해지 신청"}
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={
                !accountData.name.trim() ||
                !accountData.phoneNationalNumber.trim() ||
                !phoneValidation.ok
              }
            >
              <Save className="mr-2 h-4 w-4" />
              저장하기
            </Button>
          </div>
        </div>

        <MultiActionDialog
          open={withdrawDialogOpen}
          title="정말 해지하시겠어요?"
          description={
            (user as any)?.position === "principal" ? (
              <div className="space-y-2">
                <div>잔여 유료 크레딧이 있으면 환불 신청 후 접수됩니다.</div>
                <div className="text-sm">
                  잔여 유료 크레딧: <b>{paidBalance.toLocaleString()}원</b>
                </div>
              </div>
            ) : (
              <div>해지하시겠습니까?</div>
            )
          }
          onClose={() => setWithdrawDialogOpen(false)}
          actions={[
            {
              label: "취소",
              variant: "secondary",
              onClick: () => setWithdrawDialogOpen(false),
              disabled: withdrawing,
            },
            {
              label: "해지 신청",
              variant: "danger",
              onClick: handleWithdraw,
              disabled: withdrawing,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
};
