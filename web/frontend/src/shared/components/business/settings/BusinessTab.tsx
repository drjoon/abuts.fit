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
  createEmptyExtracted,
  normalizeBusinessData,
  normalizeExtracted,
} from "@/shared/components/business/settings/business/businessStorage";
import { useBusinessDataManagement } from "@/shared/components/business/settings/business/useBusinessDataManagement";
import { useBusinessSearch } from "@/shared/components/business/settings/business/useBusinessSearch";
import { useMembershipManagement } from "@/shared/components/business/settings/business/useMembershipManagement";
import { useFileUpload } from "@/shared/components/business/settings/business/useFileUpload";

interface BusinessTabProps {
  userData?: {
    companyName?: string;
    role?: string;
  } | null;
  organizationTypeOverride?: string;
  selectedRole?: "owner" | "member" | null;
  registerValidationState?: (state: {
    passed: boolean;
    validating: boolean;
  }) => void;
  isOnboarding?: boolean;
}

export const BusinessTab = ({
  userData,
  organizationTypeOverride,
  selectedRole,
  registerValidationState,
  isOnboarding = false,
}: BusinessTabProps) => {
  const { toast } = useToast();
  const { token, user, loginWithToken } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = (searchParams.get("next") || "").trim();
  const reason = (searchParams.get("reason") || "").trim();
  const allowLocalDraft = !String(searchParams.get("wizard") || "").trim();

  const authUserId = user?.id ? String(user.id) : null;
  const organizationType = useMemo(() => {
    if (organizationTypeOverride) return organizationTypeOverride;
    const role = String(user?.role || userData?.role || "requestor").trim();
    return role || "requestor";
  }, [organizationTypeOverride, user?.role, userData?.role]);

  // 커스텀 훅으로 상태 관리 분리
  const businessDataMgmt = useBusinessDataManagement({
    token,
    authUserId,
    organizationType,
    membership: "none",
    allowLocalDraft,
  });

  const businessSearch = useBusinessSearch({
    token,
    organizationType,
    membership: "none",
  });

  const membershipMgmt = useMembershipManagement({
    token,
    organizationType,
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
  const renderStateLogRef = useRef<string>("");

  const licenseUploadRef = useRef<BusinessLicenseUploadHandle | null>(null);

  // 파일 업로드 훅
  const { handleFileUpload, licenseDeleteLoading, setLicenseDeleteLoading } =
    useFileUpload(
      {
        token,
        membership: membershipMgmt.membership,
        setupMode,
        extracted: businessDataMgmt.extracted,
        businessData: businessDataMgmt.businessData,
        companyNameTouched: businessDataMgmt.companyNameTouched,
      },
      {
        onExtractedChange: businessDataMgmt.setExtracted,
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
    membershipMgmt.membership,
    setupMode,
    selectedRole,
  ]);

  useEffect(() => {
    if (membershipMgmt.membership !== "none" && setupMode !== null) {
      setSetupMode(null);
    }
  }, [membershipMgmt.membership, setupMode]);

  // 온보딩 검증 상태 업데이트
  useEffect(() => {
    if (selectedRole === "owner" && registerValidationState) {
      registerValidationState({
        passed:
          businessDataMgmt.validationSucceeded || businessDataMgmt.isVerified,
        validating: false,
      });
    }
  }, [
    businessDataMgmt.validationSucceeded,
    businessDataMgmt.isVerified,
    selectedRole,
    registerValidationState,
  ]);

  useEffect(() => {
    const showBusinessForm =
      membershipMgmt.membership === "owner" ||
      businessDataMgmt.licenseStatus === "ready" ||
      setupMode === "manual";
    const signature = JSON.stringify({
      membership: membershipMgmt.membership,
      setupMode,
      licenseStatus: businessDataMgmt.licenseStatus,
      showBusinessForm,
      licenseFileName: businessDataMgmt.licenseFileName,
    });
    if (renderStateLogRef.current === signature) return;
    renderStateLogRef.current = signature;
    console.info("[business-tab] render gate state", {
      membership: membershipMgmt.membership,
      setupMode,
      licenseStatus: businessDataMgmt.licenseStatus,
      showBusinessForm,
      licenseFileName: businessDataMgmt.licenseFileName,
    });
  }, [
    membershipMgmt.membership,
    setupMode,
    businessDataMgmt.licenseStatus,
    businessDataMgmt.licenseFileName,
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

  const handleSave = async () => {
    const savingToast = toast({
      title: "저장 중...",
      description: "사업자 정보를 확인하고 있습니다.",
      duration: 3000,
    });

    const { success, verification } = await handleSaveImpl({
      token,
      businessData: businessDataMgmt.businessData,
      extracted: businessDataMgmt.extracted,
      businessNumberLocked: businessDataMgmt.validationSucceeded,
      membership: membershipMgmt.membership,
      organizationType,
      businessLicense: {
        fileId: businessDataMgmt.licenseFileId,
        s3Key: businessDataMgmt.licenseS3Key,
        originalName: businessDataMgmt.licenseFileName,
      },
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
      toast({
        title: "저장 완료",
        description: "사업자 정보가 성공적으로 업데이트되었습니다.",
      });
      setShowInquiryCta(false);
      await membershipMgmt.refreshMembership();
      if (token) {
        await loginWithToken(token);
      }
      if (verification && typeof verification === "object") {
        businessDataMgmt.setIsVerified(!!verification.verified);
      }
      businessDataMgmt.setValidationSucceeded(true);
      setCardHighlight(true);
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
          organizationType,
          reason: "사업자 설정 문의",
          errorMessage: "",
          ownerForm: {
            companyName: String(
              businessDataMgmt.businessData.companyName || "",
            ).trim(),
            representativeName: String(
              businessDataMgmt.extracted.representativeName || "",
            ).trim(),
            businessNumber: String(
              businessDataMgmt.businessData.businessNumber || "",
            ).replace(/\D/g, ""),
            phone: String(businessDataMgmt.businessData.phone || "").replace(
              /\D/g,
              "",
            ),
            email: String(businessDataMgmt.extracted.email || "").trim(),
            businessType: String(
              businessDataMgmt.extracted.businessType || "",
            ).trim(),
            businessItem: String(
              businessDataMgmt.extracted.businessItem || "",
            ).trim(),
            address: String(businessDataMgmt.businessData.address || "").trim(),
            addressDetail: String(
              businessDataMgmt.businessData.addressDetail || "",
            ).trim(),
            startDate: String(
              businessDataMgmt.extracted.startDate || "",
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
            path: "/api/organizations/me",
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
        console.error("[BusinessTab] Failed to verify organization owner", err);
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
            path: "/api/organizations/me",
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
      organizationType,
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
    const message = `안녕하세요.\n이미 검증 및 등록 완료된 사업자 정보 변경을 요청드립니다.\n\n사업자명: ${String(businessDataMgmt.businessData.companyName || "").trim()}\n사업자등록번호: ${String(businessDataMgmt.businessData.businessNumber || "").trim()}\n대표자명: ${String(businessDataMgmt.extracted.representativeName || "").trim()}\n\n변경이 필요한 내용을 확인 후 처리 부탁드립니다.\n`;
    navigate(
      `/dashboard/inquiries?type=general&subject=${encodeURIComponent(subject)}&message=${encodeURIComponent(message)}&focus=message`,
    );
  };

  const handleCancelJoinRequest = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "cancel",
      organizationType,
      mockHeaders: {},
      toast,
      setCancelLoadingOrgId: membershipMgmt.setCancelLoadingOrgId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleLeaveOrganization = async (businessId: string) => {
    await handleJoinOrLeave({
      token,
      businessId,
      action: "leave",
      organizationType,
      mockHeaders: {},
      toast,
      setCancelLoadingOrgId: membershipMgmt.setCancelLoadingOrgId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleJoinRequest = async () => {
    await handleJoinRequestImpl({
      token,
      selectedBusinessId: businessSearch.selectedBusiness?._id,
      organizationType,
      mockHeaders: {},
      toast,
      setJoinLoading: membershipMgmt.setJoinLoading,
      setOrgSearch: businessSearch.setBusinessSearch,
      setOrgSearchResults: businessSearch.setBusinessSearchResults,
      setSelectedOrg: businessSearch.setSelectedBusiness,
      refreshMembership: membershipMgmt.refreshMembership,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
    });
  };

  const currentOrgName = useMemo(() => {
    const fromUser = String(
      (user as any)?.business || (user as any)?.organization || "",
    ).trim();
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
        {membershipMgmt.membership === "none" &&
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
                cancelLoadingOrgId={membershipMgmt.cancelLoadingOrgId}
                onCancelJoinRequest={handleCancelJoinRequest}
                onLeaveOrganization={handleLeaveOrganization}
              />
            </div>
          )}

        {membershipMgmt.membership === "none" && showJoinRequestSection && (
          <JoinRequestsSection
            myJoinRequests={membershipMgmt.myJoinRequests || []}
            cancelLoadingOrgId={membershipMgmt.cancelLoadingOrgId}
            onCancelJoinRequest={handleCancelJoinRequest}
            onLeaveOrganization={handleLeaveOrganization}
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
                  />
                )}

                {(membershipMgmt.membership === "owner" ||
                  businessDataMgmt.licenseStatus === "ready" ||
                  setupMode === "manual") && (
                  <BusinessForm
                    businessData={businessDataMgmt.businessData}
                    extracted={businessDataMgmt.extracted}
                    errors={businessDataMgmt.errors}
                    licenseStatus={businessDataMgmt.licenseStatus}
                    membership={membershipMgmt.membership}
                    licenseDeleteLoading={licenseDeleteLoading}
                    setBusinessData={businessDataMgmt.setBusinessData}
                    setExtracted={businessDataMgmt.setExtracted}
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
                        extracted: businessDataMgmt.extracted,
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
                currentOrgName={currentOrgName}
                licenseStatus={businessDataMgmt.licenseStatus}
                isVerified={businessDataMgmt.isVerified}
                extracted={businessDataMgmt.extracted}
                businessData={businessDataMgmt.businessData}
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
                      cancelLoadingOrgId={membershipMgmt.cancelLoadingOrgId}
                      onCancelJoinRequest={handleCancelJoinRequest}
                      onLeaveOrganization={handleLeaveOrganization}
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
