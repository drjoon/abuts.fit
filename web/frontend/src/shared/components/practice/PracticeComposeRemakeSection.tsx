/**
 * 주문(작성) 모달 — 리메이크 체크·6개월 내 원본 의뢰 선택.
 * 거래 기공소 전체에서 검색. 원본 기공소 ≠ 선택 기공소면 무료 리메이크 vs 유료 신규 선택.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/shared/components/practice/PracticeRemakeSearchDialog.tsx
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - docs/intent/practice-remake-lab-choice.md
 * change-log:
 * - 2026-11-23: 작업시작 전 원본은 리메이크 후보에서 제외(의뢰수정 경로).
 * - 2026-11-23: 연결 유지·원본 카드(환자·치아·원주문일·기공소). 거래 기공소 전체 검색.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  targetLabAnchorId: String(transfer.targetLabAnchorId || "").trim() || undefined,
  orderYmd: transfer.orderDate,
  manufacturerStage: transfer.status,
  withinRemakePricingWindow: true,
});

const isSameLabAsSelected = (
  source: PracticeSimilarCaseMatch,
  labAnchorId: string | null,
  labName: string,
) => {
  const selectedId = String(labAnchorId || "").trim();
  const sourceId = String(source.targetLabAnchorId || "").trim();
  if (selectedId && sourceId) return selectedId === sourceId;
  const selectedLabel = normalizeLabLabel(labName);
  const sourceLabel = normalizeLabLabel(source.targetLabName || "");
  if (selectedLabel && sourceLabel) return selectedLabel === sourceLabel;
  return true;
};

const LinkedSourceInfoCard = ({
  source,
  feeLabel,
}: {
  source: PracticeSimilarCaseMatch;
  feeLabel: string;
}) => {
  const teeth =
    Array.isArray(source.toothNumbers) && source.toothNumbers.length
      ? source.toothNumbers.join(", ")
      : "—";
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "환자",
      value: String(source.patientName || "").trim() || "—",
    },
    { label: "치아", value: teeth },
    {
      label: "원주문일",
      value: String(source.orderYmd || "").trim() || "—",
    },
    {
      label: "기공소",
      value: String(source.targetLabName || "").trim() || "—",
    },
    { label: "리메이크비", value: feeLabel },
  ];
  return (
    <div className="rounded-md border border-amber-300 bg-white px-2.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-amber-900">연결 원본</p>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {toStatusBadgeLabel(source.manufacturerStage || "")}
        </Badge>
      </div>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 truncate font-medium text-slate-900">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export type PracticeComposeRemakeSectionProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  patientName: string;
  labAnchorId: string | null;
  labName: string;
  linkedSource: PracticeSimilarCaseMatch | null;
  onLinkedSourceChange: (source: PracticeSimilarCaseMatch | null) => void;
  /** 원래 기공소 — 기공소를 원본 쪽으로 바꾸고 원본 연결 · 무료 리메이크 */
  onSwitchToSourceLab: (source: PracticeSimilarCaseMatch) => void;
  /** 새 기공소 — 리메이크 OFF · 일반 신규(유료) */
  onChooseNewLabPaid: () => void;
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
  onSwitchToSourceLab,
  onChooseNewLabPaid,
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
  /** 원본 기공소 ≠ 선택 기공소 — 무료 리메이크 vs 유료 신규 대기 */
  const [pendingLabChoice, setPendingLabChoice] =
    useState<PracticeSimilarCaseMatch | null>(null);
  const searchGenRef = useRef(0);
  const linkedIdRef = useRef("");
  linkedIdRef.current = String(linkedSource?._id || "").trim();

  const normalizedPatient = useMemo(
    () => String(patientName || "").trim().normalize("NFC"),
    [patientName],
  );
  const patientReady = /[가-힣]/.test(normalizedPatient);

  const applyCandidate = (transfer: PracticeRecentTransferItem) => {
    const match = toSimilarCaseMatch(transfer);
    if (isSameLabAsSelected(match, labAnchorId, labName)) {
      setPendingLabChoice(null);
      onLinkedSourceChange(match);
      onPickRequiredChange?.(false);
      return;
    }
    setPendingLabChoice(match);
    onLinkedSourceChange(null);
    onPickRequiredChange?.(true);
  };

  useEffect(() => {
    if (!checked) {
      setCandidates([]);
      setSearching(false);
      setSearchError("");
      setPendingLabChoice(null);
      onPickRequiredChange?.(false);
      return;
    }
    if (!authToken || !patientReady) {
      setCandidates([]);
      setSearching(false);
      setSearchError("");
      setPendingLabChoice(null);
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
            setPendingLabChoice(null);
            setSearchError(String(body.message || "검색에 실패했습니다."));
            // 이미 고른 원본(유사의뢰 확인 등)은 검색 실패로 지우지 않는다.
            onPickRequiredChange?.(!linkedIdRef.current);
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
          const excludeId = String(excludeTransferMongoId || "").trim();
          const filtered = grouped
            .filter((t) => canRemakePracticeTransferByStatus(t.status))
            .filter((t) => {
              if (!excludeId) return true;
              return transferKey(t) !== excludeId;
            });
          setCandidates(filtered);
          const linkedId = linkedIdRef.current;
          if (filtered.length === 1 && !linkedId) {
            applyCandidate(filtered[0]);
          } else if (filtered.length === 0) {
            setPendingLabChoice(null);
            // 유사의뢰·수동으로 이미 연결한 원본은 유지(작업시작 전 원본 포함).
            if (!linkedId) {
              onLinkedSourceChange(null);
              onPickRequiredChange?.(false);
            } else {
              onPickRequiredChange?.(false);
            }
          } else {
            const stillValid = Boolean(
              linkedId && filtered.some((t) => transferKey(t) === linkedId),
            );
            if (linkedId && stillValid) {
              onPickRequiredChange?.(false);
            } else if (linkedId && !stillValid) {
              // 목록에 없어도 연결은 유지(검색 창·필터와 무관하게 확정된 원본).
              onPickRequiredChange?.(false);
            } else {
              setPendingLabChoice(null);
              onLinkedSourceChange(null);
              onPickRequiredChange?.(true);
            }
          }
        } catch {
          if (searchGenRef.current !== gen) return;
          setCandidates([]);
          setPendingLabChoice(null);
          setSearchError("검색에 실패했습니다.");
          onPickRequiredChange?.(!linkedIdRef.current);
        } finally {
          if (searchGenRef.current === gen) setSearching(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 환자·체크·제외 id만 재조회
  }, [
    authToken,
    checked,
    normalizedPatient,
    onLinkedSourceChange,
    onPickRequiredChange,
    patientReady,
    excludeTransferMongoId,
  ]);

  const selectedId = String(linkedSource?._id || "").trim();
  const pendingId = String(pendingLabChoice?._id || "").trim();
  const linkedFeeLabel = (() => {
    if (!linkedSource) return "무료";
    const row = candidates.find((t) => transferKey(t) === selectedId);
    const fee = Math.max(
      0,
      Math.round(
        Number(
          row?.remakeFeeQuote?.total || row?.remakeFeeQuote?.labFeeTotal || 0,
        ),
      ),
    );
    return fee > 0 ? formatManWon(fee) : "무료";
  })();
  const prePlatform =
    checked &&
    patientReady &&
    !searching &&
    !searchError &&
    candidates.length === 0 &&
    !linkedSource &&
    !pendingLabChoice;

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
              ? "최근 6개월 · 같은 환자·치과 의뢰를 거래 기공소에서 검색합니다."
              : "이전에 받은 보철·어벗을 다시 의뢰할 때 선택하세요."}
          </p>
        </span>
      </label>

      {checked ? (
        <div className="mt-2.5 space-y-2 border-t border-amber-200/80 pt-2.5">
          {!patientReady ? (
            <p className="text-xs text-muted-foreground">
              환자명을 입력해 주세요.
            </p>
          ) : searching ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              최근 의뢰 검색 중…
            </p>
          ) : searchError ? (
            <>
              <p className="text-xs text-destructive">{searchError}</p>
              {linkedSource ? (
                <LinkedSourceInfoCard
                  source={linkedSource}
                  feeLabel={linkedFeeLabel}
                />
              ) : null}
            </>
          ) : prePlatform ? (
            <p className="text-xs leading-snug text-muted-foreground">
              6개월 내 의뢰 없음: {PRE_PLATFORM_REMAKE_PRACTICE_SEND_HINT}
            </p>
          ) : (
            <>
              {candidates.length > 0 ? (
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
                        resolvePracticeTransferListToothNumbers(transfer) ||
                        "—";
                      const labLabel =
                        String(transfer.targetLab || "").trim() || "기공소";
                      const orderYmd = String(transfer.orderDate || "").trim();
                      const active =
                        key === selectedId ||
                        (Boolean(pendingId) && key === pendingId);
                      return (
                        <button
                          key={key || transfer.transferId}
                          type="button"
                          onClick={() => applyCandidate(transfer)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                            active
                              ? "border-amber-400 bg-white shadow-sm"
                              : "border-transparent bg-white/60 hover:bg-white",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                              {patient}
                              <span className="ml-1 font-normal text-muted-foreground">
                                {teeth}
                              </span>
                            </span>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              {toStatusBadgeLabel(transfer.status)}
                            </Badge>
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {labLabel}
                            {orderYmd ? ` · ${orderYmd}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {pendingLabChoice ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-white px-2.5 py-2.5">
                  <p className="text-xs font-medium text-amber-950">
                    원 기공소와 지금 고른 기공소가 다릅니다.
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    원 기공소:{" "}
                    {String(pendingLabChoice.targetLabName || "").trim() || "—"}
                    <br />
                    원주문일:{" "}
                    {String(pendingLabChoice.orderYmd || "").trim() || "—"}
                  </p>
                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 flex-1 bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => {
                        const source = pendingLabChoice;
                        setPendingLabChoice(null);
                        onSwitchToSourceLab(source);
                        onPickRequiredChange?.(false);
                      }}
                    >
                      원래 기공소
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1"
                      onClick={() => {
                        setPendingLabChoice(null);
                        onChooseNewLabPaid();
                      }}
                    >
                      새 기공소
                    </Button>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    원래 기공소는 무료 리메이크입니다.
                    <br />
                    새 기공소는 일반 신규 의뢰(유료)입니다.
                  </p>
                </div>
              ) : linkedSource ? (
                <LinkedSourceInfoCard
                  source={linkedSource}
                  feeLabel={linkedFeeLabel}
                />
              ) : candidates.length > 1 ? (
                <p className="text-xs font-medium text-amber-800">
                  원본 의뢰를 선택해 주세요.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
