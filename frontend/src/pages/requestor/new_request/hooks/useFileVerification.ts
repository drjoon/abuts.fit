import { useMemo, useState } from "react";

type HighlightStep = "upload" | "details" | "shipping";

type Params = {
  files: File[];
};

export function useFileVerification({ files }: Params) {
  const [fileVerificationStatus, setFileVerificationStatus] = useState<
    Record<string, boolean>
  >({});
  const [highlightUnverifiedArrows, setHighlightUnverifiedArrows] =
    useState(false);

  const unverifiedCount = useMemo(
    () =>
      files.filter(
        (file) => !fileVerificationStatus[`${file.name}:${file.size}`]
      ).length,
    [files, fileVerificationStatus]
  );

  const highlightStep = useMemo<HighlightStep>(() => {
    if (!files.length) return "upload";
    if (unverifiedCount > 0) return "details";
    return "shipping";
  }, [files.length, unverifiedCount]);

  return {
    fileVerificationStatus,
    setFileVerificationStatus,
    highlightUnverifiedArrows,
    setHighlightUnverifiedArrows,
    unverifiedCount,
    highlightStep,
  };
}
