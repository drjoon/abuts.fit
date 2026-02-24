import { request } from "@/shared/api/apiClient";
import {
  normalizeBusinessNumber,
  normalizePhoneNumber,
  isValidEmail,
  isValidAddress,
  normalizeStartDate,
  isValidStartDate,
} from "./validations";
import { BusinessData, LicenseExtracted, MembershipStatus } from "./types";

interface HandleSaveParams {
  token: string;
  businessData: BusinessData;
  extracted: LicenseExtracted;
  membership?: MembershipStatus;
  organizationType?: string;
  businessLicense?: {
    fileId?: string;
    s3Key?: string;
    originalName?: string;
  };
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  silent?: boolean;
  auto?: boolean;
  setErrors: (
    errors:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  setBusinessData: (fn: (prev: BusinessData) => BusinessData) => void;
  navigate: (path: string) => void;
  nextPath: string;
}

interface HandleSaveResult {
  success: boolean;
  welcomeBonusGranted?: boolean;
  welcomeBonusAmount?: number;
  verification?: {
    verified?: boolean;
    provider?: string;
    message?: string;
    checkedAt?: string;
  };
}

export const handleSave = async (
  params: HandleSaveParams,
): Promise<HandleSaveResult> => {
  const {
    token,
    businessData,
    extracted,
    membership,
    organizationType,
    businessLicense,
    mockHeaders,
    toast,
    silent,
    auto,
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
      return { success: false };
    }

    const companyName = String(businessData.companyName || "").trim();
    const repName = String(extracted.representativeName || "").trim();
    const phoneNumberRaw = String(businessData.phone || "").trim();
    const businessNumberRaw = String(businessData.businessNumber || "").trim();
    const businessType = String(extracted.businessType || "").trim();
    const businessItem = String(extracted.businessItem || "").trim();
    const taxEmail = String(extracted.email || "").trim();
    const address = String(businessData.address || "").trim();
    const startDateRaw = String(extracted.startDate || "").trim();
    const startDate = normalizeStartDate(startDateRaw);

    const normalizedBusinessNumber = normalizeBusinessNumber(businessNumberRaw);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumberRaw);

    const allowPartialUpdate = membership === "owner";

    const requiredMissing =
      !companyName ||
      !repName ||
      !phoneNumberRaw ||
      !businessNumberRaw ||
      !businessType ||
      !businessItem ||
      !taxEmail ||
      !address ||
      !startDate;

    if (requiredMissing && !allowPartialUpdate) {
      if (!auto) {
        const nextErrors: Record<string, boolean> = {
          companyName: !companyName,
          representativeName: !repName,
          phone: !phoneNumberRaw,
          businessNumber: !businessNumberRaw,
          businessType: !businessType,
          businessItem: !businessItem,
          email: !taxEmail,
          address: !address,
          startDate: !startDate,
        };
        setErrors(nextErrors);
        toast({
          title: "필수 항목을 입력해주세요",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    if (startDateRaw && !startDate) {
      setErrors((prev) => ({ ...prev, startDate: true }));
      if (!auto) {
        toast({
          title: "개업연월일 형식이 올바르지 않습니다",
          description: "YYYYMMDD 8자리로 입력해주세요.",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    if (businessNumberRaw && !normalizedBusinessNumber) {
      setErrors((prev) => ({ ...prev, businessNumber: true }));
      if (!auto) {
        toast({
          title: "사업자등록번호 형식이 올바르지 않습니다",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    if (phoneNumberRaw && !normalizedPhoneNumber) {
      setErrors((prev) => ({ ...prev, phone: true }));
      if (!auto) {
        toast({
          title: "전화번호 형식이 올바르지 않습니다",
          description: "숫자만 입력해도 자동으로 형식이 맞춰집니다.",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    if (taxEmail && !isValidEmail(taxEmail)) {
      setErrors((prev) => ({ ...prev, email: true }));
      if (!auto) {
        toast({
          title: "세금계산서 이메일 형식이 올바르지 않습니다",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    if (address && !isValidAddress(address)) {
      setErrors((prev) => ({ ...prev, address: true }));
      if (!auto) {
        toast({
          title: "주소 형식이 올바르지 않습니다",
          description: "주소를 5자 이상 입력해주세요.",
          variant: "destructive",
          duration: 3500,
        });
      }
      return { success: false };
    }

    const res = await request<any>({
      path: "/api/requestor-organizations/me",
      method: "PUT",
      token,
      headers: mockHeaders,
      jsonBody: {
        organizationType,
        name: companyName,
        representativeName: repName,
        phoneNumber: normalizedPhoneNumber,
        businessNumber: normalizedBusinessNumber,
        businessType,
        businessItem,
        email: taxEmail,
        address,
        startDate,
        ...(businessLicense &&
        (String(businessLicense?.s3Key || "").trim() ||
          String(businessLicense?.fileId || "").trim() ||
          String(businessLicense?.originalName || "").trim())
          ? {
              businessLicense: {
                fileId: String(businessLicense?.fileId || "").trim() || null,
                s3Key: String(businessLicense?.s3Key || "").trim(),
                originalName: String(
                  businessLicense?.originalName || "",
                ).trim(),
              },
            }
          : {}),
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
        return { success: false };
      }
      if (reason === "business_verification_failed") {
        setErrors((prev) => ({ ...prev, businessNumber: true }));
        toast({
          title: "사업자등록번호 검증에 실패했습니다",
          description:
            serverMessage ||
            "홈택스 조회 결과와 일치하지 않습니다. 정보를 확인해주세요. 반복될 경우 관리자에게 문의하면 수동 검증 후 승인됩니다.",
          variant: "destructive",
          duration: 4500,
        });
        return { success: false };
      }
      toast({
        title: "저장 실패",
        description: serverMessage || undefined,
        variant: "destructive",
        duration: 3000,
      });
      return { success: false };
    }

    const body: any = res.data || {};
    const data = body?.data || body || {};
    const welcomeBonusGranted = Boolean(data?.welcomeBonusGranted);
    const welcomeBonusAmount = Number(data?.welcomeBonusAmount || 0);
    const verificationRaw = data?.verification;
    const verification = verificationRaw
      ? {
          verified: Boolean(verificationRaw?.verified),
          provider: String(verificationRaw?.provider || "").trim() || undefined,
          message: String(verificationRaw?.message || "").trim() || undefined,
          checkedAt:
            String(verificationRaw?.checkedAt || "").trim() || undefined,
        }
      : undefined;

    setErrors({});
    setBusinessData((prev) => ({
      ...prev,
      phone: normalizedPhoneNumber,
      businessNumber: normalizedBusinessNumber,
    }));

    if (welcomeBonusGranted && welcomeBonusAmount > 0) {
      const formatted = new Intl.NumberFormat("ko-KR").format(
        Math.max(0, welcomeBonusAmount),
      );
      toast({
        title: "신규 기공소 등록 완료",
        description: `축하 크레딧 ${formatted}원이 자동 적립되었어요.`,
      });
    } else if (!silent && !auto) {
      toast({
        title: "설정이 저장되었습니다",
        description: "사업자 정보가 성공적으로 업데이트되었습니다.",
      });
    }

    return {
      success: true,
      welcomeBonusGranted,
      welcomeBonusAmount,
      verification,
    };
  } catch {
    toast({
      title: "저장 실패",
      variant: "destructive",
      duration: 3000,
    });
    return { success: false };
  }
};

interface HandleDeleteLicenseParams {
  token: string;
  membership: MembershipStatus;
  licenseFileName: string;
  licenseS3Key: string;
  licenseFileId: string;
  organizationType?: string;
  mockHeaders: Record<string, string>;
  toast: (options: any) => void;
  setLicenseDeleteLoading: (loading: boolean) => void;
}

export const handleDeleteLicense = async (
  params: HandleDeleteLicenseParams,
): Promise<boolean> => {
  const {
    token,
    membership,
    licenseFileName,
    licenseS3Key,
    licenseFileId,
    organizationType,
    mockHeaders,
    toast,
    setLicenseDeleteLoading,
  } = params;

  try {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return false;
    }

    if (membership !== "owner") {
      toast({
        title: "대표자만 삭제할 수 있어요",
        variant: "destructive",
        duration: 3000,
      });
      return false;
    }

    if (!licenseFileName && !licenseS3Key && !licenseFileId) {
      return true;
    }

    setLicenseDeleteLoading(true);
    const res = await request<any>({
      path: "/api/requestor-organizations/me/business-license",
      method: "DELETE",
      token,
      headers: mockHeaders,
      jsonBody: { organizationType },
    });

    if (!res.ok) {
      const msg = String((res.data as any)?.message || "").trim();
      toast({
        title: "삭제 실패",
        description: msg || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return false;
    }

    toast({
      title: "삭제되었습니다",
      duration: 2000,
    });
    return true;
  } finally {
    setLicenseDeleteLoading(false);
  }
};

interface HandleJoinOrLeaveParams {
  token: string;
  organizationId: string;
  action: "cancel" | "leave";
  organizationType?: string;
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
    organizationType,
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
      jsonBody: { organizationType },
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
  organizationType?: string;
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
    organizationType,
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
      jsonBody: { organizationId: selectedOrgId, organizationType },
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
