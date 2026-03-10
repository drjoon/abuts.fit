import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { ArrowLeft, Loader2, MapPinned, Search } from "lucide-react";
import type { ManufacturerRequest } from "../../utils/request";

declare global {
  interface Window {
    daum?: {
      Postcode?: new (options: {
        oncomplete: (data: {
          zonecode?: string;
          address?: string;
          roadAddress?: string;
          jibunAddress?: string;
        }) => void;
        onclose?: () => void;
      }) => { open: (options?: { popupName?: string }) => void };
    };
  }
}

const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let postcodeScriptPromise: Promise<void> | null = null;
const POSTCODE_POPUP_NAME = "daum-postcode";
let postcodePopupOpen = false;

const loadPostcodeScript = () => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (postcodeScriptPromise) return postcodeScriptPromise;
  postcodeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트 로딩 실패"));
    document.body.appendChild(script);
  });
  return postcodeScriptPromise;
};

type MailboxContentsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  requests: ManufacturerRequest[];
  errorMessage?: string;
  token?: string | null;
  onRollback?: (req: ManufacturerRequest) => void;
  onRollbackAll?: (requests: ManufacturerRequest[]) => void;
  isRollingBackAll?: boolean;
  onAddressSaved?: (payload: {
    businessId: string;
    address: string;
    addressDetail: string;
    zipCode: string;
  }) => void;
};

export const MailboxContentsModal = ({
  open,
  onOpenChange,
  address,
  requests,
  errorMessage,
  token,
  onRollback,
  onRollbackAll,
  isRollingBackAll = false,
  onAddressSaved,
}: MailboxContentsModalProps) => {
  const { toast } = useToast();
  const getLotShortCode = (req: ManufacturerRequest) => {
    const full = String(
      req.lotNumber?.value || req.lotNumber?.material || "",
    ).trim();
    const match = full.match(/[A-Z]{3}$/i);
    return match ? match[0].toUpperCase() : "";
  };

  const primaryOrganization =
    requests.find((req) => req.requestor?.organization)?.requestor
      ?.organization || "-";

  const stageLabel =
    requests.find((req) => req.manufacturerStage)?.manufacturerStage || "의뢰";

  const primaryRequest = requests[0] || null;
  const requestorOrganization =
    (primaryRequest as any)?.requestorBusiness ||
    (primaryRequest as any)?.requestorBusinessId ||
    (primaryRequest as any)?.requestorOrganization ||
    (primaryRequest as any)?.requestorOrganizationId ||
    null;
  const businessId = String(
    requestorOrganization?._id || requestorOrganization || "",
  ).trim();
  const initialAddress = String(
    requestorOrganization?.extracted?.address ||
      (primaryRequest as any)?.requestor?.addressText ||
      (primaryRequest as any)?.requestor?.address?.roadAddress ||
      (primaryRequest as any)?.requestor?.address?.address1 ||
      "",
  ).trim();
  const initialAddressDetail = String(
    requestorOrganization?.extracted?.addressDetail ||
      (primaryRequest as any)?.requestor?.address?.detailAddress ||
      (primaryRequest as any)?.requestor?.address?.address2 ||
      "",
  ).trim();
  const initialZipCode = String(
    requestorOrganization?.extracted?.zipCode ||
      (primaryRequest as any)?.requestor?.address?.postalCode ||
      (primaryRequest as any)?.requestor?.zipCode ||
      "",
  ).trim();
  const addressDetailRef = useRef<HTMLInputElement | null>(null);
  const [addressInput, setAddressInput] = useState(initialAddress);
  const [addressDetailInput, setAddressDetailInput] =
    useState(initialAddressDetail);
  const [zipCodeInput, setZipCodeInput] = useState(initialZipCode);
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAddressInput(initialAddress);
    setAddressDetailInput(initialAddressDetail);
    setZipCodeInput(initialZipCode);
  }, [initialAddress, initialAddressDetail, initialZipCode, open]);

  useEffect(() => {
    void loadPostcodeScript().catch(() => {});
  }, []);

  const getImplantInfo = (req: ManufacturerRequest) => {
    const parts = [
      String(req.caseInfos?.implantManufacturer || "").trim(),
      String(req.caseInfos?.implantBrand || "").trim(),
      String(req.caseInfos?.implantFamily || "").trim(),
      String(req.caseInfos?.implantType || "").trim(),
    ].filter(Boolean);
    return parts.join(" / ");
  };

  const handleOpenAddressSearch = () => {
    try {
      if (!window.daum?.Postcode) {
        loadPostcodeScript().catch(() => {
          toast({
            title: "주소 검색 스크립트를 불러오지 못했습니다",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
        });
        toast({
          title: "주소 검색 준비 중",
          description: "잠시만 기다린 뒤 다시 눌러주세요.",
        });
        return;
      }
      if (postcodePopupOpen) {
        window.open("", POSTCODE_POPUP_NAME)?.focus();
        return;
      }
      postcodePopupOpen = true;
      new window.daum.Postcode({
        oncomplete: (data) => {
          const nextAddress =
            data.roadAddress || data.jibunAddress || data.address || "";
          const nextZipCode = String(data.zonecode || "").trim();
          setAddressInput(nextAddress);
          setZipCodeInput(nextZipCode);
          requestAnimationFrame(() => {
            addressDetailRef.current?.focus();
          });
        },
        onclose: () => {
          postcodePopupOpen = false;
        },
      }).open({ popupName: POSTCODE_POPUP_NAME });
    } catch {
      postcodePopupOpen = false;
      toast({
        title: "주소 검색을 불러오지 못했습니다",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const handleSaveAddress = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }
    if (!businessId) {
      toast({
        title: "조직 정보를 찾을 수 없습니다",
        variant: "destructive",
      });
      return;
    }
    const nextAddress = String(addressInput || "").trim();
    const nextAddressDetail = String(addressDetailInput || "").trim();
    const nextZipCode = String(zipCodeInput || "").trim();
    if (!nextAddress || !nextAddressDetail || !nextZipCode) {
      toast({
        title: "주소를 모두 입력해주세요",
        description: "주소, 상세주소, 우편번호가 필요합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingAddress(true);
    try {
      const res = await request<any>({
        path: "/api/organizations/requestor-shipping-address",
        method: "PUT",
        token,
        jsonBody: {
          businessId,
          address: nextAddress,
          addressDetail: nextAddressDetail,
          zipCode: nextZipCode,
        },
      });
      if (!res.ok) {
        throw new Error(
          String(res.data?.message || "의뢰인 배송지 저장에 실패했습니다."),
        );
      }
      onAddressSaved?.({
        businessId,
        address: String(res.data?.data?.address || nextAddress).trim(),
        addressDetail: String(
          res.data?.data?.addressDetail || nextAddressDetail,
        ).trim(),
        zipCode: String(res.data?.data?.zipCode || nextZipCode).trim(),
      });
      toast({
        title: "의뢰인 주소를 저장했습니다",
        description: "다시 접수/출력을 시도해주세요.",
      });
    } catch (error) {
      toast({
        title: "주소 저장 실패",
        description:
          error instanceof Error
            ? error.message
            : "의뢰인 배송지 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAddress(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base text-slate-800">
            <span className="text-lg font-semibold text-slate-900">
              {address}
            </span>
            {primaryOrganization && primaryOrganization !== "-" ? (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-sm text-slate-600">
                  {primaryOrganization}
                </span>
              </>
            ) : null}
            <span className="ml-auto flex items-center gap-2 mr-6">
              <Badge
                variant="secondary"
                className="text-[11px] bg-slate-100 text-slate-700"
              >
                {stageLabel}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {requests.length}건
              </Badge>
              {onRollbackAll ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={isRollingBackAll}
                  onClick={() => onRollbackAll(requests)}
                >
                  <ArrowLeft className="h-3 w-3" />
                </Button>
              ) : null}
            </span>
          </DialogTitle>
        </DialogHeader>
        {errorMessage ? (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMessage}
          </div>
        ) : null}
        {errorMessage && businessId ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  의뢰인 배송지 수정
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  주소 오류인 경우 제조사에서 의뢰인 사업자 주소를 바로 수정할
                  수 있습니다.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    addressDetailRef.current?.focus();
                  }}
                >
                  <MapPinned className="h-3.5 w-3.5" />
                  주소 정정
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleOpenAddressSearch}
                >
                  <Search className="h-3.5 w-3.5" />
                  주소 검색
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="requestor-shipping-address">주소</Label>
                <Input
                  id="requestor-shipping-address"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="도로명 주소"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requestor-shipping-zip">우편번호</Label>
                <Input
                  id="requestor-shipping-zip"
                  value={zipCodeInput}
                  onChange={(e) => setZipCodeInput(e.target.value)}
                  placeholder="우편번호"
                />
              </div>
              <div className="md:col-span-3 space-y-2">
                <Label htmlFor="requestor-shipping-address-detail">
                  상세주소
                </Label>
                <Input
                  id="requestor-shipping-address-detail"
                  ref={addressDetailRef}
                  value={addressDetailInput}
                  onChange={(e) => setAddressDetailInput(e.target.value)}
                  placeholder="상세주소"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <MapPinned className="h-3.5 w-3.5" />
                저장 후 다시 택배 접수/라벨 출력을 시도해주세요.
              </div>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                disabled={isSavingAddress}
                onClick={() => {
                  void handleSaveAddress();
                }}
              >
                {isSavingAddress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                주소 저장
              </Button>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requests.map((req) => (
            <div
              key={req._id}
              className="relative p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors flex flex-col gap-3"
            >
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                {onRollback && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={isRollingBackAll}
                    onClick={() => {
                      void onRollback(req);
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                )}
                {getLotShortCode(req) && (
                  <Badge className="text-[11px] bg-slate-900 text-white border border-slate-900">
                    {getLotShortCode(req)}
                  </Badge>
                )}
              </div>
              <div className="flex items-start gap-3 pr-10">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">
                    {req.requestId}
                  </div>
                  <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                    <div>
                      {req.caseInfos?.clinicName || "-"} /{" "}
                      {req.caseInfos?.patientName || "미지정"} /{" "}
                      {req.caseInfos?.tooth || "-"}
                    </div>
                    {getLotShortCode(req) && (
                      <div>LOT: {getLotShortCode(req)}</div>
                    )}
                    {getImplantInfo(req) && <div>{getImplantInfo(req)}</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
