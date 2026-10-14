/**
 * 주문(작성) 모달 — 리메이크 체크·6개월 내 원본 의뢰 선택.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/components/practice/PracticeRemakeSearchDialog.tsx
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/shared/ui/cn";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  canRemakePracticeTransferByStatus,
  groupPracticeRecentRequests,
  mapMyPracticeTransferApiRows,
  toStatusBadgeLabel,
  type PracticeRecentTransferItem,
} from "@/shared/practice/practiceRecentTransferList";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import { formatManWon } from "@/shared/practice/practiceTransferFeeQuote";
import { PRE_PLATFORM_REMAKE_PRACTICE_SEND_HINT } from "@/shared/practice/practiceTransferLabReceive";
import type { PracticeSimilarCaseMatch } from "@/shared/components/practice/PracticeSimilarCaseRemakeDialog";

const REMAKE_RECENT_DAYS = 180;

const transferKey = (transfer: PracticeRecentTransferItem) =>
  String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();

const normalizeLabLabel = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const toSimilarCaseMatch = (
  transfer: PracticeRecentTransferItem,
): PracticeSimilarCaseMatch => ({
  _id: transferKey(transfer),
  transferId: String(transfer.transferId || "").trim(),
  patientName: resolvePracticeTransferListPatientName(transfer) || "",
  toothNumbers: resolvePracticeTransferListToothNumbers(transfer)
    .split(/[,·\s]+/)
    .map((t) => t.trim())
    .filter(Boolean),
  targetLabName: String(transfer.targetLab || "").trim(),
  orderYmd: transfer.orderDate,
  manufacturerStage: transfer.status,
  withinRemakePricingWindow: true,
});

export type PracticeComposeRemakeSectionProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  patientName: string;
  labAnchorId: string | null;
  labName: string;
  linkedSource: PracticeSimilarCaseMatch | null;
  onLinkedSourceChange: (source: PracticeSimilarCaseMatch | null) => void;
  onPickRequiredChange?: (required: boolean) => void;
  guideTourRemake?: boolean;
  /** 의뢰 수정 중 — 자기 자신은 원본 후보에서 제외 */
  excludeTransferMongoId?: string;
};

export function PracticeComposeRemakeSection({
  checked,
  onCheckedChange,
  disabled = false,
  patientName,
  labAnchorId,
  labName,
  linkedSource,
  onLinkedSourceChange,
  onPickRequiredChange,
  guideTourRemake = false,
  excludeTransferMongoId = "",
}: PracticeComposeRemakeSectionProps) {
  const authToken = useAuthStore((s) => s.token);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [candidates, setCandidates] = useState<PracticeRecentTransferItem[]>(
    [],
  );
  const searchGenRef = useRef(0);
  const linkedIdRef = useRef("");
  linkedIdRef.current = String(linkedSource?._id || "").trim();

  const normalizedPatient = useMemo(
    () => String(patientName || "").trim().normalize("NFC"),
    [patientName],
  );
  const patientReady = /[가-힣]/.test(normalizedPatient);
  const labReady = Boolean(String(labAnchorId || labName || "").trim());

  useEffect(() => {
    if (!checked) {
      setCandidates([]);
      setSearching(false);
      setSearchError("");
      onPickRequiredChange?.(false);
      return;
    }
    if (!authToken || !patientReady || !labReady) {
      setCandidates([]);
      setSearching(false);
      setSearchError("");
      onPickRequiredChange?.(false);
      return;
    }

    const gen = ++searchGenRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        setSearchError("");
        try {
          const qs = new URLSearchParams({
            limit: "30",
            days: String(REMAKE_RECENT_DAYS),
            q: normalizedPatient,
          });
          const res = await apiFetch<unknown>({
            path: `/api/practice/transfers/remake-candidates?${qs}`,
            method: "GET",
            token: authToken,
          });
          if (searchGenRef.current !== gen) return;
          if (!res.ok) {
            const body =
              res.data && typeof res.data === "object"
                ? (res.data as { message?: string })
                : {};
            setCandidates([]);
            setSearchError(String(body.message || "검색에 실패했습니다."));
            onLinkedSourceChange(null);
            onPickRequiredChange?.(false);
            return;
          }
          const body = res.data;
          const data =
            body &&
            typeof body === "object" &&
            "data" in (body as Record<string, unknown>)
              ? (body as { data?: unknown }).data
              : body;
          const list =
            data &&
            typeof data === "object" &&
            Array.isArray((data as { requests?: unknown }).requests)
              ? ((data as { requests: unknown[] }).requests ?? [])
              : [];
          const mapped = mapMyPracticeTransferApiRows(list);
          const grouped = groupPracticeRecentRequests(mapped, []);
          const labId = String(labAnchorId || "").trim();
          const labLabel = normalizeLabLabel(labName);
          const excludeId = String(excludeTransferMongoId || "").trim();
          const filtered = grouped
            .filter((t) => canRemakePracticeTransferByStatus(t.status))
            .filter((t) => {
              if (!excludeId) return true;
              return transferKey(t) !== excludeId;
            })
            .filter((t) => {
              const anchor = String(t.targetLabAnchorId || "").trim();
              if (labId && anchor) return anchor === labId;
              if (labLabel) {
                return normalizeLabLabel(t.targetLab || "") === labLabel;
              }
              return true;
            });
          setCandidates(filtered);
          if (filtered.length === 1) {
            onLinkedSourceChange(toSimilarCaseMatch(filtered[0]));
            onPickRequiredChange?.(false);
          } else if (filtered.length === 0) {
            onLinkedSourceChange(null);
            onPickRequiredChange?.(false);
          } else {
            const linkedId = linkedIdRef.current;
            const stillValid =
              linkedId && filtered.some((t) => transferKey(t) === linkedId);
            if (!stillValid) onLinkedSourceChange(null);
            onPickRequiredChange?.(true);
          }
        } catch {
          if (searchGenRef.current !== gen) return;
          setCandidates([]);
          setSearchError("검색에 실패했습니다.");
          onLinkedSourceChange(null);
          onPickRequiredChange?.(false);
        } finally {
          if (searchGenRef.current === gen) setSearching(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    authToken,
    checked,
    labAnchorId,
    labName,
    labReady,
    normalizedPatient,
    onLinkedSourceChange,
    onPickRequiredChange,
    patientReady,
    excludeTransferMongoId,
  ]);

  const selectedId = String(linkedSource?._id || "").trim();
  const prePlatform =
    checked &&
    patientReady &&
    labReady &&
    !searching &&
    !searchError &&
    candidates.length === 0;

  return (
    <div
      className={cn(
        "mb-3 rounded-lg border px-3 py-2.5",
        checked
          ? "border-amber-300 bg-amber-50/80"
          : "border-slate-200 bg-slate-50/60",
      )}
      {...(guideTourRemake ? { "data-guide-tour": "practice_remake" } : {})}
    >
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          className="mt-0.5"
          aria-label="리메이크"
        />
        <span className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-muted-foreground">
            <Repeat
              className="mr-1 inline h-3.5 w-3.5 shrink-0 -translate-y-px text-amber-700"
              aria-hidden
            />
            <span className="font-semibold text-slate-900">리메이크.</span>{" "}
            {checked
              ? "최근 6개월 · 같은 환자·치과·기공소 의뢰를 검색합니다."
              : "이전에 받은 보철·어벗을 다시 의뢰할 때 선택하세요."}
          </p>
        </span>
      </label>

      {checked ? (
        <div className="mt-2.5 space-y-2 border-t border-amber-200/80 pt-2.5">
          {!patientReady || !labReady ? (
            <p className="text-xs text-muted-foreground">
              {!labReady ? "기공소를 선택해 주세요." : "환자명을 입력해 주세요."}
            </p>
          ) : searching ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              최근 의뢰 검색 중…
            </p>
          ) : searchError ? (
            <p className="text-xs text-destructive">{searchError}</p>
          ) : prePlatform ? (
            <p className="text-xs leading-snug text-muted-foreground">
              6개월 내 의뢰 없음: {PRE_PLATFORM_REMAKE_PRACTICE_SEND_HINT}
            </p>
          ) : candidates.length > 0 ? (
            <>
              <p className="text-[11px] font-medium text-amber-900">
                연결할 원본 의뢰
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto px-0.5 py-0.5">
                {candidates.map((transfer) => {
                  const key = transferKey(transfer);
                  const patient =
                    resolvePracticeTransferListPatientName(transfer) || "—";
                  const teeth =
                    resolvePracticeTransferListToothNumbers(transfer) || "—";
                  const active = key === selectedId;
                  return (
                    <button
                      key={key || transfer.transferId}
                      type="button"
                      onClick={() =>
                        onLinkedSourceChange(toSimilarCaseMatch(transfer))
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                        active
                          ? "border-amber-400 bg-white shadow-sm"
                          : "border-transparent bg-white/60 hover:bg-white",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {patient}
                        <span className="ml-1 font-normal text-muted-foreground">
                          {teeth}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {toStatusBadgeLabel(transfer.status)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              {!selectedId && candidates.length > 1 ? (
                <p className="text-xs font-medium text-amber-800">
                  원본 의뢰를 선택해 주세요.
                </p>
              ) : linkedSource ? (
                (() => {
                  const row = candidates.find((t) => transferKey(t) === selectedId);
                  const fee = Math.max(
                    0,
                    Math.round(
                      Number(
                        row?.remakeFeeQuote?.total ||
                          row?.remakeFeeQuote?.labFeeTotal ||
                          0,
                      ),
                    ),
                  );
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      원의뢰{" "}
                      {linkedSource.transferId || linkedSource.orderYmd || ""}{" "}
                      연결 · 리메이크 기공비{" "}
                      {fee > 0 ? formatManWon(fee) : "무료"}
                    </p>
                  );
                })()
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
