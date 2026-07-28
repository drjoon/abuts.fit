/**
 * 설정 > 사업자 주소 입력 UX를 재사용하기 위한 공통 주소 컴포넌트.
 *
 * - Daum Postcode 스크립트를 로드하여 도로명 주소 검색을 제공합니다.
 * - 주소/상세주소/우편번호 3필드를 동일 패턴으로 노출합니다.
 * - BusinessForm, PracticeDropzonePage 등 주소 입력이 필요한 화면에서 공통 사용합니다.
 *
 * related files:
 * - web/frontend/src/shared/components/business/settings/business/BusinessForm.tsx
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let postcodeScriptPromise: Promise<void> | null = null;

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

type BusinessAddressFieldsProps = {
  address: string;
  addressDetail: string;
  zipCode: string;
  onChangeAddress: (next: string) => void;
  onChangeAddressDetail: (next: string) => void;
  onChangeZipCode: (next: string) => void;
  className?: string;
  addressLabel?: string;
  disabled?: boolean;
  autoOpenAddressSearchSignal?: number;
  addressInputRef?: React.RefObject<HTMLInputElement | null>;
  addressDetailInputRef?: React.RefObject<HTMLInputElement | null>;
  zipCodeInputRef?: React.RefObject<HTMLInputElement | null>;
  addressError?: boolean;
  zipCodeError?: boolean;
  onAddressBlur?: () => void;
  onAddressDetailBlur?: () => void;
  onZipCodeBlur?: () => void;
  onAddressKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onAddressDetailKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onZipCodeKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onAddressSelected?: () => void;
  rowLayout?: "default" | "address-detail-zip";
};

export const BusinessAddressFields = ({
  address,
  addressDetail,
  zipCode,
  onChangeAddress,
  onChangeAddressDetail,
  onChangeZipCode,
  className,
  addressLabel = "주소",
  disabled = false,
  autoOpenAddressSearchSignal,
  addressInputRef,
  addressDetailInputRef,
  zipCodeInputRef,
  addressError,
  zipCodeError,
  onAddressBlur,
  onAddressDetailBlur,
  onZipCodeBlur,
  onAddressKeyDown,
  onAddressDetailKeyDown,
  onZipCodeKeyDown,
  onAddressSelected,
  rowLayout = "default",
}: BusinessAddressFieldsProps) => {
  const { toast } = useToast();
  const [addressPromptActive, setAddressPromptActive] = useState(false);
  const postcodeContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadPostcodeScript().catch(() => {
      toast({
        title: "주소 검색 스크립트를 불러오지 못했습니다",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleOpenAddressSearch = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      try {
        if (!window.daum?.Postcode) {
          await loadPostcodeScript();
        }
        setAddressPromptActive(true);
      } catch {
        if (!silent) {
          toast({
            title: "주소 검색을 불러오지 못했습니다",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
        }
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!autoOpenAddressSearchSignal) return;
    requestAnimationFrame(() => {
      void handleOpenAddressSearch({ silent: true });
    });
  }, [autoOpenAddressSearchSignal, handleOpenAddressSearch]);

  useEffect(() => {
    if (!addressPromptActive) return;
    if (!window.daum?.Postcode) return;

    const container = postcodeContainerRef.current;
    if (!container) return;

    container.innerHTML = "";
    const postcode = new window.daum.Postcode({
      oncomplete: (data) => {
        const nextAddress =
          data.roadAddress || data.jibunAddress || data.address || "";
        const nextZipCode = String(data.zonecode || "").trim();

        if (nextAddress) onChangeAddress(nextAddress);
        if (nextZipCode) onChangeZipCode(nextZipCode);

        setAddressPromptActive(false);
        onAddressSelected?.();
      },
      onclose: () => setAddressPromptActive(false),
    }) as { embed?: (element: HTMLElement) => void };

    if (!postcode.embed) return;
    postcode.embed(container);

    const setIframeLangKo = () => {
      const iframe = container.querySelector("iframe");
      if (iframe) iframe.setAttribute("lang", "ko");
    };
    requestAnimationFrame(setIframeLangKo);
    const langTimer = setTimeout(setIframeLangKo, 300);

    return () => {
      container.innerHTML = "";
      clearTimeout(langTimer);
    };
  }, [addressPromptActive, onAddressSelected, onChangeAddress, onChangeZipCode]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="address">{addressLabel}</Label>

      {addressPromptActive && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="text-xs font-medium text-slate-600">주소 검색</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setAddressPromptActive(false)}
            >
              닫기
            </Button>
          </div>
          <div
            ref={postcodeContainerRef}
            lang="ko"
            className="min-h-[420px] w-full bg-white"
          />
        </div>
      )}

      {rowLayout === "address-detail-zip" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input
            id="address"
            ref={addressInputRef}
            className={cn(
              "md:col-span-2",
              addressError && "border-destructive focus-visible:ring-destructive",
            )}
            value={address}
            placeholder="주소1 (도로명 주소) - 클릭하여 검색"
            onClick={() => {
              void handleOpenAddressSearch();
            }}
            onChange={(e) => onChangeAddress(e.target.value)}
            onBlur={onAddressBlur}
            onKeyDown={onAddressKeyDown}
            disabled={disabled}
          />
          <Input
            id="addressDetail"
            ref={addressDetailInputRef}
            className="md:col-span-2"
            value={addressDetail}
            placeholder="주소2 (동, 호수 등 상세주소)"
            onChange={(e) => onChangeAddressDetail(e.target.value)}
            onBlur={onAddressDetailBlur}
            onKeyDown={onAddressDetailKeyDown}
            disabled={disabled}
          />
          <Input
            id="zipCode"
            ref={zipCodeInputRef}
            className={cn(
              zipCodeError && "border-destructive focus-visible:ring-destructive",
            )}
            value={zipCode}
            placeholder="우편번호"
            onChange={(e) => onChangeZipCode(e.target.value)}
            onBlur={onZipCodeBlur}
            onKeyDown={onZipCodeKeyDown}
            disabled={disabled}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              id="address"
              ref={addressInputRef}
              className={cn(
                "md:col-span-2",
                addressError && "border-destructive focus-visible:ring-destructive",
              )}
              value={address}
              placeholder="주소1 (도로명 주소) - 클릭하여 검색"
              onClick={() => {
                void handleOpenAddressSearch();
              }}
              onChange={(e) => onChangeAddress(e.target.value)}
              onBlur={onAddressBlur}
              onKeyDown={onAddressKeyDown}
              disabled={disabled}
            />
            <Input
              id="zipCode"
              ref={zipCodeInputRef}
              className={cn(
                zipCodeError && "border-destructive focus-visible:ring-destructive",
              )}
              value={zipCode}
              placeholder="우편번호"
              onChange={(e) => onChangeZipCode(e.target.value)}
              onBlur={onZipCodeBlur}
              onKeyDown={onZipCodeKeyDown}
              disabled={disabled}
            />
          </div>

          <Input
            id="addressDetail"
            ref={addressDetailInputRef}
            value={addressDetail}
            placeholder="주소2 (동, 호수 등 상세주소)"
            onChange={(e) => onChangeAddressDetail(e.target.value)}
            onBlur={onAddressDetailBlur}
            onKeyDown={onAddressDetailKeyDown}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
};
