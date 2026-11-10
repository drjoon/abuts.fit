// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback, useEffect, useState } from "react";
import type { PackLabelBranding } from "../utils/packLabelRenderer";

export const usePackingPrintSettings = ({
  token,
}: {
  token?: string | null;
}) => {
  const [printerProfile, setPrinterProfile] = useState("");
  const [vialPrinter, setVialPrinter] = useState("");
  const [paperProfile, setPaperProfile] = useState("PACK_80x65");
  const [paperOptions, setPaperOptions] = useState<string[]>(["PACK_80x65"]);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [printerOptions, setPrinterOptions] = useState<string[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
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
  const [packLabelBranding, setPackLabelBranding] =
    useState<PackLabelBranding | null>(null);

  useEffect(() => {
    const storedProfile = localStorage.getItem(
      "worksheet:pack:printer:profile",
    );
    if (storedProfile) setPrinterProfile(storedProfile);
    const storedVial = localStorage.getItem("worksheet:pack:vial:printer");
    if (storedVial) setVialPrinter(storedVial);
    const storedPaper = localStorage.getItem("worksheet:pack:paper:profile");
    if (storedPaper === "PACK_80x65") {
      setPaperProfile(storedPaper);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:printer:profile", printerProfile);
  }, [printerProfile]);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:vial:printer", vialPrinter);
  }, [vialPrinter]);

  useEffect(() => {
    localStorage.setItem("worksheet:pack:paper:profile", paperProfile);
  }, [paperProfile]);

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

      const nextDpi = Number(data?.data?.dpi);
      if (Number.isFinite(nextDpi) && nextDpi > 0) {
        setPackLabelDpi(nextDpi);
      }

      const nextDots = data?.data?.label?.dots;
      if (
        nextDots &&
        Number.isFinite(Number(nextDots.pw)) &&
        Number(nextDots.pw) > 0 &&
        Number.isFinite(Number(nextDots.ll)) &&
        Number(nextDots.ll) > 0
      ) {
        setPackLabelDots({ pw: Number(nextDots.pw), ll: Number(nextDots.ll) });
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
        setPackLabelDesignDots({
          pw: Number(nextDesignDots.pw),
          ll: Number(nextDesignDots.ll),
          dpi: Number(nextDesignDots.dpi),
        });
      }

      const nextBranding = data?.data?.branding;
      if (nextBranding && typeof nextBranding === "object") {
        setPackLabelBranding(nextBranding as PackLabelBranding);
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
      if (printers[0]) {
        setPrinterProfile((prev) => prev || printers[0]);
        setVialPrinter((prev) => prev || printers[0]);
      }
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : "프린터 목록을 불러올 수 없습니다.";
      setPrinterError(
        /abort/i.test(raw) ? "프린터 목록을 불러오지 못했습니다." : raw,
      );
    } finally {
      setPrinterLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchPaperSettings();
  }, [fetchPaperSettings]);

  return {
    printerProfile,
    setPrinterProfile,
    vialPrinter,
    setVialPrinter,
    paperProfile,
    setPaperProfile,
    paperOptions,
    paperLoading,
    paperError,
    printerOptions,
    printerLoading,
    printerError,
    packLabelDpi,
    packLabelDots,
    packLabelDesignDots,
    packLabelBranding,
    fetchPaperSettings,
    fetchPrinters,
  };
};
