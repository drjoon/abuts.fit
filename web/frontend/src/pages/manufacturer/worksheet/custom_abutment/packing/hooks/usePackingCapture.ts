// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/backend/controllers/ai/lotCapture.controller.js
// - bg/pc2/lot-server/src/index.js
// change-log:
// - 2026-11-26: 이미지 AI·pending·드롭 매칭 제거. 3글자 코드→confirmBySuffix 만.
import { useCallback, useRef, useState } from "react";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export type CaptureResult = {
  requestId: string;
  recognizedSuffix: string;
  request: ManufacturerRequest;
  capturedAt: Date;
};

export function extractLotSuffix3(value: string | null | undefined) {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
}

/** @deprecated 세척·패킹 드롭 매칭 제거. WorksheetCardGrid/PreviewModal 호환용. */
export const PACKING_PENDING_DRAG_MIME = "application/x-abuts-packing-pending";
/** @deprecated 세척·패킹 드롭 매칭 제거. WorksheetCardGrid/PreviewModal 호환용. */
export const PACKING_IMAGE_DRAG_MIME = "application/x-abuts-packing-image";

export type PackingImageDragPayload = {
  s3Key: string;
  s3Url?: string;
  fileName?: string;
  fileSize?: number;
  sourceRequestMongoId?: string;
};

export const readPackingImageDragPayload = (
  dataTransfer: DataTransfer | null,
): PackingImageDragPayload | null => {
  if (!dataTransfer) return null;
  let raw = "";
  try {
    raw = dataTransfer.getData(PACKING_IMAGE_DRAG_MIME);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PackingImageDragPayload;
    const s3Key = String(parsed?.s3Key || "").trim();
    if (!s3Key) return null;
    return {
      s3Key,
      s3Url: String(parsed?.s3Url || "").trim(),
      fileName: String(parsed?.fileName || "").trim(),
      fileSize: Number(parsed?.fileSize) || 0,
      sourceRequestMongoId: String(parsed?.sourceRequestMongoId || "").trim(),
    };
  } catch {
    return null;
  }
};

const PACKING_IMAGE_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
];

export const isPackingCaptureImageFile = (file: File) => {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return PACKING_IMAGE_EXTS.some((ext) => name.endsWith(ext));
};

export type MatchBySuffixResult =
  | {
      ok: true;
      matched: true;
      requestId: string;
      request: ManufacturerRequest;
      suffix: string;
    }
  | {
      ok: true;
      matched: false;
      suffix: string;
      reason: string;
      message: string;
    }
  | { ok: false; suffix: string; message: string };

type ToastFn = (args: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

export function usePackingCapture({
  token,
  setRequests,
  toast,
  onCaptureResult,
}: {
  token: string | null | undefined;
  setRequests: React.Dispatch<React.SetStateAction<ManufacturerRequest[]>>;
  toast: ToastFn;
  onCaptureResult?: (result: CaptureResult) => void;
}) {
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [matchNote, setMatchNote] = useState<
    "" | "miss" | "ambiguous" | "error" | "ok"
  >("");
  const inFlightRef = useRef("");

  const applyMatchedRequest = useCallback(
    (payload: {
      request?: ManufacturerRequest;
      requestMongoId?: string;
      requestId?: string;
      suffix?: string;
    }) => {
      const matched = payload.request;
      const mongoId = String(
        payload.requestMongoId || matched?._id || "",
      ).trim();
      if (matched && mongoId) {
        setRequests((prev) =>
          prev.filter((row) => String(row._id || "") !== mongoId),
        );
        onCaptureResult?.({
          requestId: String(matched.requestId || payload.requestId || ""),
          recognizedSuffix: extractLotSuffix3(payload.suffix),
          request: matched,
          capturedAt: new Date(),
        });
      } else if (mongoId) {
        setRequests((prev) =>
          prev.filter((row) => String(row._id || "") !== mongoId),
        );
      }
    },
    [onCaptureResult, setRequests],
  );

  useAppEventListener(
    "packing:capture-processed",
    (event) => {
      const data = (event as { data?: Record<string, unknown> })?.data || event;
      const payload = (data || {}) as {
        request?: ManufacturerRequest;
        requestMongoId?: string;
        requestId?: string;
        recognizedSuffix?: string;
      };
      applyMatchedRequest({
        request: payload.request,
        requestMongoId: payload.requestMongoId,
        requestId: payload.requestId,
        suffix: payload.recognizedSuffix,
      });
    },
    [applyMatchedRequest],
  );

  const matchBySuffix = useCallback(
    async (
      rawSuffix: string,
      options?: { silentToast?: boolean; source?: "lot-server" | "manual" },
    ): Promise<MatchBySuffixResult> => {
      const suffix = extractLotSuffix3(rawSuffix);
      if (suffix.length !== 3) {
        return { ok: false, suffix, message: "각인 코드 3글자가 필요합니다." };
      }
      if (!token) {
        return { ok: false, suffix, message: "로그인이 필요합니다." };
      }
      if (inFlightRef.current === suffix) {
        return { ok: false, suffix, message: "매칭 중…" };
      }

      inFlightRef.current = suffix;
      setMatchingBusy(true);
      setMatchNote("");
      try {
        const response = await fetch("/api/bg/lot-capture/packing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recognizedSuffix: suffix,
            confirmBySuffix: true,
            source: options?.source || "manual",
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          setMatchNote("error");
          const message =
            data?.message || "각인 매칭에 실패했습니다.";
          if (!options?.silentToast) {
            toast({
              title: "각인 매칭 실패",
              description: message,
              variant: "destructive",
            });
          }
          return { ok: false, suffix, message };
        }

        const body = (data.data || {}) as {
          matched?: boolean;
          reason?: string;
          requestId?: string;
          requestMongoId?: string;
          request?: ManufacturerRequest;
          suffix?: string;
        };

        if (!body.matched) {
          const reason = String(body.reason || "no_suffix_match");
          setMatchNote(
            reason === "ambiguous_suffix"
              ? "ambiguous"
              : reason === "no_suffix_match"
                ? "miss"
                : "error",
          );
          const message =
            data.message ||
            (reason === "ambiguous_suffix"
              ? "같은 각인 코드가 여러 건입니다."
              : "일치하는 세척.패킹 의뢰가 없습니다.");
          return {
            ok: true,
            matched: false,
            suffix,
            reason,
            message,
          };
        }

        setMatchNote("ok");
        applyMatchedRequest({
          request: body.request,
          requestMongoId: body.requestMongoId,
          requestId: body.requestId,
          suffix: body.suffix || suffix,
        });
        if (!options?.silentToast) {
          toast({
            title: `매칭 완료: ${suffix}`,
            description: body.requestId
              ? `${body.requestId} → 포장.발송`
              : "포장.발송으로 이동했습니다.",
          });
        }
        return {
          ok: true,
          matched: true,
          requestId: String(body.requestId || ""),
          request: body.request as ManufacturerRequest,
          suffix,
        };
      } catch (err) {
        setMatchNote("error");
        const message =
          err instanceof Error ? err.message : "각인 매칭에 실패했습니다.";
        if (!options?.silentToast) {
          toast({
            title: "각인 매칭 실패",
            description: message,
            variant: "destructive",
          });
        }
        return { ok: false, suffix, message };
      } finally {
        inFlightRef.current = "";
        setMatchingBusy(false);
      }
    },
    [applyMatchedRequest, toast, token],
  );

  const bindToRequest = useCallback(
    async (requestMongoId: string, rawSuffix?: string) => {
      const mongoId = String(requestMongoId || "").trim();
      const suffix = extractLotSuffix3(rawSuffix);
      if (!mongoId || !token) return false;
      setMatchingBusy(true);
      setMatchNote("");
      try {
        const response = await fetch("/api/bg/lot-capture/packing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            requestMongoId: mongoId,
            recognizedSuffix: suffix || undefined,
            source: "manual",
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success || !data?.data?.matched) {
          setMatchNote("error");
          toast({
            title: "카드 매칭 실패",
            description: data?.message || "의뢰에 연결하지 못했습니다.",
            variant: "destructive",
          });
          return false;
        }
        setMatchNote("ok");
        applyMatchedRequest({
          request: data.data.request,
          requestMongoId: data.data.requestMongoId || mongoId,
          requestId: data.data.requestId,
          suffix: data.data.suffix || suffix,
        });
        toast({
          title: `매칭 완료: ${data.data.suffix || suffix || ""}`,
          description: data.data.requestId
            ? `${data.data.requestId} → 포장.발송`
            : "포장.발송으로 이동했습니다.",
        });
        return true;
      } catch (err) {
        setMatchNote("error");
        toast({
          title: "카드 매칭 실패",
          description:
            err instanceof Error ? err.message : "의뢰에 연결하지 못했습니다.",
          variant: "destructive",
        });
        return false;
      } finally {
        setMatchingBusy(false);
      }
    },
    [applyMatchedRequest, toast, token],
  );

  return {
    matchingBusy,
    matchNote,
    setMatchNote,
    matchBySuffix,
    bindToRequest,
  };
}
