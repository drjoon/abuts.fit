import { useCallback, useEffect, useState } from "react";

export const usePackingPrintSettings = ({
  token,
}: {
  token?: string | null;
}) => {
  const [printerProfile, setPrinterProfile] = useState("");
  const [paperProfile, setPaperProfile] = useState("PACK_80x65");
  const [paperOptions, setPaperOptions] = useState<string[]>(["PACK_80x65"]);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [printerOptions, setPrinterOptions] = useState<string[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [packOutputMode, setPackOutputMode] = useState<"image" | "label">(
    "image",
  );
  const [packLabelDpi, setPackLabelDpi] = useState(600);
  const [packLabelDots, setPackLabelDots] = useState<{
    pw: number;
    ll: number;
  }>({
    pw: 1890,
    ll: 1535,
  });
  const [packLabelDesignDots, setPackLabelDesignDots] = useState<{
    pw: number;
    ll: number;
    dpi: number;
  }>({ pw: 640, ll: 520, dpi: 203 });

  useEffect(() => {
    const storedProfile = localStorage.getItem(
      "worksheet:pack:printer:profile",
    );
    if (storedProfile) setPrinterProfile(storedProfile);
    const storedPaper = localStorage.getItem("worksheet:pack:paper:profile");
    if (storedPaper === "PACK_80x65") {
      setPaperProfile(storedPaper);
    }
    const storedOutputMode = localStorage.getItem("worksheet:pack:output:mode");
    if (storedOutputMode === "label" || storedOutputMode === "image") {
      setPackOutputMode(storedOutputMode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:printer:profile", printerProfile);
  }, [printerProfile]);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:paper:profile", paperProfile);
  }, [paperProfile]);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:output:mode", packOutputMode);
  }, [packOutputMode]);

  const fetchPaperSettings = useCallback(async () => {
    setPaperLoading(true);
    setPaperError(null);
    try {
      const response = await fetch("/api/requests/packing/print-settings", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "용지 설정을 불러올 수 없습니다.");
      }

      console.log("[fetchPaperSettings] 서버 응답:", data);

      const nextDpi = Number(data?.data?.dpi);
      if (Number.isFinite(nextDpi) && nextDpi > 0) {
        console.log("[fetchPaperSettings] DPI 설정:", nextDpi);
        setPackLabelDpi(nextDpi);
      } else {
        console.warn("[fetchPaperSettings] DPI 값 없음, 기본값 유지");
      }

      const nextDots = data?.data?.label?.dots;
      if (
        nextDots &&
        Number.isFinite(Number(nextDots.pw)) &&
        Number(nextDots.pw) > 0 &&
        Number.isFinite(Number(nextDots.ll)) &&
        Number(nextDots.ll) > 0
      ) {
        console.log("[fetchPaperSettings] Dots 설정:", nextDots);
        setPackLabelDots({ pw: Number(nextDots.pw), ll: Number(nextDots.ll) });
      } else {
        console.warn("[fetchPaperSettings] Dots 값 없음, 기본값 유지");
      }

      const nextDesignDots = data?.data?.label?.designDots;
      if (
        nextDesignDots &&
        Number.isFinite(Number(nextDesignDots.pw)) &&
        Number(nextDesignDots.pw) > 0 &&
        Number.isFinite(Number(nextDesignDots.ll)) &&
        Number(nextDesignDots.ll) > 0 &&
        Number.isFinite(Number(nextDesignDots.dpi)) &&
        Number(nextDesignDots.dpi) > 0
      ) {
        console.log("[fetchPaperSettings] DesignDots 설정:", nextDesignDots);
        setPackLabelDesignDots({
          pw: Number(nextDesignDots.pw),
          ll: Number(nextDesignDots.ll),
          dpi: Number(nextDesignDots.dpi),
        });
      } else {
        console.warn("[fetchPaperSettings] DesignDots 값 없음, 기본값 유지");
      }

      const options = Array.isArray(data?.data?.paper?.options)
        ? data.data.paper.options
        : [];
      const normalized = options
        .map((v: any) => String(v || "").trim())
        .filter(Boolean);
      const fallback = normalized.length ? normalized : ["PACK_80x65"];
      setPaperOptions(fallback);
      const defaultPaper = String(data?.data?.paper?.default || "").trim();
      const stored = localStorage.getItem("worksheet:pack:paper:profile") || "";
      const next = stored && fallback.includes(stored) ? stored : defaultPaper;
      if (next && fallback.includes(next)) setPaperProfile(next);
      else if (fallback[0]) setPaperProfile(fallback[0]);
    } catch (error) {
      setPaperError((error as Error).message);
    } finally {
      setPaperLoading(false);
    }
  }, [token]);

  const fetchPrinters = useCallback(async () => {
    setPrinterLoading(true);
    setPrinterError(null);
    try {
      const response = await fetch("/api/requests/packing/printers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "프린터 목록을 불러올 수 없습니다.");
      }
      const printers = Array.isArray(data.printers) ? data.printers : [];
      setPrinterOptions(printers);
      if (!printerProfile && printers.length) setPrinterProfile(printers[0]);
    } catch (error) {
      setPrinterError((error as Error).message);
    } finally {
      setPrinterLoading(false);
    }
  }, [printerProfile, token]);

  useEffect(() => {
    if (!printerModalOpen) return;
    void fetchPaperSettings();
  }, [printerModalOpen, fetchPaperSettings]);

  useEffect(() => {
    if (!printerModalOpen) return;
    if (!printerOptions.length) {
      void fetchPrinters();
    }
  }, [fetchPrinters, printerModalOpen, printerOptions.length]);

  return {
    printerProfile,
    setPrinterProfile,
    paperProfile,
    setPaperProfile,
    paperOptions,
    paperLoading,
    paperError,
    printerOptions,
    printerLoading,
    printerError,
    printerModalOpen,
    setPrinterModalOpen,
    packOutputMode,
    setPackOutputMode,
    packLabelDpi,
    packLabelDots,
    packLabelDesignDots,
    fetchPaperSettings,
    fetchPrinters,
  };
};
