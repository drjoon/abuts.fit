// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/useLotServerWatch.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - bg/pc2/lot-server/public/index.html
// change-log:
// - 2026-11-26: 라이브 뷰·3글자 입력·감시/초점/수동인식·오인식 대응 버튼.
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";

const PHASE_KO: Record<string, string> = {
  idle: "대기",
  moving: "움직임",
  stable: "정지·초점",
  focusing: "초점",
  ocr: "OCR",
  hold: "인식 유지",
  error: "오류",
};

export function PackingLotStation({
  liveUrl,
  running,
  reachable,
  busy,
  phase,
  lastLot,
  error,
  suffix,
  onSuffixChange,
  matchNote,
  matchingBusy,
  onStartWatch,
  onStopWatch,
  onFocus,
  onRecognize,
  onSubmitSuffix,
  onRetryRecognize,
  onClearSuffix,
  onBindSelected,
  hasSelectedCard,
}: {
  liveUrl: string;
  running: boolean;
  reachable: boolean;
  busy: boolean;
  phase: string;
  lastLot: string;
  error: string;
  suffix: string;
  onSuffixChange: (value: string) => void;
  matchNote: "" | "miss" | "ambiguous" | "error" | "ok";
  matchingBusy: boolean;
  onStartWatch: () => void;
  onStopWatch: () => void;
  onFocus: () => void;
  onRecognize: () => void;
  onSubmitSuffix: () => void;
  onRetryRecognize: () => void;
  onClearSuffix: () => void;
  onBindSelected?: () => void;
  hasSelectedCard?: boolean;
}) {
  const phaseLabel = PHASE_KO[phase] || phase || "—";
  const controlsDisabled = busy || matchingBusy;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)]">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-950">
        {liveUrl ? (
          <img
            src={liveUrl}
            alt="현미경 라이브"
            className="aspect-[4/3] w-full object-contain"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center px-4 text-center text-sm text-stone-400">
            {reachable
              ? "감시 시작을 누르면 라이브가 표시됩니다."
              : "lot-server(8012)에 연결되지 않았습니다."}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {running ? (
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onStopWatch}
              className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
            >
              감시 종료
            </button>
          ) : (
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onStartWatch}
              className="inline-flex h-8 items-center rounded-lg bg-stone-900 px-2.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              감시 시작
            </button>
          )}
          <button
            type="button"
            disabled={controlsDisabled || !running}
            onClick={onFocus}
            className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            초점
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={onRecognize}
            className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            수동 인식
          </button>
        </div>

        <div className="text-[11px] text-stone-500">
          {reachable ? (
            <>
              {running ? "감시 중" : "중지"} · {phaseLabel}
              {lastLot ? ` · 최근 ${lastLot}` : ""}
            </>
          ) : (
            "lot-server 미연결"
          )}
        </div>

        <label className="text-[11px] font-semibold text-stone-600">
          각인 코드
        </label>
        <Input
          value={suffix}
          onChange={(e) => {
            const next = String(e.target.value || "")
              .toUpperCase()
              .replace(/[^A-Z]/g, "")
              .slice(0, 3);
            onSuffixChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suffix.length === 3) {
              e.preventDefault();
              onSubmitSuffix();
            }
          }}
          placeholder="ABC"
          maxLength={3}
          autoComplete="off"
          spellCheck={false}
          className="h-12 max-w-[10rem] font-mono text-2xl tracking-[0.35em] uppercase"
          aria-label="각인 코드 3글자"
        />

        <div
          className={cn(
            "min-h-[2.5rem] text-[11px] leading-snug text-stone-600",
            matchNote === "ok" && "text-primary-strong",
            (matchNote === "miss" ||
              matchNote === "ambiguous" ||
              matchNote === "error" ||
              error) &&
              "text-destructive",
          )}
        >
          {matchingBusy ? (
            "매칭 중…"
          ) : matchNote === "miss" ? (
            <>
              대기 목록에 없습니다.
              <br />
              코드를 고치거나 다시 인식하세요.
            </>
          ) : matchNote === "ambiguous" ? (
            <>
              같은 코드가 여러 건입니다.
              <br />
              아래 카드를 눌러 지정하세요.
            </>
          ) : matchNote === "error" ? (
            "매칭에 실패했습니다."
          ) : matchNote === "ok" ? (
            "포장.발송으로 이동했습니다."
          ) : error ? (
            error
          ) : (
            "어벗을 대면 자동 인식됩니다."
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={controlsDisabled || suffix.length !== 3}
            onClick={onSubmitSuffix}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            코드로 매칭
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={onRetryRecognize}
            className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            다시 인식
          </button>
          <button
            type="button"
            disabled={controlsDisabled || !suffix}
            onClick={onClearSuffix}
            className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            입력 지우기
          </button>
          {hasSelectedCard && onBindSelected ? (
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onBindSelected}
              className="inline-flex h-8 items-center rounded-lg border border-stone-900 bg-white px-2.5 text-xs font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-50"
            >
              선택 카드로 확정
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
