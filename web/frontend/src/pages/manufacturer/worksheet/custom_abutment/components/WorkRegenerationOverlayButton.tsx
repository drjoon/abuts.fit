// STL/Rhino/CAM 생성 중 카드 오버레이 — 상태 뱃지+중지를 단일 버튼으로 통합.

type WorkRegenerationOverlayButtonProps = {
  /** 짧은 작업명: Rhino · STL · CAM */
  workLabel: string;
  cancelling?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
};

const pillClass =
  "rounded-full border border-primary/35 bg-primary-soft/70 px-3 py-1.5 text-sm font-extrabold text-primary-strong";

const actionClass =
  "rounded-full border border-slate-400/40 bg-white/75 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-white/85 disabled:opacity-50 cursor-pointer";

export function WorkRegenerationOverlayButton({
  workLabel,
  cancelling = false,
  disabled = false,
  onCancel,
}: WorkRegenerationOverlayButtonProps) {
  const label = String(workLabel || "").trim() || "작업";

  if (!onCancel) {
    return (
      <span className={pillClass} role="status">
        {label} 생성 중
      </span>
    );
  }

  const busy = cancelling || disabled;
  const buttonLabel = cancelling ? "중지 중…" : `${label} 생성 중지`;

  return (
    <button
      type="button"
      className={actionClass}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy) return;
        onCancel();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      title={buttonLabel}
      aria-label={`${label} 생성 중 — ${cancelling ? "중지 처리 중" : "중지"}`}
    >
      {buttonLabel}
    </button>
  );
}
