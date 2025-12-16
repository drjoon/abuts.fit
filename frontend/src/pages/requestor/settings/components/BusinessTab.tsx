import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { BusinessLicenseUpload } from "./business/BusinessLicenseUpload";
import { BusinessForm } from "./business/BusinessForm";
import { OrganizationSearchSection } from "./business/OrganizationSearchSection";
import { JoinRequestsSection } from "./business/JoinRequestsSection";
import { BusinessMemberView } from "./business/BusinessMemberView";
import {
  LicenseExtracted,
  BusinessData,
  LicenseStatus,
  MembershipStatus,
} from "./business/types";

interface BusinessTabProps {
  userData: {
    companyName?: string;
    role?: string;
    email?: string;
    name?: string;
  } | null;
}

export const BusinessTab = ({ userData }: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();

  const [membership, setMembership] = useState<MembershipStatus>("none");

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

  const [licenseDeleteLoading, setLicenseDeleteLoading] = useState(false);

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

  const [licenseFileName, setLicenseFileName] = useState<string>("");
  const [licenseFileId, setLicenseFileId] = useState<string>("");
  const [licenseS3Key, setLicenseS3Key] = useState<string>("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(
    userData?.companyName ? "missing" : "missing"
  );

  const showLicenseDetails = useMemo(() => {
    if (!licenseFileName) return false;
    return (
      licenseStatus === "ready" ||
      licenseStatus === "error" ||
      licenseStatus === "uploaded" ||
      licenseStatus === "processing"
    );
  }, [licenseFileName, licenseStatus]);

  const [extracted, setExtracted] = useState<LicenseExtracted>({});
  const [isVerified, setIsVerified] = useState<boolean>(false);

  const [businessData, setBusinessData] = useState<BusinessData>({
    companyName: "",
    businessNumber: "",
    address: "",
    phone: "",
  });
  const [companyNameTouched, setCompanyNameTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

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
        const next = (data?.membership || "none") as MembershipStatus;
        setMembership(next);

        setOrgOwnerId(String(data?.organization?.owner || "").trim());

        const orgName = String(data?.organization?.name || "").trim();
        const ex = data?.extracted || {};
        setBusinessData((prev) => ({
          ...prev,
          companyName: companyNameTouched
            ? prev.companyName
            : orgName || prev.companyName,
          businessNumber:
            String(ex?.businessNumber || "").trim() || prev.businessNumber,
          address: String(ex?.address || "").trim() || prev.address,
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
          businessItem:
            String(ex?.businessItem || "").trim() || prev.businessItem,
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
    const next = (data?.membership || "none") as MembershipStatus;
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

  const handleDeleteLicense = async () => {
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
          title: "대표자만 삭제할 수 있어요",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (!licenseFileName && !licenseS3Key && !licenseFileId) {
        return;
      }

      setLicenseDeleteLoading(true);
      const res = await request<any>({
        path: "/api/requestor-organizations/me/business-license",
        method: "DELETE",
        token,
        headers: mockHeaders,
      });

      if (!res.ok) {
        const msg = String((res.data as any)?.message || "").trim();
        toast({
          title: "삭제 실패",
          description: msg || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setLicenseFileName("");
      setLicenseFileId("");
      setLicenseS3Key("");
      setLicenseStatus("missing");
      setIsVerified(false);
      setExtracted({});
      setErrors({});
      setBusinessData((prev) => ({
        ...prev,
        companyName: "",
        businessNumber: "",
        address: "",
        phone: "",
      }));
      setCompanyNameTouched(false);

      toast({
        title: "삭제되었습니다",
        duration: 2000,
      });
    } finally {
      setLicenseDeleteLoading(false);
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

  const normalizeBusinessNumber = (input: string) => {
    const digits = String(input || "").replace(/\D/g, "");
    if (digits.length !== 10) return "";
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const normalizePhoneNumber = (input: string) => {
    const digits = String(input || "").replace(/\D/g, "");
    if (!digits.startsWith("0")) return "";
    if (digits.startsWith("02")) {
      if (digits.length === 9)
        return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10)
        return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
      return "";
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    return "";
  };

  const isValidEmail = (input: string) => {
    const v = String(input || "").trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const isValidAddress = (input: string) => {
    const v = String(input || "").trim();
    return v.length >= 5;
  };

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
      const phoneNumberRaw = String(businessData.phone || "").trim();
      const businessNumberRaw = String(
        businessData.businessNumber || ""
      ).trim();
      const businessType = String(extracted.businessType || "").trim();
      const businessItem = String(extracted.businessItem || "").trim();
      const taxEmail = String(extracted.email || "").trim();
      const address = String(businessData.address || "").trim();

      const normalizedBusinessNumber =
        normalizeBusinessNumber(businessNumberRaw);
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumberRaw);

      const nextErrors: Record<string, boolean> = {
        companyName: !companyName,
        representativeName: !repName,
        phone: !phoneNumberRaw,
        businessNumber: !businessNumberRaw,
        businessType: !businessType,
        businessItem: !businessItem,
        email: !taxEmail,
        address: !address,
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

      if (!normalizedBusinessNumber) {
        setErrors((prev) => ({ ...prev, businessNumber: true }));
        toast({
          title: "사업자등록번호 형식이 올바르지 않습니다",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }

      if (!normalizedPhoneNumber) {
        setErrors((prev) => ({ ...prev, phone: true }));
        toast({
          title: "전화번호 형식이 올바르지 않습니다",
          description: "숫자만 입력해도 자동으로 형식이 맞춰집니다.",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }

      if (!isValidEmail(taxEmail)) {
        setErrors((prev) => ({ ...prev, email: true }));
        toast({
          title: "세금계산서 이메일 형식이 올바르지 않습니다",
          variant: "destructive",
          duration: 3500,
        });
        return;
      }

      if (!isValidAddress(address)) {
        setErrors((prev) => ({ ...prev, address: true }));
        toast({
          title: "주소 형식이 올바르지 않습니다",
          description: "주소를 5자 이상 입력해주세요.",
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
          phoneNumber: normalizedPhoneNumber,
          businessNumber: normalizedBusinessNumber,
          businessType,
          businessItem,
          email: taxEmail,
          address,
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
      setBusinessData((prev) => ({
        ...prev,
        phone: normalizedPhoneNumber,
        businessNumber: normalizedBusinessNumber,
      }));

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

      const maxBytes = 10 * 1024 * 1024;
      const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);
      if (!allowedMimeTypes.has(file.type)) {
        toast({
          title: "이미지 파일만 업로드할 수 있어요",
          description: "JPG 또는 PNG 파일을 선택해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (file.size > maxBytes) {
        toast({
          title: "파일이 너무 큽니다",
          description:
            "사업자등록증 이미지는 최대 10MB까지 업로드할 수 있어요.",
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
      const processingStartedAt = Date.now();
      const processingToast = toast({
        title: "AI 인식 중",
        description:
          "사업자등록증을 인식하고 있어요. 약 4~5초 정도 걸릴 수 있어요.",
        duration: 60000,
      });
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
        const waitMs = Math.max(0, 4500 - (Date.now() - processingStartedAt));
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        const body: any = res.data || {};
        const data = body.data || body;
        const nextExtracted: LicenseExtracted = data?.extracted || {};
        const verification = data?.verification;
        const hasAnyExtracted = Object.values(nextExtracted || {}).some((v) =>
          String(v || "").trim()
        );
        const nextCompanyName = String(nextExtracted?.companyName || "").trim();
        setExtracted((prev) => ({
          ...prev,
          companyName: nextCompanyName || prev.companyName,
          businessNumber:
            String(nextExtracted?.businessNumber || "").trim() ||
            prev.businessNumber,
          address: String(nextExtracted?.address || "").trim() || prev.address,
          phoneNumber:
            String(nextExtracted?.phoneNumber || "").trim() || prev.phoneNumber,
          email: String(nextExtracted?.email || "").trim() || prev.email,
          representativeName:
            String(nextExtracted?.representativeName || "").trim() ||
            prev.representativeName,
          businessType:
            String(nextExtracted?.businessType || "").trim() ||
            prev.businessType,
          businessItem:
            String(nextExtracted?.businessItem || "").trim() ||
            prev.businessItem,
        }));
        setBusinessData((prev) => ({
          ...prev,
          companyName: companyNameTouched
            ? prev.companyName
            : nextCompanyName || prev.companyName,
          businessNumber:
            nextExtracted?.businessNumber?.trim() || prev.businessNumber,
          address: nextExtracted?.address?.trim() || prev.address,
          phone: nextExtracted?.phoneNumber?.trim() || prev.phone,
        }));
        setIsVerified(!!data?.verification?.verified);
        setLicenseStatus("ready");
        processingToast.dismiss();

        if (!hasAnyExtracted) {
          const msg = String(verification?.message || "").trim();
          toast({
            title: "자동 인식 결과가 비어있습니다",
            description:
              msg ||
              "이미지가 흐리거나 각도가 틀어져서 인식이 어려울 수 있어요. 정면/선명하게 다시 업로드해보세요.",
            variant: "destructive",
            duration: 4000,
          });
        }
        return;
      }

      processingToast.dismiss();
      setLicenseStatus("error");
      const msg = String((res.data as any)?.message || "").trim();
      const isBadRequest = res.status === 400;
      toast({
        title: isBadRequest ? "파일 확인 필요" : "분석 실패",
        description:
          msg ||
          (isBadRequest
            ? "업로드된 파일을 확인할 수 없습니다. 초기화 후 다시 업로드해주세요."
            : "자동 인식에 실패했습니다. 아래 정보를 직접 입력해서 저장할 수 있어요."),
        variant: "destructive",
        duration: 4000,
      });
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
            <BusinessLicenseUpload
              membership={membership}
              licenseStatus={licenseStatus}
              isVerified={isVerified}
              licenseFileName={licenseFileName}
              licenseDeleteLoading={licenseDeleteLoading}
              onFileUpload={handleFileUpload}
              onDeleteLicense={handleDeleteLicense}
            />

            {showLicenseDetails && (
              <BusinessForm
                businessData={businessData}
                extracted={extracted}
                errors={errors}
                licenseStatus={licenseStatus}
                membership={membership}
                licenseDeleteLoading={licenseDeleteLoading}
                setBusinessData={setBusinessData}
                setExtracted={setExtracted}
                setErrors={setErrors}
                setCompanyNameTouched={setCompanyNameTouched}
                onSave={handleSave}
                onReset={handleDeleteLicense}
              />
            )}
          </div>
        )}

        {membership !== "owner" && (
          <div className="space-y-4">
            {membership === "member" && (
              <BusinessMemberView
                currentOrgName={currentOrgName}
                licenseStatus={licenseStatus}
                isVerified={isVerified}
                extracted={extracted}
                businessData={businessData}
              />
            )}

            {membership === "none" && (
              <OrganizationSearchSection
                orgSearch={orgSearch}
                setOrgSearch={setOrgSearch}
                orgSearchResults={orgSearchResults}
                selectedOrg={selectedOrg}
                setSelectedOrg={setSelectedOrg}
                orgOpen={orgOpen}
                setOrgOpen={setOrgOpen}
                joinLoading={joinLoading}
                onJoinRequest={handleJoinRequest}
              />
            )}

            <JoinRequestsSection
              myJoinRequests={myJoinRequests}
              cancelLoadingOrgId={cancelLoadingOrgId}
              onCancelJoinRequest={handleCancelJoinRequest}
              onLeaveOrganization={handleLeaveOrganization}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
