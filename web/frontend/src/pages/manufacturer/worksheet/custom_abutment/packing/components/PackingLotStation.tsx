// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/useLotServerWatch.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - bg/pc2/lot-server/public/index.html
// change-log:
// - 2026-11-26: 라이브를 우측 패널에 늘리지 않고 h-36~40으로 맞춤.
// - 2026-11-26: 라이브 높이 축소·우측 패널 구역 정리. 대기 카드가 한 화면에 보이게.
// - 2026-11-26: 라이브 뷰·3글자 입력·감시/초점/수동인식·오인식 대응 버튼.
import type { ReactNode } from "react";
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

const btnBase =
  "inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50";
const btnGhost = `${btnBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-100`;
const btnDark = `${btnBase} bg-stone-900 text-white hover:bg-stone-800`;
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;

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
  const statusLine = !reachable
    ? "lot-server 미연결"
    : [
        running ? "감시 중" : "중지",
        phaseLabel,
        lastLot ? `최근 ${lastLot}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const noteClass = cn(
    "text-[11px] leading-snug text-stone-600",
    matchNote === "ok" && "text-primary-strong",
    (matchNote === "miss" ||
      matchNote === "ambiguous" ||
      matchNote === "error" ||
      error) &&
      "text-destructive",
  );

  let note: ReactNode = "어벗을 대면 자동 인식됩니다.";
  if (matchingBusy) note = "매칭 중…";
  else if (matchNote === "miss")
    note = (
      <>
        대기 목록에 없습니다.
        <br />
        코드를 고치거나 다시 인식하세요.
      </>
    );
  else if (matchNote === "ambiguous")
    note = (
      <>
        같은 코드가 여러 건입니다.
        <br />
        아래 카드를 눌러 지정하세요.
      </>
    );
  else if (matchNote === "error") note = "매칭에 실패했습니다.";
  else if (matchNote === "ok") note = "포장.발송으로 이동했습니다.";
  else if (error) note = error;

  return (
    <div className="grid shrink-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16.5rem,17.5rem)] lg:items-start">
      <div className="flex h-36 max-h-[40vh] w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-950 sm:h-40">
        {liveUrl ? (
          <img
            src={liveUrl}
            alt="현미경 라이브"
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="px-4 text-center text-sm text-stone-400">
            {reachable
              ? "감시 시작을 누르면 라이브가 표시됩니다."
              : "lot-server(8012)에 연결되지 않았습니다."}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
        <section className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-stone-600">감시</span>
            <span
              className={cn(
                "truncate text-[10px] tabular-nums",
                reachable ? "text-stone-500" : "text-destructive",
              )}
              title={statusLine}
            >
              {statusLine}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {running ? (
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={onStopWatch}
                className={btnGhost}
              >
                종료
              </button>
            ) : (
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={onStartWatch}
                className={btnDark}
              >
                시작
              </button>
            )}
            <button
              type="button"
              disabled={controlsDisabled || !running}
              onClick={onFocus}
              className={btnGhost}
            >
              초점
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onRecognize}
              className={btnGhost}
            >
              수동 인식
            </button>
          </div>
        </section>

        <section className="space-y-1 border-t border-stone-200/80 pt-1.5">
          <label
            htmlFor="packing-lot-suffix"
            className="text-[11px] font-semibold text-stone-600"
          >
            각인 코드
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="packing-lot-suffix"
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
              className="h-10 max-w-[9rem] font-mono text-lg tracking-[0.28em] uppercase"
              aria-label="각인 코드 3글자"
            />
            <button
              type="button"
              disabled={controlsDisabled || suffix.length !== 3}
              onClick={onSubmitSuffix}
              className={cn(btnPrimary, "min-w-[4.75rem] flex-1")}
            >
              매칭
            </button>
          </div>
          <p className={cn(noteClass, "min-h-[1.25rem]")}>{note}</p>
        </section>

        <section className="space-y-1 border-t border-stone-200/80 pt-1.5">
          <span className="text-[11px] font-semibold text-stone-600">
            오인식 대응
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={onRetryRecognize}
              className={btnGhost}
            >
              다시 인식
            </button>
            <button
              type="button"
              disabled={controlsDisabled || !suffix}
              onClick={onClearSuffix}
              className={btnGhost}
            >
              입력 지우기
            </button>
            {hasSelectedCard && onBindSelected ? (
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={onBindSelected}
                className={cn(btnGhost, "col-span-2 border-stone-900 text-stone-900")}
              >
                선택 카드로 확정
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
