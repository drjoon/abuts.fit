import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUploadWithProgressToast } from "@/hooks/useUploadWithProgressToast";
import { Building2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GuideFocus } from "@/features/guidetour/GuideFocus";
import { useGuideTour } from "@/features/guidetour/GuideTourProvider";
import { PageFileDropZone } from "@/components/PageFileDropZone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  BusinessLicenseUpload,
  type BusinessLicenseUploadHandle,
} from "./business/BusinessLicenseUpload";
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
import {
  normalizeBusinessNumber,
  normalizePhoneNumber,
  isValidEmail,
  isValidAddress,
  formatBusinessNumberInput,
  formatPhoneNumberInput,
} from "./business/validations";
import {
  handleSave as handleSaveImpl,
  handleDeleteLicense as handleDeleteLicenseImpl,
  handleJoinOrLeave,
  handleJoinRequest as handleJoinRequestImpl,
} from "./business/handlers";

const SETUP_MODE_STORAGE_KEY = "business_tab_setup_mode";
const BUSINESS_DRAFT_STORAGE_KEY = "business_tab_draft_v1";

const getSetupModeStorageKey = (userId?: string | null) => {
  if (!userId) return null;
  return `${SETUP_MODE_STORAGE_KEY}:${userId}`;
};

const readStoredSetupMode = (
  userId?: string | null
): "license" | "search" | null => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getSetupModeStorageKey(userId);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "license" || raw === "search") return raw;
    return null;
  } catch {
    return null;
  }
};

const writeStoredSetupMode = (
  userId: string | null,
  mode: "license" | "search" | null
) => {
  if (typeof window === "undefined") return;
  try {
    const storageKey = getSetupModeStorageKey(userId);
    if (!storageKey) return;
    if (!mode) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // ignore
  }
};

const getBusinessDraftStorageKey = (userId?: string | null) => {
  if (!userId) return null;
  return `${BUSINESS_DRAFT_STORAGE_KEY}:${userId}`;
};

type BusinessDraftPayload = {
  businessData: BusinessData;
  extracted: LicenseExtracted;
  licenseFileName: string;
  licenseFileId: string;
  licenseS3Key: string;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  updatedAt: number;
};

const readStoredBusinessDraft = (
  userId?: string | null
): BusinessDraftPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getBusinessDraftStorageKey(userId);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.businessData) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredBusinessDraft = (
  userId: string | null,
  payload: BusinessDraftPayload | null
) => {
  if (typeof window === "undefined") return;
  try {
    const storageKey = getBusinessDraftStorageKey(userId);
    if (!storageKey) return;
    if (!payload) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

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
  const { token, user, loginWithToken } = useAuthStore();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const navigate = useNavigate();
  const {
    active: guideActive,
    activeTourId,
    isStepActive,
    goToStep,
    completeStep,
    startTour,
    stopTour,
    setStepCompleted,
  } = useGuideTour();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();

  const authUserId = user?.id ? String(user.id) : null;
  const [membership, setMembership] = useState<MembershipStatus>("none");
  const [setupMode, setSetupMode] = useState<"license" | "search" | null>(null);
  const [setupModeLocked, setSetupModeLocked] = useState(false);

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
    | { organizationId: string; organizationName: string; status: string }[]
    | null
  >(null);
  const [joinRequestsLoaded, setJoinRequestsLoaded] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoadingOrgId, setCancelLoadingOrgId] = useState<string>("");
  const [orgOpen, setOrgOpen] = useState(false);

  const [licenseDeleteLoading, setLicenseDeleteLoading] = useState(false);

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
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(
    userData?.companyName ? "missing" : "missing"
  );

  const licenseUploadRef = useRef<BusinessLicenseUploadHandle | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const latestDraftRef = useRef<{
    payload: BusinessDraftPayload | null;
    hasAnyLicense: boolean;
    hasAnyData: boolean;
  }>({ payload: null, hasAnyLicense: false, hasAnyData: false });

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

  const applyStoredDraft = useCallback((draft: BusinessDraftPayload) => {
    setBusinessData(draft.businessData);
    setExtracted(draft.extracted);
    setLicenseFileName(draft.licenseFileName);
    setLicenseFileId(draft.licenseFileId);
    setLicenseS3Key(draft.licenseS3Key);
    setLicenseStatus(draft.licenseStatus);
    setIsVerified(draft.isVerified);
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    const draft = readStoredBusinessDraft(authUserId);
    if (!draft) return;

    const hasDraftLicense =
      Boolean(String(draft.licenseFileId || "").trim()) ||
      Boolean(String(draft.licenseS3Key || "").trim()) ||
      Boolean(String(draft.licenseFileName || "").trim());
    if (!hasDraftLicense) return;

    if (licenseFileId || licenseS3Key || licenseFileName) return;

    applyStoredDraft(draft);
  }, [
    applyStoredDraft,
    authUserId,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
  ]);

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
        if (!res.ok) {
          setJoinRequestsLoaded(true);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        const next = (data?.membership || "none") as MembershipStatus;
        setMembership(next);

        const orgName = String(data?.organization?.name || "").trim();
        const ex = data?.extracted || {};
        setBusinessData((prev) => {
          const nextBusinessNumber = formatBusinessNumberInput(
            String(ex?.businessNumber || "").trim()
          );
          const nextPhone = formatPhoneNumberInput(
            String(ex?.phoneNumber || "").trim()
          );
          return {
            ...prev,
            companyName: companyNameTouched
              ? prev.companyName
              : orgName || prev.companyName,
            businessNumber: nextBusinessNumber || prev.businessNumber,
            address: String(ex?.address || "").trim() || prev.address,
            phone: nextPhone || prev.phone,
          };
        });
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
          startDate: String(ex?.startDate || "").trim() || prev.startDate,
        }));

        const lic = data?.businessLicense || {};
        const licName = String(lic?.originalName || "").trim();
        const licFileId = String(lic?.fileId || "").trim();
        const licS3Key = String(lic?.s3Key || "").trim();
        if (licName || licFileId || licS3Key) {
          setLicenseFileName((prev) => licName || prev);
          setLicenseFileId(licFileId);
          setLicenseS3Key(licS3Key);
          setLicenseStatus("ready");

          writeStoredBusinessDraft(authUserId, null);
        }

        setIsVerified(!!data?.businessVerified);
      } catch {
        setMembership("none");
      }
    };

    load();
  }, [authUserId, mockHeaders, token]);

  useEffect(() => {
    if (!authUserId) return;
    if (membership !== "none") {
      writeStoredBusinessDraft(authUserId, null);
    }
  }, [authUserId, membership]);

  const hasAnyLicense =
    Boolean(String(licenseFileId || "").trim()) ||
    Boolean(String(licenseS3Key || "").trim()) ||
    Boolean(String(licenseFileName || "").trim());
  const hasAnyData =
    Boolean(String(businessData.companyName || "").trim()) ||
    Boolean(String(businessData.businessNumber || "").trim()) ||
    Boolean(String(businessData.address || "").trim()) ||
    Boolean(String(businessData.phone || "").trim()) ||
    Object.values(extracted || {}).some((v) => Boolean(String(v || "").trim()));

  latestDraftRef.current = {
    hasAnyLicense,
    hasAnyData,
    payload:
      hasAnyLicense || hasAnyData
        ? {
            businessData,
            extracted,
            licenseFileName,
            licenseFileId,
            licenseS3Key,
            licenseStatus,
            isVerified,
            updatedAt: Date.now(),
          }
        : null,
  };

  useEffect(() => {
    if (!authUserId) return;
    const { hasAnyLicense: latestHasAnyLicense, hasAnyData: latestHasAnyData } =
      latestDraftRef.current;
    if (!latestHasAnyLicense && !latestHasAnyData) {
      writeStoredBusinessDraft(authUserId, null);
      return;
    }
    writeStoredBusinessDraft(authUserId, latestDraftRef.current.payload);
  }, [
    authUserId,
    businessData,
    extracted,
    isVerified,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
    licenseStatus,
  ]);

  const updateSetupMode = useCallback(
    (mode: "license" | "search" | null) => {
      setSetupMode(mode);
      writeStoredSetupMode(authUserId, mode);
    },
    [authUserId]
  );

  useEffect(() => {
    if (!authUserId) return;
    if (membership !== "none") return;
    if (setupMode !== null) return;
    const stored = readStoredSetupMode(authUserId);
    if (!stored) return;
    updateSetupMode(stored);
  }, [authUserId, membership, setupMode, updateSetupMode]);

  useEffect(() => {
    if (membership !== "none" && setupMode !== null) {
      updateSetupMode(null);
    }
  }, [membership, setupMode, updateSetupMode]);

  useEffect(() => {
    if (!guideActive || membership !== "none") {
      setSetupModeLocked(false);
    }
  }, [guideActive, membership]);

  useEffect(() => {
    if (!guideActive) return;
    if (activeTourId !== "requestor-onboarding") return;
    if (!isStepActive("requestor.business.licenseUpload")) return;
    if (licenseStatus === "missing") return;
    if (!licenseFileId && !licenseFileName && !licenseS3Key) return;
    completeStep("requestor.business.licenseUpload");
  }, [
    activeTourId,
    completeStep,
    guideActive,
    isStepActive,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
    licenseStatus,
  ]);

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
        if (!token) {
          setJoinRequestsLoaded(false);
          setMyJoinRequests(null);
          return;
        }
        if (membership === "owner") {
          setJoinRequestsLoaded(true);
          setMyJoinRequests([]);
          return;
        }
        setJoinRequestsLoaded(false);
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
      } finally {
        setJoinRequestsLoaded(true);
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
    setJoinRequestsLoaded(false);
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
    setJoinRequestsLoaded(true);
  };

  const handleCancelJoinRequest = async (organizationId: string) => {
    await handleJoinOrLeave({
      token,
      organizationId,
      action: "cancel",
      mockHeaders,
      toast,
      setCancelLoadingOrgId,
      refreshMyJoinRequests,
      refreshMembership,
    });
  };

  const handleDeleteLicense = async () => {
    if (membership === "none") {
      await runDeleteLicense();
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const runDeleteLicense = async () => {
    if (membership === "none") {
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
      updateSetupMode(null);
      if (authUserId) {
        writeStoredBusinessDraft(authUserId, null);
      }
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

    const success = await handleDeleteLicenseImpl({
      token,
      membership,
      licenseFileName,
      licenseS3Key,
      licenseFileId,
      mockHeaders,
      toast,
      setLicenseDeleteLoading,
    });

    if (success) {
      latestDraftRef.current = {
        payload: null,
        hasAnyLicense: false,
        hasAnyData: false,
      };
      if (authUserId) {
        writeStoredBusinessDraft(authUserId, null);
      }
      setBusinessData({
        companyName: "",
        businessNumber: "",
        address: "",
        phone: "",
      });
      setExtracted({});
      await refreshMembership();
      if (token) {
        await loginWithToken(token);
      }
    }
  };

  const handleLeaveOrganization = async (organizationId: string) => {
    await handleJoinOrLeave({
      token,
      organizationId,
      action: "leave",
      mockHeaders,
      toast,
      setCancelLoadingOrgId,
      refreshMyJoinRequests,
      refreshMembership,
    });
  };

  const handleJoinRequest = async () => {
    await handleJoinRequestImpl({
      token,
      selectedOrgId: selectedOrg?._id,
      mockHeaders,
      toast,
      setJoinLoading,
      setOrgSearch,
      setOrgSearchResults,
      setSelectedOrg,
      refreshMembership,
      refreshMyJoinRequests,
      stopTour,
      setStepCompleted,
    });
  };

  const hasJoinRequest =
    Array.isArray(myJoinRequests) && myJoinRequests.length > 0;
  const showJoinRequestSection = joinRequestsLoaded && hasJoinRequest;
  const showSelectionChoices =
    joinRequestsLoaded &&
    Array.isArray(myJoinRequests) &&
    myJoinRequests.length === 0;

  const currentOrgName = useMemo(() => {
    const fromUser = String((user as any)?.organization || "").trim();
    const fromState = String(businessData.companyName || "").trim();
    const fromProps = String(userData?.companyName || "").trim();
    return fromUser || fromState || fromProps;
  }, [businessData.companyName, user, userData?.companyName]);

  const roleBadge = useMemo(() => {
    if (membership === "owner") return "대표";
    if (membership === "member") return "직원";
    if (membership === "pending") return "승인대기";
    return "미소속";
  }, [membership]);

  const handleSave = async () => {
    const inBusinessTour =
      isStepActive("requestor.business.companyName") ||
      isStepActive("requestor.business.businessNumber");

    const { success } = await handleSaveImpl({
      token,
      businessData,
      extracted,
      membership,
      businessLicense: {
        fileId: licenseFileId,
        s3Key: licenseS3Key,
        originalName: licenseFileName,
      },
      mockHeaders,
      toast,
      silent: true,
      auto: true,
      setErrors,
      setBusinessData,
      navigate,
      nextPath: inBusinessTour ? "" : nextPath,
    });
    if (success) {
      await refreshMembership();
      if (token) {
        await loginWithToken(token);
      }

      if (isStepActive("requestor.business.businessNumber")) {
        completeStep("requestor.business.businessNumber");
        navigate(
          nextPath
            ? `/dashboard/settings?tab=account&next=${encodeURIComponent(
                nextPath
              )}`
            : "/dashboard/settings?tab=account"
        );
      }
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          description: "사업자등록증 업로드는 로그인 후 이용할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (licenseFileName) {
        toast({
          title: "이미 업로드되어 있습니다",
          description:
            "사업자등록증을 재업로드하려면 먼저 삭제하거나 [초기화]를 진행해주세요.",
          duration: 3000,
        });
        return;
      }

      const canUploadLicense =
        membership === "owner" ||
        (membership === "none" && setupMode === "license");

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

      if (!canUploadLicense) {
        toast({
          title: "대표 계정만 업로드할 수 있어요",
          description: "사업자등록증 업로드/수정은 대표 계정에서만 가능합니다.",
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
      completeStep("requestor.business.licenseUpload");

      if (String(businessData.phone || "").trim()) {
        goToStep("requestor.business.email");
      } else {
        goToStep("requestor.business.phoneNumber");
      }

      setTimeout(() => {
        if (isStepActive("requestor.business.phoneNumber")) {
          const phoneInput =
            document.querySelector<HTMLInputElement>("#orgPhone");
          if (phoneInput) phoneInput.focus();
        }
        if (isStepActive("requestor.business.email")) {
          const emailInput =
            document.querySelector<HTMLInputElement>("#taxEmail");
          if (emailInput) emailInput.focus();
        }
      }, 50);

      setLicenseStatus("processing");
      const processingStartedAt = Date.now();
      const processingToast = toast({
        title: "AI 인식 중",
        description:
          "사업자등록증을 인식하고 있어요. 약 5초 정도 걸릴 수 있어요.",
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
        setBusinessData((prev) => {
          const aiBusinessNumber = formatBusinessNumberInput(
            String(nextExtracted?.businessNumber || "").trim()
          );
          const aiPhone = formatPhoneNumberInput(
            String(nextExtracted?.phoneNumber || "").trim()
          );
          return {
            ...prev,
            companyName: companyNameTouched
              ? prev.companyName
              : nextCompanyName || prev.companyName,
            businessNumber: aiBusinessNumber || prev.businessNumber,
            address: nextExtracted?.address?.trim() || prev.address,
            phone: aiPhone || prev.phone,
          };
        });
        setIsVerified(!!data?.verification?.verified);
        setLicenseStatus("ready");
        processingToast.dismiss();

        if (
          String((verification as any)?.reason || "").trim() ===
          "duplicate_business_number"
        ) {
          const msg = String((verification as any)?.message || "").trim();
          toast({
            title: "이미 등록된 사업자등록증입니다",
            description:
              msg ||
              "사업자등록번호가 이미 등록되어 있어 자동 등록을 진행할 수 없습니다.",
            variant: "destructive",
            duration: 4500,
          });
        }

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

  const handleLicenseFilesDrop = (selectedFiles: File[]) => {
    const file = selectedFiles?.[0];
    if (!file) return;
    if (licenseFileName) {
      toast({
        title: "이미 업로드되어 있습니다",
        description:
          "사업자등록증을 재업로드하려면 먼저 삭제하거나 [초기화]를 진행해주세요.",
        duration: 3000,
      });
      return;
    }
    void handleFileUpload(file);
  };

  return (
    <PageFileDropZone
      onFiles={handleLicenseFilesDrop}
      activeClassName="ring-2 ring-primary/30"
    >
      <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                기공소 정보
              </p>
              <span className="ml-2 inline-flex items-center rounded-md border bg-white/60 px-2 py-0.5 text-xs text-foreground">
                {roleBadge}
              </span>
            </div>

            {membership === "owner" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDeleteLicense}
                disabled={
                  licenseDeleteLoading ||
                  licenseStatus === "processing" ||
                  licenseStatus === "uploading"
                }
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                초기화
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {membership === "none" && !setupMode && showSelectionChoices && (
            <div className="space-y-4">
              <div className="rounded-lg bg-white/60 p-3 text-sm">
                아래 두 가지 방법 중 하나를 선택해 기공소 소속을 설정해주세요.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <GuideFocus
                  stepId="requestor.business.licenseUpload"
                  hint="사업자등록증 업로드"
                >
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border bg-white/70 p-4 transition-colors hover:bg-white"
                    onClick={() => {
                      setSetupModeLocked(true);
                      updateSetupMode("license");
                      startTour(
                        "requestor-onboarding",
                        "requestor.business.licenseUpload"
                      );
                      requestAnimationFrame(() => {
                        licenseUploadRef.current?.focusUpload();
                      });
                    }}
                  >
                    <div className="text-sm font-medium">신규 기공소 등록</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      사업자등록증을 업로드해서 기공소를 새로 등록합니다.
                    </div>
                  </button>
                </GuideFocus>
                <GuideFocus
                  stepId="requestor.business.licenseUpload"
                  hint="기공소 선택"
                >
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border bg-white/70 p-4 transition-colors hover:bg-white"
                    onClick={() => {
                      setSetupModeLocked(true);
                      updateSetupMode("search");
                    }}
                  >
                    <div className="text-sm font-medium">
                      기존 기공소 소속 신청
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      이미 등록된 기공소를 검색해 소속을 신청합니다.
                    </div>
                  </button>
                </GuideFocus>
              </div>

              <JoinRequestsSection
                myJoinRequests={myJoinRequests}
                cancelLoadingOrgId={cancelLoadingOrgId}
                onCancelJoinRequest={handleCancelJoinRequest}
                onLeaveOrganization={handleLeaveOrganization}
              />
            </div>
          )}

          {membership === "none" && showJoinRequestSection && (
            <JoinRequestsSection
              myJoinRequests={myJoinRequests || []}
              cancelLoadingOrgId={cancelLoadingOrgId}
              onCancelJoinRequest={handleCancelJoinRequest}
              onLeaveOrganization={handleLeaveOrganization}
            />
          )}

          {(membership !== "none" || !!setupMode || showJoinRequestSection) && (
            <div className="space-y-6">
              {membership === "none" && showSelectionChoices && (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">
                    {setupMode === "license"
                      ? "신규 기공소 등록"
                      : "기존 기공소 소속 신청"}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSetupModeLocked(true);
                      updateSetupMode(null);
                    }}
                  >
                    다른 방법 선택
                  </Button>
                </div>
              )}

              {(membership === "owner" || setupMode === "license") && (
                <div className="space-y-6">
                  <BusinessLicenseUpload
                    ref={licenseUploadRef}
                    membership={membership}
                    licenseStatus={licenseStatus}
                    isVerified={isVerified}
                    licenseFileName={licenseFileName}
                    licenseDeleteLoading={licenseDeleteLoading}
                    onFileUpload={handleFileUpload}
                    onDeleteLicense={handleDeleteLicense}
                  />

                  {(membership === "owner" || licenseStatus !== "missing") && (
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
                    />
                  )}
                </div>
              )}

              {(membership === "member" || membership === "pending") && (
                <BusinessMemberView
                  currentOrgName={currentOrgName}
                  licenseStatus={licenseStatus}
                  isVerified={isVerified}
                  extracted={extracted}
                  businessData={businessData}
                />
              )}

              {(membership === "none"
                ? setupMode === "search" && showSelectionChoices
                : membership !== "owner") && (
                <div className="space-y-4">
                  {membership === "none" && (
                    <GuideFocus
                      stepId="requestor.business.licenseUpload"
                      hint="기공소 선택"
                    >
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
                    </GuideFocus>
                  )}

                  {Array.isArray(myJoinRequests) &&
                    myJoinRequests.length > 0 && (
                      <JoinRequestsSection
                        myJoinRequests={myJoinRequests}
                        cancelLoadingOrgId={cancelLoadingOrgId}
                        onCancelJoinRequest={handleCancelJoinRequest}
                        onLeaveOrganization={handleLeaveOrganization}
                      />
                    )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 초기화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 등록된 임직원 정보도 초기화됩니다. 그래도 진행할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setDeleteConfirmOpen(false);
                await runDeleteLicense();
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFileDropZone>
  );
};
