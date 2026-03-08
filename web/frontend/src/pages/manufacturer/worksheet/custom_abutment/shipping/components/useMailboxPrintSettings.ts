import { useEffect, useState } from "react";
import { request } from "@/shared/api/apiClient";

export function useMailboxPrintSettings() {
  const [printerProfile, setPrinterProfile] = useState("");
  const [paperProfile, setPaperProfile] = useState("FS");
  const [paperOptions, setPaperOptions] = useState<string[]>(["FS"]);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [printerOptions, setPrinterOptions] = useState<string[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [shippingOutputMode, setShippingOutputMode] = useState<
    "image" | "label"
  >("image");

  useEffect(() => {
    const storedProfile = localStorage.getItem("worksheet:printer:profile");
    if (storedProfile) setPrinterProfile(storedProfile);
    const storedPaper = localStorage.getItem("worksheet:wbl:paper:profile");
    if (storedPaper) setPaperProfile(storedPaper);

    const storedOutputMode = localStorage.getItem("worksheet:wbl:output:mode");
    if (storedOutputMode === "label" || storedOutputMode === "image") {
      setShippingOutputMode(storedOutputMode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("worksheet:printer:profile", printerProfile);
  }, [printerProfile]);

  useEffect(() => {
    localStorage.setItem("worksheet:wbl:paper:profile", paperProfile);
  }, [paperProfile]);

  useEffect(() => {
    localStorage.setItem("worksheet:wbl:output:mode", shippingOutputMode);
  }, [shippingOutputMode]);

  const fetchWblPrintSettings = async () => {
    setPaperLoading(true);
    setPaperError(null);
    try {
      const response = await request<any>({
        path: "/api/requests/shipping/wbl/print-settings",
        method: "GET",
      });
      const body = response.data as any;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "용지 설정을 불러올 수 없습니다.");
      }

      const optionsRaw = body?.data?.media?.options;
      const options = Array.isArray(optionsRaw)
        ? optionsRaw.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [];
      const fallback = options.length ? options : ["FS"];
      setPaperOptions(fallback);

      const defaultMedia = String(body?.data?.media?.default || "").trim();
      const stored = localStorage.getItem("worksheet:wbl:paper:profile") || "";
      const next = stored && fallback.includes(stored) ? stored : defaultMedia;
      if (next && fallback.includes(next)) {
        setPaperProfile(next);
      } else if (fallback[0]) {
        setPaperProfile(fallback[0]);
      }
    } catch (error) {
      setPaperError((error as Error).message);
    } finally {
      setPaperLoading(false);
    }
  };

  const fetchPrinters = async () => {
    setPrinterLoading(true);
    setPrinterError(null);
    try {
      const response = await request<any>({
        path: "/api/requests/packing/printers",
        method: "GET",
      });
      const data = response.data as any;
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "프린터 목록을 불러올 수 없습니다.");
      }
      const printers = Array.isArray(data.printers) ? data.printers : [];
      setPrinterOptions(printers);
      if (!printerProfile && printers.length) {
        setPrinterProfile(printers[0]);
      }
    } catch (error) {
      setPrinterError((error as Error).message);
    } finally {
      setPrinterLoading(false);
    }
  };

  useEffect(() => {
    if (!printerModalOpen) return;
    if (!printerOptions.length) {
      void fetchPrinters();
    }
    void fetchWblPrintSettings();
  }, [printerModalOpen, printerOptions.length]);

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
    shippingOutputMode,
    setShippingOutputMode,
    fetchPrinters,
  };
}
