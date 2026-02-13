import { Pause, Play } from "lucide-react";

type Props = {
  paused: boolean;
  running?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
};

export const CncCirclePlayPauseButton = ({
  paused,
  running,
  disabled,
  onClick,
  title,
  className,
}: Props) => {
  return (
    <button
      type="button"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-40 ${
        running ? "animate-pulse" : ""
      } ${className || ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
    </button>
  );
};
