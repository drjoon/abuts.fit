import { useMemo, useState, useRef, useEffect } from "react";
import type { ManufacturerRequest } from "../../utils/request";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";

type MailboxGridProps = {
  requests: ManufacturerRequest[];
  onBoxClick?: (address: string, requests: ManufacturerRequest[]) => void;
};

const HANJIN_DEV_TEST_PAYLOAD = {
  mailboxes: ["DEVTESTA1"],
  shipments: [
    {
      requestId: "DEV-REQ-0001",
      mongoId: "000000000000000000000001",
      mailboxAddress: "DEVTESTA1",
      clinicName: "테스트치과",
      patientName: "홍길동",
      tooth: "#11",
      receiverName: "테스트 담당자",
      receiverPhone: "02-0000-0000",
      receiverAddress: "서울특별시 강남구 테스트로 123",
      receiverZipCode: "06236",
      shippingMode: "normal",
    },
  ],
};

const HANJIN_DEV_TEST_WEBHOOK = {
  mock: true,
  trackingNumber: "DEVTEST123456",
  carrier: "hanjin",
  shippedAt: new Date().toISOString(),
  events: [
    {
      statusCode: "DLV",
      statusText: "배송완료",
      occurredAt: new Date().toISOString(),
      location: "서울강남",
      description: "테스트 배송 완료",
    },
  ],
};

const callHanjinApi = async ({
  path,
  mailboxAddresses,
  payload,
}: {
  path: string;
  mailboxAddresses?: string[];
  payload?: Record<string, any>;
}) => {
  const body: Record<string, unknown> = {};
  if (Array.isArray(mailboxAddresses)) {
    body.mailboxAddresses = mailboxAddresses;
  }
  if (payload) {
    body.payload = payload;
  }
  const response = await request<any>({
    path,
    method: "POST",
    jsonBody: body,
  });
  const responseBody = response.data as any;
  if (!response.ok || !responseBody?.success) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `한진 API 호출 실패 (status=${response.status})`;
    throw new Error(message);
  }
  return responseBody?.data;
};

const callHanjinApiWithMeta = async ({
  path,
  mailboxAddresses,
  payload,
  wblPrintOptions,
}: {
  path: string;
  mailboxAddresses?: string[];
  payload?: Record<string, any>;
  wblPrintOptions?: {
    printer?: string;
    paperProfile?: string;
  };
}) => {
  const body: Record<string, unknown> = {};
  if (Array.isArray(mailboxAddresses)) {
    body.mailboxAddresses = mailboxAddresses;
  }
  if (payload) {
    body.payload = payload;
  }
  if (wblPrintOptions) {
    body.wblPrintOptions = wblPrintOptions;
  }
  const response = await request<any>({
    path,
    method: "POST",
    jsonBody: body,
  });
  const responseBody = response.data as any;
  if (!response.ok || !responseBody?.success) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `한진 API 호출 실패 (status=${response.status})`;
    throw new Error(message);
  }
  return {
    data: responseBody?.data,
    wblPrint: responseBody?.wblPrint,
  };
};

export const MailboxGrid = ({ requests, onBoxClick }: MailboxGridProps) => {
  const { toast } = useToast();
  // 선반: 가로 A~X (3개씩 묶음) / 세로 1~4
  // 서랍장(박스): 가로 A,B,C,D / 세로 1,2,3,4
  const shelfNames = Array.from({ length: 24 }, (_, i) =>
    String.fromCharCode(65 + i),
  ); // A to X
  const shelfGroups = useMemo(() => {
    const groups = [];
    // Limit to G-I (3 groups: A-C, D-F, G-I = 9 shelves A-I)
    for (let i = 0; i < Math.min(9, shelfNames.length); i += 3) {
      groups.push(shelfNames.slice(i, i + 3));
    }
    return groups;
  }, [shelfNames]);

  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(
    new Set(),
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRequestingPickup, setIsRequestingPickup] = useState(false);
  const [devTestLoading, setDevTestLoading] = useState({
    label: false,
    order: false,
    webhook: false,
  });
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const didInitSelectionRef = useRef(false);

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

  const downloadPdfFromBase64 = async (base64: string, fileName: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const saveGeneratedWaybillPngs = async ({
    addressList,
    zplLabels,
  }: {
    addressList: any[];
    zplLabels?: string[];
  }) => {
    const normalized = Array.isArray(addressList) ? addressList : [];
    const rows = normalized.filter(
      (row) => row && row.result_code === "OK" && row.wbl_num,
    );
    if (!rows.length) {
      throw new Error("운송장 정보를 찾지 못했습니다.");
    }

    const canvasW = 1218;
    const canvasH = 812;

    const isMeaningfulHanjinText = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return false;
      return raw.replace(/[\/()\s]+/g, "").length > 0;
    };

    const renderRowToPngBlob = async (row: any) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("이미지 렌더링에 실패했습니다.");

      const wbl = String(row.wbl_num || "").trim();
      const prtAdd = String(row.prt_add || "").trim();
      const senderName = String(row.snd_prn || row.snd_nam || "").trim();
      const senderTel = String(row.snd_tel || row.snd_hphn || "").trim();
      const senderAddr = String(row.snd_add || row.snd_addr || "").trim();
      const receiverName = String(row.rcv_prn || row.rcv_nam || "").trim();
      const receiverTel = String(row.rcv_tel || row.rcv_hphn || "").trim();
      const receiverZip = String(row.rcv_zip || "").trim();
      const receiverAddr = String(
        row.address || row.rcv_add || row.rcv_addr || prtAdd,
      ).trim();
      const goodsName = String(row.goods_nm || row.gds_nm || "의료기기").trim();
      const boxCount = String(
        row.qty || row.box_cnt || row.cts_num || "1/0",
      ).trim();
      const 운임Type = String(row.pay_typ || row.fare_typ || "S").trim();
      const tmlRaw = String(row.tml_nam || "").trim();
      const cenRaw = String(row.cen_nam || "").trim();
      const tml = isMeaningfulHanjinText(tmlRaw) ? tmlRaw : "";
      const cen = isMeaningfulHanjinText(cenRaw) ? cenRaw : "";
      const mailboxCode = String(row.mailbox_code || "").trim();
      const organizationName = String(row.organization_name || "").trim();
      const requestCount = Number(row.request_count || 0);
      const remark = String(
        row.remark ||
          [
            mailboxCode,
            organizationName,
            requestCount > 0 ? `${requestCount}건` : "",
          ]
            .filter(Boolean)
            .join(" / ") ||
          row.msg_key ||
          "",
      ).trim();
      const printedYmd = String(
        row.prt_ymd || row.wbl_dt || new Date().toISOString().slice(0, 10),
      )
        .trim()
        .replace(/[^0-9-]/g, "")
        .slice(0, 10);

      const drawText = (
        text: string,
        x: number,
        y: number,
        font: string,
        color = "#111827",
      ) => {
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.fillText(text, x, y);
      };

      const fitText = (
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        font: string,
        color = "#111827",
      ) => {
        ctx.save();
        ctx.font = font;
        let output = String(text || "").trim();
        if (output) {
          while (
            output.length > 1 &&
            ctx.measureText(output).width > maxWidth
          ) {
            output = `${output.slice(0, -2).trimEnd()}…`;
          }
        }
        ctx.fillStyle = color;
        ctx.fillText(output || "-", x, y);
        ctx.restore();
      };

      const line = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        width = 2,
      ) => {
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.strokeStyle = "#111827";
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };

      const box = (x: number, y: number, w: number, h: number, width = 2) => {
        ctx.lineWidth = width;
        ctx.strokeStyle = "#111827";
        ctx.strokeRect(x, y, w, h);
      };

      const sideLabel = (text: string, x: number, y: number, h: number) => {
        ctx.save();
        ctx.translate(x, y + h);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = "#111827";
        ctx.font = '700 22px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        ctx.fillText(text, 0, 0);
        ctx.restore();
      };

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);

      box(18, 18, 1180, 768, 2);
      line(18, 58, 1198, 58, 2);
      drawText(
        "운송장번호",
        30,
        48,
        '700 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(
        wbl,
        150,
        44,
        320,
        '700 30px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "P. 1",
        520,
        44,
        '500 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "1 / 1",
        590,
        44,
        '500 16px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "한진택배",
        945,
        44,
        '800 26px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText("1588-0011", 1045, 44, "500 12px Arial, sans-serif");

      const routeTop = 58;
      line(18, 150, 1198, 150, 2);
      line(700, routeTop, 700, 150, 2);
      line(860, routeTop, 860, 150, 2);
      line(980, routeTop, 980, 150, 2);
      drawText(
        "발도",
        34,
        102,
        '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "도착점",
        740,
        102,
        '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "권역",
        892,
        102,
        '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "구분",
        1012,
        102,
        '600 20px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(tml || "CB", 34, 136, 620, "900 86px Arial, sans-serif");
      fitText(cen || "650", 730, 136, 120, "800 50px Arial, sans-serif");
      fitText(
        receiverName || "-",
        730,
        186,
        120,
        '700 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(receiverZip || "D1", 880, 136, 90, "800 46px Arial, sans-serif");
      fitText(
        remark || "-",
        1012,
        136,
        160,
        '700 22px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );

      const receiverTop = 150;
      line(110, receiverTop, 110, 290, 2);
      sideLabel("받는분", 52, receiverTop + 8, 98);
      fitText(
        receiverName || "-",
        132,
        receiverTop + 36,
        320,
        '700 34px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(
        receiverTel || "-",
        470,
        receiverTop + 36,
        240,
        "600 24px Arial, sans-serif",
      );
      fitText(
        receiverAddr || prtAdd || "-",
        132,
        receiverTop + 92,
        960,
        '600 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );

      const { default: JsBarcode } = await import("jsbarcode");
      const barcodeCanvas = document.createElement("canvas");
      try {
        JsBarcode(barcodeCanvas, wbl || "-", {
          format: "CODE128",
          displayValue: false,
          font: "Apple SD Gothic Neo",
          fontSize: 28,
          textMargin: 6,
          margin: 0,
          height: 62,
          width: 2,
          background: "#ffffff",
          lineColor: "#000000",
        });
        ctx.drawImage(barcodeCanvas, 902, receiverTop + 70, 220, 52);
      } catch {}

      fitText(wbl, 930, receiverTop + 144, 180, "600 18px Arial, sans-serif");

      const senderTop = 428;
      line(18, senderTop, 1198, senderTop, 2);
      line(18, 562, 1198, 562, 2);
      line(110, senderTop, 110, 562, 2);
      sideLabel("보내는분", 52, senderTop + 8, 96);
      fitText(
        senderName || "-",
        132,
        senderTop + 38,
        300,
        '700 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(
        senderTel || "-",
        480,
        senderTop + 38,
        220,
        "600 20px Arial, sans-serif",
      );
      fitText(
        senderAddr || "-",
        132,
        senderTop + 86,
        820,
        '500 18px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(
        printedYmd || "-",
        882,
        senderTop + 38,
        96,
        "500 18px Arial, sans-serif",
      );
      fitText(
        `Type:${운임Type || "S"}`,
        1042,
        senderTop + 38,
        120,
        "500 18px Arial, sans-serif",
      );

      const remarkTop = 562;
      drawText(
        "비고",
        34,
        596,
        '700 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      fitText(
        remark || "-",
        130,
        596,
        820,
        '600 28px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );
      drawText(
        "※ 개인정보 보호를 위하여 인수하신 화물의 운송장증을 폐기하여 주시기 바랍니다.",
        34,
        728,
        '500 14px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      );

      const bottomBarcodeCanvas = document.createElement("canvas");
      try {
        JsBarcode(bottomBarcodeCanvas, wbl || "-", {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: 110,
          width: 2.2,
          background: "#ffffff",
          lineColor: "#000000",
        });
        ctx.drawImage(bottomBarcodeCanvas, 904, 620, 240, 76);
      } catch {}
      fitText(
        `운임Type:${운임Type || "S"}`,
        836,
        736,
        120,
        "500 16px Arial, sans-serif",
      );
      fitText(wbl, 988, 736, 132, "700 24px Arial, sans-serif");

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => {
            if (value) resolve(value);
            else reject(new Error("PNG 생성에 실패했습니다."));
          },
          "image/png",
          1,
        );
      });
      return blob;
    };

    const pad2 = (v: number) => String(v).padStart(2, "0");
    const now = new Date();
    const folderName = `waybills-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const dir = zip.folder(folderName);
    if (!dir) throw new Error("zip 폴더 생성에 실패했습니다.");

    void zplLabels;
    for (const row of rows) {
      const wblNum = String(row.wbl_num || "").trim() || "unknown";
      const mailboxCode = String(row.mailbox_code || "").trim() || "BOX";
      const organizationName = String(row.organization_name || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "_")
        .slice(0, 30);
      const blob = await renderRowToPngBlob(row);
      dir.file(
        `wbl_${mailboxCode}${organizationName ? `_${organizationName}` : ""}_${wblNum}.png`,
        blob,
      );
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const zipName = `${folderName}.zip`;
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadPdfFromUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadWaybillPdf = async (payload: any) => {
    const printPayload = resolvePrintPayload(payload);
    if (!printPayload) {
      throw new Error("운송장 응답에서 PDF 데이터를 찾지 못했습니다.");
    }
    const fileName = `hanjin-waybill-${new Date().toISOString().slice(0, 10)}.pdf`;
    if (printPayload.url) {
      downloadPdfFromUrl(printPayload.url);
      return;
    }
    if (printPayload.base64) {
      await downloadPdfFromBase64(printPayload.base64, fileName);
      return;
    }
    throw new Error("운송장 PDF 출력 데이터가 없습니다.");
  };

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

  const shelfRows = ["1", "2", "3", "4"];
  const binCols = ["A", "B", "C", "D"];
  const binRows = ["1", "2", "3", "4"];

  const addressMap = useMemo(() => {
    const map = new Map<string, ManufacturerRequest[]>();
    for (const req of requests) {
      const addr = req.mailboxAddress;
      if (addr) {
        if (!map.has(addr)) map.set(addr, []);
        map.get(addr)!.push(req);
      }
    }
    return map;
  }, [requests]);

  // 발송일 기준으로 우편함 배경색 결정
  const getMailboxColorClass = (items: ManufacturerRequest[]) => {
    if (items.length === 0) return "bg-white border-slate-200";

    // 가장 빠른 발송 예정일 찾기
    const earliestShipDate = items.reduce((earliest, req) => {
      const shipYmd = req.timeline?.estimatedShipYmd;
      if (!shipYmd) return earliest;
      if (!earliest || shipYmd < earliest) return shipYmd;
      return earliest;
    }, "");

    if (!earliestShipDate) {
      // 발송일 정보 없음 - 기본 파란색
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    }

    // 오늘 날짜 (KST 기준 YYYY-MM-DD)
    const today = new Date();
    const kstOffset = 9 * 60; // KST = UTC+9
    const kstDate = new Date(today.getTime() + kstOffset * 60 * 1000);
    const todayYmd = kstDate.toISOString().split("T")[0];

    if (earliestShipDate === todayYmd) {
      // 오늘 발송 예정 - 파란색
      return "bg-blue-50 border-blue-400 cursor-pointer hover:bg-blue-100 hover:shadow-md";
    } else if (earliestShipDate > todayYmd) {
      // 미래 발송 예정 - 회색
      return "bg-slate-50 border-slate-300 cursor-pointer hover:bg-slate-100 hover:shadow-md";
    } else {
      // 과거 발송 예정 (지연) - 빨간색
      return "bg-red-50 border-red-400 cursor-pointer hover:bg-red-100 hover:shadow-md";
    }
  };

  // Prevent browser back/forward on swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartXRef.current - touchEndX;

    // If swipe is less than 50px, prevent default (browser back/forward)
    if (Math.abs(diff) < 50) {
      e.preventDefault();
    }
  };

  // Scroll to selected group when button is clicked
  useEffect(() => {
    const currentGroup = shelfGroups[selectedGroupIdx];
    if (currentGroup && currentGroup.length > 0) {
      const firstShelfInGroup = currentGroup[0];
      const shelfElement = shelfRefs.current[firstShelfInGroup];
      if (shelfElement && scrollContainerRef.current) {
        const scrollLeft =
          shelfElement.offsetLeft - scrollContainerRef.current.offsetLeft - 16;
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, scrollLeft),
          behavior: "smooth",
        });
      }
    }
  }, [selectedGroupIdx, shelfGroups]);

  // Get all shelves up to I (first 9 shelves)
  const allShelvesToShow = shelfNames.slice(0, 9);

  // Get occupied mailbox addresses
  const occupiedAddresses = useMemo(() => {
    return Array.from(addressMap.keys());
  }, [addressMap]);

  useEffect(() => {
    setSelectedMailboxes((prev) => {
      const next = new Set(
        Array.from(prev).filter((address) =>
          occupiedAddresses.includes(address),
        ),
      );

      if (!didInitSelectionRef.current) {
        didInitSelectionRef.current = true;
        return new Set(occupiedAddresses);
      }

      return next;
    });
  }, [occupiedAddresses]);

  const pickupRequestedMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const di =
        req?.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
          ? (req.deliveryInfoRef as any)
          : null;
      const hasPickup = Boolean(
        di?.trackingNumber ||
        di?.shippedAt ||
        di?.tracking?.lastStatusText ||
        String(req?.manufacturerStage || "").trim() === "추적관리",
      );
      const isDelivered = Boolean(di?.deliveredAt);
      const isCanceled =
        String(di?.tracking?.lastStatusText || "").trim() === "예약취소";
      if (hasPickup && !isDelivered && !isCanceled) {
        set.add(mailbox);
      }
    }
    return set;
  }, [requests]);

  const printedMailboxes = useMemo(() => {
    const set = new Set<string>();
    for (const req of requests) {
      const mailbox = String(req?.mailboxAddress || "").trim();
      if (!mailbox) continue;
      const printed = Boolean((req as any)?.shippingLabelPrinted?.printed);
      if (printed) {
        set.add(mailbox);
      }
    }
    return set;
  }, [requests]);

  const selectedOccupiedAddresses = useMemo(
    () => occupiedAddresses.filter((addr) => selectedMailboxes.has(addr)),
    [occupiedAddresses, selectedMailboxes],
  );

  const selectedPrintedAddresses = useMemo(
    () =>
      selectedOccupiedAddresses.filter((addr) => printedMailboxes.has(addr)),
    [selectedOccupiedAddresses, printedMailboxes],
  );

  const selectedRequestedAddresses = useMemo(
    () =>
      selectedOccupiedAddresses.filter((addr) =>
        pickupRequestedMailboxes.has(addr),
      ),
    [selectedOccupiedAddresses, pickupRequestedMailboxes],
  );

  const toggleMailboxSelection = (address: string) => {
    setSelectedMailboxes((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  };

  const selectAllOccupied = () => {
    setSelectedMailboxes(new Set(occupiedAddresses));
  };

  const clearAllOccupied = () => {
    setSelectedMailboxes(new Set());
  };

  const resolvePrintPayload = (payload: any) => {
    if (!payload) return null;
    if (typeof payload === "string" && payload.startsWith("http")) {
      return { url: payload };
    }

    const candidate = [
      payload.url,
      payload.pdfUrl,
      payload.labelUrl,
      payload.printUrl,
      payload.downloadUrl,
      payload.fileUrl,
      payload?.data?.url,
      payload?.data?.pdfUrl,
      payload?.data?.labelUrl,
      payload?.data?.printUrl,
      payload?.data?.downloadUrl,
    ].find((value) => typeof value === "string" && value.startsWith("http"));

    if (candidate) return { url: candidate };

    const base64 =
      payload.pdfBase64 ||
      payload.labelBase64 ||
      payload?.data?.pdfBase64 ||
      payload?.data?.labelBase64;
    if (typeof base64 === "string" && base64.length > 0) {
      return { base64 };
    }

    return null;
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

  const triggerLocalPrint = async (payload: any) => {
    const addressList = payload?.address_list;
    if (!Array.isArray(addressList) || addressList.length === 0) {
      toast({
        title: "출력 준비 실패",
        description:
          "운송장 응답에서 ZPL 생성에 필요한 address_list를 찾지 못했습니다.",
        variant: "destructive",
      });
      return;
    }

    const escapeZplText = (value: any) =>
      String(value || "")
        .replace(/\^/g, "")
        .replace(/~/g, "")
        .replace(/[\r\n]+/g, " ")
        .trim();

    const zplLabels = Array.isArray(payload?.zplLabels)
      ? payload.zplLabels.filter((v: any) => typeof v === "string" && v.trim())
      : [];
    const zpl = zplLabels.join("\n");

    if (!zpl) {
      toast({
        title: "출력 준비 실패",
        description: "address_list에서 유효한 운송장 정보를 찾지 못했습니다.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await request<any>({
        path: "/api/requests/packing/print-zpl",
        method: "POST",
        jsonBody: {
          zpl,
          printer: printerProfile || undefined,
          title: "Hanjin Label",
          paperProfile,
        },
      });
      const data = response.data as any;
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "로컬 프린터 출력에 실패했습니다.");
      }
    } catch (error) {
      toast({
        title: "로컬 출력 실패",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  // Handle printing shipping labels
  const handlePrintLabels = async () => {
    if (selectedOccupiedAddresses.length === 0) {
      toast({
        title: "우편함 없음",
        description: "운송장을 출력할 우편함을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    try {
      if (shippingOutputMode === "image") {
        const { data, wblPrint } = await callHanjinApiWithMeta({
          path: "/api/requests/shipping/hanjin/print-labels",
          mailboxAddresses: selectedOccupiedAddresses,
        });

        const candidatePayload =
          (wblPrint as any)?.data || wblPrint || (data as any);
        const printPayload = resolvePrintPayload(candidatePayload);

        if (printPayload) {
          await handleDownloadWaybillPdf(candidatePayload);
          toast({
            title: "운송장 저장 완료",
            description: `${selectedOccupiedAddresses.length}개 우편함의 운송장을 다운로드했습니다.`,
          });
          return;
        }

        if (Array.isArray((data as any)?.address_list)) {
          await saveGeneratedWaybillPngs({
            addressList: (data as any).address_list,
            zplLabels: (data as any).zplLabels,
          });
          toast({
            title: "운송장 저장 완료",
            description: `${selectedOccupiedAddresses.length}개 우편함의 운송장을 다운로드했습니다.`,
          });
          return;
        }

        if (wblPrint?.success) {
          toast({
            title: "운송장 출력 완료",
            description: `${selectedOccupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`,
          });
          return;
        }

        toast({
          title: "출력 데이터 없음",
          description:
            "운송장 응답에 PDF(URL/Base64) 데이터가 포함되지 않아 다운로드할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const { data, wblPrint } = await callHanjinApiWithMeta({
        path: "/api/requests/shipping/hanjin/print-labels",
        mailboxAddresses: selectedOccupiedAddresses,
        wblPrintOptions: {
          printer: printerProfile || undefined,
          paperProfile,
        },
      });

      if (wblPrint?.success) {
        toast({
          title: "운송장 출력 완료",
          description: `${selectedOccupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`,
        });
        return;
      }

      if (
        wblPrint?.skipped &&
        wblPrint?.reason === "wbl_print_server_not_configured"
      ) {
        await triggerLocalPrint(data);
        toast({
          title: "운송장 출력 완료",
          description: `${selectedOccupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`,
        });
        return;
      }

      if (wblPrint?.skipped && wblPrint?.reason === "print_payload_not_found") {
        toast({
          title: "출력 데이터 없음",
          description:
            "한진 운송장 응답에 PDF(URL/Base64) 데이터가 포함되지 않아 자동 출력이 불가능합니다.",
          variant: "destructive",
        });
        return;
      }

      if (wblPrint && wblPrint?.success === false) {
        toast({
          title: "운송장 출력 실패",
          description:
            wblPrint?.message ||
            wblPrint?.reason ||
            "운송장 출력에 실패했습니다.",
          variant: "destructive",
        });
        return;
      }

      await triggerLocalPrint(data);
      toast({
        title: "운송장 출력 완료",
        description: `${selectedOccupiedAddresses.length}개 우편함의 운송장이 출력되었습니다.`,
      });
    } catch (error) {
      console.error("운송장 출력 실패:", error);
      toast({
        title: "운송장 출력 실패",
        description: "운송장 출력에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Handle requesting or cancelling pickup
  const handlePickupAction = async () => {
    const requestedAddresses = selectedRequestedAddresses;
    const hasRequestedPickup = requestedAddresses.length > 0;

    const targetAddresses = hasRequestedPickup
      ? requestedAddresses
      : selectedOccupiedAddresses;

    if (!targetAddresses.length) {
      toast({
        title: "접수 불가",
        description: "택배 접수 또는 취소할 우편함을 먼저 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPickup(true);
    try {
      if (!hasRequestedPickup) {
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup",
          mailboxAddresses: targetAddresses,
        });
        toast({
          title: "택배 수거 접수 완료",
          description: `${targetAddresses.length}개 우편함의 택배 수거가 접수되었습니다.`,
        });
      } else {
        await callHanjinApi({
          path: "/api/requests/shipping/hanjin/pickup-cancel",
          mailboxAddresses: targetAddresses,
        });
        toast({
          title: "택배 수거 취소 완료",
          description: `${targetAddresses.length}개 우편함의 택배 수거를 취소했습니다.`,
        });
      }
    } catch (error) {
      console.error("택배 수거 처리 실패:", error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : hasRequestedPickup
            ? "택배 수거 접수 취소에 실패했습니다."
            : "택배 수거 접수에 실패했습니다.";
      toast({
        title: hasRequestedPickup ? "취소 실패" : "택배 수거 접수 실패",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRequestingPickup(false);
    }
  };

  const canRequestPickup = selectedOccupiedAddresses.length > 0;

  const hasRequestedPickup = selectedRequestedAddresses.length > 0;

  const pickupButtonLabel = isRequestingPickup
    ? hasRequestedPickup
      ? "취소 중..."
      : "접수 중..."
    : hasRequestedPickup
      ? "↩️ 접수 취소"
      : "🚚 택배 접수";

  const runDevTest = async (
    kind: "label" | "order" | "webhook",
    task: () => Promise<void>,
  ) => {
    setDevTestLoading((prev) => ({ ...prev, [kind]: true }));
    try {
      await task();
      toast({
        title: "DEV 테스트 완료",
        description:
          kind === "webhook"
            ? "배송정보 수신 모의가 완료되었습니다."
            : kind === "order"
              ? "주문정보(수거) 송신이 완료되었습니다."
              : "운송장 출력 모의가 완료되었습니다.",
      });
    } catch (error) {
      console.error(`DEV 테스트(${kind}) 실패:`, error);
      toast({
        title: "DEV 테스트 실패",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setDevTestLoading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const handleDevLabelTest = () =>
    runDevTest("label", async () => {
      await callHanjinApi({
        path: "/api/requests/shipping/hanjin/print-labels",
        payload: HANJIN_DEV_TEST_PAYLOAD,
      });
    });

  const handleDevOrderTest = () =>
    runDevTest("order", async () => {
      await callHanjinApi({
        path: "/api/requests/shipping/hanjin/pickup",
        payload: HANJIN_DEV_TEST_PAYLOAD,
      });
    });

  const handleDevWebhookTest = () =>
    runDevTest("webhook", async () => {
      const response = await request<any>({
        path: "/api/requests/shipping/hanjin/webhook-simulate",
        method: "POST",
        jsonBody: { payload: HANJIN_DEV_TEST_WEBHOOK },
      });
      const data = response.data as any;
      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || `Webhook 테스트 실패 (status=${response.status})`,
        );
      }
    });

  return (
    <div className="w-full flex flex-col h-full relative">
      {/* 고정 영역: 운송장 출력/택배 수거 접수 + 선반 그룹 버튼 */}
      <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        {/* 운송장 출력 및 택배 수거 접수 버튼 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4 pb-1 px-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrinterModalOpen(true)}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="프린터 설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2 justify-center">
            <button
              onClick={handlePrintLabels}
              disabled={isPrinting || selectedOccupiedAddresses.length === 0}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isPrinting || selectedOccupiedAddresses.length === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
              }`}
            >
              {isPrinting ? "출력 중..." : "📦 운송장 출력"}
            </button>
            <button
              onClick={handlePickupAction}
              disabled={
                isRequestingPickup || (!hasRequestedPickup && !canRequestPickup)
              }
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                isRequestingPickup || (!hasRequestedPickup && !canRequestPickup)
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : hasRequestedPickup
                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-sm"
                    : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-sm"
              }`}
            >
              {pickupButtonLabel}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 pb-3 px-2 text-center">
          <button
            type="button"
            onClick={selectAllOccupied}
            disabled={occupiedAddresses.length === 0}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              occupiedAddresses.length === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearAllOccupied}
            disabled={
              occupiedAddresses.length === 0 || selectedMailboxes.size === 0
            }
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              occupiedAddresses.length === 0 || selectedMailboxes.size === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            전체 해제
          </button>
          <div className="text-xs text-slate-500">
            전체 {occupiedAddresses.length}개 / 선택{" "}
            {selectedOccupiedAddresses.length}개
          </div>
        </div>

        <Dialog open={printerModalOpen} onOpenChange={setPrinterModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-2xl rounded-2xl border border-slate-200 bg-white/85 backdrop-blur-md shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-slate-900">
                프린터 설정
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="text-sm text-slate-600 leading-relaxed">
                운송장 출력은 로컬 프린터 서버(5777)의 CUPS 프린터 목록을
                사용합니다.
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    프린터
                  </span>
                  <button
                    type="button"
                    onClick={() => void fetchPrinters()}
                    disabled={printerLoading}
                    className={`text-xs font-medium rounded-md px-2.5 py-1 border transition-colors ${
                      printerLoading
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    새로고침
                  </button>
                </div>

                <select
                  value={printerProfile}
                  onChange={(e) => setPrinterProfile(e.target.value)}
                  title={printerProfile}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={printerLoading}
                >
                  {printerLoading ? (
                    <option value="">프린터 목록 불러오는 중...</option>
                  ) : printerOptions.length ? (
                    printerOptions.map((printer) => (
                      <option key={printer} value={printer} title={printer}>
                        {printer}
                      </option>
                    ))
                  ) : (
                    <option value="">사용 가능한 프린터가 없습니다.</option>
                  )}
                </select>

                {printerError ? (
                  <div className="text-xs text-rose-600">{printerError}</div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    용지
                  </span>
                </div>

                <select
                  value={paperProfile}
                  onChange={(e) => setPaperProfile(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={paperLoading}
                >
                  {paperLoading ? (
                    <option value={paperProfile}>
                      용지 설정 불러오는 중...
                    </option>
                  ) : (
                    paperOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))
                  )}
                </select>
                {paperError ? (
                  <div className="text-xs text-rose-600">{paperError}</div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    출력 방식
                  </span>
                </div>

                <select
                  value={shippingOutputMode}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "image" || v === "label")
                      setShippingOutputMode(v);
                  }}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="image">PDF 저장</option>
                  <option value="label">실제 라벨 출력</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPrinterModalOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 선반 그룹 선택 라디오/버튼 그룹 */}
        <div className="flex flex-wrap gap-1.5 justify-center pt-1 pb-4 px-2">
          {shelfGroups.map((group, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGroupIdx(idx)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border ${
                idx === selectedGroupIdx
                  ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {group[0]}-{group[group.length - 1]}
            </button>
          ))}
        </div>
      </div>

      {/* 모든 선반을 가로 스크롤로 표시 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex gap-3 sm:gap-4 overflow-x-auto overflow-y-auto pb-4 w-full justify-start px-2 scroll-smooth p-1 sm:p-2"
        style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {allShelvesToShow.map((shelf) => (
          <div
            key={shelf}
            ref={(el) => {
              if (el) shelfRefs.current[shelf] = el;
            }}
            className="flex flex-col gap-2 min-w-max"
          >
            {shelfRows.map((sRow) => (
              <div
                key={`${shelf}${sRow}`}
                className="flex flex-col gap-1 bg-white p-2 rounded-lg shadow-sm border border-slate-300"
              >
                <div className="text-[11px] font-bold text-slate-600 text-center leading-none mb-1">
                  {shelf}
                  {sRow}
                </div>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-md">
                  {binCols.map((bCol) => (
                    <div key={bCol} className="flex flex-col gap-1">
                      {binRows.map((bRow) => {
                        const address = `${shelf}${sRow}${bCol}${bRow}`;
                        const items = addressMap.get(address) || [];
                        const isOccupied = items.length > 0;

                        const handleClick = (
                          e: React.MouseEvent | React.TouchEvent,
                        ) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isOccupied) {
                            toggleMailboxSelection(address);
                          }
                        };

                        const isSelected = selectedMailboxes.has(address);
                        const handleOpenDetails = (
                          e: React.MouseEvent | React.TouchEvent,
                        ) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isOccupied && onBoxClick) {
                            onBoxClick(address, items);
                          }
                        };

                        return (
                          <div
                            key={address}
                            onClick={handleClick}
                            onTouchEnd={handleClick}
                            data-printed={
                              printedMailboxes.has(address) ? "1" : "0"
                            }
                            className={`
                              relative flex flex-col items-center justify-between p-1 rounded border transition-all select-none
                              ${
                                isOccupied && isSelected
                                  ? "bg-blue-100 border-blue-500 shadow-sm"
                                  : isOccupied && printedMailboxes.has(address)
                                    ? "bg-white border-orange-400 shadow-sm"
                                    : isOccupied
                                      ? getMailboxColorClass(items)
                                      : "bg-white border-slate-200"
                              }
                            `}
                            style={{
                              width: "62px",
                              height: "44px",
                              touchAction: "manipulation",
                            }}
                          >
                            {/* 상단 라벨 */}
                            <div
                              className={`font-mono font-bold leading-none text-center w-full pointer-events-none ${
                                isOccupied && isSelected
                                  ? "text-blue-800"
                                  : isOccupied
                                    ? getMailboxColorClass(items).includes(
                                        "bg-blue",
                                      )
                                      ? "text-blue-800"
                                      : getMailboxColorClass(items).includes(
                                            "bg-red",
                                          )
                                        ? "text-red-800"
                                        : "text-slate-700"
                                    : "text-slate-400"
                              }`}
                              style={{ fontSize: "9px" }}
                            >
                              {address}
                            </div>
                            {/* 중앙 카운트 */}
                            <div className="flex-1 flex items-center justify-center">
                              {isOccupied && (
                                <button
                                  type="button"
                                  onClick={handleOpenDetails}
                                  className={`font-bold leading-none ${
                                    isSelected
                                      ? "text-blue-700"
                                      : getMailboxColorClass(items).includes(
                                            "bg-blue",
                                          )
                                        ? "text-blue-700"
                                        : getMailboxColorClass(items).includes(
                                              "bg-red",
                                            )
                                          ? "text-red-700"
                                          : "text-slate-700"
                                  }`}
                                  style={{ fontSize: "18px" }}
                                  aria-label={`${address} 내용 보기`}
                                >
                                  {items.length}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
