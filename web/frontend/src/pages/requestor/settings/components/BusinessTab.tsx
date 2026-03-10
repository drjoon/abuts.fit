import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { Building2, RotateCcw } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
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
} from "@/shared/components/business/BusinessLicenseUpload";
import { BusinessForm } from "./business/BusinessForm";
import { OrganizationSearchSection } from "./business/OrganizationSearchSection";
import { JoinRequestsSection } from "./business/JoinRequestsSection";
import { BusinessMemberView } from "./business/BusinessMemberView";
import {
  LicenseExtracted,
  BusinessData,
  LicenseStatus,
  MembershipStatus,
} from "@/shared/components/business/types";
import type { FieldKey } from "./business/types";
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
const BUSINESS_TAB_DEBUG_PREFIX = "[BusinessTab]";

const getSetupModeStorageKey = (userId?: string | null) => {
  if (!userId) return null;
  return `${SETUP_MODE_STORAGE_KEY}:${userId}`;
};

const readStoredSetupMode = (
  userId?: string | null,
): "license" | "search" | "manual" | null => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getSetupModeStorageKey(userId);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "license" || raw === "search" || raw === "manual")
      return raw as any;
    return null;
  } catch {
    return null;
  }
};

const writeStoredSetupMode = (
  userId: string | null,
  mode: "license" | "search" | "manual" | null,
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

const createEmptyExtracted = (): LicenseExtracted => ({
  companyName: "",
  businessNumber: "",
  address: "",
  addressDetail: "",
  zipCode: "",
  phoneNumber: "",
  email: "",
  representativeName: "",
  businessType: "",
  businessItem: "",
  startDate: "",
});

const normalizeBusinessData = (
  value?: Partial<BusinessData> | null,
): BusinessData => ({
  companyName: String(value?.companyName || "").trim(),
  businessNumber: String(value?.businessNumber || "").trim(),
  address: String(value?.address || "").trim(),
  addressDetail: String(value?.addressDetail || "").trim(),
  zipCode: String(value?.zipCode || "").trim(),
  phone: String(value?.phone || "").trim(),
});

const normalizeExtracted = (
  value?: Partial<LicenseExtracted> | null,
): LicenseExtracted => ({
  ...createEmptyExtracted(),
  ...(value || {}),
  companyName: String(value?.companyName || "").trim(),
  businessNumber: String(value?.businessNumber || "").trim(),
  address: String(value?.address || "").trim(),
  addressDetail: String(value?.addressDetail || "").trim(),
  zipCode: String(value?.zipCode || "").trim(),
  phoneNumber: String(value?.phoneNumber || "").trim(),
  email: String(value?.email || "").trim(),
  representativeName: String(value?.representativeName || "").trim(),
  businessType: String(value?.businessType || "").trim(),
  businessItem: String(value?.businessItem || "").trim(),
  startDate: String(value?.startDate || "").trim(),
});

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
  userId?: string | null,
): BusinessDraftPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getBusinessDraftStorageKey(userId);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.businessData) return null;
    return {
      ...parsed,
      businessData: normalizeBusinessData(parsed.businessData),
      extracted: normalizeExtracted(parsed.extracted),
    };
  } catch {
    return null;
  }
};

const writeStoredBusinessDraft = (
  userId: string | null,
  payload: BusinessDraftPayload | null,
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
  organizationTypeOverride?: "requestor" | "manufacturer" | "salesman" | string;
}

export const BusinessTab = ({
  userData,
  organizationTypeOverride,
}: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user, loginWithToken } = useAuthStore();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();
  const allowLocalDraft = !String(searchParams.get("wizard") || "").trim();

  const authUserId = user?.id ? String(user.id) : null;
  const [membership, setMembership] = useState<MembershipStatus>("none");
  const [setupMode, setSetupMode] = useState<
    "license" | "search" | "manual" | null
  >(null);
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
    { businessId: string; organizationName: string; status: string }[] | null
  >(null);
  const [joinRequestsLoaded, setJoinRequestsLoaded] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoadingOrgId, setCancelLoadingOrgId] = useState<string>("");
  const [orgOpen, setOrgOpen] = useState(false);

  const [licenseDeleteLoading, setLicenseDeleteLoading] = useState(false);
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [showInquiryCta, setShowInquiryCta] = useState(false);
  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const organizationType = useMemo(() => {
    if (organizationTypeOverride) return organizationTypeOverride;
    const role = String(user?.role || userData?.role || "requestor").trim();
    return role || "requestor";
  }, [organizationTypeOverride, user?.role, userData?.role]);

  const [licenseFileName, setLicenseFileName] = useState<string>("");
  const [licenseFileId, setLicenseFileId] = useState<string>("");
  const [licenseS3Key, setLicenseS3Key] = useState<string>("");
  const [validationSucceeded, setValidationSucceeded] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(
    userData?.companyName ? "missing" : "missing",
  );
  const resetVersionRef = useRef(0);
  const suppressPrefillRef = useRef(false);

  const licenseUploadRef = useRef<BusinessLicenseUploadHandle | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [verifiedResetConfirmOpen, setVerifiedResetConfirmOpen] =
    useState(false);
  const latestDraftRef = useRef<{
    payload: BusinessDraftPayload | null;
    hasAnyLicense: boolean;
    hasAnyData: boolean;
  }>({ payload: null, hasAnyLicense: false, hasAnyData: false });

  const [extracted, setExtracted] =
    useState<LicenseExtracted>(createEmptyExtracted);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  const [businessData, setBusinessData] = useState<BusinessData>(() =>
    normalizeBusinessData(),
  );
  const [companyNameTouched, setCompanyNameTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [autoOpenAddressSearchSignal, setAutoOpenAddressSearchSignal] =
    useState(0);
  const [focusFirstMissingSignal, setFocusFirstMissingSignal] = useState(0);
  const [focusFieldKey, setFocusFieldKey] = useState<FieldKey | null>(null);
  const serverHydratedRef = useRef(false);
  const suppressDraftWriteRef = useRef(false);

  const applyStoredDraft = useCallback((draft: BusinessDraftPayload) => {
    setBusinessData(normalizeBusinessData(draft.businessData));
    setExtracted(normalizeExtracted(draft.extracted));
    setLicenseFileName(draft.licenseFileName);
    setLicenseFileId(draft.licenseFileId);
    setLicenseS3Key(draft.licenseS3Key);
    setLicenseStatus(draft.licenseStatus);
    setIsVerified(draft.isVerified);
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    if (!allowLocalDraft) return;
    if (membership !== "none") return;
    if (serverHydratedRef.current) return;
    const draft = readStoredBusinessDraft(authUserId);
    if (!draft) return;

    const hasDraftLicense =
      Boolean(String(draft.licenseFileId || "").trim()) ||
      Boolean(String(draft.licenseS3Key || "").trim()) ||
      Boolean(String(draft.licenseFileName || "").trim());
    if (!hasDraftLicense) return;

    if (licenseFileId || licenseS3Key || licenseFileName) return;

    console.info(`${BUSINESS_TAB_DEBUG_PREFIX} applying stored draft`, {
      authUserId,
      updatedAt: draft.updatedAt,
      licenseFileName: draft.licenseFileName,
    });
    applyStoredDraft(draft);
  }, [
    applyStoredDraft,
    allowLocalDraft,
    authUserId,
    membership,
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
    const loadVersion = resetVersionRef.current;
    const load = async () => {
      try {
        if (!token) return;
        const res = await request<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) {
          setJoinRequestsLoaded(true);
          return;
        }
        if (resetVersionRef.current !== loadVersion) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const next = (data?.membership || "none") as MembershipStatus;
        serverHydratedRef.current = true;
        setMembership(next);
        setValidationSucceeded(Boolean(data?.businessVerified));
        setCardHighlight(false);

        if (
          suppressPrefillRef.current &&
          setupMode === "license" &&
          licenseStatus === "missing"
        ) {
          suppressPrefillRef.current = false;
          return;
        }
        suppressPrefillRef.current = false;

        const orgName = String(
          data?.business?.name || data?.organization?.name || "",
        ).trim();
        const ex = data?.extracted || {};
        console.info(
          `${BUSINESS_TAB_DEBUG_PREFIX} server payload before hydration`,
          {
            membership: next,
            organizationName: orgName,
            extracted: {
              companyName: String(ex?.companyName || "").trim(),
              businessNumber: String(ex?.businessNumber || "").trim(),
              address: String(ex?.address || "").trim(),
              addressDetail: String(ex?.addressDetail || "").trim(),
              zipCode: String(ex?.zipCode || "").trim(),
              phoneNumber: String(ex?.phoneNumber || "").trim(),
              email: String(ex?.email || "").trim(),
              representativeName: String(ex?.representativeName || "").trim(),
              businessType: String(ex?.businessType || "").trim(),
              businessItem: String(ex?.businessItem || "").trim(),
              startDate: String(ex?.startDate || "").trim(),
            },
          },
        );
        const nextBusinessData = normalizeBusinessData({
          companyName: String(ex?.companyName || "").trim() || orgName,
          businessNumber: formatBusinessNumberInput(
            String(ex?.businessNumber || "").trim(),
          ),
          address: String(ex?.address || "").trim(),
          addressDetail: String(ex?.addressDetail || "").trim(),
          zipCode: String(ex?.zipCode || "").trim(),
          phone: formatPhoneNumberInput(String(ex?.phoneNumber || "").trim()),
        });
        setBusinessData(nextBusinessData);
        if (resetVersionRef.current !== loadVersion) return;
        setExtracted(
          normalizeExtracted({
            companyName: String(ex?.companyName || "").trim() || orgName,
            businessNumber: String(ex?.businessNumber || "").trim(),
            address: String(ex?.address || "").trim(),
            addressDetail: String(ex?.addressDetail || "").trim(),
            zipCode: String(ex?.zipCode || "").trim(),
            phoneNumber: String(ex?.phoneNumber || "").trim(),
            email: String(ex?.email || "").trim(),
            representativeName: String(ex?.representativeName || "").trim(),
            businessType: String(ex?.businessType || "").trim(),
            businessItem: String(ex?.businessItem || "").trim(),
            startDate: String(ex?.startDate || "").trim(),
          }),
        );

        const lic = data?.businessLicense || {};
        const licName = String(lic?.originalName || "").trim();
        const nextLicenseFileId = String(lic?.fileId || "").trim();
        const nextLicenseS3Key = String(lic?.s3Key || "").trim();
        if (resetVersionRef.current !== loadVersion) return;
        if (licName || nextLicenseFileId || nextLicenseS3Key) {
          setLicenseFileName(licName);
          setLicenseFileId(nextLicenseFileId);
          setLicenseS3Key(nextLicenseS3Key);
          setLicenseStatus(licName ? "ready" : "missing");
          setIsVerified(!!data?.businessVerified);
        } else {
          setLicenseFileName("");
          setLicenseFileId("");
          setLicenseS3Key("");
          setLicenseStatus("missing");
          setIsVerified(false);
        }
        console.info(`${BUSINESS_TAB_DEBUG_PREFIX} hydrated from server`, {
          membership: next,
          organizationName: orgName,
          extracted: {
            companyName: String(ex?.companyName || "").trim(),
            businessNumber: String(ex?.businessNumber || "").trim(),
            address: String(ex?.address || "").trim(),
            zipCode: String(ex?.zipCode || "").trim(),
            phoneNumber: String(ex?.phoneNumber || "").trim(),
          },
          businessLicense: {
            fileId: nextLicenseFileId,
            s3Key: nextLicenseS3Key,
            originalName: licName,
          },
          businessVerified: !!data?.businessVerified,
        });
      } catch {
        serverHydratedRef.current = true;
        setMembership("none");
      }
    };

    load();
  }, [authUserId, organizationType, token]);

  useEffect(() => {
    if (!authUserId) return;
    if (!allowLocalDraft) return;
    if (membership !== "none") {
      console.info(
        `${BUSINESS_TAB_DEBUG_PREFIX} clearing stored draft because membership is linked`,
        {
          authUserId,
          membership,
        },
      );
      writeStoredBusinessDraft(authUserId, null);
    }
  }, [allowLocalDraft, authUserId, membership]);

  const hasAnyLicense =
    Boolean(String(licenseFileId || "").trim()) ||
    Boolean(String(licenseS3Key || "").trim()) ||
    Boolean(String(licenseFileName || "").trim());
  const hasAnyData =
    Boolean(String(businessData.companyName || "").trim()) ||
    Boolean(String(businessData.businessNumber || "").trim()) ||
    Boolean(String(businessData.address || "").trim()) ||
    Boolean(String(businessData.addressDetail || "").trim()) ||
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
    if (!allowLocalDraft) return;
    if (suppressDraftWriteRef.current) return;
    const { hasAnyLicense: latestHasAnyLicense, hasAnyData: latestHasAnyData } =
      latestDraftRef.current;
    if (!latestHasAnyLicense && !latestHasAnyData) {
      writeStoredBusinessDraft(authUserId, null);
      return;
    }
    writeStoredBusinessDraft(authUserId, latestDraftRef.current.payload);
  }, [
    allowLocalDraft,
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
    (mode: "license" | "search" | "manual" | null) => {
      setSetupMode(mode);
      if (allowLocalDraft) {
        writeStoredSetupMode(authUserId, mode);
      }
    },
    [allowLocalDraft, authUserId],
  );

  useEffect(() => {
    if (!authUserId) return;
    if (!allowLocalDraft) return;
    if (membership !== "none") return;
    if (setupMode !== null) return;
    const stored = readStoredSetupMode(authUserId);
    if (!stored) return;
    updateSetupMode(stored);
  }, [allowLocalDraft, authUserId, membership, setupMode, updateSetupMode]);

  useEffect(() => {
    if (membership !== "none" && setupMode !== null) {
      updateSetupMode(null);
    }
  }, [membership, setupMode, updateSetupMode]);

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
          path: `/api/organizations/search?q=${encodeURIComponent(
            q,
          )}&organizationType=${encodeURIComponent(organizationType)}`,
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
  }, [membership, orgSearch, organizationType, token]);

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
          path: `/api/organizations/join-requests/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
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
  }, [membership, organizationType, token]);

  const refreshMembership = async () => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/organizations/me?organizationType=${encodeURIComponent(
        organizationType,
      )}`,
      method: "GET",
      token,
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
      path: `/api/organizations/join-requests/me?organizationType=${encodeURIComponent(
        organizationType,
      )}`,
      method: "GET",
      token,
    });
    if (!res.ok) return;
    const body: any = res.data || {};
    const data = body.data || body;
    setMyJoinRequests(Array.isArray(data) ? data : []);
    setJoinRequestsLoaded(true);
  };

  const handleCancelJoinRequest = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "cancel",
      organizationType,
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
    if (validationSucceeded || isVerified) {
      setVerifiedResetConfirmOpen(true);
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const moveToInquiryPageForVerifiedBusiness = () => {
    const subject = "사업자 정보 변경 요청";
    const message = `안녕하세요.\n이미 검증 및 등록 완료된 사업자 정보 변경을 요청드립니다.\n\n사업자명: ${String(businessData.companyName || "").trim()}\n사업자등록번호: ${String(businessData.businessNumber || "").trim()}\n대표자명: ${String(extracted.representativeName || "").trim()}\n\n변경이 필요한 내용을 확인 후 처리 부탁드립니다.\n`;
    navigate(
      `/dashboard/inquiries?type=general&subject=${encodeURIComponent(subject)}&message=${encodeURIComponent(message)}&focus=message`,
    );
  };

  const runDeleteLicense = async () => {
    resetVersionRef.current += 1;
    suppressDraftWriteRef.current = true;
    if (membership === "none") {
      latestDraftRef.current = {
        payload: null,
        hasAnyLicense: false,
        hasAnyData: false,
      };
      serverHydratedRef.current = false;
      setLicenseFileName("");
      setLicenseFileId("");
      setLicenseS3Key("");
      setLicenseStatus("missing");
      setIsVerified(false);
      setExtracted(createEmptyExtracted());
      setErrors({});
      setBusinessData((prev) => ({
        ...prev,
        companyName: "",
        businessNumber: "",
        address: "",
        addressDetail: "",
        zipCode: "",
        phone: "",
      }));
      setCompanyNameTouched(false);
      updateSetupMode(null);
      if (authUserId) {
        writeStoredBusinessDraft(authUserId, null);
      }
      requestAnimationFrame(() => {
        suppressDraftWriteRef.current = false;
      });
      return;
    }

    latestDraftRef.current = {
      payload: null,
      hasAnyLicense: false,
      hasAnyData: false,
    };
    serverHydratedRef.current = false;
    setLicenseFileName("");
    setLicenseFileId("");
    setLicenseS3Key("");
    setLicenseStatus("missing");
    setIsVerified(false);
    setExtracted(createEmptyExtracted());
    setErrors({});
    setBusinessData((prev) => ({
      ...prev,
      companyName: "",
      businessNumber: "",
      address: "",
      addressDetail: "",
      zipCode: "",
      phone: "",
    }));
    setCompanyNameTouched(false);

    const success = await handleDeleteLicenseImpl({
      token,
      membership,
      licenseFileName,
      licenseS3Key,
      licenseFileId,
      organizationType,
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
        addressDetail: "",
        zipCode: "",
        phone: "",
      });
      setExtracted(createEmptyExtracted());
      await refreshMembership();
      if (token) {
        await loginWithToken(token);
      }
    }
    requestAnimationFrame(() => {
      suppressDraftWriteRef.current = false;
    });
  };

  const handleLeaveOrganization = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "leave",
      organizationType,
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
      selectedBusinessId: selectedOrg?._id,
      organizationType,
      mockHeaders,
      toast,
      setJoinLoading,
      setOrgSearch,
      setOrgSearchResults,
      setSelectedOrg,
      refreshMembership,
      refreshMyJoinRequests,
    });
  };

  const hasJoinRequest =
    Array.isArray(myJoinRequests) && myJoinRequests.length > 0;
  const showJoinRequestSection = joinRequestsLoaded && hasJoinRequest;
  const showSelectionChoices =
    joinRequestsLoaded &&
    Array.isArray(myJoinRequests) &&
    myJoinRequests.length === 0;

  const resetLocalBusinessState = useCallback(() => {
    resetVersionRef.current += 1;
    suppressPrefillRef.current = true;
    suppressDraftWriteRef.current = true;
    console.info(`${BUSINESS_TAB_DEBUG_PREFIX} resetLocalBusinessState`, {
      authUserId,
      allowLocalDraft,
    });
    setLicenseFileName("");
    setLicenseFileId("");
    setLicenseS3Key("");
    setLicenseStatus("missing");
    setIsVerified(false);
    setExtracted(createEmptyExtracted());
    setErrors({});
    setBusinessData({
      companyName: "",
      businessNumber: "",
      address: "",
      addressDetail: "",
      zipCode: "",
      phone: "",
    });
    setCompanyNameTouched(false);
    latestDraftRef.current = {
      payload: null,
      hasAnyLicense: false,
      hasAnyData: false,
    };
    serverHydratedRef.current = false;
    if (authUserId && allowLocalDraft) {
      writeStoredBusinessDraft(authUserId, null);
    }
    requestAnimationFrame(() => {
      suppressDraftWriteRef.current = false;
    });
  }, [allowLocalDraft, authUserId]);

  const currentOrgName = useMemo(() => {
    const fromUser = String(
      (user as any)?.business || (user as any)?.organization || "",
    ).trim();
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
    console.info(`${BUSINESS_TAB_DEBUG_PREFIX} submitting business payload`, {
      membership,
      businessData,
      extracted,
      businessLicense: {
        fileId: licenseFileId,
        s3Key: licenseS3Key,
        originalName: licenseFileName,
      },
    });
    const savingToast = toast({
      title: "저장 중...",
      description: "사업자 정보를 확인하고 있습니다.",
      duration: 3000,
    });
    const { success, verification } = await handleSaveImpl({
      token,
      businessData,
      extracted,
      businessNumberLocked: validationSucceeded,
      membership,
      organizationType,
      businessLicense: {
        fileId: licenseFileId,
        s3Key: licenseS3Key,
        originalName: licenseFileName,
      },
      mockHeaders,
      toast,
      silent: false,
      auto: false,
      setErrors,
      setBusinessData,
      navigate,
      nextPath: "",
      onFocusFirstMissing: (key) => {
        setFocusFieldKey(key);
        setFocusFirstMissingSignal((v) => v + 1);
      },
    });
    savingToast?.dismiss?.();
    if (success) {
      toast({
        title: "저장 완료",
        description: "사업자 정보가 성공적으로 업데이트되었습니다.",
      });
      setShowInquiryCta(false);
      await refreshMembership();
      if (token) {
        await loginWithToken(token);
      }

      if (verification && typeof verification === "object") {
        setIsVerified(!!verification.verified);
      }
      setValidationSucceeded(true);
      setCardHighlight(true);
    }
    if (!success) {
      setShowInquiryCta(true);
    }
  };

  const submitBusinessInquiry = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    setInquirySubmitting(true);
    try {
      const res = await request<any>({
        path: "/api/support/business-registration-inquiries",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: {
          organizationType,
          reason: "사업자 설정 문의",
          errorMessage: "",
          ownerForm: {
            companyName: String(businessData.companyName || "").trim(),
            representativeName: String(
              extracted.representativeName || "",
            ).trim(),
            businessNumber: String(businessData.businessNumber || "").replace(
              /\D/g,
              "",
            ),
            phone: String(businessData.phone || "").replace(/\D/g, ""),
            email: String(extracted.email || "").trim(),
            businessType: String(extracted.businessType || "").trim(),
            businessItem: String(extracted.businessItem || "").trim(),
            address: String(businessData.address || "").trim(),
            addressDetail: String(businessData.addressDetail || "").trim(),
            startDate: String(extracted.startDate || "").replace(/\D/g, ""),
          },
          license: {
            fileId: String(licenseFileId || "").trim() || null,
            s3Key: String(licenseS3Key || "").trim() || null,
            originalName: String(licenseFileName || "").trim() || null,
          },
        },
      });
      if (!res.ok) {
        const body: any = res.data || {};
        toast({
          title: "문의 접수 실패",
          description: String(body?.message || "잠시 후 다시 시도해주세요."),
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      toast({
        title: "문의가 접수되었습니다",
        description: "담당자가 확인 후 연락드릴게요.",
      });
    } catch {
      toast({
        title: "문의 접수 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setInquirySubmitting(false);
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

      setLicenseStatus("processing");
      const processingStartedAt = Date.now();
      const processingToast = toast({
        title: "AI 인식 중",
        description:
          "사업자등록증을 인식하고 있어요. 약 10초 정도 걸릴 수 있어요.",
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
        const nextExtracted: LicenseExtracted = normalizeExtracted(
          data?.extracted || {},
        );
        const verification = data?.verification;
        const hasAnyExtracted = Object.values(nextExtracted || {}).some((v) =>
          String(v || "").trim(),
        );
        const nextCompanyName = String(nextExtracted?.companyName || "").trim();
        setExtracted({
          ...nextExtracted,
          address: "",
          addressDetail: "",
          zipCode: "",
        });
        setBusinessData((prev) => ({
          ...prev,
          companyName: companyNameTouched
            ? prev.companyName
            : nextCompanyName || "",
          businessNumber: formatBusinessNumberInput(
            String(nextExtracted?.businessNumber || "").trim(),
          ),
          address: "",
          addressDetail: "",
          zipCode: "",
          phone: formatPhoneNumberInput(
            String(nextExtracted?.phoneNumber || "").trim(),
          ),
        }));
        setIsVerified(!!data?.verification?.verified);
        setLicenseStatus("ready");
        processingToast.dismiss();
        console.info(
          `${BUSINESS_TAB_DEBUG_PREFIX} OCR parsed business license`,
          {
            extracted: {
              companyName: nextCompanyName,
              businessNumber: String(
                nextExtracted?.businessNumber || "",
              ).trim(),
              address: String(nextExtracted?.address || "").trim(),
              zipCode: String(nextExtracted?.zipCode || "").trim(),
              phoneNumber: String(nextExtracted?.phoneNumber || "").trim(),
            },
            verification,
          },
        );
        setAutoOpenAddressSearchSignal((prev) => prev + 1);
        toast({
          title: "주소 확인이 필요합니다",
          description:
            "주소와 우편번호를 비워두었어요. 주소 검색 창에서 도로명 주소를 선택해주세요.",
          duration: 3500,
        });

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
      <Card
        className={cn(
          "app-glass-card app-glass-card--lg transition-all duration-300",
          cardHighlight && "ring-2 ring-sky-400/70 border-sky-300 bg-sky-50/30",
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                사업자 정보
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
              <div className="app-surface app-surface--panel text-sm">
                아래 두 가지 방법 중 하나를 선택해 사업자 소속을 설정해주세요.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  className="app-surface app-surface--panel w-full text-left p-4 transition-colors hover:bg-white"
                  onClick={() => {
                    setSetupModeLocked(true);
                    resetLocalBusinessState();
                    updateSetupMode("license");
                    requestAnimationFrame(() => {
                      licenseUploadRef.current?.focusUpload();
                    });
                  }}
                >
                  <div className="text-sm font-medium">신규 사업자 등록</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    사업자등록증을 업로드해서 사업자를 새로 등록합니다.
                  </div>
                </button>
                <button
                  type="button"
                  className="app-surface app-surface--panel w-full text-left p-4 transition-colors hover:bg-white"
                  onClick={() => {
                    setSetupModeLocked(true);
                    updateSetupMode("search");
                  }}
                >
                  <div className="text-sm font-medium">
                    기존 사업자 소속 신청
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    이미 등록된 사업자를 검색해 소속을 신청합니다.
                  </div>
                </button>
                <button
                  type="button"
                  className="app-surface app-surface--panel w-full text-left p-4 transition-colors hover:bg-white"
                  onClick={() => {
                    setSetupModeLocked(true);
                    resetLocalBusinessState();
                    updateSetupMode("manual");
                  }}
                >
                  <div className="text-sm font-medium">
                    직접 입력으로 신규 등록
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    사업자등록증 없이 직접 정보를 입력해 새로 등록합니다.
                  </div>
                </button>
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
                      ? "신규 사업자 등록"
                      : setupMode === "manual"
                        ? "직접 입력으로 신규 등록"
                        : "기존 사업자 소속 신청"}
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

              {(membership === "owner" ||
                setupMode === "license" ||
                setupMode === "manual") && (
                <div className="space-y-6">
                  {setupMode !== "manual" && (
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
                  )}

                  {(membership === "owner" ||
                    licenseStatus !== "missing" ||
                    setupMode === "manual") && (
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
                      successNote={
                        validationSucceeded
                          ? "사업자등록이 완료되었습니다"
                          : undefined
                      }
                      businessNumberLocked={validationSucceeded}
                      autoOpenAddressSearchSignal={autoOpenAddressSearchSignal}
                      focusFirstMissingSignal={focusFirstMissingSignal}
                      focusFieldKey={focusFieldKey}
                      onAutoSave={() => {
                        if (!authUserId) return;
                        if (!allowLocalDraft) return;
                        writeStoredBusinessDraft(authUserId, {
                          businessData,
                          extracted,
                          licenseFileName,
                          licenseFileId,
                          licenseS3Key,
                          licenseStatus,
                          isVerified,
                          updatedAt: Date.now(),
                        });
                      }}
                      renderActions={({ disabled }) =>
                        showInquiryCta ? (
                          <Button
                            type="button"
                            variant="destructive"
                            className="w-full font-semibold"
                            disabled={disabled || inquirySubmitting}
                            onClick={() => void submitBusinessInquiry()}
                          >
                            {inquirySubmitting
                              ? "문의 접수 중..."
                              : "관리자에게 문의"}
                          </Button>
                        ) : null
                      }
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

      <AlertDialog
        open={deleteConfirmOpen || verifiedResetConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmOpen(false);
            setVerifiedResetConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {verifiedResetConfirmOpen
                ? "이미 검증 완료된 사업자입니다"
                : "정말 초기화할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {verifiedResetConfirmOpen
                ? "이미 검증 후 제출되어 등록 완료된 사업자 정보는 직접 초기화할 수 없습니다. 문의 페이지로 이동해 관리자에게 변경을 요청하시겠습니까?"
                : "삭제하면 등록된 임직원 정보도 초기화됩니다. 그래도 진행할까요?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (verifiedResetConfirmOpen) {
                  setVerifiedResetConfirmOpen(false);
                  moveToInquiryPageForVerifiedBusiness();
                  return;
                }
                setDeleteConfirmOpen(false);
                await runDeleteLicense();
              }}
            >
              {verifiedResetConfirmOpen ? "문의로 이동" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFileDropZone>
  );
};
