import { useCallback, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { useToast } from "@/shared/hooks/use-toast";
// SSOT: metadata 사용 (extracted 레거시 제거)
import {
  BusinessMetadata,
  BusinessData,
  LicenseStatus,
} from "@/shared/components/business/types";
import {
  normalizeMetadata,
  normalizeBusinessData,
  createEmptyMetadata,
} from "./businessStorage";
import {
  formatBusinessNumberInput,
  formatPhoneNumberInput,
} from "./validations";

interface FileUploadHandlers {
  onMetadataChange: (metadata: BusinessMetadata) => void;
  onBusinessDataChange: (data: BusinessData) => void;
  onLicenseFileNameChange: (name: string) => void;
  onLicenseFileIdChange: (id: string) => void;
  onLicenseS3KeyChange: (key: string) => void;
  onLicenseStatusChange: (status: LicenseStatus) => void;
  onIsVerifiedChange: (verified: boolean) => void;
  onAutoOpenAddressSearch: () => void;
}

interface UseFileUploadProps {
  token?: string;
  membership: "none" | "owner" | "member" | "pending";
  setupMode: "license" | "search" | "manual" | null;
  metadata: BusinessMetadata;
  businessData: BusinessData;
  companyNameTouched: boolean;
}

export const useFileUpload = (
  props: UseFileUploadProps,
  handlers: FileUploadHandlers,
) => {
  const { toast } = useToast();
  const { uploadFilesWithToast } = useUploadWithProgressToast({
    token: props.token,
  });
  const [licenseDeleteLoading, setLicenseDeleteLoading] = useState(false);

  const handleFileUpload = useCallback(
    async (file: File) => {
      try {
        if (!props.token) {
          toast({
            title: "로그인이 필요합니다",
            description: "사업자등록증 업로드는 로그인 후 이용할 수 있습니다.",
            variant: "destructive",
            duration: 3000,
          });
          return;
        }

        const canUploadLicense =
          props.membership === "owner" ||
          (props.membership === "none" && props.setupMode === "license");

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
            description:
              "사업자등록증 업로드/수정은 대표 계정에서만 가능합니다.",
            variant: "destructive",
            duration: 3000,
          });
          return;
        }

        handlers.onLicenseStatusChange("uploading");
        const uploaded = await uploadFilesWithToast([file]);
        const first = uploaded?.[0];

        if (!first?._id) {
          handlers.onLicenseStatusChange("error");
          return;
        }

        // 상태를 먼저 변경하여 리렌더링 최소화
        handlers.onLicenseStatusChange("processing");
        handlers.onLicenseFileNameChange(first.originalName);
        handlers.onLicenseFileIdChange(first._id);
        handlers.onLicenseS3KeyChange(first.key || "");

        const processingToast = toast({
          title: "AI 인식 중",
          description:
            "사업자등록증을 인식하고 있어요. 약 10초 정도 걸릴 수 있어요.",
          duration: 60000,
        });

        const res = await request<any>({
          path: "/api/ai/parse-business-license",
          method: "POST",
          token: props.token,
          jsonBody: {
            fileId: first._id,
            s3Key: first.key,
            originalName: first.originalName,
          },
        });

        if (res.ok) {
          const body: any = res.data || {};
          const data = body.data || body;
          // SSOT: metadata 사용 (extracted 레거시 제거)
          const nextMetadata = normalizeMetadata(data?.metadata || {});
          const verification = data?.verification;
          const hasAnyMetadata = Object.values(nextMetadata || {}).some((v) =>
            String(v || "").trim(),
          );
          const nextCompanyName = String(
            nextMetadata?.companyName || "",
          ).trim();
          const nextStartDate =
            String(nextMetadata?.startDate || "").trim() ||
            props.metadata.startDate;
          const extractedBusinessNumber = String(
            nextMetadata?.businessNumber || "",
          ).trim();
          const formattedBusinessNumber = formatBusinessNumberInput(
            extractedBusinessNumber,
          );

          console.info("[business-upload] parse result", {
            hasAnyMetadata,
            hasBusinessNumber: Boolean(extractedBusinessNumber),
            verified: Boolean(data?.verification?.verified),
            statusCode: res.status,
          });

          processingToast.dismiss();

          // 1. 먼저 모든 검증 수행 (데이터 업데이트 전)

          // 중복 사업자등록번호 체크 (백엔드 verification)
          if (
            String((verification as any)?.reason || "").trim() ===
            "duplicate_business_number"
          ) {
            handlers.onLicenseStatusChange("error");
            const msg = String((verification as any)?.message || "").trim();
            toast({
              title: "이미 가입된 사업자등록번호입니다",
              description:
                msg ||
                "이 사업자등록번호는 이미 등록되어 있습니다. 기존 사업자에 가입 요청을 진행해주세요.",
              variant: "destructive",
              duration: 4500,
            });
            return;
          }

          // 빈 인식 결과 체크
          if (!hasAnyMetadata) {
            const msg = String(verification?.message || "").trim();
            handlers.onMetadataChange({
              ...createEmptyMetadata(),
              startDate: props.metadata.startDate,
            });
            handlers.onBusinessDataChange({
              ...props.businessData,
              companyName: props.companyNameTouched
                ? props.businessData.companyName
                : "",
              owner: "",
              businessNumber: formattedBusinessNumber,
              address: "",
              addressDetail: "",
              zipCode: "",
              phone: "",
              email: "",
              businessType: "",
              businessItem: "",
              startDate: "",
            });
            handlers.onIsVerifiedChange(false);
            handlers.onLicenseStatusChange("ready");
            console.info("[business-upload] fallback to manual form", {
              reason: "empty_metadata",
              businessNumber: formattedBusinessNumber,
            });
            toast({
              title: "자동 인식 결과가 비어 있습니다",
              description:
                msg ||
                "이미지가 흐리거나 각도가 틀어져 인식하지 못했습니다. 이어서 수동으로 입력해주세요.",
              variant: "destructive",
              duration: 4500,
            });
            return;
          }

          // 사업자등록번호 중복 확인 (프론트엔드 API 호출)
          if (extractedBusinessNumber) {
            try {
              const duplicateCheckResponse = await request<any>({
                path: "/api/businesses/check-business-number",
                method: "POST",
                token: props.token,
                jsonBody: {
                  businessNumber: formattedBusinessNumber,
                },
              });

              if (
                !duplicateCheckResponse.ok &&
                duplicateCheckResponse.data?.reason ===
                  "duplicate_business_number"
              ) {
                handlers.onLicenseFileNameChange("");
                handlers.onLicenseFileIdChange("");
                handlers.onLicenseS3KeyChange("");
                handlers.onLicenseStatusChange("missing");
                toast({
                  title: "이미 가입된 사업자등록번호입니다",
                  description:
                    "이 사업자등록번호는 다른 계정에서 이미 등록되었습니다. 기존 사업자에 가입 요청을 진행해주세요.",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
              if (
                !duplicateCheckResponse.ok &&
                duplicateCheckResponse.status === 400
              ) {
                const message = String(
                  duplicateCheckResponse.data?.message || "",
                ).trim();
                handlers.onLicenseStatusChange("error");
                toast({
                  title: "사업자등록번호를 확인해주세요",
                  description:
                    message || "사업자등록번호 형식이 올바르지 않습니다.",
                  variant: "destructive",
                  duration: 5000,
                });
                return;
              }
            } catch (err) {
              console.error(
                "[useFileUpload] Failed to check business number duplicate",
                err,
              );
            }
          }

          // 2. 모든 검증 통과 → 데이터 업데이트 및 입력 폼으로 전환
          // AI 파싱 결과에 없는 필드는 기존 값 유지
          const newPhoneNumber = String(nextMetadata?.phoneNumber || "").trim();
          const newEmail = String(nextMetadata?.email || "").trim();
          const newAddress = String(nextMetadata?.address || "").trim();
          const newAddressDetail = String(
            nextMetadata?.addressDetail || "",
          ).trim();
          const newZipCode = String(nextMetadata?.zipCode || "").trim();

          // 기존 주소가 있으면 유지, 없으면 비우고 주소 검색 유도
          const hasExistingAddress = Boolean(props.businessData.address);

          handlers.onMetadataChange({
            ...nextMetadata,
            address: hasExistingAddress ? props.metadata.address : "",
            addressDetail: hasExistingAddress
              ? props.metadata.addressDetail
              : "",
            zipCode: hasExistingAddress ? props.metadata.zipCode : "",
            email: newEmail || props.metadata.email,
            phoneNumber: newPhoneNumber || props.metadata.phoneNumber,
            startDate: nextStartDate,
          });

          handlers.onBusinessDataChange({
            ...props.businessData,
            companyName: props.companyNameTouched
              ? props.businessData.companyName
              : nextCompanyName || "",
            owner: String(nextMetadata?.representativeName || "").trim(),
            businessNumber: formattedBusinessNumber,
            // 기존 주소가 있으면 유지, 없으면 비우고 주소 검색 유도
            address: hasExistingAddress ? props.businessData.address : "",
            addressDetail: hasExistingAddress
              ? props.businessData.addressDetail
              : "",
            zipCode: hasExistingAddress ? props.businessData.zipCode : "",
            // AI 파싱 결과에 값이 있으면 사용, 없으면 기존 값 유지
            phone: newPhoneNumber
              ? formatPhoneNumberInput(newPhoneNumber)
              : props.businessData.phone,
            email: newEmail || props.businessData.email,
            businessType: String(nextMetadata?.businessType || "").trim(),
            businessItem: String(nextMetadata?.businessItem || "").trim(),
            startDate: nextStartDate,
          });

          handlers.onIsVerifiedChange(!!data?.verification?.verified);
          handlers.onLicenseStatusChange("ready");

          // 기존 주소가 없는 경우에만 주소 검색 유도
          if (!hasExistingAddress) {
            handlers.onAutoOpenAddressSearch();
            toast({
              title: "주소 확인이 필요합니다",
              description:
                "주소와 우편번호를 비워두었어요. 주소 검색 창에서 도로명 주소를 선택해주세요.",
              duration: 3500,
            });
          }

          // AI 인식 결과 확인 유도 토스트
          setTimeout(() => {
            toast({
              title: "AI 인식 결과를 확인해주세요",
              description:
                "사업자명, 전화번호, 이메일 등이 정확한지 확인하고 필요시 수정해주세요.",
              duration: 5000,
            });
          }, 500);
          return;
        }

        processingToast.dismiss();
        // AI 인식 실패 시 파일 정보 유지 (업로드 화면 유지)
        handlers.onLicenseStatusChange("error");

        const msg = String((res.data as any)?.message || "").trim();
        const isBadRequest = res.status === 400;
        const isRateLimited = res.status === 429;

        toast({
          title: isRateLimited
            ? "AI 인식 서비스 할당량 초과"
            : isBadRequest
              ? "파일 확인 필요"
              : "분석 실패",
          description:
            msg ||
            (isRateLimited
              ? "AI 인식 서비스 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요."
              : isBadRequest
                ? "업로드된 파일을 확인할 수 없습니다. 초기화 후 다시 업로드해주세요."
                : "자동 인식에 실패했습니다. 초기화 후 다시 업로드해주세요."),
          variant: "destructive",
          duration: 5000,
        });
      } catch {
        handlers.onLicenseStatusChange("error");
        toast({
          title: "업로드 실패",
          description: "사업자등록증 업로드에 실패했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    [props, handlers, toast, uploadFilesWithToast],
  );

  return {
    handleFileUpload,
    licenseDeleteLoading,
    setLicenseDeleteLoading,
  };
};
