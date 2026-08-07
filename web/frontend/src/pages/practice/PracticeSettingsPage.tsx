// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User,
  Bell,
  Shield,
  Camera,
  RefreshCcw,
  Building2,
  Users,
} from "lucide-react";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { RequestorSecurity as PracticeSecurity } from "@/pages/requestor/settings/Security";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { useAvatarCarousel } from "@/shared/hooks/useAvatarCarousel";
import { avatarSeedFromUrl } from "@/shared/lib/avatarOptions";

type TabKey = "account" | "business" | "staff" | "notifications" | "security";

type PracticeAccountForm = {
  staffName: string;
  clinicName: string;
  directorName: string;
  phone: string;
  clinicPhone: string;
  zipCode: string;
  address: string;
  addressDetail: string;
  email: string;
  profileImage: string;
};

const parseData = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const data = row.data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return row;
};

const toStringSafe = (v: unknown) => String(v ?? "").trim();

export const PracticeSettingsPage = () => {
  const { user, token, setUser } = useAuthStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<PracticeAccountForm>({
    staffName: toStringSafe(user?.practiceProfile?.staffName || user?.name),
    clinicName: toStringSafe(user?.practiceProfile?.clinicName || user?.companyName),
    directorName: toStringSafe(user?.practiceProfile?.directorName),
    phone: toStringSafe(user?.practiceProfile?.phone),
    clinicPhone: toStringSafe(user?.practiceProfile?.clinicPhone),
    zipCode: toStringSafe(user?.practiceProfile?.zipCode),
    address: toStringSafe(user?.practiceProfile?.address),
    addressDetail: toStringSafe(user?.practiceProfile?.addressDetail),
    email: toStringSafe(user?.email),
    profileImage: toStringSafe(user?.profileImage),
  });

  const activeTab = (() => {
    const raw = String(searchParams.get("tab") || "account");
    if (
      raw === "notifications" ||
      raw === "security" ||
      raw === "staff" ||
      raw === "account" ||
      raw === "business"
    ) {
      return raw as TabKey;
    }
    return "account";
  })();

  const avatarSeedBase = (form.email || form.staffName || "practice")
    .trim()
    .slice(0, 50);
  const { avatarOptions, refreshAvatars } = useAvatarCarousel(avatarSeedBase);

  const loadProfile = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const res = await request<unknown>({
        path: "/api/users/profile",
        method: "GET",
        token,
      });

      if (!res.ok) {
        throw new Error("계정 정보를 불러오지 못했습니다.");
      }

      const data = parseData(res.data);
      const practiceProfile =
        data.practiceProfile && typeof data.practiceProfile === "object"
          ? (data.practiceProfile as Record<string, unknown>)
          : {};

      setForm((prev) => ({
        ...prev,
        staffName: toStringSafe(practiceProfile.staffName || data.name),
        clinicName: toStringSafe(practiceProfile.clinicName || data.business),
        directorName: toStringSafe(practiceProfile.directorName),
        phone: toStringSafe(practiceProfile.phone || data.phoneNumber),
        clinicPhone: toStringSafe(practiceProfile.clinicPhone),
        zipCode: toStringSafe(practiceProfile.zipCode),
        address: toStringSafe(practiceProfile.address),
        addressDetail: toStringSafe(practiceProfile.addressDetail),
        email: toStringSafe(data.email || prev.email),
        profileImage: toStringSafe(data.profileImage || prev.profileImage),
      }));
    } catch (error) {
      toast({
        title: "계정 정보 로딩 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveAccount = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    if (
      !form.staffName ||
      !form.clinicName ||
      !form.directorName ||
      !form.phone ||
      !form.clinicPhone ||
      !form.address ||
      !form.zipCode
    ) {
      toast({
        title: "필수값을 확인해주세요",
        description:
          "치과명, 대표원장님 성함, 담당직원명, 치과 전화, 담당자 휴대폰, 주소, 우편번호는 필수입니다.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const jsonBody = {
        name: form.staffName,
        business: form.clinicName,
        phoneNumber: form.phone,
        profileImage: form.profileImage,
        practiceProfile: {
          clinicName: form.clinicName,
          directorName: form.directorName,
          staffName: form.staffName,
          phone: form.phone,
          clinicPhone: form.clinicPhone,
          address: form.address,
          addressDetail: form.addressDetail,
          zipCode: form.zipCode,
          updatedAt: new Date().toISOString(),
        },
      };

      const res = await request<unknown>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody,
      });

      if (!res.ok) {
        const body = parseData(res.data);
        throw new Error(toStringSafe(body.message || "계정 정보 저장에 실패했습니다."));
      }

      const updated = parseData(res.data);
      const updatedProfile =
        updated.practiceProfile && typeof updated.practiceProfile === "object"
          ? (updated.practiceProfile as Record<string, unknown>)
          : null;

      if (user) {
        setUser({
          ...user,
          name: toStringSafe(updated.name || form.staffName),
          companyName: toStringSafe(updated.business || form.clinicName),
          profileImage: toStringSafe(updated.profileImage || form.profileImage),
          practiceProfile: {
            clinicName: toStringSafe(updatedProfile?.clinicName || form.clinicName),
            directorName: toStringSafe(updatedProfile?.directorName || form.directorName),
            staffName: toStringSafe(updatedProfile?.staffName || form.staffName),
            phone: toStringSafe(updatedProfile?.phone || form.phone),
            clinicPhone: toStringSafe(updatedProfile?.clinicPhone || form.clinicPhone),
            address: toStringSafe(updatedProfile?.address || form.address),
            addressDetail: toStringSafe(updatedProfile?.addressDetail || form.addressDetail),
            zipCode: toStringSafe(updatedProfile?.zipCode || form.zipCode),
            updatedAt: toStringSafe(updatedProfile?.updatedAt || new Date().toISOString()),
          },
        } as typeof user);
      }

      try {
        window.dispatchEvent(new Event("abuts:profile:updated"));
      } catch {
        // ignore
      }

      toast({
        title: "저장 완료",
        description: "치과 계정 정보가 업데이트되었습니다.",
      });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(next) => {
            const nextTab =
              next === "account" ||
              next === "business" ||
              next === "staff" ||
              next === "notifications" ||
              next === "security"
                ? next
                : "account";
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set("tab", nextTab);
            setSearchParams(nextParams, { replace: true });
          }}
          className="space-y-4"
        >
          <TabsList className="flex h-auto w-full flex-wrap gap-1.5 px-1.5 py-1.5">
            <TabsTrigger
              value="account"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <User className="h-4 w-4" />
              계정
            </TabsTrigger>
            <TabsTrigger
              value="business"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <Building2 className="h-4 w-4" />
              사업자
            </TabsTrigger>
            <TabsTrigger
              value="staff"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <Users className="h-4 w-4" />
              임직원
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <Bell className="h-4 w-4" />
              알림
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <Shield className="h-4 w-4" />
              보안
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <User className="h-5 w-5" />
                  계정 설정
                  <Badge className="ml-2">치과병의원</Badge>
                </CardTitle>
                <CardDescription>
                  회원가입 시 입력한 치과 정보와 프로필 이미지를 관리합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">프로필 이미지</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar className="h-20 w-20 border">
                      <AvatarImage
                        src={form.profileImage || undefined}
                        seed={form.email || "practice"}
                        fallbackInitial={form.staffName || "P"}
                        alt={form.staffName || "profile"}
                      />
                      <AvatarFallback className="bg-primary/10">
                        <Camera className="h-7 w-7 text-primary" />
                      </AvatarFallback>
                    </Avatar>

                    {avatarOptions.map((opt) => (
                      <button
                        key={opt.url}
                        type="button"
                        className={`rounded-full border p-0.5 transition-colors ${
                          form.profileImage === opt.url
                            ? "border-primary"
                            : "border-border hover:border-muted-foreground/40"
                        }`}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            profileImage: opt.url,
                          }))
                        }
                      >
                        <Avatar className="h-11 w-11">
                          <AvatarImage
                            src={opt.url}
                            seed={opt.seed || avatarSeedFromUrl(opt.url)}
                            fallbackInitial={form.staffName || "P"}
                            alt="avatar"
                          />
                          <AvatarFallback />
                        </Avatar>
                      </button>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={refreshAvatars}
                      aria-label="새 이미지 그룹 불러오기"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="practice-clinic">치과명</Label>
                    <Input
                      id="practice-clinic"
                      value={form.clinicName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, clinicName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-director">대표원장님 성함</Label>
                    <Input
                      id="practice-director"
                      value={form.directorName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, directorName: e.target.value }))
                      }
                      placeholder="예: 김원장"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-clinic-phone">치과 전화번호</Label>
                    <Input
                      id="practice-clinic-phone"
                      value={form.clinicPhone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, clinicPhone: e.target.value }))
                      }
                      placeholder="예: 02-123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-staff">담당직원명</Label>
                    <Input
                      id="practice-staff"
                      value={form.staffName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, staffName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-phone">담당자 휴대폰</Label>
                    <Input
                      id="practice-phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-email">이메일</Label>
                    <Input id="practice-email" value={form.email} disabled />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="practice-address">치과 주소</Label>
                    <Input
                      id="practice-address"
                      value={form.address}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, address: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-address-detail">상세주소</Label>
                    <Input
                      id="practice-address-detail"
                      value={form.addressDetail}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, addressDetail: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="practice-zipcode">우편번호</Label>
                    <Input
                      id="practice-zipcode"
                      value={form.zipCode}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, zipCode: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => void loadProfile()}>
                    {loading ? "불러오는 중..." : "다시 불러오기"}
                  </Button>
                  <Button type="button" onClick={() => void saveAccount()} disabled={saving}>
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business">
            <BusinessTab
              userData={{
                companyName: form.clinicName || user?.companyName || "",
                role: "practice",
              }}
            />
          </TabsContent>

          <TabsContent value="staff">
            <StaffTab
              userData={{
                companyName: form.clinicName || user?.companyName || "",
                role: "practice",
                email: user?.email || "",
                name: form.staffName || user?.name || "",
              }}
              businessTypeOverride="practice"
            />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>


          <TabsContent value="security">
            <PracticeSecurity />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
