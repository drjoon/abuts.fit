// change-log:
// - 2026-08-10: 파일 카운트 s3Key 중복 제거(primary+files).
// - 2026-08-10: 디자인 큐 전용 기공의뢰서형 카드(수락/승인/unread).
// related files:
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestTransferView.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/ui/cn";
import {
  formatToothWorksForDisplay,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
};

const formatClaimRemaining = (remainingMs: number) => {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  if (hh > 0) return `${hh}시간 ${mm}분`;
  if (mm > 0) return `${mm}분 ${String(ss).padStart(2, "0")}초`;
  return `${ss}초`;
};

const normalizeToothWorks = (raw: unknown): ToothWorkSelection[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const toothNumber = String(r.toothNumber || r.tooth || "").trim();
      const prosthesisType = String(r.prosthesisType || "").trim();
      if (!toothNumber && !prosthesisType) return null;
      return {
        toothNumber,
        prosthesisType,
        customAbutment: Boolean(r.customAbutment),
        bridgeLinkedTeeth: Array.isArray(r.bridgeLinkedTeeth)
          ? r.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
          : [],
        implantManufacturer: String(r.implantManufacturer || "").trim() || undefined,
        implantBrand: String(r.implantBrand || "").trim() || undefined,
        implantFamily: String(r.implantFamily || "").trim() || undefined,
        implantType: String(r.implantType || "").trim() || undefined,
        abutmentManufacturer: String(r.abutmentManufacturer || "").trim() || undefined,
        abutmentDiameter: String(r.abutmentDiameter || "").trim() || undefined,
        abutmentHeight: String(r.abutmentHeight || "").trim() || undefined,
      } satisfies ToothWorkSelection;
    })
    .filter((row): row is ToothWorkSelection => Boolean(row));
};

const countRequestFiles = (request: ManufacturerRequest) => {
  const caseInfos = request.caseInfos || {};
  const seen = new Set<string>();
  const add = (key: string) => {
    const k = String(key || "").trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
  };
  const primaryKey = String(
    caseInfos.file?.s3Key || caseInfos.file?.s3Url || caseInfos.file?.filePath || "",
  ).trim();
  if (primaryKey) add(primaryKey);
  const extras = Array.isArray(caseInfos.files) ? caseInfos.files : [];
  for (const f of extras) {
    const key = String(f?.s3Key || f?.s3Url || f?.filePath || "").trim();
    if (key) add(key);
  }
  return seen.size;
};

export type DesignRequestCardGridProps = {
  requests: ManufacturerRequest[];
  unreadByRequestId: Map<string, number>;
  onOpen: (request: ManufacturerRequest) => void;
  onDesignClaim?: (request: ManufacturerRequest) => void;
  onApprove?: (request: ManufacturerRequest) => void;
  designClaimBusyIds?: Record<string, boolean>;
};

export function DesignRequestCardGrid({
  requests,
  unreadByRequestId,
  onOpen,
  onDesignClaim,
  onApprove,
  designClaimBusyIds = {},
}: DesignRequestCardGridProps) {
  const [claimTickMs, setClaimTickMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setClaimTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {requests.map((request) => {
        const requestKey = String(request._id || request.requestId || "");
        const requestId = String(request.requestId || "").trim() || "-";
        const chatUnreadCount = unreadByRequestId.get(requestId) || 0;
        const caseInfos = request.caseInfos || {};
        const labName =
          String(request.requestor?.business || "").trim() ||
          String((request as { business?: { name?: string } }).business?.name || "").trim() ||
          "-";
        const contactName = String(request.requestor?.name || "").trim();
        const clinicName = String(caseInfos.clinicName || "").trim();
        const patientName = String(caseInfos.patientName || "").trim();
        const toothWorks = normalizeToothWorks(caseInfos.toothWorks);
        const toothPreview = formatToothWorksForDisplay(toothWorks);
        const prosthesisType = String(caseInfos.prosthesisType || "").trim();
        const memo = String(caseInfos.memo || "").replace(/\s+/g, " ").trim();
        const fileCount = countRequestFiles(request);

        const designPeerBusy = Boolean(
          request.designClaimPeerBusy ?? request.designClaimMeta?.peerBusy,
        );
        const designClaimMine = Boolean(
          request.designClaimMine ?? request.designClaimMeta?.mine,
        );
        const designClaimable = Boolean(
          !designPeerBusy &&
            !designClaimMine &&
            (request.designClaimClaimable ??
              request.designClaimMeta?.claimable ??
              true),
        );
        const designDeadlineMs = request.designClaim?.deadlineAt
          ? Date.parse(String(request.designClaim.deadlineAt))
          : NaN;
        const designRemainingMs = designClaimMine
          ? Number.isFinite(designDeadlineMs)
            ? Math.max(0, designDeadlineMs - claimTickMs)
            : Number(
                request.designClaimRemainingMs ??
                  request.designClaimMeta?.remainingMs ??
                  0,
              )
          : null;
        const designClaimWarn =
          designClaimMine &&
          designRemainingMs != null &&
          designRemainingMs <= 30 * 60 * 1000;
        const designClaimBusy = Boolean(designClaimBusyIds[String(request._id || "")]);
        const canApprove = designClaimMine && !designPeerBusy;

        let statusLabel = "준비";
        let statusVariant: "secondary" | "destructive" | "default" = "secondary";
        if (designPeerBusy) {
          statusLabel = "다른 디자이너 작업중";
          statusVariant = "destructive";
        } else if (designClaimMine) {
          statusLabel = designClaimWarn ? "마감 임박" : "작업중";
          statusVariant = "default";
        }

        return (
          <button
            key={requestKey}
            type="button"
            onClick={() => onOpen(request)}
            className="relative w-full rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-muted/20"
            data-transfer-card="true"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold truncate">{requestId}</span>
                {chatUnreadCount > 0 ? (
                  <Badge
                    variant="destructive"
                    className="h-5 min-w-5 justify-center px-1 text-[11px] leading-none"
                  >
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(request.createdAt)}
                </span>
                <Badge
                  variant={statusVariant}
                  className={cn(
                    "shrink-0 whitespace-nowrap",
                    designClaimMine && !designClaimWarn
                      ? "bg-primary-soft text-primary-strong hover:bg-primary-soft"
                      : "",
                    designClaimWarn
                      ? "bg-destructive-soft text-destructive hover:bg-destructive-soft"
                      : "",
                  )}
                >
                  {statusLabel}
                </Badge>
              </div>
            </div>

            <div className="mt-2 text-sm text-muted-foreground">
              기공소: {labName}
              {contactName ? ` · 담당자 ${contactName}` : ""}
              {clinicName ? ` · 치과 ${clinicName}` : ""}
              {patientName ? ` · 환자 ${patientName}` : ""}
            </div>

            <p className="mt-2 text-xs text-muted-foreground truncate pr-16">
              파일 {fileCount}개
              {toothPreview
                ? ` · 치아별 ${toothPreview}`
                : prosthesisType
                  ? ` · 형태 ${prosthesisType}`
                  : ""}
              {memo ? ` · 메모: ${memo}` : ""}
            </p>

            <div className="absolute bottom-3 right-3 flex items-center gap-1">
              {designClaimMine && designRemainingMs != null ? (
                <Badge
                  variant="outline"
                  className={`text-[11px] px-2 py-0.5 font-semibold ${
                    designClaimWarn
                      ? "border-destructive/80 bg-destructive-soft text-destructive"
                      : "border-primary-muted bg-primary-soft text-primary-strong"
                  }`}
                >
                  {designClaimWarn ? "마감 임박 · " : "작업중 · "}
                  {formatClaimRemaining(designRemainingMs)}
                </Badge>
              ) : null}
              {designClaimable && onDesignClaim ? (
                <span
                  role="button"
                  tabIndex={0}
                  className={`h-7 px-2 inline-flex items-center justify-center gap-1 rounded-md border bg-white text-primary-strong shadow-sm transition hover:bg-primary-soft ${
                    designClaimBusy ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (designClaimBusy) return;
                    onDesignClaim(request);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (designClaimBusy) return;
                    onDesignClaim(request);
                  }}
                  aria-label="수락"
                  title="이 디자인 작업을 수락합니다"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold">
                    {designClaimBusy ? "수락 중…" : "수락"}
                  </span>
                </span>
              ) : null}
              {onApprove && designClaimMine ? (
                <span
                  role="button"
                  tabIndex={0}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 ${
                    canApprove ? "" : "opacity-40 cursor-not-allowed"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canApprove) return;
                    onApprove(request);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canApprove) return;
                    onApprove(request);
                  }}
                  aria-label="승인"
                  title="완성 어벗 STL 업로드 후 제조사 생산으로 넘깁니다"
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
