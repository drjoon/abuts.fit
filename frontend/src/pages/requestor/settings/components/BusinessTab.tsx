import { useEffect, useMemo, useRef, useState } from "react";
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
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { cn } from "@/lib/utils";
import {
  Building2,
  Upload,
  Save,
  ShieldCheck,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();

  const [membership, setMembership] = useState<
    "none" | "owner" | "member" | "pending"
  >("none");

  const myUserId = useMemo(() => {
    return String(user?.mockUserId || user?.id || "");
  }, [user?.id, user?.mockUserId]);

  const [orgOwnerId, setOrgOwnerId] = useState<string>("");

  const [orgSearch, setOrgSearch] = useState("");
  const [orgSearchResults, setOrgSearchResults] = useState<
    {
      _id: string;
      name: string;
      representativeName?: string;
      businessNumber?: string;
      address?: string;
    }[]
  >([]);
  const [selectedOrg, setSelectedOrg] = useState<{
    _id: string;
    name: string;
    representativeName?: string;
    businessNumber?: string;
    address?: string;
  } | null>(null);
  const [myJoinRequests, setMyJoinRequests] = useState<
    { organizationId: string; organizationName: string; status: string }[]
  >([]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoadingOrgId, setCancelLoadingOrgId] = useState<string>("");
  const [orgOpen, setOrgOpen] = useState(false);

  const getOrgLabel = (o: { name: string; businessNumber?: string }) => {
    const name = String(o?.name || "").trim();
    const bn = String(o?.businessNumber || "").trim();
    return bn ? `${name} (${bn})` : name;
  };

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
  const licenseInputRef = useRef<HTMLInputElement | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<
    "missing" | "uploading" | "uploaded" | "processing" | "ready" | "error"
  >(userData?.companyName ? "missing" : "missing");

  const [extracted, setExtracted] = useState<LicenseExtracted>({});
  const [isVerified, setIsVerified] = useState<boolean>(false);

  useEffect(() => {
    if (!reason) return;
    if (reason === "missing_business") {
      toast({
        title: "사업자 정보가 필요합니다",
        description:
          "의뢰 제출을 완료하려면 기공소 사업자 정보를 등록해주세요.",
        duration: 3000,
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("reason");
    navigate({ search: `?${nextParams.toString()}` }, { replace: true });
  }, [navigate, reason, searchParams, toast]);

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

        setOrgOwnerId(String(data?.organization?.owner || "").trim());

        const orgName = String(data?.organization?.name || "").trim();
        const ex = data?.extracted || {};
        setBusinessData((prev) => ({
          ...prev,
          companyName: orgName || prev.companyName,
          businessNumber:
            String(ex?.businessNumber || "").trim() || prev.businessNumber,
          address: String(ex?.address || "").trim() || prev.address,
          detailAddress:
            String(ex?.detailAddress || "").trim() || prev.detailAddress,
          phone: String(ex?.phoneNumber || "").trim() || prev.phone,
        }));
        setExtracted((prev) => ({
          ...prev,
          representativeName:
            String(ex?.representativeName || "").trim() ||
            prev.representativeName,
          email: String(ex?.email || "").trim() || prev.email,
          businessType:
            String(ex?.businessType || "").trim() || prev.businessType,
        }));

        const lic = data?.businessLicense || {};
        const licName = String(lic?.originalName || "").trim();
        const licFileId = String(lic?.fileId || "").trim();
        const licS3Key = String(lic?.s3Key || "").trim();
        if (licName) {
          setLicenseFileName(licName);
          setLicenseFileId(licFileId);
          setLicenseS3Key(licS3Key);
          setLicenseStatus("ready");
        }

        setIsVerified(!!data?.businessVerified);
      } catch {
        setMembership("none");
      }
    };

    load();
  }, [mockHeaders, token]);

  useEffect(() => {
    const q = orgSearch.trim();
    if (!token) return;
    if (membership !== "none") return;
    if (!q) {
      setOrgSearchResults([]);
      setSelectedOrg(null);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await request<any>({
          path: `/api/requestor-organizations/search?q=${encodeURIComponent(
            q
          )}`,
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) {
          setOrgSearchResults([]);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        setOrgSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setOrgSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [membership, mockHeaders, orgSearch, token]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) return;
        if (membership === "owner") return;
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

  const refreshMyJoinRequests = async () => {
    if (!token) return;
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
  };

  const getJoinStatusLabel = (status: string) => {
    const s = String(status || "").trim();
    if (s === "pending") return "승인대기중";
    if (s === "approved") return "승인됨";
    if (s === "rejected") return "거절됨";
    return s || "-";
  };

  const handleCancelJoinRequest = async (organizationId: string) => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      const orgId = String(organizationId || "").trim();
      if (!orgId) return;

      setCancelLoadingOrgId(orgId);
      const res = await request<any>({
        path: `/api/requestor-organizations/join-requests/${orgId}/cancel`,
        method: "POST",
        token,
        headers: mockHeaders,
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "신청 취소 실패",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "신청이 취소되었습니다" });
      await refreshMyJoinRequests();
      await refreshMembership();
    } finally {
      setCancelLoadingOrgId("");
    }
  };

  const handleLeaveOrganization = async (organizationId: string) => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      const orgId = String(organizationId || "").trim();
      if (!orgId) return;

      setCancelLoadingOrgId(orgId);
      const res = await request<any>({
        path: `/api/requestor-organizations/join-requests/${orgId}/leave`,
        method: "POST",
        token,
        headers: mockHeaders,
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "승인 취소 실패",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "승인이 취소되었습니다" });
      await refreshMyJoinRequests();
      await refreshMembership();
    } finally {
      setCancelLoadingOrgId("");
    }
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
      if (!selectedOrg?._id) {
        toast({
          title: "기공소를 선택해주세요",
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
        jsonBody: { organizationId: selectedOrg._id },
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "소속 신청 실패",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "소속 신청이 접수되었습니다" });
      setOrgSearch("");
      setOrgSearchResults([]);
      setSelectedOrg(null);
      await refreshMembership();
      await refreshMyJoinRequests();
    } catch {
      toast({
        title: "소속 신청 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setJoinLoading(false);
    }
  };

  const [businessData, setBusinessData] = useState({
    companyName: userData?.companyName || "",
    businessNumber: "",
    address: "",
    detailAddress: "",
    phone: "",
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const currentOrgName = useMemo(() => {
    const fromUser = String((user as any)?.organization || "").trim();
    const fromState = String(businessData.companyName || "").trim();
    const fromProps = String(userData?.companyName || "").trim();
    return fromUser || fromState || fromProps;
  }, [businessData.companyName, user, userData?.companyName]);

  const isPrimaryOwner = useMemo(() => {
    if (!orgOwnerId) return false;
    if (!myUserId) return false;
    return String(orgOwnerId) === String(myUserId);
  }, [myUserId, orgOwnerId]);

  const roleBadge = useMemo(() => {
    if (membership === "owner") return isPrimaryOwner ? "주대표" : "공동대표";
    if (membership === "member") return "직원";
    if (membership === "pending") return "승인대기";
    return "미소속";
  }, [isPrimaryOwner, membership]);

  const handleSave = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      const companyName = String(businessData.companyName || "").trim();
      const repName = String(extracted.representativeName || "").trim();
      const phoneNumber = String(businessData.phone || "").trim();
      const businessNumber = String(businessData.businessNumber || "").trim();
      const businessType = String(extracted.businessType || "").trim();
      const taxEmail = String(extracted.email || "").trim();
      const address = String(businessData.address || "").trim();
      const detailAddress = String(businessData.detailAddress || "").trim();

      const nextErrors: Record<string, boolean> = {
        companyName: !companyName,
        representativeName: !repName,
        phone: !phoneNumber,
        businessNumber: !businessNumber,
        businessType: !businessType,
        email: !taxEmail,
        address: !address,
        detailAddress: !detailAddress,
      };

      if (Object.values(nextErrors).some(Boolean)) {
        setErrors(nextErrors);
        toast({
          title: "필수 항목을 입력해주세요",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }

      const bnDigits = businessNumber.replace(/\D/g, "");
      if (bnDigits.length !== 10) {
        setErrors((prev) => ({ ...prev, businessNumber: true }));
        toast({
          title: "사업자등록번호 형식이 올바르지 않습니다",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }

      const res = await request<any>({
        path: "/api/requestor-organizations/me",
        method: "PUT",
        token,
        headers: mockHeaders,
        jsonBody: {
          name: companyName,
          representativeName: repName,
          phoneNumber,
          businessNumber,
          businessType,
          email: taxEmail,
          address,
          detailAddress,
        },
      });

      if (!res.ok) {
        toast({
          title: "저장 실패",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setErrors({});

      toast({
        title: "설정이 저장되었습니다",
        description: "사업자 정보가 성공적으로 업데이트되었습니다.",
      });

      if (nextPath) {
        navigate(nextPath);
      }
    } catch {
      toast({
        title: "저장 실패",
        variant: "destructive",
        duration: 3000,
      });
    }
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
          title: "대표자만 업로드할 수 있어요",
          description:
            "사업자등록증 업로드/수정은 대표자(주대표/공동대표) 계정에서만 가능합니다.",
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
          <p className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            기공소 정보
          </p>
          <span className="ml-2 inline-flex items-center rounded-md border bg-white/60 px-2 py-0.5 text-xs text-foreground">
            {roleBadge}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {membership === "owner" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
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
                  <Button
                    type="button"
                    variant={
                      licenseStatus === "missing" ? "default" : "outline"
                    }
                    disabled={
                      licenseStatus === "uploading" ||
                      licenseStatus === "processing" ||
                      membership !== "owner"
                    }
                    onClick={() => {
                      if (
                        licenseStatus === "uploading" ||
                        licenseStatus === "processing" ||
                        membership !== "owner"
                      ) {
                        return;
                      }
                      licenseInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {licenseStatus === "uploading"
                      ? "업로드 중..."
                      : licenseStatus === "processing"
                      ? "분석 중..."
                      : "사업자등록증 업로드"}
                  </Button>
                  <input
                    ref={licenseInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={membership !== "owner"}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {membership !== "owner" && (
                    <p className="text-xs text-muted-foreground mt-2">
                      사업자등록증 업로드/수정은 대표자(주대표/공동대표)만
                      가능합니다.
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

            <div className="space-y-2">
              <Label>기공소 정보</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="repName">대표자명</Label>
                  <Input
                    id="repName"
                    className={cn(
                      errors.representativeName &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={extracted.representativeName || ""}
                    onChange={(e) => (
                      setExtracted((prev) => ({
                        ...prev,
                        representativeName: e.target.value,
                      })),
                      setErrors((prev) => ({
                        ...prev,
                        representativeName: false,
                      }))
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgName">기공소명</Label>
                  <Input
                    id="orgName"
                    className={cn(
                      errors.companyName &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={businessData.companyName}
                    onChange={(e) => (
                      setBusinessData((prev) => ({
                        ...prev,
                        companyName: e.target.value,
                      })),
                      setErrors((prev) => ({ ...prev, companyName: false }))
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgPhone">전화번호</Label>
                  <Input
                    id="orgPhone"
                    className={cn(
                      errors.phone &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={businessData.phone}
                    onChange={(e) => (
                      setBusinessData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      })),
                      setErrors((prev) => ({ ...prev, phone: false }))
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bizNo">사업자등록번호</Label>
                  <Input
                    id="bizNo"
                    className={cn(
                      errors.businessNumber &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={businessData.businessNumber}
                    onChange={(e) => (
                      setBusinessData((prev) => ({
                        ...prev,
                        businessNumber: e.target.value,
                      })),
                      setErrors((prev) => ({
                        ...prev,
                        businessNumber: false,
                      }))
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bizType">업종/업태</Label>
                  <Input
                    id="bizType"
                    className={cn(
                      errors.businessType &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={extracted.businessType || ""}
                    onChange={(e) => (
                      setExtracted((prev) => ({
                        ...prev,
                        businessType: e.target.value,
                      })),
                      setErrors((prev) => ({
                        ...prev,
                        businessType: false,
                      }))
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxEmail">세금계산서 이메일</Label>
                  <Input
                    id="taxEmail"
                    type="email"
                    className={cn(
                      errors.email &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    value={extracted.email || ""}
                    onChange={(e) => (
                      setExtracted((prev) => ({
                        ...prev,
                        email: e.target.value,
                      })),
                      setErrors((prev) => ({ ...prev, email: false }))
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  className={cn(
                    errors.address &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                  value={businessData.address}
                  onChange={(e) => (
                    setBusinessData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    })),
                    setErrors((prev) => ({ ...prev, address: false }))
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="detailAddress">세부주소</Label>
                <Input
                  id="detailAddress"
                  className={cn(
                    errors.detailAddress &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                  value={businessData.detailAddress}
                  onChange={(e) => (
                    setBusinessData((prev) => ({
                      ...prev,
                      detailAddress: e.target.value,
                    })),
                    setErrors((prev) => ({
                      ...prev,
                      detailAddress: false,
                    }))
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                저장하기
              </Button>
            </div>
          </div>
        )}

        {membership !== "owner" && (
          <div className="space-y-4">
            {membership === "member" && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-white/60 p-3 text-sm">
                  현재 소속됨{currentOrgName ? `: ${currentOrgName}` : ""}
                </div>

                <div className="rounded-lg border bg-white/60 p-3 text-xs text-muted-foreground">
                  기공소 사업자 정보는 대표자만 수정할 수 있어요. 여기서는
                  확인만 가능합니다.
                </div>

                <div className="rounded-lg border bg-white/60 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">사업자 식별 정보</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4" />
                      {licenseStatus === "ready"
                        ? isVerified
                          ? "검증 완료"
                          : "검증 대기"
                        : "등록 필요"}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>대표자명</Label>
                      <Input
                        value={extracted.representativeName || ""}
                        readOnly
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>기공소명</Label>
                      <Input value={businessData.companyName || ""} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>전화번호</Label>
                      <Input value={businessData.phone || ""} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>사업자등록번호</Label>
                      <Input
                        value={businessData.businessNumber || ""}
                        readOnly
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>업종/업태</Label>
                      <Input value={extracted.businessType || ""} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>세금계산서 이메일</Label>
                      <Input value={extracted.email || ""} readOnly />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>주소</Label>
                      <Input value={businessData.address || ""} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>세부주소</Label>
                      <Input
                        value={businessData.detailAddress || ""}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {membership === "none" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label>기공소 선택</Label>
                    <Popover open={orgOpen} onOpenChange={setOrgOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={orgOpen}
                          className="w-full justify-between"
                          disabled={joinLoading}
                        >
                          <span className="truncate">
                            {selectedOrg
                              ? getOrgLabel(selectedOrg)
                              : "기공소를 검색해서 선택하세요"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[520px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="기공소명/대표자명/사업자번호/주소 검색..."
                            value={orgSearch}
                            onValueChange={(v) => {
                              setOrgSearch(v);
                              setSelectedOrg(null);
                            }}
                          />
                          <CommandList>
                            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {orgSearchResults.map((o) => {
                                const selected = selectedOrg?._id === o._id;
                                const rep = String(
                                  o.representativeName || ""
                                ).trim();
                                const bn = String(
                                  o.businessNumber || ""
                                ).trim();
                                const addr = String(o.address || "").trim();
                                const meta = [
                                  rep ? `대표: ${rep}` : "",
                                  bn ? `사업자: ${bn}` : "",
                                  addr ? addr : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ");
                                const searchValue = [o.name, rep, bn, addr]
                                  .filter(Boolean)
                                  .join(" ");
                                return (
                                  <CommandItem
                                    key={o._id}
                                    value={searchValue}
                                    onSelect={() => {
                                      setSelectedOrg(o);
                                      setOrgOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selected ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="min-w-0">
                                      <div className="text-sm truncate">
                                        {getOrgLabel(o)}
                                      </div>
                                      {!!meta && (
                                        <div className="text-xs text-muted-foreground truncate">
                                          {meta}
                                        </div>
                                      )}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="opacity-0">신청</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleJoinRequest}
                      disabled={joinLoading || !selectedOrg?._id}
                    >
                      {joinLoading ? "신청 중..." : "소속 신청"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {Array.isArray(myJoinRequests) && myJoinRequests.length > 0 && (
              <div className="rounded-lg border bg-white/60 p-4">
                <div className="text-sm font-medium mb-2">내 소속 신청:</div>
                <div className="space-y-2">
                  {myJoinRequests.map((r) => (
                    <div
                      key={`${r.organizationId}-${r.status}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="text-sm">
                        {r.organizationName} - {getJoinStatusLabel(r.status)}
                      </div>
                      {String(r.status) === "pending" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleCancelJoinRequest(String(r.organizationId))
                          }
                          disabled={cancelLoadingOrgId === r.organizationId}
                        >
                          {cancelLoadingOrgId === r.organizationId
                            ? "취소 중..."
                            : "신청 취소"}
                        </Button>
                      )}

                      {String(r.status) === "approved" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleLeaveOrganization(String(r.organizationId))
                          }
                          disabled={cancelLoadingOrgId === r.organizationId}
                        >
                          {cancelLoadingOrgId === r.organizationId
                            ? "취소 중..."
                            : "소속 해제"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
