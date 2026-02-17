export const MACHINING_SECTION_LABELS = {
  complete: "Complete",
  nowPlaying: "Now Playing",
  nextUp: "Next Up",
} as const;

export const formatElapsedMMSS = (elapsedSeconds?: number | null) => {
  const sec =
    typeof elapsedSeconds === "number" && elapsedSeconds >= 0
      ? Math.floor(elapsedSeconds)
      : null;
  if (sec == null) return "";
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export const formatHHMM = (d: Date | null) => {
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

export const formatDurationMMSS = (durationSeconds?: number | null) => {
  const sec =
    typeof durationSeconds === "number" && durationSeconds >= 0
      ? Math.floor(durationSeconds)
      : null;
  if (sec == null) return "-";
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export const buildLastCompletedSummary = (it?: {
  completedAt?: string | Date | null;
  durationSeconds?: number | null;
} | null) => {
  if (!it) return null;
  const completedAt = it.completedAt ? new Date(it.completedAt) : null;
  return {
    completedAtLabel: formatHHMM(completedAt),
    durationLabel: formatDurationMMSS(it.durationSeconds ?? null),
  };
};
