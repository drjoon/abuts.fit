import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import {
  LicenseExtracted,
  BusinessData,
  LicenseStatus,
  MembershipStatus,
} from "@/shared/components/business/types";
import {
  readStoredBusinessDraft,
  writeStoredBusinessDraft,
  normalizeBusinessData,
  normalizeExtracted,
  createEmptyExtracted,
  BusinessDraftPayload,
} from "./businessStorage";
import {
  formatBusinessNumberInput,
  formatPhoneNumberInput,
} from "./validations";

interface UseBusinessDataManagementProps {
  token?: string;
  authUserId: string | null;
  businessType: string;
  membership: MembershipStatus;
  allowLocalDraft: boolean;
}

export const useBusinessDataManagement = (
  props: UseBusinessDataManagementProps,
) => {
  const { toast } = useToast();
  const [businessData, setBusinessData] = useState<BusinessData>(() =>
    normalizeBusinessData(),
  );
  const [extracted, setExtracted] =
    useState<LicenseExtracted>(createEmptyExtracted);
  const [licenseFileName, setLicenseFileName] = useState<string>("");
  const [licenseFileId, setLicenseFileId] = useState<string>("");
  const [licenseS3Key, setLicenseS3Key] = useState<string>("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>("missing");
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [validationSucceeded, setValidationSucceeded] = useState(false);
  const [companyNameTouched, setCompanyNameTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const serverHydratedRef = useRef(false);
  const suppressDraftWriteRef = useRef(false);
  const resetVersionRef = useRef(0);
  const suppressPrefillRef = useRef(false);
  const latestDraftRef = useRef<{
    payload: BusinessDraftPayload | null;
    hasAnyLicense: boolean;
    hasAnyData: boolean;
  }>({ payload: null, hasAnyLicense: false, hasAnyData: false });
  const latestLicenseStateRef = useRef<{
    fileName: string;
    fileId: string;
    s3Key: string;
    status: LicenseStatus;
  }>({
    fileName: "",
    fileId: "",
    s3Key: "",
    status: "missing",
  });

  const applyStoredDraft = useCallback((draft: BusinessDraftPayload) => {
    setBusinessData(normalizeBusinessData(draft.businessData));
    setExtracted(normalizeExtracted(draft.extracted));
    setLicenseFileName(draft.licenseFileName);
    setLicenseFileId(draft.licenseFileId);
    setLicenseS3Key(draft.licenseS3Key);
    setLicenseStatus(draft.licenseStatus);
    setIsVerified(draft.isVerified);
  }, []);

  // 저장된 draft 복구
  useEffect(() => {
    if (!props.authUserId) return;
    if (!props.allowLocalDraft) return;
    if (props.membership !== "none") return;
    if (serverHydratedRef.current) return;

    const draft = readStoredBusinessDraft(props.authUserId);
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
    props.allowLocalDraft,
    props.authUserId,
    props.membership,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
  ]);

  // 서버에서 데이터 로드
  useEffect(() => {
    const loadVersion = resetVersionRef.current;
    const load = async () => {
      try {
        if (!props.token) return;
        const res = await request<any>({
          path: `/api/businesses/me?businessType=${encodeURIComponent(
            props.businessType,
          )}`,
          method: "GET",
          token: props.token,
        });

        if (!res.ok) return;
        if (resetVersionRef.current !== loadVersion) return;

        const body: any = res.data || {};
        const data = body.data || body;
        const next = (data?.membership || "none") as MembershipStatus;

        serverHydratedRef.current = true;
        setValidationSucceeded(Boolean(data?.businessVerified));

        if (suppressPrefillRef.current && licenseStatus === "missing") {
          suppressPrefillRef.current = false;
          return;
        }
        suppressPrefillRef.current = false;

        const businessName = String(data?.business?.name || "").trim();
        const ex = data?.extracted || {};

        const nextBusinessData = normalizeBusinessData({
          companyName: String(ex?.companyName || "").trim() || businessName,
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
            companyName: String(ex?.companyName || "").trim() || businessName,
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
        const hasServerLicense =
          Boolean(licName) ||
          Boolean(nextLicenseFileId) ||
          Boolean(nextLicenseS3Key);
        const localLicense = latestLicenseStateRef.current;
        const hasLocalLicense =
          Boolean(String(localLicense.fileName || "").trim()) ||
          Boolean(String(localLicense.fileId || "").trim()) ||
          Boolean(String(localLicense.s3Key || "").trim());

        if (resetVersionRef.current !== loadVersion) return;

        if (next === "none" && !hasServerLicense && hasLocalLicense) {
          console.info(
            "[business-data] skip server hydrate license overwrite",
            {
              businessType: props.businessType,
              membership: next,
              localLicenseStatus: localLicense.status,
              localFileName: localLicense.fileName,
            },
          );
          return;
        }

        if (hasServerLicense) {
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
      } catch {
        serverHydratedRef.current = true;
      }
    };

    load();
  }, [props.token, props.businessType]);

  useEffect(() => {
    latestLicenseStateRef.current = {
      fileName: licenseFileName,
      fileId: licenseFileId,
      s3Key: licenseS3Key,
      status: licenseStatus,
    };
  }, [licenseFileId, licenseFileName, licenseS3Key, licenseStatus]);

  // 멤버십 변경 시 draft 정리
  useEffect(() => {
    if (!props.authUserId) return;
    if (!props.allowLocalDraft) return;
    if (props.membership !== "none") {
      writeStoredBusinessDraft(props.authUserId, null);
    }
  }, [props.allowLocalDraft, props.authUserId, props.membership]);

  // draft 자동 저장
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
    if (!props.authUserId) return;
    if (!props.allowLocalDraft) return;
    if (suppressDraftWriteRef.current) return;

    const { hasAnyLicense: latestHasAnyLicense, hasAnyData: latestHasAnyData } =
      latestDraftRef.current;

    if (!latestHasAnyLicense && !latestHasAnyData) {
      writeStoredBusinessDraft(props.authUserId, null);
      return;
    }

    writeStoredBusinessDraft(props.authUserId, latestDraftRef.current.payload);
  }, [
    props.allowLocalDraft,
    props.authUserId,
    businessData,
    extracted,
    isVerified,
    licenseFileId,
    licenseFileName,
    licenseS3Key,
    licenseStatus,
  ]);

  const resetLocalBusinessState = useCallback(() => {
    resetVersionRef.current += 1;
    suppressPrefillRef.current = true;
    suppressDraftWriteRef.current = true;

    setLicenseFileName("");
    setLicenseFileId("");
    setLicenseS3Key("");
    setLicenseStatus("missing");
    setIsVerified(false);
    setExtracted(createEmptyExtracted());
    setErrors({});
    setBusinessData({
      companyName: "",
      owner: "",
      businessNumber: "",
      address: "",
      addressDetail: "",
      zipCode: "",
      phone: "",
      email: "",
      businessType: "",
      businessItem: "",
      startDate: "",
    });
    setCompanyNameTouched(false);

    latestDraftRef.current = {
      payload: null,
      hasAnyLicense: false,
      hasAnyData: false,
    };
    serverHydratedRef.current = false;

    if (props.authUserId && props.allowLocalDraft) {
      writeStoredBusinessDraft(props.authUserId, null);
    }

    requestAnimationFrame(() => {
      suppressDraftWriteRef.current = false;
    });
  }, [props.allowLocalDraft, props.authUserId]);

  return {
    businessData,
    setBusinessData,
    extracted,
    setExtracted,
    licenseFileName,
    setLicenseFileName,
    licenseFileId,
    setLicenseFileId,
    licenseS3Key,
    setLicenseS3Key,
    licenseStatus,
    setLicenseStatus,
    isVerified,
    setIsVerified,
    validationSucceeded,
    setValidationSucceeded,
    companyNameTouched,
    setCompanyNameTouched,
    errors,
    setErrors,
    resetLocalBusinessState,
    resetVersionRef,
    suppressDraftWriteRef,
    latestDraftRef,
  };
};
