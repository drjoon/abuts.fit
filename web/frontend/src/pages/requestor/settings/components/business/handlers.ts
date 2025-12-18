import { request } from "@/lib/apiClient";
import {
  normalizeBusinessNumber,
  normalizePhoneNumber,
  isValidEmail,
  isValidAddress,
} from "./validations";
import { BusinessData, LicenseExtracted, MembershipStatus } from "./types";

interface HandleSaveParams {
  token: string;
  businessData: BusinessData;
  extracted: LicenseExtracted;
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  setErrors: (
    errors:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  setBusinessData: (fn: (prev: BusinessData) => BusinessData) => void;
  navigate: (path: string) => void;
  nextPath: string;
}

export const handleSave = async (params: HandleSaveParams) => {
  const {
    token,
    businessData,
    extracted,
    mockHeaders,
    toast,
    setErrors,
    setBusinessData,
    navigate,
    nextPath,
  } = params;

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
    const businessNumberRaw = String(businessData.businessNumber || "").trim();
    const businessType = String(extracted.businessType || "").trim();
    const businessItem = String(extracted.businessItem || "").trim();
    const taxEmail = String(extracted.email || "").trim();
    const address = String(businessData.address || "").trim();

    const normalizedBusinessNumber = normalizeBusinessNumber(businessNumberRaw);
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
      const body: any = res.data || {};
      const reason = String(body?.reason || "").trim();
      const serverMessage = String(body?.message || "").trim();
      if (reason === "duplicate_business_number") {
        setErrors((prev) => ({ ...prev, businessNumber: true }));
        toast({
          title: "이미 등록된 사업자등록번호입니다",
          description:
            serverMessage || "기존 기공소에 가입 요청을 진행해주세요.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
      toast({
        title: "저장 실패",
        description: serverMessage || undefined,
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

interface HandleDeleteLicenseParams {
  token: string;
  membership: MembershipStatus;
  licenseFileName: string;
  licenseS3Key: string;
  licenseFileId: string;
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  setLicenseDeleteLoading: (loading: boolean) => void;
  setLicenseFileName: (name: string) => void;
  setLicenseFileId: (id: string) => void;
  setLicenseS3Key: (key: string) => void;
  setLicenseStatus: (status: any) => void;
  setIsVerified: (verified: boolean) => void;
  setExtracted: (extracted: any) => void;
  setErrors: (
    errors:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  setBusinessData: (fn: (prev: BusinessData) => BusinessData) => void;
  setCompanyNameTouched: (touched: boolean) => void;
}

export const handleDeleteLicense = async (
  params: HandleDeleteLicenseParams
) => {
  const {
    token,
    membership,
    licenseFileName,
    licenseS3Key,
    licenseFileId,
    mockHeaders,
    toast,
    setLicenseDeleteLoading,
    setLicenseFileName,
    setLicenseFileId,
    setLicenseS3Key,
    setLicenseStatus,
    setIsVerified,
    setExtracted,
    setErrors,
    setBusinessData,
    setCompanyNameTouched,
  } = params;

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

interface HandleJoinOrLeaveParams {
  token: string;
  organizationId: string;
  action: "cancel" | "leave";
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  setCancelLoadingOrgId: (id: string) => void;
  refreshMyJoinRequests: () => Promise<void>;
  refreshMembership: () => Promise<void>;
}

export const handleJoinOrLeave = async (params: HandleJoinOrLeaveParams) => {
  const {
    token,
    organizationId,
    action,
    mockHeaders,
    toast,
    setCancelLoadingOrgId,
    refreshMyJoinRequests,
    refreshMembership,
  } = params;

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
      path: `/api/requestor-organizations/join-requests/${orgId}/${action}`,
      method: "POST",
      token,
      headers: mockHeaders,
    });

    if (!res.ok) {
      const message = String((res.data as any)?.message || "").trim();
      toast({
        title: action === "cancel" ? "신청 취소 실패" : "승인 취소 실패",
        description: message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    toast({
      title:
        action === "cancel" ? "신청이 취소되었습니다" : "승인이 취소되었습니다",
    });
    await refreshMyJoinRequests();
    await refreshMembership();
  } finally {
    setCancelLoadingOrgId("");
  }
};

interface HandleJoinRequestParams {
  token: string;
  selectedOrgId: string | undefined;
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  setJoinLoading: (loading: boolean) => void;
  setOrgSearch: (search: string) => void;
  setOrgSearchResults: (results: any[]) => void;
  setSelectedOrg: (org: any) => void;
  refreshMembership: () => Promise<void>;
  refreshMyJoinRequests: () => Promise<void>;
}

export const handleJoinRequest = async (params: HandleJoinRequestParams) => {
  const {
    token,
    selectedOrgId,
    mockHeaders,
    toast,
    setJoinLoading,
    setOrgSearch,
    setOrgSearchResults,
    setSelectedOrg,
    refreshMembership,
    refreshMyJoinRequests,
  } = params;

  try {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (!selectedOrgId) {
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
      jsonBody: { organizationId: selectedOrgId },
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
