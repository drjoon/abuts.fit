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
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { cn } from "@/lib/utils";
import {
  Building2,
  Upload,
  Save,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BusinessTabProps {
  userData: {
    companyName?: string;
    role?: string;
    email?: string;
    name?: string;
  } | null;
}

type LicenseExtracted = {
  businessNumber?: string;
  address?: string;
  email?: string;
  representativeName?: string;
  businessType?: string;
  businessItem?: string;
};

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });

  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [membership, setMembership] = useState<
    "none" | "owner" | "member" | "pending"
  >("none");

  const [orgSearch, setOrgSearch] = useState("");
  const [myJoinRequests, setMyJoinRequests] = useState<
    { organizationId: string; organizationName: string; status: string }[]
  >([]);
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    {
      user: { _id: string; name?: string; email?: string } | string;
      createdAt?: string;
    }[]
  >([]);
  const [joinLoading, setJoinLoading] = useState(false);

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "requestor") as string,
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || userData?.companyName || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role, userData]);

  const [licenseFileName, setLicenseFileName] = useState<string>("");
  const [licenseFileId, setLicenseFileId] = useState<string>("");
  const [licenseS3Key, setLicenseS3Key] = useState<string>("");
  const [licenseStatus, setLicenseStatus] = useState<
    "missing" | "uploading" | "uploaded" | "processing" | "ready" | "error"
  >(userData?.companyName ? "missing" : "missing");

  const [extracted, setExtracted] = useState<LicenseExtracted>({});
  const [isVerified, setIsVerified] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) return;
        const res = await request<any>({
          path: "/api/requestor-organizations/me",
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const next = (data?.membership || "none") as
          | "none"
          | "owner"
          | "member"
          | "pending";
        setMembership(next);
        if (next !== "owner") {
          setMode("staff");
        }
      } catch {
        setMembership("none");
      }
    };

    load();
  }, [mockHeaders, token]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) return;

        if (membership === "owner") {
          const res = await request<any>({
            path: "/api/requestor-organizations/join-requests/pending",
            method: "GET",
            token,
            headers: mockHeaders,
          });
          if (!res.ok) return;
          const body: any = res.data || {};
          const data = body.data || body;
          setPendingJoinRequests(
            Array.isArray(data?.joinRequests) ? data.joinRequests : []
          );
          return;
        }

        const res = await request<any>({
          path: "/api/requestor-organizations/join-requests/me",
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        setMyJoinRequests(Array.isArray(data) ? data : []);
      } catch {
        setPendingJoinRequests([]);
        setMyJoinRequests([]);
      }
    };

    load();
  }, [membership, mockHeaders, token]);

  const refreshMembership = async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/me",
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) return;
    const body: any = res.data || {};
    const data = body.data || body;
    const next = (data?.membership || "none") as
      | "none"
      | "owner"
      | "member"
      | "pending";
    setMembership(next);
  };

  const handleJoinRequest = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      const name = orgSearch.trim();
      if (!name) {
        toast({
          title: "기공소명을 입력해주세요",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setJoinLoading(true);
      const res = await request<any>({
        path: "/api/requestor-organizations/join-requests",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { organizationName: name },
      });

      if (!res.ok) {
        toast({
          title: "소속 신청 실패",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "소속 신청이 접수되었습니다" });
      setOrgSearch("");
      await refreshMembership();
    } finally {
      setJoinLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/requestor-organizations/join-requests/${userId}/approve`,
      method: "POST",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      toast({ title: "승인 실패", variant: "destructive", duration: 3000 });
      return;
    }
    toast({ title: "승인되었습니다" });
    await refreshMembership();
  };

  const handleReject = async (userId: string) => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/requestor-organizations/join-requests/${userId}/reject`,
      method: "POST",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      toast({ title: "거절 실패", variant: "destructive", duration: 3000 });
      return;
    }
    toast({ title: "거절되었습니다" });
    await refreshMembership();
  };

  const [businessData, setBusinessData] = useState({
    companyName: userData?.companyName || "",
    businessNumber: "123-45-67890",
    address: "서울시 강남구 테헤란로 123",
    detailAddress: "4층 401호",
    phone: "02-1234-5678",
    fax: "02-1234-5679",
    website: "https://company.com",
    businessHours: {
      weekday: "09:00 - 18:00",
      saturday: "09:00 - 15:00",
      sunday: "휴무",
    },
    businessLicense: null as File | null,
    description: "고품질 치과 기공물 제작 전문",
  });

  const handleSave = () => {
    toast({
      title: "설정이 저장되었습니다",
      description: "사업자 정보가 성공적으로 업데이트되었습니다.",
    });
  };

  const handleFileUpload = async (file: File) => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (membership !== "owner") {
        toast({
          title: "대표자만 업로드할 수 있습니다",
          description: "사업자등록증 업로드는 기공소 대표자 계정만 가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setLicenseStatus("uploading");
      const uploaded = await uploadFilesWithToast([file]);
      const first = uploaded?.[0];
      if (!first?._id) {
        setLicenseStatus("error");
        return;
      }

      setLicenseFileName(first.originalName);
      setLicenseFileId(first._id);
      setLicenseS3Key(first.key || "");
      setLicenseStatus("uploaded");

      setLicenseStatus("processing");
      const res = await request<any>({
        path: "/api/ai/parse-business-license",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: {
          fileId: first._id,
          s3Key: first.key,
          originalName: first.originalName,
        },
      });

      if (res.ok) {
        const body: any = res.data || {};
        const data = body.data || body;
        const nextExtracted: LicenseExtracted = data?.extracted || {};
        setExtracted(nextExtracted);
        setBusinessData((prev) => ({
          ...prev,
          companyName: nextExtracted?.businessItem
            ? prev.companyName
            : prev.companyName,
          businessNumber: nextExtracted?.businessNumber || prev.businessNumber,
          address: nextExtracted?.address || prev.address,
        }));
        setIsVerified(!!data?.verification?.verified);
        setLicenseStatus("ready");
        return;
      }

      setLicenseStatus("error");
    } catch {
      setLicenseStatus("error");
      toast({
        title: "업로드 실패",
        description: "사업자등록증 업로드에 실패했습니다.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          사업자 정보
        </CardTitle>
        <CardDescription>
          회사 정보와 사업자 등록증을 관리하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "owner" ? "default" : "outline"}
            onClick={() => setMode("owner")}
          >
            대표자
          </Button>
          <Button
            type="button"
            variant={mode === "staff" ? "default" : "outline"}
            onClick={() => setMode("staff")}
          >
            직원
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>사업자등록증</Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {licenseStatus === "ready" && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {isVerified ? "검증 완료" : "검증 대기"}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4",
              licenseStatus === "missing"
                ? "border-orange-300 bg-orange-50/80"
                : "border-border bg-white/60"
            )}
          >
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <label className="cursor-pointer">
                <Button
                  variant={licenseStatus === "missing" ? "default" : "outline"}
                  disabled={
                    licenseStatus === "uploading" ||
                    licenseStatus === "processing" ||
                    membership !== "owner"
                  }
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {licenseStatus === "uploading"
                    ? "업로드 중..."
                    : licenseStatus === "processing"
                    ? "분석 중..."
                    : "파일 업로드"}
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={membership !== "owner"}
                  onChange={(e) =>
                    e.target.files?.[0] && handleFileUpload(e.target.files[0])
                  }
                />
              </label>
              {membership !== "owner" && (
                <p className="text-xs text-muted-foreground mt-2">
                  사업자등록증 업로드는 대표자 계정만 가능합니다.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                PDF, JPG, PNG 파일만 가능 (최대 10MB)
              </p>
              {licenseFileName && (
                <p className="text-xs mt-2 text-foreground/80">
                  업로드됨: {licenseFileName}
                </p>
              )}
              {(licenseFileId || licenseS3Key) && (
                <p className="text-xs mt-1 text-muted-foreground">
                  파일 ID: {licenseFileId || "-"}
                </p>
              )}
            </div>
          </div>
        </div>

        {mode === "staff" && (
          <div className="space-y-4">
            <Label>기공소 소속 설정</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="orgSearch">기공소명 검색</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="orgSearch"
                    placeholder="예: 서울치과기공소"
                    className="pl-9"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="opacity-0">신청</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleJoinRequest}
                  disabled={joinLoading}
                >
                  소속 신청
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              소속 신청 후 기공소 대표자의 승인이 필요합니다.
            </p>

            {Array.isArray(myJoinRequests) && myJoinRequests.length > 0 && (
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-sm font-medium mb-2">내 소속 신청</div>
                <div className="space-y-2">
                  {myJoinRequests.map((r) => (
                    <div
                      key={`${r.organizationId}-${r.status}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="text-sm">{r.organizationName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "owner" && (
          <div className="space-y-2">
            <Label>사업자 정보(추출/수정)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="repName">대표자명</Label>
                <Input
                  id="repName"
                  value={extracted.representativeName || ""}
                  onChange={(e) =>
                    setExtracted((prev) => ({
                      ...prev,
                      representativeName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bizEmail">세금계산서 이메일</Label>
                <Input
                  id="bizEmail"
                  type="email"
                  value={extracted.email || ""}
                  onChange={(e) =>
                    setExtracted((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bizNo">사업자등록번호</Label>
                <Input
                  id="bizNo"
                  value={businessData.businessNumber}
                  onChange={(e) =>
                    setBusinessData((prev) => ({
                      ...prev,
                      businessNumber: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bizType">업종/업태</Label>
                <Input
                  id="bizType"
                  value={extracted.businessType || ""}
                  onChange={(e) =>
                    setExtracted((prev) => ({
                      ...prev,
                      businessType: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {Array.isArray(pendingJoinRequests) &&
              pendingJoinRequests.length > 0 && (
                <div className="mt-4 rounded-lg border bg-white/60 p-4">
                  <div className="text-sm font-medium mb-2">소속 신청 대기</div>
                  <div className="space-y-2">
                    {pendingJoinRequests.map((r, idx) => {
                      const u: any = (r as any)?.user;
                      const userId =
                        typeof u === "string" ? u : String(u?._id || "");
                      const label =
                        typeof u === "string"
                          ? u
                          : `${u?.name || ""} ${
                              u?.email ? `(${u.email})` : ""
                            }`.trim();
                      return (
                        <div
                          key={`${userId}-${idx}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="text-sm truncate">
                            {label || userId}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleApprove(userId)}
                              disabled={!userId}
                            >
                              승인
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleReject(userId)}
                              disabled={!userId}
                            >
                              거절
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">회사명</Label>
            <Input
              id="companyName"
              value={businessData.companyName}
              onChange={(e) =>
                setBusinessData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessNumber">사업자등록번호</Label>
            <Input
              id="businessNumber"
              value={businessData.businessNumber}
              onChange={(e) =>
                setBusinessData((prev) => ({
                  ...prev,
                  businessNumber: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">주소</Label>
          <Input
            id="address"
            value={businessData.address}
            onChange={(e) =>
              setBusinessData((prev) => ({ ...prev, address: e.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="detailAddress">상세주소</Label>
          <Input
            id="detailAddress"
            value={businessData.detailAddress}
            onChange={(e) =>
              setBusinessData((prev) => ({
                ...prev,
                detailAddress: e.target.value,
              }))
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="businessPhone">대표번호</Label>
            <Input
              id="businessPhone"
              value={businessData.phone}
              onChange={(e) =>
                setBusinessData((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fax">팩스번호</Label>
            <Input
              id="fax"
              value={businessData.fax}
              onChange={(e) =>
                setBusinessData((prev) => ({ ...prev, fax: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">웹사이트</Label>
            <Input
              id="website"
              value={businessData.website}
              onChange={(e) =>
                setBusinessData((prev) => ({
                  ...prev,
                  website: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* Business Hours */}
        <div className="space-y-4">
          <Label>영업시간</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">평일</Label>
              <Input
                value={businessData.businessHours.weekday}
                onChange={(e) =>
                  setBusinessData((prev) => ({
                    ...prev,
                    businessHours: {
                      ...prev.businessHours,
                      weekday: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">토요일</Label>
              <Input
                value={businessData.businessHours.saturday}
                onChange={(e) =>
                  setBusinessData((prev) => ({
                    ...prev,
                    businessHours: {
                      ...prev.businessHours,
                      saturday: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">일요일</Label>
              <Input
                value={businessData.businessHours.sunday}
                onChange={(e) =>
                  setBusinessData((prev) => ({
                    ...prev,
                    businessHours: {
                      ...prev.businessHours,
                      sunday: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">회사 소개</Label>
          <Textarea
            id="description"
            value={businessData.description}
            onChange={(e) =>
              setBusinessData((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            placeholder="회사 소개 및 전문 분야를 입력하세요"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            저장하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
