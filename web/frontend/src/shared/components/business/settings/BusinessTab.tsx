// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
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
import { BusinessForm } from "@/shared/components/business/settings/business/BusinessForm";
import { BusinessSearchSection } from "@/shared/components/business/settings/business/BusinessSearchSection";
import { JoinRequestsSection } from "@/shared/components/business/settings/business/JoinRequestsSection";
import { BusinessMemberView } from "@/shared/components/business/settings/business/BusinessMemberView";
import { MembershipStatus } from "@/shared/components/business/types";
import type { FieldKey } from "@/shared/components/business/settings/business/types";
import {
  handleSave as handleSaveImpl,
  handleDeleteLicense as handleDeleteLicenseImpl,
  handleJoinOrLeave,
  handleJoinRequest as handleJoinRequestImpl,
} from "@/shared/components/business/settings/business/handlers";
import {
  readStoredSetupMode,
  writeStoredSetupMode,
  readStoredBusinessDraft,
  writeStoredBusinessDraft,
  createEmptyMetadata,
  normalizeBusinessData,
  normalizeMetadata,
} from "@/shared/components/business/settings/business/businessStorage";
import { useBusinessDataManagement } from "@/shared/components/business/settings/business/useBusinessDataManagement";
import { useBusinessSearch } from "@/shared/components/business/settings/business/useBusinessSearch";
import { useMembershipManagement } from "@/shared/components/business/settings/business/useMembershipManagement";
import { useFileUpload } from "@/shared/components/business/settings/business/useFileUpload";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import { RequestorCapabilitiesPicker } from "@/shared/components/business/RequestorCapabilitiesPicker";
import {
  REQUESTOR_CAPABILITY_LABEL,
  hasAnyRequestorCapability,
  normalizeRequestorCapabilities,
  notifyRequestorAccessUpdated,
  requiresBusinessLicense,
  resolveRequestorCapabilities,
  type RequestorCapabilities,
} from "@/shared/business/requestorCapabilities";

interface BusinessTabProps {
  userData?: {
    companyName?: string;
    role?: string;
  } | null;
  businessTypeOverride?: string;
  selectedRole?: "owner" | "member" | null;
  registerValidationState?: (state: {
    passed: boolean;
    validating: boolean;
  }) => void;
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
  isOnboarding?: boolean;
  /** practice-only로 사업자등록증을 건너뛸 때 필수 치과정보 단계로 진입 */
  onRequirePracticeProfile?: () => void;
}

export const BusinessTab = ({
  userData,
  businessTypeOverride,
  selectedRole,
  registerValidationState,
  registerGoNextAction,
  isOnboarding = false,
  onRequirePracticeProfile,
}: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user, setUser, loginWithToken } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();
  const allowLocalDraft =
    !isOnboarding && !String(searchParams.get("wizard") || "").trim();

  const authUserId = user?.id ? String(user.id) : null;
  const businessType = useMemo(() => {
    if (businessTypeOverride) return businessTypeOverride;
    return resolveBusinessType(user?.role || userData?.role, "requestor");
  }, [businessTypeOverride, user?.role, userData?.role]);

  // 커스텀 훅으로 상태 관리 분리
  const businessDataMgmt = useBusinessDataManagement({
    token,
    authUserId,
    businessType,
    membership: "none",
    allowLocalDraft,
  });

  const membershipMgmt = useMembershipManagement({
    token,
    businessType,
  });

  // businessSearch는 membershipMgmt.membership을 사용해야 함
  // membership이 "none"일 때만 검색 활성화
  const businessSearch = useBusinessSearch({
    token,
    businessType,
    membership: membershipMgmt.membership,
  });

  const [setupMode, setSetupMode] = useState<
    "license" | "search" | "manual" | null
  >(null);
  const [setupModeLocked, setSetupModeLocked] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [verifiedResetConfirmOpen, setVerifiedResetConfirmOpen] =
    useState(false);
  const [showInquiryCta, setShowInquiryCta] = useState(false);
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [autoOpenAddressSearchSignal, setAutoOpenAddressSearchSignal] =
    useState(0);
  const [focusFirstMissingSignal, setFocusFirstMissingSignal] = useState(0);
  const [focusFieldKey, setFocusFieldKey] = useState<FieldKey | null>(null);
  const [requestorCapabilities, setRequestorCapabilities] =
    useState<RequestorCapabilities>({ practice: false, lab: false });
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);
  const [capabilitiesSaving, setCapabilitiesSaving] = useState(false);

  const licenseUploadRef = useRef<BusinessLicenseUploadHandle | null>(null);
  const isRequestorBusiness = businessType === "requestor";
  const caps = normalizeRequestorCapabilities(requestorCapabilities);
  const licenseOptional = isRequestorBusiness && caps.practice && !caps.lab;

  const markOnboardingWizardCompleted = useCallback(async () => {
    if (!token || !user) return false;

    try {
      const res = await request<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: { onboardingWizardCompleted: true },
      });

      if (!res.ok) return false;

      await loginWithToken(token);
      return true;
    } catch (error) {
      console.error("[BusinessTab] failed to mark onboarding complete", error);
      return false;
    }
  }, [loginWithToken, token, user]);

  // 파일 업로드 훅
  const { handleFileUpload, licenseDeleteLoading, setLicenseDeleteLoading } =
    useFileUpload(
      {
        token,
        membership: membershipMgmt.membership,
        setupMode,
        metadata: businessDataMgmt.metadata,
        businessData: businessDataMgmt.businessData,
        companyNameTouched: businessDataMgmt.companyNameTouched,
      },
      {
        onMetadataChange: businessDataMgmt.setMetadata,
        onBusinessDataChange: businessDataMgmt.setBusinessData,
        onLicenseFileNameChange: businessDataMgmt.setLicenseFileName,
        onLicenseFileIdChange: businessDataMgmt.setLicenseFileId,
        onLicenseS3KeyChange: businessDataMgmt.setLicenseS3Key,
        onLicenseStatusChange: businessDataMgmt.setLicenseStatus,
        onIsVerifiedChange: businessDataMgmt.setIsVerified,
        onAutoOpenAddressSearch: () =>
          setAutoOpenAddressSearchSignal((prev) => prev + 1),
      },
    );

  // 사유 토스트
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

  // setupMode 초기화
  useEffect(() => {
    if (membershipMgmt.membership !== "none") return;
    if (setupMode !== null) return;

    if (selectedRole === "owner") {
      // 치과 온보딩 owner는 BusinessStep에서 치과 정보 폼으로 분기되므로
      // 여기까지 오면 일반 role만 해당. practice는 등록증 경로를 쓰지 않음.
      if (businessType === "practice") {
        setSetupMode("search");
        setSetupModeLocked(true);
        return;
      }
      setSetupMode("license");
      setSetupModeLocked(true);
      return;
    }
    if (selectedRole === "member") {
      setSetupMode("search");
      setSetupModeLocked(true);
      return;
    }

    if (!authUserId || !allowLocalDraft) return;
    const stored = readStoredSetupMode(authUserId);
    if (stored) setSetupMode(stored);
  }, [
    allowLocalDraft,
    authUserId,
    businessType,
    membershipMgmt.membership,
    setupMode,
    selectedRole,
  ]);

  useEffect(() => {
    if (membershipMgmt.membership !== "none" && setupMode !== null) {
      setSetupMode(null);
    }
  }, [membershipMgmt.membership, setupMode]);

  // 의뢰자 유형(발신/수신) 로드
  useEffect(() => {
    if (!isRequestorBusiness || !token) {
      setCapabilitiesLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadBusinessMeCached({
          token,
          businessType,
          force: true,
        });
        if (cancelled) return;
        setRequestorCapabilities(
          resolveRequestorCapabilities({
            anchorCaps: data?.requestorCapabilities,
            userRole: user?.role,
            businessVerified: Boolean(data?.businessVerified),
          }),
        );
      } catch {
        if (!cancelled) {
          setRequestorCapabilities(
            resolveRequestorCapabilities({
              userRole: user?.role,
              businessVerified: false,
            }),
          );
        }
      } finally {
        if (!cancelled) setCapabilitiesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessType, isRequestorBusiness, token, user?.role]);

  const persistRequestorCapabilities = useCallback(
    async (next: RequestorCapabilities) => {
      if (!token || !isRequestorBusiness) return false;
      const normalized = normalizeRequestorCapabilities(next);
      if (!hasAnyRequestorCapability(normalized)) {
        toast({
          title: "유형을 선택해주세요",
          description: `${REQUESTOR_CAPABILITY_LABEL.practice} 또는 ${REQUESTOR_CAPABILITY_LABEL.lab} 중 하나 이상 선택해주세요.`,
          variant: "destructive",
        });
        return false;
      }
      if (
        requiresBusinessLicense(normalized) &&
        !(businessDataMgmt.validationSucceeded || businessDataMgmt.isVerified)
      ) {
        toast({
          title: "사업자등록증이 필요합니다",
          description: `${REQUESTOR_CAPABILITY_LABEL.lab}을 선택하려면 사업자등록증을 등록·검증해야 합니다.`,
          variant: "destructive",
        });
        return false;
      }

      setCapabilitiesSaving(true);
      try {
        const res = await request<any>({
          path: `/api/businesses/me?businessType=${encodeURIComponent("requestor")}`,
          method: "PUT",
          token,
          jsonBody: {
            requestorCapabilities: normalized,
          },
        });
        if (!res.ok) {
          const body: any = res.data || {};
          toast({
            title: "저장 실패",
            description:
              body?.message || "사업자 유형을 저장하지 못했습니다.",
            variant: "destructive",
          });
          return false;
        }
        setRequestorCapabilities(normalized);
        invalidateBusinessMeCache({ token, businessType });
        if (user) {
          setUser({ ...user, requestorCapabilities: normalized });
        }
        notifyRequestorAccessUpdated();
        return true;
      } catch {
        toast({
          title: "저장 실패",
          description: "사업자 유형을 저장하지 못했습니다.",
          variant: "destructive",
        });
        return false;
      } finally {
        setCapabilitiesSaving(false);
      }
    },
    [
      businessDataMgmt.isVerified,
      businessDataMgmt.validationSucceeded,
      businessType,
      isRequestorBusiness,
      setUser,
      toast,
      token,
      user,
    ],
  );

  const handleCapabilitiesChange = useCallback(
    (next: RequestorCapabilities) => {
      const normalized = normalizeRequestorCapabilities(next);
      const prev = caps;
      setRequestorCapabilities(normalized);
      // 설정 화면에서는 즉시 저장 시도 (기공소+미검증은 거부되어 토스트)
      if (!isOnboarding && membershipMgmt.membership === "owner") {
        void persistRequestorCapabilities(normalized).then((ok) => {
          if (!ok) setRequestorCapabilities(prev);
        });
      }
    },
    [
      caps,
      isOnboarding,
      membershipMgmt.membership,
      persistRequestorCapabilities,
    ],
  );

  // 온보딩 검증 상태 업데이트
  useEffect(() => {
    if (!registerValidationState) return;
    if (selectedRole === "owner") {
      const verified =
        businessDataMgmt.validationSucceeded || businessDataMgmt.isVerified;
      if (isOnboarding && isRequestorBusiness) {
        const hasCap = hasAnyRequestorCapability(caps);
        const labOk = !requiresBusinessLicense(caps) || verified;
        registerValidationState({
          passed: hasCap && labOk,
          validating: !capabilitiesLoaded || capabilitiesSaving,
        });
        return;
      }
      registerValidationState({
        passed: isOnboarding ? true : verified,
        validating: false,
      });
    } else if (selectedRole === "member" && isOnboarding) {
      registerValidationState({
        passed: membershipMgmt.membership === "member",
        validating: false,
      });
    }
  }, [
    businessDataMgmt.validationSucceeded,
    businessDataMgmt.isVerified,
    capabilitiesLoaded,
    capabilitiesSaving,
    requestorCapabilities.practice,
    requestorCapabilities.lab,
    isOnboarding,
    isRequestorBusiness,
    membershipMgmt.membership,
    registerValidationState,
    selectedRole,
  ]);

  useEffect(() => {
    if (!registerGoNextAction) return;
    if (!isOnboarding || selectedRole !== "owner" || !isRequestorBusiness) {
      registerGoNextAction(null);
      return;
    }
    registerGoNextAction(async () => {
      const ok = await persistRequestorCapabilities(caps);
      if (!ok) return false;

      const verified =
        businessDataMgmt.validationSucceeded || businessDataMgmt.isVerified;
      // 치과만 선택하고 사업자등록증을 건너뛰면 필수 치과정보 페이지로 이동
      if (licenseOptional && !verified && onRequirePracticeProfile) {
        const pp = user?.practiceProfile;
        const profileReady = Boolean(
          String(pp?.clinicName || "").trim() &&
            String(pp?.directorName || "").trim() &&
            String(pp?.staffName || "").trim() &&
            String(pp?.phone || "").trim() &&
            String(pp?.clinicPhone || "").trim() &&
            String(pp?.address || "").trim() &&
            String(pp?.zipCode || "").trim(),
        );
        if (profileReady) return true;
        onRequirePracticeProfile();
        return false;
      }
      return true;
    });
    return () => registerGoNextAction(null);
  }, [
    businessDataMgmt.isVerified,
    businessDataMgmt.validationSucceeded,
    caps,
    isOnboarding,
    isRequestorBusiness,
    licenseOptional,
    onRequirePracticeProfile,
    persistRequestorCapabilities,
    registerGoNextAction,
    selectedRole,
    user?.practiceProfile,
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

  // 설정 화면: 사업자 미등록 + 기공소 선택 시에만 등록증 업로드 경로를 연다.
  // (신규/기존 가입 선택 버튼은 온보딩 RoleStep에서 이미 처리)
  useEffect(() => {
    if (isOnboarding) return;
    if (membershipMgmt.membership !== "none") return;

    if (requiresBusinessLicense(caps)) {
      if (setupMode !== "license" && setupMode !== "manual") {
        updateSetupMode("license");
        setSetupModeLocked(true);
      }
      return;
    }

    if (setupMode === "license" || setupMode === "manual" || setupMode === "search") {
      updateSetupMode(null);
      setSetupModeLocked(false);
    }
  }, [
    caps,
    isOnboarding,
    membershipMgmt.membership,
    setupMode,
    updateSetupMode,
  ]);

  const handleSave = async () => {
    const savingToast = toast({
      title: "저장 중...",
      description:
        "사업자 정보를 검증하는 중입니다. 최대 10초 정도 소요될 수 있습니다.",
      duration: 60000,
    });

    const { success, verification, welcomeBonusGranted, welcomeBonusAmount } =
      await handleSaveImpl({
        token,
        businessData: businessDataMgmt.businessData,
        metadata: businessDataMgmt.metadata,
        businessNumberLocked: businessDataMgmt.validationSucceeded,
        membership: membershipMgmt.membership,
        businessType,
        businessLicense: {
          fileId: businessDataMgmt.licenseFileId,
          s3Key: businessDataMgmt.licenseS3Key,
          originalName: businessDataMgmt.licenseFileName,
        },
        requestorCapabilities: isRequestorBusiness ? caps : undefined,
        mockHeaders: {},
        toast,
        silent: false,
        auto: false,
        setErrors: businessDataMgmt.setErrors,
        setBusinessData: businessDataMgmt.setBusinessData,
        navigate,
        nextPath: "",
        onFocusFirstMissing: (key) => {
          setFocusFieldKey(key);
          setFocusFirstMissingSignal((v) => v + 1);
        },
      });

    savingToast?.dismiss?.();

    if (success) {
      if (!(welcomeBonusGranted && (welcomeBonusAmount ?? 0) > 0)) {
        toast({
          title: "저장 완료",
          description: "사업자 정보가 성공적으로 업데이트되었습니다.",
        });
      }
      setShowInquiryCta(false);

      // 캐시 무효화 및 서버 데이터 강제 재로드
      invalidateBusinessMeCache({ token, businessType });
      await membershipMgmt.refreshMembership();

      // 서버에서 최신 데이터 강제 로드 (businessLicense 포함)
      if (token) {
        await loginWithToken(token);
        const freshData = await loadBusinessMeCached({
          token,
          businessType,
          force: true,
        });
        console.info("[BusinessTab] force-reloaded business data after save", {
          hasBusinessLicense: !!freshData?.businessLicense,
          businessLicense: freshData?.businessLicense,
        });
      }

      if (verification && typeof verification === "object") {
        businessDataMgmt.setIsVerified(!!verification.verified);
      }
      businessDataMgmt.setValidationSucceeded(true);
      setCardHighlight(true);

      if (isOnboarding) {
        const completed = await markOnboardingWizardCompleted();
        if (!completed) {
          console.warn(
            "[BusinessTab] onboarding completion flag was not persisted",
          );
        }
      }
    } else {
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
        jsonBody: {
          businessType,
          reason: "사업자 설정 문의",
          errorMessage: "",
          ownerForm: {
            companyName: String(
              businessDataMgmt.businessData.companyName || "",
            ).trim(),
            representativeName: String(
              businessDataMgmt.metadata.representativeName || "",
            ).trim(),
            businessNumber: String(
              businessDataMgmt.businessData.businessNumber || "",
            ).replace(/\D/g, ""),
            phone: String(businessDataMgmt.businessData.phone || "").replace(
              /\D/g,
              "",
            ),
            email: String(businessDataMgmt.metadata.email || "").trim(),
            businessType: String(
              businessDataMgmt.metadata.businessType || "",
            ).trim(),
            businessItem: String(
              businessDataMgmt.metadata.businessItem || "",
            ).trim(),
            address: String(businessDataMgmt.businessData.address || "").trim(),
            addressDetail: String(
              businessDataMgmt.businessData.addressDetail || "",
            ).trim(),
            startDate: String(
              businessDataMgmt.metadata.startDate || "",
            ).replace(/\D/g, ""),
          },
          license: {
            fileId: String(businessDataMgmt.licenseFileId || "").trim() || null,
            s3Key: String(businessDataMgmt.licenseS3Key || "").trim() || null,
            originalName:
              String(businessDataMgmt.licenseFileName || "").trim() || null,
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

  const handleDeleteLicense = async () => {
    if (isOnboarding || membershipMgmt.membership === "none") {
      try {
        if (token && user?.id) {
          const response = await request<{ owner?: string }>({
            path: "/api/businesses/me",
            method: "GET",
            token,
          });

          if (response?.data?.owner && response.data.owner !== user.id) {
            toast({
              title: "초기화 불가",
              description:
                "이 사업자등록증은 다른 계정으로 등록되었습니다. 초기화할 수 없습니다.",
              variant: "destructive",
            });
            return;
          }
        }
      } catch (err) {
        console.error("[BusinessTab] Failed to verify business owner", err);
      }

      await runDeleteLicense();
      return;
    }

    if (businessDataMgmt.validationSucceeded || businessDataMgmt.isVerified) {
      setVerifiedResetConfirmOpen(true);
      return;
    }

    setDeleteConfirmOpen(true);
  };

  const runDeleteLicense = async () => {
    businessDataMgmt.resetVersionRef.current += 1;
    businessDataMgmt.suppressDraftWriteRef.current = true;

    if (membershipMgmt.membership === "none") {
      try {
        if (token) {
          await request<any>({
            path: "/api/businesses/me",
            method: "DELETE",
            token,
          });
        }
      } catch (err) {
        console.error(
          "[BusinessTab] Failed to delete business entity during onboarding",
          err,
        );
      }

      businessDataMgmt.resetLocalBusinessState();
      return;
    }

    const success = await handleDeleteLicenseImpl({
      token,
      membership: membershipMgmt.membership,
      licenseFileName: businessDataMgmt.licenseFileName,
      licenseS3Key: businessDataMgmt.licenseS3Key,
      licenseFileId: businessDataMgmt.licenseFileId,
      businessType,
      mockHeaders: {},
      toast,
      setLicenseDeleteLoading,
    });

    if (success) {
      businessDataMgmt.resetLocalBusinessState();
      await membershipMgmt.refreshMembership();
      if (token) {
        await loginWithToken(token);
      }
    }

    requestAnimationFrame(() => {
      businessDataMgmt.suppressDraftWriteRef.current = false;
    });
  };

  const moveToInquiryPageForVerifiedBusiness = () => {
    const subject = "사업자 정보 변경 요청";
    const message = `안녕하세요.\n이미 검증 및 등록 완료된 사업자 정보 변경을 요청드립니다.\n\n사업자명: ${String(businessDataMgmt.businessData.companyName || "").trim()}\n사업자등록번호: ${String(businessDataMgmt.businessData.businessNumber || "").trim()}\n대표자명: ${String(businessDataMgmt.metadata.representativeName || "").trim()}\n\n변경이 필요한 내용을 확인 후 처리 부탁드립니다.\n`;
    navigate(
      `/dashboard/inquiries?type=general&subject=${encodeURIComponent(subject)}&message=${encodeURIComponent(message)}&focus=message`,
    );
  };

  const handleCancelJoinRequest = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "cancel",
      businessType,
      mockHeaders: {},
      toast,
      setCancelLoadingBusinessId: membershipMgmt.setCancelLoadingBusinessId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleLeaveBusiness = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "leave",
      businessType,
      mockHeaders: {},
      toast,
      setCancelLoadingBusinessId: membershipMgmt.setCancelLoadingBusinessId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleJoinRequest = async () => {
    await handleJoinRequestImpl({
      token,
      selectedBusinessId: businessSearch.selectedBusiness?._id,
      businessType,
      mockHeaders: {},
      toast,
      setJoinLoading: membershipMgmt.setJoinLoading,
      setBusinessSearch: businessSearch.setBusinessSearch,
      setBusinessSearchResults: businessSearch.setBusinessSearchResults,
      setSelectedBusiness: businessSearch.setSelectedBusiness,
      refreshMembership: membershipMgmt.refreshMembership,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
    });
  };

  const currentBusinessName = useMemo(() => {
    const fromUser = String((user as any)?.business || "").trim();
    const fromState = String(
      businessDataMgmt.businessData.companyName || "",
    ).trim();
    const fromProps = String(userData?.companyName || "").trim();
    return fromUser || fromState || fromProps;
  }, [businessDataMgmt.businessData.companyName, user, userData?.companyName]);

  const hasJoinRequest =
    Array.isArray(membershipMgmt.myJoinRequests) &&
    membershipMgmt.myJoinRequests.length > 0;
  const showJoinRequestSection =
    membershipMgmt.joinRequestsLoaded && hasJoinRequest;
  const showSelectionChoices =
    membershipMgmt.joinRequestsLoaded &&
    Array.isArray(membershipMgmt.myJoinRequests) &&
    membershipMgmt.myJoinRequests.length === 0;

  const handleLicenseFilesDrop = (selectedFiles: File[]) => {
    const file = selectedFiles?.[0];
    if (!file) return;
    void handleFileUpload(file);
  };

  return (
    <PageFileDropZone
      onFiles={handleLicenseFilesDrop}
      activeClassName="ring-2 ring-primary/30"
    >
      <div className="space-y-6">
        {isRequestorBusiness &&
          (selectedRole === "owner" ||
            membershipMgmt.membership === "owner" ||
            membershipMgmt.membership === "none") && (
            <RequestorCapabilitiesPicker
              value={caps}
              onChange={handleCapabilitiesChange}
              disabled={
                capabilitiesSaving ||
                (membershipMgmt.membership !== "owner" &&
                  membershipMgmt.membership !== "none" &&
                  selectedRole !== "owner")
              }
              labRequiresLicenseHint={
                !(
                  businessDataMgmt.validationSucceeded ||
                  businessDataMgmt.isVerified
                )
              }
            />
          )}

        {/* 온보딩에서만 표시. 설정 화면은 RoleStep에서 이미 등록/가입을 선택했으므로 숨김. */}
        {isOnboarding &&
          membershipMgmt.membership === "none" &&
          !setupMode &&
          showSelectionChoices &&
          !setupModeLocked && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  className="app-surface app-surface--panel w-full text-left p-4 transition-colors hover:bg-white"
                  onClick={() => {
                    setSetupModeLocked(true);
                    businessDataMgmt.resetLocalBusinessState();
                    updateSetupMode("license");
                    requestAnimationFrame(() => {
                      licenseUploadRef.current?.focusUpload();
                    });
                  }}
                >
                  <div className="text-sm font-medium">신규 사업자 등록</div>
                </button>
                <button
                  type="button"
                  className="app-surface app-surface--panel w-full text-left p-4 transition-colors hover:bg-white"
                  onClick={() => {
                    setSetupModeLocked(true);
                    updateSetupMode("search");
                  }}
                >
                  <div className="text-sm font-medium">기존 사업자 가입</div>
                </button>
              </div>

              <JoinRequestsSection
                myJoinRequests={membershipMgmt.myJoinRequests}
                cancelLoadingBusinessId={membershipMgmt.cancelLoadingBusinessId}
                onCancelJoinRequest={handleCancelJoinRequest}
                onLeaveBusiness={handleLeaveBusiness}
              />
            </div>
          )}

        {membershipMgmt.membership === "none" && showJoinRequestSection && (
          <JoinRequestsSection
            myJoinRequests={membershipMgmt.myJoinRequests || []}
            cancelLoadingBusinessId={membershipMgmt.cancelLoadingBusinessId}
            onCancelJoinRequest={handleCancelJoinRequest}
            onLeaveBusiness={handleLeaveBusiness}
          />
        )}

        {(membershipMgmt.membership !== "none" ||
          !!setupMode ||
          showJoinRequestSection) && (
          <div className="space-y-6">
            {(membershipMgmt.membership === "owner" ||
              setupMode === "license" ||
              setupMode === "manual") && (
              <div className="space-y-6">
                {setupMode !== "manual" && (
                  <BusinessLicenseUpload
                    ref={licenseUploadRef}
                    membership={membershipMgmt.membership}
                    licenseStatus={businessDataMgmt.licenseStatus}
                    isVerified={businessDataMgmt.isVerified}
                    validationSucceeded={businessDataMgmt.validationSucceeded}
                    licenseFileName={businessDataMgmt.licenseFileName}
                    licenseDeleteLoading={licenseDeleteLoading}
                    onFileUpload={handleFileUpload}
                    onDeleteLicense={handleDeleteLicense}
                    isOptional={licenseOptional && isOnboarding}
                  />
                )}

                {(membershipMgmt.membership === "owner" ||
                  businessDataMgmt.licenseStatus === "ready" ||
                  setupMode === "manual") && (
                  <BusinessForm
                    businessData={businessDataMgmt.businessData}
                    metadata={businessDataMgmt.metadata}
                    errors={businessDataMgmt.errors}
                    licenseStatus={businessDataMgmt.licenseStatus}
                    membership={membershipMgmt.membership}
                    licenseDeleteLoading={licenseDeleteLoading}
                    setBusinessData={businessDataMgmt.setBusinessData}
                    setMetadata={businessDataMgmt.setMetadata}
                    setErrors={businessDataMgmt.setErrors}
                    setCompanyNameTouched={
                      businessDataMgmt.setCompanyNameTouched
                    }
                    onSave={handleSave}
                    successNote={
                      businessDataMgmt.validationSucceeded
                        ? "사업자등록이 완료되었습니다"
                        : undefined
                    }
                    businessNumberLocked={
                      businessDataMgmt.validationSucceeded &&
                      Boolean(businessDataMgmt.businessData.businessNumber)
                    }
                    validationSucceeded={businessDataMgmt.validationSucceeded}
                    isVerified={businessDataMgmt.isVerified}
                    autoOpenAddressSearchSignal={autoOpenAddressSearchSignal}
                    focusFirstMissingSignal={focusFirstMissingSignal}
                    focusFieldKey={focusFieldKey}
                    onAutoSave={() => {
                      if (!authUserId || !allowLocalDraft) return;
                      writeStoredBusinessDraft(authUserId, {
                        businessData: businessDataMgmt.businessData,
                        metadata: businessDataMgmt.metadata,
                        licenseFileName: businessDataMgmt.licenseFileName,
                        licenseFileId: businessDataMgmt.licenseFileId,
                        licenseS3Key: businessDataMgmt.licenseS3Key,
                        licenseStatus: businessDataMgmt.licenseStatus,
                        isVerified: businessDataMgmt.isVerified,
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

            {(membershipMgmt.membership === "member" ||
              membershipMgmt.membership === "pending") && (
              <BusinessMemberView
                currentBusinessName={currentBusinessName}
                licenseStatus={businessDataMgmt.licenseStatus}
                isVerified={businessDataMgmt.isVerified}
                metadata={businessDataMgmt.metadata}
                businessData={businessDataMgmt.businessData}
                isPending={membershipMgmt.membership === "pending"}
              />
            )}

            {(membershipMgmt.membership === "none"
              ? setupMode === "search" && showSelectionChoices
              : membershipMgmt.membership !== "owner") && (
              <>
                {membershipMgmt.membership === "none" && (
                  <BusinessSearchSection
                    businessSearch={businessSearch.businessSearch}
                    setBusinessSearch={businessSearch.setBusinessSearch}
                    businessSearchResults={businessSearch.businessSearchResults}
                    selectedBusiness={businessSearch.selectedBusiness}
                    setSelectedBusiness={businessSearch.setSelectedBusiness}
                    businessOpen={businessSearch.businessOpen}
                    setBusinessOpen={businessSearch.setBusinessOpen}
                    joinLoading={membershipMgmt.joinLoading}
                    onJoinRequest={handleJoinRequest}
                  />
                )}

                {Array.isArray(membershipMgmt.myJoinRequests) &&
                  membershipMgmt.myJoinRequests.length > 0 && (
                    <JoinRequestsSection
                      myJoinRequests={membershipMgmt.myJoinRequests}
                      cancelLoadingBusinessId={
                        membershipMgmt.cancelLoadingBusinessId
                      }
                      onCancelJoinRequest={handleCancelJoinRequest}
                      onLeaveBusiness={handleLeaveBusiness}
                    />
                  )}
              </>
            )}
          </div>
        )}
      </div>

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
