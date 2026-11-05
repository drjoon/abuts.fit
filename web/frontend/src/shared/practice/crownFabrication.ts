import { useCallback, useEffect, useRef, useState } from "react";

export type CrownFabrication = "scan" | "impression";

export function parseCrownFabrication(value: unknown): CrownFabrication | null {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "scan" || raw === "impression") return raw;
  return null;
}

/**
 * 신규의뢰 스캔/인상.
 * 스캔 파일을 올리면 스캔으로 맞춘다. 파일을 빼도 인상으로 되돌리지 않는다.
 * 저장된 선택이 없을 때만, 이미 있는 스캔 파일로 스캔을 채운다.
 */
export function useCrownFabricationChoice(
  scanDataAttached: boolean,
  hydrated = true,
) {
  const [value, setValue] = useState<CrownFabrication>("impression");
  const touchedRef = useRef(false);

  const setChoice = useCallback((next: CrownFabrication) => {
    touchedRef.current = true;
    setValue(next);
  }, []);

  const onScanModelFilesAdded = useCallback(() => {
    touchedRef.current = true;
    setValue("scan");
  }, []);

  const restoreChoice = useCallback((next: CrownFabrication | null) => {
    if (next) {
      touchedRef.current = true;
      setValue(next);
      return;
    }
    touchedRef.current = false;
    setValue("impression");
  }, []);

  useEffect(() => {
    if (!hydrated || touchedRef.current) return;
    if (scanDataAttached) setValue("scan");
  }, [hydrated, scanDataAttached]);

  return { value, setChoice, onScanModelFilesAdded, restoreChoice };
}
