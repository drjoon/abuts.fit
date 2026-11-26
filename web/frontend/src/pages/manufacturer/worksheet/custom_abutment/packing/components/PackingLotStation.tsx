// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/hooks/useLotServerWatch.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/src/camera.js
// change-log:
// - 2026-11-26: 라이브를 감시 패널 안·크게. 각인코드는 상단 버튼 오른쪽.
// - 2026-11-26: 라이브뷰 ResizeObserver contain(640×480 4:3). cqw 붕괴로 사라짐 복구.
// - 2026-11-26: 라이브뷰를 현미경 640×480(4:3) contain — h-full로 세로 늘어남 방지.
// - 2026-11-26: 작업영역 높이 안에 라이브·패널(vh 고정 제거). 간격 축소.
// - 2026-11-26: 라이브 확대(비율 유지). 각인코드는 카드 선택만. 오인식 대응 제거.
// - 2026-11-26: 라이브를 실제 카메라 비율(기본 4:3·프레임 natural size)로. 가로 1fr 검은 박스 제거.
// - 2026-11-26: 라이브를 우측 패널에 늘리지 않고 h-36~40으로 맞춤.
// - 2026-11-26: 라이브 높이 축소·우측 패널 구역 정리. 대기 카드가 한 화면에 보이게.
// - 2026-11-26: 라이브 뷰·3글자 입력·감시/초점/수동인식·오인식 대응 버튼.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/** lot-server 기본 캡처 프로필(640×480) → width/height. */
const DEFAULT_LIVE_RATIO = 4 / 3;

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

function fitContain(areaW: number, areaH: number, ratio: number) {
  if (!(areaW > 0 && areaH > 0 && ratio > 0)) {
    return { width: 0, height: 0 };
  }
  let width = areaW;
  let height = width / ratio;
  if (height > areaH) {
    height = areaH;
    width = height * ratio;
  }
  return { width, height };
}

export function PackingLotStation({
  liveUrl,
  running,
  reachable,
  busy,
  phase,
  lastLot,
  error,
  suffix,
  matchNote,
  matchingBusy,
  onStartWatch,
  onStopWatch,
  onFocus,
  onRecognize,
  onSubmitSuffix,
  onPrintSingle,
  printingBusy,
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
  matchNote: "" | "miss" | "ambiguous" | "error" | "ok";
  matchingBusy: boolean;
  onStartWatch: () => void;
  onStopWatch: () => void;
  onFocus: () => void;
  onRecognize: () => void;
  onSubmitSuffix: () => void;
  onPrintSingle?: () => void;
  printingBusy?: boolean;
  hasSelectedCard?: boolean;
}) {
  const [liveRatio, setLiveRatio] = useState(DEFAULT_LIVE_RATIO);
  const [liveBox, setLiveBox] = useState({ width: 0, height: 0 });
  const liveAreaRef = useRef<HTMLDivElement | null>(null);
  const phaseLabel = PHASE_KO[phase] || phase || "—";
  const controlsDisabled = busy || matchingBusy || Boolean(printingBusy);
  const canMatch = suffix.length === 3 || Boolean(hasSelectedCard);
  const canPrintSingle = Boolean(onPrintSingle) && canMatch;
  const statusLine = !reachable
    ? "lot-server 미연결"
    : [
        running ? "감시 중" : "중지",
        phaseLabel,
        lastLot ? `최근 ${lastLot}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  useEffect(() => {
    if (!liveUrl) setLiveRatio(DEFAULT_LIVE_RATIO);
  }, [liveUrl]);

  useEffect(() => {
    const el = liveAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      setLiveBox(fitContain(rect.width, rect.height, liveRatio));
    };
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, [liveRatio]);

  const noteClass = cn(
    "text-[11px] leading-snug text-stone-600",
    matchNote === "ok" && "text-primary-strong",
    (matchNote === "miss" ||
      matchNote === "ambiguous" ||
      matchNote === "error" ||
      error) &&
      "text-destructive",
  );

  let note: ReactNode = null;
  if (matchingBusy) note = "매칭 중…";
  else if (matchNote === "miss")
    note = (
      <>
        대기 목록에 없습니다.
        <br />
        오른쪽 카드를 눌러 선택하세요.
      </>
    );
  else if (matchNote === "ambiguous")
    note = (
      <>
        같은 코드가 여러 건입니다.
        <br />
        오른쪽 카드를 눌러 지정하세요.
      </>
    );
  else if (matchNote === "error") note = "매칭에 실패했습니다.";
  else if (matchNote === "ok") note = "포장.발송으로 이동했습니다.";
  else if (error) note = error;

  const liveVisible = liveBox.width > 1 && liveBox.height > 1;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <section className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-1.5">
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

        <section className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-none">
          <span className="text-[11px] font-semibold text-stone-600">
            각인 코드
          </span>
          <div
            className={cn(
              "flex h-8 min-w-[7.5rem] items-center rounded-md border border-stone-300 bg-white px-2.5 font-mono text-base tracking-[0.28em] uppercase",
              suffix ? "text-stone-900" : "text-stone-400",
            )}
            aria-label="선택된 각인 코드"
          >
            {suffix || "—"}
          </div>
          <button
            type="button"
            disabled={controlsDisabled || !canMatch}
            onClick={onSubmitSuffix}
            className={cn(btnPrimary, "min-w-[4.25rem]")}
          >
            매칭
          </button>
          {onPrintSingle ? (
            <button
              type="button"
              disabled={controlsDisabled || !canPrintSingle}
              onClick={onPrintSingle}
              className={btnGhost}
            >
              {printingBusy ? "프린트 중…" : "프린트"}
            </button>
          ) : null}
          {note ? (
            <p
              className={cn(
                noteClass,
                "w-full text-right sm:w-auto sm:max-w-[14rem] sm:text-left",
              )}
            >
              {note}
            </p>
          ) : null}
        </section>
      </div>

      <div
        ref={liveAreaRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      >
        <div
          className="flex items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-950"
          style={
            liveVisible
              ? { width: liveBox.width, height: liveBox.height }
              : {
                  width: "100%",
                  aspectRatio: String(liveRatio),
                  maxHeight: "100%",
                }
          }
        >
          {liveUrl ? (
            <img
              src={liveUrl}
              alt="현미경 라이브"
              className="h-full w-full object-contain"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w > 0 && h > 0) setLiveRatio(w / h);
              }}
            />
          ) : (
            <p className="px-4 text-center text-sm text-stone-400">
              {reachable
                ? "감시 시작을 누르면 라이브가 표시됩니다."
                : "lot-server(8012)에 연결되지 않았습니다."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
