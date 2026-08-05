/**
 * 치과병의원(practice) 파일전송 페이지.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 상단: 기간필터 + 요약(좌 2x2) + 최근 의뢰(우)
 * - 하단: 스캔 전송 섹션이 남은 영역을 채움
 * - 최근 전송 카드 클릭 시 의뢰 정보 + 기공소 채팅 모달 제공
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/shared/hooks/useChatRooms.ts
 * - web/frontend/src/shared/hooks/useChatMessages.ts
 * - web/backend/modules/chat/chat.routes.js
 * - web/backend/controllers/chats/chat.controller.js
 * - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
 * - web/backend/models/practiceTransferDraft.model.js
 * - web/backend/models/businessAnchor.model.js
 * - web/backend/modules/files/file.routes.js
 * - web/backend/controllers/files/file.controller.js
 * - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
 * - web/frontend/src/shared/realtime/socket.ts
 * - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/toothWorkDraft.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  UploadCloud,
  ClipboardList,
  Search,
  Trash2,
  RotateCcw,
  BookmarkPlus,
  ChevronsUpDown,
  Check,
  Download,
  Copy,
  Link2,
  Send,
  Plus,
  Settings,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/shared/ui/cn";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  usePracticeTransferStep1,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { PracticeTransferIntakeSection } from "@/shared/components/practice/PracticeTransferIntakeSection";
import { normalizeMemoSnippets } from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { restoreToothWorksFromDraft } from "@/shared/practice/toothWorkDraft";
import { deleteFile as deleteFileFromIndexedDb } from "@/shared/storage/fileIndexedDB";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildPracticeTransferMemo as buildPracticeTransferMemoShared,
  extractTransferMemoFromMessage as extractTransferMemoFromMessageShared,
  formatTransferMemoForDisplay as formatTransferMemoForDisplayShared,
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  stripPracticeTransferMessageEnvelope,
} from "@/shared/practice/transferMemo";

type RecentRequestItem = {
  id: string; // 전송 내 파일 row 식별자(표시/그룹/optimistic 삭제용)
  requestMongoId: string; // PracticeTransfer _id (삭제 API 호출용)
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  status: string;
  createdAtTs: number;
  transferId: string;
  orderDate: string;
  arrivalDate: string;
  transferMemo: string;
  fileName: string;
  fileS3Key: string;
  fileSize: number;
};

type TransferFileItem = {
  fileName: string;
  s3Key: string;
  size: number;
};

type DraftTransferFileItem = {
  fileId: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
  location?: string;
};

type PracticeTransferDraftPayload = {
  _id: string;
  targetLabAnchorId: string | null;
  targetLabName: string;
  transferMemo: string;
  orderDate?: string;
  arrivalDate?: string;
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  files: DraftTransferFileItem[];
  updatedAt?: string | null;
  createdAt?: string | null;
};

type DraftListSummary = {
  id: string;
  targetLabName: string;
  transferMemo: string;
  updatedAt: string | null;
  createdAt: string | null;
};

const PRACTICE_DRAFT_TRANSFER_ID = "DRAFT-TEMP";

type RecentTransferItem = {
  id: string;
  transferId: string;
  deleteTargetLabel: string;
  createdAt: string;
  createdAtTs: number;
  requestDate: string;
  targetLab: string;
  orderDate: string;
  arrivalDate: string;
  status: string;
  fileCount: number;
  patientCount: number;
  requestIds: string[];
  transferMongoIds: string[];
  fileNames: string[];
  files: TransferFileItem[];
  transferMemo: string;
  unreadCount: number;
  searchBlob: string;
};

const extractLabNameFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/);
  return String(matched?.[1] || "").trim();
};

const extractTransferIdFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const formatToothWorksForDisplay = (rows: ToothWorkSelection[], options?: { multiline?: boolean }) => {
  const normalizedRows = normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber));
  if (!normalizedRows.length) return "";

  const formattedRows = normalizedRows.map((row) => {
    const details = [row.prosthesisType];
    if (row.customAbutment) details.push("커스텀어벗");
    if (isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length > 0) {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      details.push(`연결 ${[row.toothNumber, ...orderedLinks].join("-")}`);
    }
    return `${row.toothNumber}번: ${details.join(" · ")}`;
  });

  return options?.multiline ? formattedRows.join("\n") : formattedRows.join(" / ");
};

const parseLegacyToothWorksSummary = (value: string): ToothWorkSelection[] => {
  const serialized = String(value || "")
    .split(/\s*[,|]\s*/)
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = chunk.match(/^([1-4][1-8])\s*[:=]\s*(.+)$/);
      if (!match) return "";
      return `${match[1]}=${String(match[2] || "").trim()}`;
    })
    .filter(Boolean)
    .join(" | ");

  if (!serialized) return [];
  return parseToothWorks(serialized);
};

const formatTransferMemoForDisplay = (rawMemo: string) =>
  formatTransferMemoForDisplayShared(rawMemo);

const extractTransferMemoFromMessage = (message: string) =>
  extractTransferMemoFromMessageShared(message, { includeDateSummary: false });

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const PRESET_PROSTHESIS_TYPES = ["크라운", "브리지", "Pontic", "인레이"] as const;
const PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY = "practice_transfer_settings_v1";
const TOOTH_TENS_OPTIONS = ["1", "2", "3", "4"] as const;
const TOOTH_ONES_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

type ToothWorkSelection = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  bridgeLinkedTeeth: string[];
};

type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  memo: string;
};

type PracticeTransferSettingsPayload = {
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  memoSnippets?: string[];
  promoNoticeDismissedAt?: string | null;
  updatedAt?: string | null;
};

type PracticeTransferLocalFormDraft = {
  orderDate?: string;
  arrivalDate?: string;
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  requestMemo?: string;
  patientName?: string;
  selectedLab?: {
    _id?: string;
    name?: string;
    businessNumber?: string;
    representativeName?: string;
    address?: string;
    businessType?: string;
  } | null;
  toothWorks?: ToothWorkSelection[];
  updatedAt?: number;
};

const toKstDateInputValue = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
};

const addDaysToDateInput = (dateInput: string, days: number) => {
  const base = String(dateInput || "").trim();
  if (!base) return "";
  const d = new Date(`${base}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return toKstDateInputValue(d);
};

const normalizeArrivalDefaultDays = (value: number) => {
  if (!Number.isFinite(Number(value))) return DEFAULT_ARRIVAL_OFFSET_DAYS;
  return Math.max(0, Math.min(365, Math.floor(Number(value))));
};

const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" || prosthesisType === "Pontic";

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) =>
  prosthesisType === "크라운" || prosthesisType === "브리지";

const sanitizeProsthesisTypeLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  if (/^커스텀어벗\+?크라운$/i.test(compact)) return "크라운";
  if (/^커스텀어벗\+?브리지$/i.test(compact)) return "브리지";
  if (/^커스텀어벗$/i.test(compact)) return "";
  return trimmed;
};

const normalizeProsthesisTypes = (items: string[]) => {
  const canonical = items
    .map((item) => sanitizeProsthesisTypeLabel(String(item || "")))
    .filter(Boolean)
    .map((item) => {
      if (/^pontic$/i.test(item)) return "Pontic";
      return item;
    });

  const deduped = Array.from(
    new Map(canonical.map((item) => [item.toLowerCase(), item])).values(),
  );

  const withPontic = [...deduped];
  if (!withPontic.some((item) => /^pontic$/i.test(item))) withPontic.push("Pontic");
  return withPontic.length ? withPontic : [...PRESET_PROSTHESIS_TYPES];
};

const resolveDefaultProsthesisType = (types: string[]) =>
  types.includes("크라운") ? "크라운" : types[0] || "크라운";

const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];

  // 같은 사분면 내 인접 치아
  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);

  // 정중선 연결: 11 ↔ 21, 31 ↔ 41
  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }

  return Array.from(new Set(out));
};

const toToothSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  return Number(raw);
};

const toToothMemoSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);

  if (tens === 1) return 9 - ones; // 18..11 (상악 우측 -> 정중선)
  if (tens === 2) return 8 + ones; // 21..28 (정중선 -> 상악 좌측)
  if (tens === 4) return 16 + (9 - ones); // 48..41 (하악 우측 -> 정중선)
  if (tens === 3) return 24 + ones; // 31..38 (정중선 -> 하악 좌측)

  return Number.MAX_SAFE_INTEGER;
};

const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisType = String(row?.prosthesisType || "").trim();
      const customAbutment = isCustomAbutmentSupportedProsthesisType(prosthesisType)
        ? Boolean(row?.customAbutment)
        : false;
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isBridgeLikeProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber))
    .map((row) => {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        isBridgeLikeProsthesisType(row.prosthesisType) && orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? "+커스텀어벗"
          : "";
      return `${row.toothNumber}=${row.prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

const parseToothWorks = (value: string) =>
  String(value || "")
    .split("|")
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [toothRaw, ...rest] = chunk.split("=");
      const toothNumber = String(toothRaw || "").trim();
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }
      const prosthesisType = withoutLinked;
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber)
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
      };
    })
    .filter((row) => row.toothNumber && row.prosthesisType);

const parsePracticeTransferMemoMeta = (rawMemo: string): ParsedPracticeTransferMemoMeta => {
  const source = String(rawMemo || "").trim();
  const defaultOrderDate = toKstDateInputValue(new Date());
  const defaults: ParsedPracticeTransferMemoMeta = {
    orderDate: defaultOrderDate,
    arrivalDate: addDaysToDateInput(defaultOrderDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
    arrivalDefaultDays: DEFAULT_ARRIVAL_OFFSET_DAYS,
    prosthesisTypes: [...PRESET_PROSTHESIS_TYPES],
    toothWorks: [],
    memo: source,
  };
  if (!source) return defaults;

  const lines = source.split(/\r?\n/);
  const memoLines: string[] = [];
  let orderDate = defaults.orderDate;
  let arrivalDate = defaults.arrivalDate;
  let arrivalDefaultDays = defaults.arrivalDefaultDays;
  let prosthesisTypes = defaults.prosthesisTypes;
  let toothWorks: ToothWorkSelection[] = [];

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      memoLines.push("");
      continue;
    }

    const orderMatch = trimmed.match(/^\[\s*주문일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (orderMatch) {
      orderDate = orderMatch[1];
      continue;
    }

    const arrivalMatch = trimmed.match(/^\[\s*도착일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (arrivalMatch) {
      arrivalDate = arrivalMatch[1];
      continue;
    }

    const defaultDaysMatch = trimmed.match(/^\[\s*도착기본일수\s*:\s*(\d{1,3})\s*\]$/);
    if (defaultDaysMatch) {
      arrivalDefaultDays = normalizeArrivalDefaultDays(Number(defaultDaysMatch[1] || 0));
      continue;
    }

    const prosthesisCatalogMatch = trimmed.match(/^\[\s*보철물형태목록\s*:\s*(.+)\]$/);
    if (prosthesisCatalogMatch) {
      prosthesisTypes = normalizeProsthesisTypes(
        String(prosthesisCatalogMatch[1] || "")
          .split(",")
          .map((item) => item.trim()),
      );
      continue;
    }

    const legacyProsthesisMatch = trimmed.match(/^\[\s*보철물형태\s*:\s*(.+)\]$/);
    if (legacyProsthesisMatch) {
      prosthesisTypes = normalizeProsthesisTypes(
        String(legacyProsthesisMatch[1] || "")
          .split(",")
          .map((item) => item.trim()),
      );
      continue;
    }

    const toothWorksMatch = trimmed.match(/^\[\s*치아보철\s*:\s*(.+)\]$/);
    if (toothWorksMatch) {
      toothWorks = parseToothWorks(toothWorksMatch[1]);
      continue;
    }

    memoLines.push(line);
  }

  const memo = memoLines.join("\n").replace(/^\s+|\s+$/g, "");
  return {
    orderDate,
    arrivalDate: arrivalDate || addDaysToDateInput(orderDate, arrivalDefaultDays),
    arrivalDefaultDays,
    prosthesisTypes: normalizeProsthesisTypes(prosthesisTypes),
    toothWorks: normalizeToothWorks(toothWorks),
    memo,
  };
};

const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
}) => buildPracticeTransferMemoShared(params);

const normalizePatientNameKey = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";

  let normalized = raw;
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    // ignore
  }

  // 파일명 fallback으로 들어온 환자명 끝 치아 suffix(_47_0, -36-1 등) 제거
  const stripped = normalized
    .replace(/\.(stl|ply|obj)$/i, "")
    .replace(/[_\-\s]*#?\d{1,2}(?:[_\-\s]\d+)?$/, "")
    .trim();

  return (stripped || normalized).toLowerCase();
};

const toDateLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const toDayLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  const lowered = raw.toLowerCase();
  if (!raw) return "발송완료";

  // 정확값 우선
  if (raw === "취소") return "취소";
  if (raw === "발송완료") return "발송완료";
  if (raw === "수신완료") return "수신완료";
  if (raw === "다운로드완료") return "다운로드완료";

  // 레거시/과거 데이터 호환
  if (raw === "수신전" || raw === "확인전") return "발송완료";
  if (raw === "확인") return "수신완료";
  if (lowered === "downloaded") return "다운로드완료";
  if (raw.includes("전달완료") || raw.includes("배송완료")) return "수신완료";
  if (raw.includes("의뢰") || raw.includes("접수") || raw.includes("대기")) return "발송완료";

  return "발송완료";
};

const formatChatTs = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatFileSize = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

const PRACTICE_TRANSFER_TEMP_DRAFT_KEY = "practice_transfer_temp_draft_v1";
const PRACTICE_TRANSFER_FORM_LOCAL_KEY = "practice_transfer_form_local_v1";
const PRACTICE_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const PRACTICE_TRANSFER_PROMO_TITLE = "어벗츠 유료서비스를 쓰지 않더라도 이용 가능!";
const PRACTICE_TRANSFER_PROMO_DESC = "무료로 구강스캔 파일전송, 기공의뢰서 관리하세요.";

const clearPracticeFileTransferCaches = async () => {
  let keys: string[] = [];
  try {
    const raw = localStorage.getItem(PRACTICE_FILE_CACHE_META_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      keys = parsed
        .map((row) => String((row as { key?: unknown })?.key || "").trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }

  const uniqueKeys = Array.from(new Set(keys));
  await Promise.all(
    uniqueKeys.map((key) =>
      deleteFileFromIndexedDb(key).catch(() => {
        // ignore
      }),
    ),
  );

  try {
    localStorage.removeItem(PRACTICE_FILE_CACHE_META_KEY);
    localStorage.removeItem(PRACTICE_TRANSFER_TEMP_DRAFT_KEY);
    localStorage.removeItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
  } catch {
    // ignore
  }
};

const toDraftFileKey = (file: { originalName: string; size: number; s3Key: string }) =>
  `${String(file.originalName || "").trim()}:${Number(file.size || 0)}:${String(file.s3Key || "").trim()}`;

export const PracticeFileTransferPage = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [recentStatusFilter, setRecentStatusFilter] = useState<"all" | "발송완료" | "수신완료" | "다운로드완료">("all");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [tempSaving, setTempSaving] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteMessageCopied, setInviteMessageCopied] = useState(false);
  const [promoNoticeVisible, setPromoNoticeVisible] = useState(true);
  const [promoNoticeSaving, setPromoNoticeSaving] = useState(false);
  const [tempSaveDirty, setTempSaveDirty] = useState(false);
  const [draftFiles, setDraftFiles] = useState<DraftTransferFileItem[]>([]);
  const [draftSummary, setDraftSummary] = useState<DraftListSummary | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(false);
  const [recentRequestsError, setRecentRequestsError] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState<RecentTransferItem | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetTransfer, setDeleteTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTargetTransfer, setRestoreTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [restoringTransfer, setRestoringTransfer] = useState(false);
  const [localFormHydrated, setLocalFormHydrated] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatRoomResolveSeqRef = useRef(0);
  const prevFileCountRef = useRef(0);
  const localFormUpdatedAtRef = useRef(0);
  const skipNextArrivalAutoSyncRef = useRef(false);
  const suppressLocalFormPersistRef = useRef(false);
  const {
    files,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
    rememberLab,
  } = usePracticeTransferStep1();
  const todayDate = useMemo(() => toKstDateInputValue(new Date()), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );

  const [arrivalSettingsDialogOpen, setArrivalSettingsDialogOpen] = useState(false);
  const [arrivalDefaultDaysDraft, setArrivalDefaultDaysDraft] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [savingArrivalSettings, setSavingArrivalSettings] = useState(false);

  const [prosthesisTypeSettingsDialogOpen, setProsthesisTypeSettingsDialogOpen] = useState(false);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [prosthesisTypeCatalog, setProsthesisTypeCatalog] = useState<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<string[]>([
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [savingProsthesisTypeSettings, setSavingProsthesisTypeSettings] = useState(false);
  const [memoSnippets, setMemoSnippets] = useState<string[]>([]);

  const [toothWorks, setToothWorks] = useState<ToothWorkSelection[]>([]);
  const [patientName, setPatientName] = useState("");

  const normalizedProsthesisTypes = useMemo(
    () => normalizeProsthesisTypes(prosthesisTypeCatalog),
    [prosthesisTypeCatalog],
  );
  const normalizedToothWorks = useMemo(() => normalizeToothWorks(toothWorks), [toothWorks]);
  const normalizedPatientName = useMemo(() => String(patientName || "").trim(), [patientName]);
  const autoClinicName = useMemo(() => {
    const profileClinic = String(authUser?.practiceProfile?.clinicName || "").trim();
    if (profileClinic) return profileClinic;
    return String(
      (authUser as { business?: string } | null)?.business ||
        authUser?.companyName ||
        authUser?.name ||
        "",
    ).trim();
  }, [authUser]);

  const orderedToothWorkRows = useMemo(() => {
    if (toothWorks.length === 0) return [] as Array<{
      row: ToothWorkSelection;
      originalIndex: number;
      linkPrev: boolean;
      linkNext: boolean;
    }>;

    const rows = toothWorks.map((row, idx) => ({ row, idx }));
    const toothIndices = rows
      .filter(({ row }) => /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()))
      .map(({ idx }) => idx);

    const byTooth = new Map<string, number>();
    for (const { row, idx } of rows) {
      const tooth = String(row.toothNumber || "").trim();
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      if (!byTooth.has(tooth)) byTooth.set(tooth, idx);
    }

    const toothSet = new Set(toothIndices);
    const adjacency = new Map<number, Set<number>>();
    toothIndices.forEach((idx) => adjacency.set(idx, new Set<number>()));

    for (const idx of toothIndices) {
      const row = rows[idx].row;
      const links = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      for (const linked of links) {
        const linkedIdx = byTooth.get(String(linked || "").trim());
        if (linkedIdx == null) continue;
        if (!toothSet.has(linkedIdx)) continue;
        adjacency.get(idx)?.add(linkedIdx);
        adjacency.get(linkedIdx)?.add(idx);
      }
    }

    const componentKeyByIdx = new Map<number, string>();
    const visited = new Set<number>();

    for (const seed of toothIndices) {
      if (visited.has(seed)) continue;
      const stack = [seed];
      const component: number[] = [];
      visited.add(seed);

      while (stack.length > 0) {
        const cur = stack.pop() as number;
        component.push(cur);
        const nexts = adjacency.get(cur) || new Set<number>();
        for (const n of nexts) {
          if (visited.has(n)) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      component.sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const key = component.map((idx) => rows[idx].row.toothNumber).join("-");
      component.forEach((idx) => componentKeyByIdx.set(idx, key));
    }

    const emitted = new Set<number>();
    const orderedIndices: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      if (emitted.has(i)) continue;
      const key = componentKeyByIdx.get(i);
      if (!key) {
        orderedIndices.push(i);
        emitted.add(i);
        continue;
      }

      const componentIndices = toothIndices.filter((idx) => componentKeyByIdx.get(idx) === key);
      const componentSet = new Set(componentIndices);
      const sortedByTooth = [...componentIndices].sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const endpoints = sortedByTooth.filter((idx) => {
        const degree = [...(adjacency.get(idx) || new Set<number>())].filter((n) => componentSet.has(n))
          .length;
        return degree <= 1;
      });
      const start = endpoints[0] ?? sortedByTooth[0];

      const orderedComponent: number[] = [];
      const componentVisited = new Set<number>();
      let current = start;
      let prev = -1;

      while (current >= 0 && !componentVisited.has(current)) {
        orderedComponent.push(current);
        componentVisited.add(current);

        const nextCandidates = [...(adjacency.get(current) || new Set<number>())]
          .filter((n) => componentSet.has(n) && !componentVisited.has(n))
          .sort(
            (a, b) =>
              toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
          );

        if (nextCandidates.length === 0) break;
        const preferred = nextCandidates.find((n) => n !== prev);
        const nextIdx = preferred ?? nextCandidates[0];
        prev = current;
        current = nextIdx;
      }

      if (orderedComponent.length < componentIndices.length) {
        const remains = sortedByTooth.filter((idx) => !componentVisited.has(idx));
        orderedComponent.push(...remains);
      }

      orderedComponent.forEach((idx) => {
        if (emitted.has(idx)) return;
        orderedIndices.push(idx);
        emitted.add(idx);
      });
    }

    return orderedIndices.map((originalIndex, orderedIndex, arr) => {
      const row = rows[originalIndex].row;
      const key = componentKeyByIdx.get(originalIndex) || "";
      const prevIdx = orderedIndex > 0 ? arr[orderedIndex - 1] : -1;
      const nextIdx = orderedIndex < arr.length - 1 ? arr[orderedIndex + 1] : -1;
      const linkPrev =
        key.length > 0 && prevIdx >= 0 && componentKeyByIdx.get(prevIdx) === key;
      const linkNext =
        key.length > 0 && nextIdx >= 0 && componentKeyByIdx.get(nextIdx) === key;

      return { row, originalIndex, linkPrev, linkNext };
    });
  }, [toothWorks]);

  const { uploadFilesWithToast } = useUploadWithProgressToast({ token: authToken });
  const { rooms: chatRooms } = useChatRooms();

  const {
    messages: chatMessages,
    loading: chatMessagesLoading,
    error: chatMessagesError,
    sendMessage,
    prefetchMessages,
    setMessages: setChatMessages,
  } = useChatMessages({ roomId: activeChatRoom?._id, autoFetch: transferDialogOpen });

  const combinedFilesSizeMb = useMemo(() => {
    const localBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const draftBytes = draftFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    return ((localBytes + draftBytes) / (1024 * 1024)).toFixed(1);
  }, [files, draftFiles]);

  const requestorSignupLink = `${typeof window !== "undefined" ? window.location.origin : ""}/signup`;

  const combinedDisplayFiles = useMemo(
    () => [
      ...files.map((file, index) => ({
        kind: "local" as const,
        key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
        name: String(file.name || "").trim(),
        size: Number(file.size || 0),
        localIndex: index,
      })),
      ...draftFiles.map((file, index) => ({
        kind: "draft" as const,
        key: `${file.fileId}:${file.s3Key}:${index}`,
        name: String(file.originalName || "").trim(),
        size: Number(file.size || 0),
        draftIndex: index,
      })),
    ],
    [files, draftFiles],
  );

  const applyPracticeTransferSettings = useCallback((payload: PracticeTransferSettingsPayload | null) => {
    if (!payload || typeof payload !== "object") return;
    const nextArrivalDefaultDays = normalizeArrivalDefaultDays(
      Number(payload.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
    );
    const nextProsthesisTypes = normalizeProsthesisTypes(
      Array.isArray(payload.prosthesisTypes) ? payload.prosthesisTypes : [...PRESET_PROSTHESIS_TYPES],
    );
    const nextMemoSnippets = normalizeMemoSnippets(payload.memoSnippets);
    const promoDismissed = String(payload.promoNoticeDismissedAt || "").trim().length > 0;

    setArrivalDefaultDays(nextArrivalDefaultDays);
    setArrivalDefaultDaysDraft(nextArrivalDefaultDays);
    setProsthesisTypeCatalog(nextProsthesisTypes);
    setProsthesisTypeCatalogDraft(nextProsthesisTypes);
    setMemoSnippets(nextMemoSnippets);
    setPromoNoticeVisible(!promoDismissed);
    setToothWorks((prev) =>
      prev.map((row) => ({
        toothNumber: row.toothNumber,
        prosthesisType: nextProsthesisTypes.some((type) => type === row.prosthesisType)
          ? row.prosthesisType
          : resolveDefaultProsthesisType(nextProsthesisTypes),
        customAbutment: Boolean(row.customAbutment),
        bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
      })),
    );
  }, []);

  const savePracticeTransferSettingsToServer = useCallback(
    async (params: Partial<PracticeTransferSettingsPayload>) => {
      if (!authToken) return false;

      const hasArrivalDefaultDays = typeof params.arrivalDefaultDays === "number";
      const hasProsthesisTypes = Array.isArray(params.prosthesisTypes);
      const hasMemoSnippets = Array.isArray(params.memoSnippets);
      const hasPromoNoticeDismissedAt = Object.prototype.hasOwnProperty.call(
        params,
        "promoNoticeDismissedAt",
      );

      const jsonBody: Record<string, unknown> = {};
      if (hasArrivalDefaultDays) {
        jsonBody.arrivalDefaultDays = normalizeArrivalDefaultDays(Number(params.arrivalDefaultDays));
      }
      if (hasProsthesisTypes) {
        jsonBody.prosthesisTypes = normalizeProsthesisTypes(params.prosthesisTypes || []);
      }
      if (hasMemoSnippets) {
        jsonBody.memoSnippets = normalizeMemoSnippets(params.memoSnippets || []);
      }
      if (hasPromoNoticeDismissedAt) {
        jsonBody.promoNoticeDismissedAt = params.promoNoticeDismissedAt || null;
      }
      if (Object.keys(jsonBody).length === 0) return true;

      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token: authToken,
        jsonBody,
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "전송 설정 저장에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferSettingsPayload)
          : null;

      applyPracticeTransferSettings(payload);

      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            arrivalDefaultDays: normalizeArrivalDefaultDays(
              Number(payload?.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
            ),
            prosthesisTypes: normalizeProsthesisTypes(
              Array.isArray(payload?.prosthesisTypes)
                ? payload?.prosthesisTypes
                : [...PRESET_PROSTHESIS_TYPES],
            ),
            memoSnippets: normalizeMemoSnippets(
              Array.isArray(payload?.memoSnippets) ? payload?.memoSnippets : memoSnippets,
            ),
            promoNoticeDismissedAt: payload?.promoNoticeDismissedAt || null,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      return true;
    },
    [applyPracticeTransferSettings, authToken, memoSnippets],
  );

  const loadPracticeTransferDraft = useCallback(async () => {
    if (!authToken) {
      setDraftFiles([]);
      setDraftSummary(null);
      return;
    }

    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/draft",
        method: "GET",
        token: authToken,
      });
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferDraftPayload)
          : null;

      if (!payload) {
        setDraftFiles([]);
        setDraftSummary(null);
        return;
      }

      const restoredFiles = Array.isArray(payload.files)
        ? payload.files
            .map((row) => ({
              fileId: String(row?.fileId || "").trim(),
              originalName: String(row?.originalName || "").trim(),
              mimetype: String(row?.mimetype || "application/octet-stream").trim(),
              size: Number(row?.size || 0),
              s3Key: String(row?.s3Key || "").trim(),
              location: String(row?.location || "").trim(),
            }))
            .filter((row) => row.fileId && row.originalName && row.s3Key)
        : [];

      setDraftFiles(restoredFiles);
      if (restoredFiles.length > 0) {
        setDraftSummary({
          id: String(payload._id || "").trim() || "draft-local",
          targetLabName: String(payload.targetLabName || "").trim(),
          transferMemo: String(payload.transferMemo || "").trim(),
          updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
          createdAt: payload.createdAt ? String(payload.createdAt) : null,
        });
      } else {
        setDraftSummary(null);
      }

      const serverUpdatedAt = payload.updatedAt
        ? new Date(String(payload.updatedAt)).getTime()
        : 0;
      const localUpdatedAt = Number(localFormUpdatedAtRef.current || 0);
      const shouldRestoreForm =
        restoredFiles.length > 0 &&
        (!Number.isFinite(localUpdatedAt) ||
          localUpdatedAt <= 0 ||
          (Number.isFinite(serverUpdatedAt) && serverUpdatedAt >= localUpdatedAt));

      if (shouldRestoreForm) {
        suppressLocalFormPersistRef.current = true;

        const labId = String(payload.targetLabAnchorId || "").trim();
        const labName = String(payload.targetLabName || "").trim();
        if (labId && labName) {
          setSelectedLab({
            _id: labId,
            name: labName,
            businessNumber: "",
            representativeName: "",
            address: "",
            businessType: "requestor",
          });
        }

        const parsed = parsePracticeTransferMemoMeta(String(payload.transferMemo || ""));
        if (parsed.orderDate) setOrderDate(parsed.orderDate);
        if (parsed.arrivalDate) {
          skipNextArrivalAutoSyncRef.current = true;
          setArrivalDate(parsed.arrivalDate);
        }
        if (Number.isFinite(Number(parsed.arrivalDefaultDays))) {
          const days = normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays));
          setArrivalDefaultDays(days);
          setArrivalDefaultDaysDraft(days);
        }
        if (parsed.prosthesisTypes.length > 0) {
          const types = normalizeProsthesisTypes(parsed.prosthesisTypes);
          setProsthesisTypeCatalog(types);
          setProsthesisTypeCatalogDraft(types);
        }
        setRequestMemo(String(parsed.memo || ""));

        if (parsed.toothWorks.length > 0) {
          const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
            prosthesisTypes:
              parsed.prosthesisTypes.length > 0
                ? normalizeProsthesisTypes(parsed.prosthesisTypes)
                : [...PRESET_PROSTHESIS_TYPES],
            isCustomAbutmentSupportedProsthesisType,
            isBridgeLikeProsthesisType,
            getAdjacentTeeth,
            fallbackProsthesisType: "크라운",
          });
          if (restoredRows.length > 0) {
            setToothWorks(restoredRows);
          }
        }

        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          localFormUpdatedAtRef.current = serverUpdatedAt;
        }

        queueMicrotask(() => {
          suppressLocalFormPersistRef.current = false;
        });
      }

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] loadDraft", {
          restoredFilesCount: restoredFiles.length,
          shouldRestoreForm,
          localFormUpdatedAt: localFormUpdatedAtRef.current,
          serverUpdatedAt,
        });
      }

      setTempSaveDirty(false);
    } catch {
      // ignore (초안 불러오기 실패는 사용자 흐름 중단 금지)
    }
  }, [authToken, setRequestMemo, setSelectedLab]);

  const loadPracticeTransferSettingsFromServer = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token: authToken,
      });
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferSettingsPayload)
          : null;

      if (localFormUpdatedAtRef.current <= 0) {
        applyPracticeTransferSettings(payload);
      } else if (payload) {
        // 폼 로컬값이 있어도 저장된 문장은 서버 설정을 우선 반영
        setMemoSnippets(normalizeMemoSnippets(payload.memoSnippets));
      }
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            arrivalDefaultDays: normalizeArrivalDefaultDays(Number(payload?.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS)),
            prosthesisTypes: normalizeProsthesisTypes(
              Array.isArray(payload?.prosthesisTypes)
                ? payload?.prosthesisTypes
                : [...PRESET_PROSTHESIS_TYPES],
            ),
            memoSnippets: normalizeMemoSnippets(
              Array.isArray(payload?.memoSnippets) ? payload?.memoSnippets : [],
            ),
            promoNoticeDismissedAt: payload?.promoNoticeDismissedAt || null,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, [applyPracticeTransferSettings, authToken]);

  const loadRecentRequests = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!authToken) {
        if (!silent) {
          setRecentRequests([]);
          setRecentRequestsError("로그인이 필요합니다.");
        }
        return;
      }

      if (!silent) {
        setRecentRequestsLoading(true);
        setRecentRequestsError("");
      }
      try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/my?page=1&limit=100",
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { message?: string })
            : {};
        if (!silent) {
          setRecentRequests([]);
          setRecentRequestsError(
            String(body.message || "최근 전송 내역을 불러올 권한이 없습니다."),
          );
        }
        return;
      }

      const body = res.data;
      const data =
        body && typeof body === "object" && "data" in (body as Record<string, unknown>)
          ? (body as { data?: unknown }).data
          : body;
      const list =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: unknown[] }).requests ?? [])
          : [];

      const mapped: RecentRequestItem[] = list
        .map((raw) => {
          const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const ci =
            r.caseInfos && typeof r.caseInfos === "object"
              ? (r.caseInfos as Record<string, unknown>)
              : {};
          const newSystemRequest =
            ci.newSystemRequest && typeof ci.newSystemRequest === "object"
              ? (ci.newSystemRequest as Record<string, unknown>)
              : {};

          const message = String(newSystemRequest.message || r.description || "").trim();
          const targetLab = extractLabNameFromMessage(message);
          const toothRaw = String(ci.tooth || "").trim();
          const createdAtRaw = String(r.createdAt || "");
          const strippedTransferMemo = stripPracticeTransferMessageEnvelope(message);
          const parsedMemo = parsePracticeTransferMemoMetaShared(strippedTransferMemo);
          const transferMemo = extractTransferMemoFromMessage(message);
          const orderDate = String(r.orderDate || parsedMemo.orderDate || "").trim();
          const arrivalDate = String(r.arrivalDate || parsedMemo.arrivalDate || "").trim();
          const fileObj =
            ci.file && typeof ci.file === "object"
              ? (ci.file as Record<string, unknown>)
              : {};

          const patientName = String(ci.patientName || "").trim() || "-";
          const requestId = String(r.requestId || r._id || "").trim();
          const requestMongoId = String(r.practiceTransferId || r._id || "").trim();

          return {
            id: requestId,
            requestMongoId,
            createdAt: toDateLabel(createdAtRaw),
            requestDate: toDayLabel(createdAtRaw),
            patientName,
            patientKey: normalizePatientNameKey(patientName),
            toothNumbers: toothRaw ? [toothRaw] : [],
            targetLab: targetLab || "-",
            status: toStatusLabel(r.manufacturerStage),
            createdAtTs: new Date(createdAtRaw).getTime(),
            transferId: extractTransferIdFromMessage(message),
            orderDate,
            arrivalDate,
            transferMemo,
            fileName: String(fileObj.originalName || fileObj.name || "").trim(),
            fileS3Key: String(fileObj.s3Key || "").trim(),
            fileSize: Number(fileObj.size || 0),
          };
        })
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

      setRecentRequests(mapped);
      if (silent) {
        setRecentRequestsError("");
      }
    } catch {
      if (!silent) {
        setRecentRequests([]);
        setRecentRequestsError("최근 전송 내역 조회 중 오류가 발생했습니다.");
      }
    } finally {
      if (!silent) {
        setRecentRequestsLoading(false);
      }
    }
  },
  [authToken],
);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PracticeTransferSettingsPayload;
        applyPracticeTransferSettings(parsed);
        return;
      }
    } catch {
      // ignore
    }

    // 레거시 단독 키 마이그레이션
    try {
      const legacyRaw = localStorage.getItem("practice_transfer_memo_snippets_v1");
      if (!legacyRaw) return;
      const legacy = normalizeMemoSnippets(JSON.parse(legacyRaw));
      if (legacy.length > 0) setMemoSnippets(legacy);
    } catch {
      // ignore
    }
  }, [applyPracticeTransferSettings]);

  useEffect(() => {
    void loadPracticeTransferSettingsFromServer();
  }, [loadPracticeTransferSettingsFromServer]);

  useEffect(() => {
    void loadRecentRequests();
  }, [loadRecentRequests]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PracticeTransferLocalFormDraft;
      const localUpdatedAt = Number(parsed.updatedAt || 0);
      if (Number.isFinite(localUpdatedAt) && localUpdatedAt > 0) {
        localFormUpdatedAtRef.current = localUpdatedAt;
      } else {
        localFormUpdatedAtRef.current = Date.now();
      }

      const restoredOrderDate = todayDate;
      const restoredArrivalDate = String(parsed.arrivalDate || "").trim();
      const restoredArrivalDefaultDays = normalizeArrivalDefaultDays(
        Number(parsed.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
      );
      const restoredProsthesisTypes = normalizeProsthesisTypes(
        Array.isArray(parsed.prosthesisTypes)
          ? parsed.prosthesisTypes
          : [...PRESET_PROSTHESIS_TYPES],
      );
      const restoredMemo = String(parsed.requestMemo || "");
      const restoredPatientName = String(parsed.patientName || "");

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] restore local form", {
          localUpdatedAt: localFormUpdatedAtRef.current,
          restoredOrderDate,
          restoredArrivalDate,
          restoredArrivalDefaultDays,
          restoredProsthesisTypes,
          restoredToothWorksCount: Array.isArray(parsed.toothWorks) ? parsed.toothWorks.length : 0,
        });
      }

      if (restoredArrivalDate) {
        skipNextArrivalAutoSyncRef.current = true;
      }
      setOrderDate(restoredOrderDate);
      if (restoredArrivalDate) setArrivalDate(restoredArrivalDate);
      setArrivalDefaultDays(restoredArrivalDefaultDays);
      setArrivalDefaultDaysDraft(restoredArrivalDefaultDays);
      setProsthesisTypeCatalog(restoredProsthesisTypes);
      setProsthesisTypeCatalogDraft(restoredProsthesisTypes);
      setRequestMemo(restoredMemo);
      setPatientName(restoredPatientName);

      const lab = parsed.selectedLab;
      if (lab && typeof lab === "object") {
        const id = String(lab._id || "").trim();
        const name = String(lab.name || "").trim();
        if (id && name) {
          setSelectedLab({
            _id: id,
            name,
            businessNumber: String(lab.businessNumber || "").trim(),
            representativeName: String(lab.representativeName || "").trim(),
            address: String(lab.address || "").trim(),
            businessType: String(lab.businessType || "requestor").trim(),
          });
        }
      }

      if (Array.isArray(parsed.toothWorks)) {
        const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
          prosthesisTypes: restoredProsthesisTypes,
          isCustomAbutmentSupportedProsthesisType,
          isBridgeLikeProsthesisType,
          getAdjacentTeeth,
          fallbackProsthesisType: "크라운",
        });

        if (import.meta.env.DEV) {
          console.info("[practice-transfer] restore toothWorks from local", {
            rawCount: parsed.toothWorks.length,
            restoredCount: restoredRows.length,
            firstRow: restoredRows[0] || null,
          });
        }

        if (restoredRows.length > 0) {
          setToothWorks(restoredRows);
        }
      }
    } catch {
      // ignore
    } finally {
      setLocalFormHydrated(true);
    }
  }, [setRequestMemo, setSelectedLab, todayDate]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (suppressLocalFormPersistRef.current) return;

    const updatedAt = Date.now();

    const payload: PracticeTransferLocalFormDraft = {
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      requestMemo,
      patientName,
      selectedLab: selectedLab
        ? {
            _id: String(selectedLab._id || "").trim(),
            name: String(selectedLab.name || "").trim(),
            businessNumber: String(selectedLab.businessNumber || "").trim(),
            representativeName: String(selectedLab.representativeName || "").trim(),
            address: String(selectedLab.address || "").trim(),
            businessType: String(selectedLab.businessType || "requestor").trim(),
          }
        : null,
      toothWorks,
      updatedAt,
    };

    try {
      localStorage.setItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY, JSON.stringify(payload));
      localFormUpdatedAtRef.current = updatedAt;
      if (import.meta.env.DEV) {
        console.info("[practice-transfer] save local form", {
          updatedAt,
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          prosthesisTypes: normalizedProsthesisTypes,
          toothWorksCount: toothWorks.length,
          firstToothWork: toothWorks[0]
            ? {
                toothNumber: String(toothWorks[0].toothNumber || ""),
                prosthesisType: String(toothWorks[0].prosthesisType || ""),
              }
            : null,
        });
      }
    } catch {
      // ignore
    }
  }, [
    arrivalDate,
    arrivalDefaultDays,
    localFormHydrated,
    normalizedProsthesisTypes,
    orderDate,
    requestMemo,
    patientName,
    selectedLab,
    toothWorks,
  ]);

  useEffect(() => {
    if (!localFormHydrated) return;
    void loadPracticeTransferDraft();
  }, [localFormHydrated, loadPracticeTransferDraft]);

  const periodAndSearchFilteredRequests = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    const periodFiltered = recentRequests.filter((request) => {
      if (!request.requestDate || request.requestDate === "-") return false;

      const createdTs = Number(request.createdAtTs || 0);
      if (!Number.isFinite(createdTs) || createdTs <= 0) return true;
      const created = new Date(createdTs);

      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const diffDays = (now.getTime() - createdTs) / dayMs;

      if (period === "30d") return diffDays <= 30;
      if (period === "90d") return diffDays <= 90;

      const y = now.getFullYear();
      const m = now.getMonth();
      const startThisMonth = new Date(y, m, 1, 0, 0, 0, 0);
      const startNextMonth = new Date(y, m + 1, 1, 0, 0, 0, 0);
      const startLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);

      if (period === "thisMonth") {
        return created >= startThisMonth && created < startNextMonth;
      }

      return created >= startLastMonth && created < startThisMonth;
    });

    if (!query) return periodFiltered;

    return periodFiltered.filter((request) => {
      const searchableText = [
        request.id,
        request.transferId,
        request.createdAt,
        request.requestDate,
        request.patientName,
        request.toothNumbers.join(" "),
        request.targetLab,
        request.orderDate,
        request.arrivalDate,
        request.status,
        request.fileName,
        request.transferMemo,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recentRequests, requestSearchTerm, period]);

  const filteredRecentRequests = useMemo(
    () =>
      periodAndSearchFilteredRequests.filter(
        (request) => String(request.status || "").trim() !== "취소",
      ),
    [periodAndSearchFilteredRequests],
  );

  const trashRecentRequests = useMemo(
    () =>
      periodAndSearchFilteredRequests.filter(
        (request) => String(request.status || "").trim() === "취소",
      ),
    [periodAndSearchFilteredRequests],
  );

  const groupedTransfers = useMemo(() => {
    const unreadByTransferId = new Map<string, number>();
    const latestChatTsByTransferId = new Map<string, number>();
    for (const room of chatRooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      unreadByTransferId.set(transferId, Number(room.unreadCount || 0));

      const lastTs = new Date(String(room.lastMessageAt || "")).getTime();
      if (Number.isFinite(lastTs) && lastTs > 0) {
        latestChatTsByTransferId.set(transferId, lastTs);
      }
    }

    const byKey = new Map<
      string,
      RecentTransferItem & {
        _statuses: Set<string>;
        _patients: Set<string>;
        _requestIds: Set<string>;
        _transferMongoIds: Set<string>;
        _files: Map<string, TransferFileItem>;
      }
    >();

    for (const req of filteredRecentRequests) {
      const minuteBucket = Math.floor(Number(req.createdAtTs || 0) / (60 * 1000));
      const fallbackKey = `${minuteBucket}|${String(req.targetLab || "-")}`;
      const key = req.transferId || fallbackKey;

      const patientKey = String(req.patientKey || "").trim();
      const existing = byKey.get(key);
      if (!existing) {
        const initialPatients = new Set<string>();
        if (patientKey) initialPatients.add(patientKey);

        const requestIds = new Set<string>([req.id]);
        const transferMongoIds = new Set<string>();
        if (req.requestMongoId) transferMongoIds.add(req.requestMongoId);
        const files = new Map<string, TransferFileItem>();
        if (req.fileName && req.fileS3Key) {
          files.set(req.fileS3Key, {
            fileName: req.fileName,
            s3Key: req.fileS3Key,
            size: Number(req.fileSize || 0),
          });
        }
        const unreadCount = Number(unreadByTransferId.get(req.transferId) || 0);
        byKey.set(key, {
          id: req.id,
          transferId: req.transferId || "-",
          deleteTargetLabel: req.transferId || req.id,
          createdAt: req.createdAt,
          createdAtTs: req.createdAtTs,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          orderDate: req.orderDate,
          arrivalDate: req.arrivalDate,
          status: req.status,
          fileCount: 1,
          patientCount: Math.max(1, initialPatients.size),
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: req.fileName ? [req.fileName] : [],
          files: req.fileName && req.fileS3Key
            ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: Number(req.fileSize || 0) }]
            : [],
          transferMemo: req.transferMemo,
          unreadCount,
          searchBlob: [
            req.id,
            req.createdAt,
            req.requestDate,
            req.patientName,
            req.toothNumbers.join(" "),
            req.targetLab,
            req.orderDate,
            req.arrivalDate,
            req.status,
            req.transferMemo,
            req.transferId,
            req.fileName,
          ]
            .join(" ")
            .toLowerCase(),
          _statuses: new Set([req.status]),
          _patients: initialPatients,
          _requestIds: requestIds,
          _transferMongoIds: transferMongoIds,
          _files: files,
        });
        continue;
      }

      existing.fileCount += 1;
      if (patientKey) {
        existing._patients.add(patientKey);
      }
      existing.patientCount = Math.max(1, existing._patients.size);
      existing._statuses.add(req.status);
      existing._requestIds.add(req.id);
      existing.requestIds = Array.from(existing._requestIds);
      if (req.requestMongoId) {
        existing._transferMongoIds.add(req.requestMongoId);
      }
      existing.transferMongoIds = Array.from(existing._transferMongoIds);
      if (req.fileName && req.fileS3Key) {
        existing._files.set(req.fileS3Key, {
          fileName: req.fileName,
          s3Key: req.fileS3Key,
          size: Number(req.fileSize || 0),
        });
      }
      existing.files = Array.from(existing._files.values());
      existing.fileNames = existing.files.map((f) => f.fileName).filter(Boolean);

      if (!existing.transferMemo && req.transferMemo) {
        existing.transferMemo = req.transferMemo;
      }
      if (!existing.orderDate && req.orderDate) {
        existing.orderDate = req.orderDate;
      }
      if (!existing.arrivalDate && req.arrivalDate) {
        existing.arrivalDate = req.arrivalDate;
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }

      existing.unreadCount = Number(unreadByTransferId.get(existing.transferId) || 0);

      existing.searchBlob = `${existing.searchBlob} ${[
        req.patientName,
        req.toothNumbers.join(" "),
        req.id,
        req.orderDate,
        req.arrivalDate,
        req.transferMemo,
        req.fileName,
      ].join(" ")}`.toLowerCase();
      if (!existing.transferId || existing.transferId === "-") {
        existing.deleteTargetLabel = req.id;
      }

      const statusSet = existing._statuses;
      if (statusSet.size === 1) {
        existing.status = [...statusSet][0] || existing.status;
      } else if (statusSet.has("발송완료")) {
        existing.status = "발송완료";
      } else if (statusSet.has("수신완료")) {
        existing.status = "수신완료";
      } else if (statusSet.has("다운로드완료")) {
        existing.status = "다운로드완료";
      } else if (statusSet.has("취소")) {
        existing.status = "취소";
      } else {
        existing.status = "발송완료";
      }
    }

    return [...byKey.values()]
      .map(({ _statuses: _s, _patients: _p, _requestIds: _r, _transferMongoIds: _tm, _files: _f, ...row }) => ({
        ...row,
        files: Array.isArray(row.files) ? row.files : [],
        fileNames: Array.isArray(row.fileNames) ? row.fileNames : [],
        deleteTargetLabel:
          row.transferId && row.transferId !== "-"
            ? row.transferId
            : row.id,
      }))
      .sort((a, b) => {
        const aChatTs = Number(latestChatTsByTransferId.get(a.transferId) || 0);
        const bChatTs = Number(latestChatTsByTransferId.get(b.transferId) || 0);
        const aSortTs = aChatTs > 0 ? aChatTs : Number(a.createdAtTs || 0);
        const bSortTs = bChatTs > 0 ? bChatTs : Number(b.createdAtTs || 0);
        return bSortTs - aSortTs;
      });
  }, [filteredRecentRequests, chatRooms]);

  const statusCounts = useMemo(() => {
    return groupedTransfers.reduce(
      (acc, request) => {
        const status = String(request.status || "").trim();
        if (status === "다운로드완료") {
          acc.downloaded += 1;
        } else if (status === "수신완료") {
          acc.read += 1;
        } else {
          acc.sent += 1;
        }
        return acc;
      },
      { sent: 0, read: 0, downloaded: 0 },
    );
  }, [groupedTransfers]);

  const filteredGroupedTransfers = useMemo(() => {
    if (recentStatusFilter === "all") return groupedTransfers;
    return groupedTransfers.filter((transfer) => String(transfer.status || "").trim() === recentStatusFilter);
  }, [groupedTransfers, recentStatusFilter]);

  const draftRecentTransfer = useMemo((): RecentTransferItem | null => {
    if (draftFiles.length === 0) return null;

    const updatedAtRaw =
      draftSummary?.updatedAt || draftSummary?.createdAt || new Date().toISOString();
    const createdAtTs = new Date(updatedAtRaw).getTime();
    const safeTs = Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs : Date.now();
    const targetLab =
      String(draftSummary?.targetLabName || selectedLab?.name || "-").trim() || "-";
    const rawMemo = String(draftSummary?.transferMemo || requestMemo || "").trim();
    const displayMemo = formatTransferMemoForDisplay(rawMemo);
    const files = draftFiles.map((file) => ({
      fileName: file.originalName,
      s3Key: file.s3Key,
      size: Number(file.size || 0),
    }));
    const parsedMemo = parsePracticeTransferMemoMeta(rawMemo);

    return {
      id: draftSummary?.id || "draft-local",
      transferId: PRACTICE_DRAFT_TRANSFER_ID,
      deleteTargetLabel: "임시저장",
      createdAt: toDateLabel(updatedAtRaw),
      createdAtTs: safeTs,
      requestDate: toDayLabel(updatedAtRaw),
      targetLab,
      orderDate: String(parsedMemo.orderDate || orderDate || "").trim(),
      arrivalDate: String(parsedMemo.arrivalDate || arrivalDate || "").trim(),
      status: "임시저장",
      fileCount: files.length,
      patientCount: 1,
      requestIds: [],
      transferMongoIds: [],
      fileNames: files.map((file) => file.fileName).filter(Boolean),
      files,
      transferMemo: displayMemo,
      unreadCount: 0,
      searchBlob: [
        "임시저장",
        PRACTICE_DRAFT_TRANSFER_ID,
        targetLab,
        displayMemo,
        ...files.map((file) => file.fileName),
      ]
        .join(" ")
        .toLowerCase(),
    };
  }, [
    arrivalDate,
    draftFiles,
    draftSummary,
    orderDate,
    requestMemo,
    selectedLab,
  ]);

  const displayGroupedTransfers = filteredGroupedTransfers;

  const draftGroupedTransfers = useMemo(() => {
    if (!draftRecentTransfer) return [] as RecentTransferItem[];
    const query = requestSearchTerm.trim().toLowerCase();
    if (query && !draftRecentTransfer.searchBlob.includes(query)) return [];
    return [draftRecentTransfer];
  }, [draftRecentTransfer, requestSearchTerm]);

  const trashGroupedTransfers = useMemo(() => {
    const byKey = new Map<string, RecentTransferItem>();

    for (const req of trashRecentRequests) {
      const key =
        req.transferId && req.transferId !== "-"
          ? `tid:${req.transferId}`
          : req.requestMongoId
            ? `mid:${req.requestMongoId}`
            : `id:${req.id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id: req.id,
          transferId: req.transferId || "-",
          deleteTargetLabel:
            req.transferId && req.transferId !== "-" ? req.transferId : req.id,
          createdAt: req.createdAt,
          createdAtTs: req.createdAtTs,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          orderDate: req.orderDate,
          arrivalDate: req.arrivalDate,
          status: "취소",
          fileCount: req.fileName ? 1 : 0,
          patientCount: 1,
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: req.fileName ? [req.fileName] : [],
          files:
            req.fileName && req.fileS3Key
              ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: req.fileSize }]
              : [],
          transferMemo: req.transferMemo,
          unreadCount: 0,
          searchBlob: "",
        });
        continue;
      }

      existing.requestIds = Array.from(new Set([...existing.requestIds, req.id]));
      if (req.requestMongoId) {
        existing.transferMongoIds = Array.from(
          new Set([...existing.transferMongoIds, req.requestMongoId]),
        );
      }
      if (req.fileName && req.fileS3Key) {
        const already = existing.files.some((file) => file.s3Key === req.fileS3Key);
        if (!already) {
          existing.files = [
            ...existing.files,
            { fileName: req.fileName, s3Key: req.fileS3Key, size: req.fileSize },
          ];
          existing.fileNames = existing.files.map((file) => file.fileName);
          existing.fileCount = existing.files.length;
        }
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }
    }

    return [...byKey.values()].sort(
      (a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0),
    );
  }, [trashRecentRequests]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };

  const asApiMessagePayload = (value: unknown) => {
    if (!value || typeof value !== "object") return {} as { message?: string };
    return value as { message?: string };
  };

  const myIdCandidates = useMemo(() => {
    const ids = [authUser?.id, (authUser as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [authUser]);

  const selectedTransferDisplayMemo = useMemo(
    () => formatTransferMemoForDisplay(String(selectedTransfer?.transferMemo || "")),
    [selectedTransfer?.transferMemo],
  );

  const handleOpenTransferDialog = async (transfer: RecentTransferItem) => {
    if (
      transfer.status === "임시저장" ||
      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      toast({
        title: "임시저장된 의뢰",
        description: "왼쪽 기공의뢰 카드에서 이어서 작성·전송할 수 있습니다.",
      });
      return;
    }

    const resolveSeq = ++chatRoomResolveSeqRef.current;

    setSelectedTransfer(transfer);
    setTransferDialogOpen(true);
    setChatDraft("");
    setChatAttachedFiles([]);
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatError("");

    if (!authToken) {
      setChatError("로그인이 필요합니다.");
      return;
    }

    const transferId = String(transfer.transferId || "").trim();
    if (!transferId || transferId === "-") {
      setChatError("전송 ID를 확인할 수 없어 채팅방을 열 수 없습니다.");
      return;
    }

    const cachedRoom = chatRooms.find(
      (room) => String(room.relatedPracticeTransferId?.transferId || "").trim() === transferId,
    );
    if (cachedRoom?._id) {
      void prefetchMessages(cachedRoom._id);
      if (resolveSeq !== chatRoomResolveSeqRef.current) return;
      setActiveChatRoom(cachedRoom);
      setChatError("");
      return;
    }

    setChatLoading(true);
    try {
      const res = await apiFetch<unknown>({
        path: `/api/chats/practice/transfer-room/${encodeURIComponent(transferId)}`,
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "채팅방을 불러오지 못했습니다."));
      }

      const payload = extractDataFromResponse<ChatRoom>(res.data);
      if (!payload?._id) {
        throw new Error("채팅방 정보가 올바르지 않습니다.");
      }

      if (payload?._id) {
        void prefetchMessages(payload._id);
      }
      if (resolveSeq !== chatRoomResolveSeqRef.current) return;
      setActiveChatRoom(payload);
      setChatError("");
    } catch (error) {
      if (resolveSeq !== chatRoomResolveSeqRef.current) return;
      setChatError(
        error instanceof Error
          ? error.message
          : "채팅방을 불러오는 중 오류가 발생했습니다.",
      );
    } finally {
      if (resolveSeq === chatRoomResolveSeqRef.current) {
        setChatLoading(false);
      }
    }
  };

  const handleCloseTransferDialog = () => {
    chatRoomResolveSeqRef.current += 1;
    setTransferDialogOpen(false);
    setSelectedTransfer(null);
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatDraft("");
    setChatAttachedFiles([]);
    setChatError("");
  };

  const handleSendChatMessage = async () => {
    if (!activeChatRoom?._id || chatSending) return;

    const content = String(chatDraft || "").trim();
    const files = [...chatAttachedFiles];
    if (!content && files.length === 0) return;

    setChatSending(true);
    try {
      let attachments: Array<{
        fileId?: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        s3Key: string;
        s3Url: string;
      }> = [];

      if (files.length > 0) {
        const uploadedFiles: TempUploadedFile[] = await uploadFilesWithToast(files);
        attachments = uploadedFiles
          .map((f) => ({
            fileId: String(f._id || "").trim() || undefined,
            fileName: String(f.originalName || "").trim(),
            fileType: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
            fileSize: Number(f.size || 0),
            s3Key: String(f.key || "").trim(),
            s3Url: String(f.location || "").trim(),
          }))
          .filter((row) => row.fileName && row.s3Key);
      }

      const sent = await sendMessage(content, attachments);
      if (sent) {
        setChatDraft("");
        setChatAttachedFiles([]);
      }
    } finally {
      setChatSending(false);
    }
  };

  const handleDownloadTransferFile = useCallback(
    async (file: TransferFileItem) => {
      if (!authToken) return;
      const fileName = String(file?.fileName || "첨부파일").trim() || "첨부파일";
      const s3Key = String(file?.s3Key || "").trim();
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "파일 키를 확인할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(fileName)}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!resp.ok) {
          throw new Error("전송 파일 다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "전송 파일 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [authToken, toast],
  );

  const handleDownloadAllTransferFiles = useCallback(async () => {
    const files = Array.isArray(selectedTransfer?.files) ? selectedTransfer.files : [];
    if (!files.length) return;

    await Promise.all(files.map((file) => handleDownloadTransferFile(file)));
  }, [handleDownloadTransferFile, selectedTransfer]);

  const handleDownloadChatAttachment = useCallback(
    async (attachment: {
      fileName?: string;
      fileSize?: number;
      s3Key?: string;
      s3Url?: string;
    }) => {
      if (!authToken) return;

      const rawName = String(attachment?.fileName || "첨부파일").trim() || "첨부파일";
      const s3Key = String(attachment?.s3Key || "").trim();
      if (!s3Key) {
        toast({
          title: "다운로드 실패",
          description: "첨부파일 키를 확인할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(rawName)}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!resp.ok) {
          throw new Error("첨부파일 다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = rawName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "첨부파일 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [authToken, toast],
  );

  const handleAttachChatFiles = (inputFiles: FileList | null) => {
    const nextFiles = Array.from(inputFiles || []);
    if (!nextFiles.length) return;

    setChatAttachedFiles((prev) => {
      const map = new Map<string, File>();
      for (const f of [...prev, ...nextFiles]) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (!map.has(key)) map.set(key, f);
      }
      return [...map.values()];
    });
  };

  const handleRemoveAttachedChatFile = (idx: number) => {
    setChatAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const syncDraftFilesToServer = async (nextDraftFiles: DraftTransferFileItem[]) => {
    if (!authToken) return;

    if (nextDraftFiles.length === 0) {
      await apiFetch<unknown>({
        path: "/api/practice/transfers/draft",
        method: "DELETE",
        token: authToken,
      });
      setDraftSummary(null);
      return;
    }

    await apiFetch<unknown>({
      path: "/api/practice/transfers/draft",
      method: "POST",
      token: authToken,
      jsonBody: {
        targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
        targetLabName: String(selectedLab?.name || "").trim(),
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        transferMemo: String(requestMemo || "").trim(),
        files: nextDraftFiles.map((row) => ({ fileId: row.fileId })),
      },
    });
  };

  const handleRemoveCombinedFile = async (target: {
    kind: "local" | "draft";
    localIndex?: number;
    draftIndex?: number;
  }) => {
    if (target.kind === "local" && Number.isFinite(Number(target.localIndex))) {
      removeFile(Number(target.localIndex));
      return;
    }

    if (target.kind === "draft" && Number.isFinite(Number(target.draftIndex))) {
      const removeIndex = Number(target.draftIndex);
      const prevDraftFiles = [...draftFiles];
      const nextDraftFiles = prevDraftFiles.filter((_, idx) => idx !== removeIndex);
      setDraftFiles(nextDraftFiles);

      try {
        await syncDraftFilesToServer(nextDraftFiles);
      } catch {
        setDraftFiles(prevDraftFiles);
        toast({
          title: "파일 삭제 실패",
          description: "임시저장 파일 반영 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleClearAllTransferFiles = async () => {
    await clearAllFiles();
    if (draftFiles.length > 0) {
      const prevDraftFiles = [...draftFiles];
      setDraftFiles([]);
      try {
        await syncDraftFilesToServer([]);
      } catch {
        setDraftFiles(prevDraftFiles);
        toast({
          title: "전체삭제 실패",
          description: "임시저장 파일 반영 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleAskDeleteTransfer = (transfer: RecentTransferItem) => {
    setDeleteTargetTransfer(transfer);
    setDeleteConfirmOpen(true);
  };

  const handleCancelDeleteTransfer = () => {
    if (deletingTransfer) return;
    setDeleteConfirmOpen(false);
    setDeleteTargetTransfer(null);
  };

  const handleConfirmDeleteTransfer = async () => {
    if (deletingTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const target = deleteTargetTransfer;
    if (!target) {
      setDeleteConfirmOpen(false);
      setDeleteTargetTransfer(null);
      return;
    }

    if (
      target.status === "임시저장" ||
      target.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      setDeletingTransfer(true);
      try {
        await apiFetch<unknown>({
          path: "/api/practice/transfers/draft",
          method: "DELETE",
          token: authToken,
        });
        setDraftFiles([]);
        setDraftSummary(null);
        toast({
          title: "임시저장 삭제 완료",
          description: "임시저장된 의뢰를 삭제했습니다.",
        });
      } catch (error) {
        toast({
          title: "임시저장 삭제 실패",
          description:
            error instanceof Error ? error.message : "임시저장 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setDeletingTransfer(false);
        setDeleteConfirmOpen(false);
        setDeleteTargetTransfer(null);
      }
      return;
    }

    const requestIds = Array.isArray(target?.requestIds)
      ? target!.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const transferIds = target?.transferId && target.transferId !== "-" ? [target.transferId] : [];
    const transferMongoIds = Array.isArray(target?.transferMongoIds)
      ? target!.transferMongoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!target || (transferIds.length === 0 && transferMongoIds.length === 0)) {
      toast({
        title: "삭제할 전송건이 없습니다",
        variant: "destructive",
      });
      setDeleteConfirmOpen(false);
      setDeleteTargetTransfer(null);
      return;
    }

    setDeletingTransfer(true);

    const deletedSet = new Set(requestIds);
    const previousRecentRequests = recentRequests;

    // optimistic UI: 최근 내역에서 제외하고 휴지통(취소)으로 이동
    setRecentRequests((prev) =>
      prev.map((row) =>
        deletedSet.has(row.id) ? { ...row, status: "취소" } : row,
      ),
    );
    setDeleteConfirmOpen(false);
    setDeleteTargetTransfer(null);

    try {
      // related files:
      // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
      // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
      // practice 전용 배치 취소 라우트 사용 (PracticeTransfer SSOT)
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/cancel-batch",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferIds,
          transferMongoIds,
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "의뢰서 전송 내역 삭제(취소)에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { successCount?: number; failedIds?: string[] } })
          : {};
      const data = body.data || {};
      const successCount = Number(data.successCount || 0);
      const failedIds = (Array.isArray(data.failedIds) ? data.failedIds : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      if (successCount <= 0) {
        // 전건 실패 시 optimistic 변경 롤백
        setRecentRequests(previousRecentRequests);
        toast({
          title: "휴지통 이동 실패",
          description: "삭제 권한 또는 대상 상태를 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "휴지통으로 이동 완료",
          description:
            failedIds.length > 0
              ? `${successCount}건 이동, ${failedIds.length}건은 권한/상태 제한으로 이동되지 않았습니다.`
              : `${successCount}건을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.`,
        });

        // 부분 실패면 서버 기준으로 재동기화(실패 건을 다시 표시)
        if (failedIds.length > 0) {
          void loadRecentRequests();
        }
      }

    } catch (error) {
      // 통신/서버 오류 시 optimistic 변경 롤백
      setRecentRequests(previousRecentRequests);
      toast({
        title: "휴지통 이동 실패",
        description:
          error instanceof Error
            ? error.message
            : "의뢰서 전송 내역 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  const handleAskRestoreTransfer = (transfer: RecentTransferItem) => {
    setRestoreTargetTransfer(transfer);
    setRestoreConfirmOpen(true);
  };

  const handleCancelRestoreTransfer = () => {
    if (restoringTransfer) return;
    setRestoreConfirmOpen(false);
    setRestoreTargetTransfer(null);
  };

  const handleConfirmRestoreTransfer = async () => {
    if (restoringTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const target = restoreTargetTransfer;
    if (!target) {
      setRestoreConfirmOpen(false);
      setRestoreTargetTransfer(null);
      return;
    }

    const transferIds =
      target.transferId && target.transferId !== "-" ? [target.transferId] : [];
    const transferMongoIds = Array.isArray(target.transferMongoIds)
      ? target.transferMongoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (transferIds.length === 0 && transferMongoIds.length === 0) {
      toast({
        title: "복구할 전송건이 없습니다",
        variant: "destructive",
      });
      setRestoreConfirmOpen(false);
      setRestoreTargetTransfer(null);
      return;
    }

    setRestoringTransfer(true);
    const previousRecentRequests = recentRequests;
    const restoreIdSet = new Set(
      Array.isArray(target.requestIds)
        ? target.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    // optimistic: 취소 → 발송완료로 되돌림
    setRecentRequests((prev) =>
      prev.map((row) =>
        restoreIdSet.has(row.id) ||
        (target.transferId &&
          target.transferId !== "-" &&
          row.transferId === target.transferId)
          ? { ...row, status: "발송완료" }
          : row,
      ),
    );
    setRestoreConfirmOpen(false);
    setRestoreTargetTransfer(null);

    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/restore-batch",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferIds,
          transferMongoIds,
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "휴지통 복구에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { successCount?: number; failedIds?: string[] } })
          : {};
      const data = body.data || {};
      const successCount = Number(data.successCount || 0);
      const failedIds = (Array.isArray(data.failedIds) ? data.failedIds : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      if (successCount <= 0) {
        setRecentRequests(previousRecentRequests);
        toast({
          title: "복구 실패",
          description: "복구 권한 또는 대상 상태를 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "복구 완료",
          description:
            failedIds.length > 0
              ? `${successCount}건 복구, ${failedIds.length}건은 복구되지 않았습니다.`
              : `${successCount}건을 최근 전송 내역으로 복구했습니다.`,
        });
        void loadRecentRequests({ silent: true });
      }
    } catch (error) {
      setRecentRequests(previousRecentRequests);
      toast({
        title: "복구 실패",
        description:
          error instanceof Error ? error.message : "휴지통 복구 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setRestoringTransfer(false);
    }
  };

  useEffect(() => {
    if (!transferDialogOpen || !activeChatRoom?._id) return;
    const raf = window.requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [transferDialogOpen, activeChatRoom?._id, chatMessages.length, chatMessagesLoading]);

  useAppEventDebouncedReload({
    enabled: Boolean(authToken),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    delayMs: 160,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const action = String(payload.action || "").trim().toLowerCase();
      const isDraftEvent =
        action === "draft-upserted" || action === "draft-cleared";

      if (isDraftEvent) {
        void loadPracticeTransferDraft();
        return;
      }

      void loadRecentRequests({ silent: true });
      // 전송 생성/정리 직후 동료 화면의 임시저장 카드도 맞춰 둔다.
      if (String(evt?.type || "").trim() === "practice:transfer-created") {
        void loadPracticeTransferDraft();
      }
    },
  });

  useEffect(() => {
    const prevCount = prevFileCountRef.current;
    const nextCount = files.length;
    if (nextCount > prevCount) {
      setTempSaveDirty(true);
    }
    prevFileCountRef.current = nextCount;
  }, [files]);

  const handleTempSaveDraft = async () => {
    if (tempSaving) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (files.length === 0 && draftFiles.length === 0) return;

    setTempSaving(true);
    try {
      const uploadedTempFiles: TempUploadedFile[] = files.length
        ? await uploadFilesWithToast(files)
        : [];

      const mergedDraftFiles = [
        ...draftFiles,
        ...uploadedTempFiles.map((f) => ({
          fileId: String(f._id || "").trim(),
          originalName: String(f.originalName || "").trim(),
          mimetype: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
          size: Number(f.size || 0),
          s3Key: String(f.key || "").trim(),
          location: String(f.location || "").trim(),
        })),
      ].filter((row) => row.fileId && row.originalName && row.s3Key);

      const dedupedDraftFiles = Array.from(
        new Map(mergedDraftFiles.map((row) => [toDraftFileKey(row), row])).values(),
      );

      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: normalizedToothWorks,
      });

      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/draft",
        method: "POST",
        token: authToken,
        jsonBody: {
          targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          transferMemo,
          files: dedupedDraftFiles.map((row) => ({
            fileId: row.fileId,
          })),
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "임시저장에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferDraftPayload)
          : null;

      const nextDraftFiles = Array.isArray(payload?.files)
        ? payload.files
            .map((row) => ({
              fileId: String(row?.fileId || "").trim(),
              originalName: String(row?.originalName || "").trim(),
              mimetype: String(row?.mimetype || "application/octet-stream").trim(),
              size: Number(row?.size || 0),
              s3Key: String(row?.s3Key || "").trim(),
              location: String(row?.location || "").trim(),
            }))
            .filter((row) => row.fileId && row.originalName && row.s3Key)
        : dedupedDraftFiles;

      setDraftFiles(nextDraftFiles);
      if (nextDraftFiles.length > 0) {
        setDraftSummary({
          id: String(payload?._id || draftSummary?.id || "").trim() || "draft-local",
          targetLabName: String(payload?.targetLabName || selectedLab?.name || "").trim(),
          transferMemo: String(payload?.transferMemo || transferMemo || "").trim(),
          updatedAt: payload?.updatedAt
            ? String(payload.updatedAt)
            : new Date().toISOString(),
          createdAt: payload?.createdAt
            ? String(payload.createdAt)
            : draftSummary?.createdAt || new Date().toISOString(),
        });
      } else {
        setDraftSummary(null);
      }
      if (files.length > 0) {
        await clearAllFiles();
      }
      setTempSaveDirty(false);
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_TEMP_DRAFT_KEY,
          JSON.stringify({ savedAt: Date.now(), source: "server" }),
        );
      } catch {
        // ignore
      }
      toast({
        title: "임시저장 완료",
        description: "서버에 임시저장했습니다. 아래 임시저장 카드에서 확인할 수 있습니다.",
      });
    } catch (error) {
      toast({
        title: "임시저장 실패",
        description: error instanceof Error ? error.message : "임시저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setTempSaving(false);
    }
  };

  const handleSubmitPracticeRequest = async () => {
    if (requestSubmitting) return;

    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (missingRequiredFields.length > 0) {
      toast({
        title: "필수 입력 항목을 확인해주세요",
        description: `미입력 항목: ${missingRequiredFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!orderDate || !arrivalDate) {
      toast({
        title: "날짜를 확인해주세요",
        description: "주문일과 도착일을 모두 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (arrivalDate < orderDate) {
      toast({
        title: "도착일을 확인해주세요",
        description: "도착일은 주문일보다 빠를 수 없습니다.",
        variant: "destructive",
      });
      return;
    }



    const hasBridgeLikeWithoutLinkedTooth = normalizedToothWorks.some(
      (row) => isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length === 0,
    );
    if (hasBridgeLikeWithoutLinkedTooth) {
      toast({
        title: "브리지/Pontic 연결 치아를 선택해주세요",
        description: "브리지 또는 Pontic 형태는 인접 치아를 최소 1개 연결해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setRequestSubmitting(true);
    try {
      const uploadedTempFiles: TempUploadedFile[] = files.length
        ? await uploadFilesWithToast(files)
        : [];

      const localTempFiles = uploadedTempFiles
        .map((f) => ({
          fileId: String(f._id || "").trim(),
          originalName: String(f.originalName || "").trim(),
          mimetype: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
          size: Number(f.size || 0),
          s3Key: String(f.key || "").trim(),
          location: String(f.location || "").trim(),
        }))
        .filter((row) => row.originalName && row.s3Key);

      const transferFiles = [...draftFiles, ...localTempFiles];
      if (transferFiles.length === 0) {
        throw new Error("전송할 파일이 없습니다.");
      }

      const clinicName = autoClinicName;
      const transferId = makeTransferId();
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: normalizedToothWorks,
      });
      const caseInfosPayload = transferFiles.map((tempFile) => {
        const originalName = String(tempFile.originalName || "").trim();
        const parsed = parseFilenameWithRules(originalName);
        const tooth = String(parsed.tooth || "").trim();

        return {
          clinicName,
          patientName: normalizedPatientName,
          tooth,
          workType: "abutment",
          designSoftware: "3Shape",
          file: {
            originalName,
            size: Number(tempFile.size || 0),
            mimetype: String(tempFile.mimetype || "application/octet-stream").trim(),
            s3Key: String(tempFile.s3Key || "").trim(),
          },
          newSystemRequest: {
            requested: true,
            manufacturer: "",
            brand: "",
            family: "",
            message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
            free: true,
            tag: "practice_file_transfer",
          },
          // related files:
          // - web/backend/models/practiceTransfer.model.js
          // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
          // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
          // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
          practiceRouting: {
            targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
            targetLabName: String(selectedLab?.name || "").trim(),
          },
        };
      });

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferId,
          targetLabAnchorId: String(selectedLab?._id || "").trim() || null,
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          transferMemo,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "기공소 전송에 실패했습니다."));
      }

      suppressLocalFormPersistRef.current = true;

      rememberLab(selectedLab);
      await clearAllFiles();
      setDraftFiles([]);
      setDraftSummary(null);
      setSelectedLab(null);
      setPatientName("");
      setRequestMemo("");
      setToothWorks([]);
      setTempSaveDirty(true);

      try {
        await apiFetch<unknown>({
          path: "/api/practice/transfers/draft",
          method: "DELETE",
          token: authToken,
        });
      } catch {
        // ignore (전송 성공을 임시저장 삭제 실패로 롤백하지 않음)
      }

      await clearPracticeFileTransferCaches();

      toast({
        title: "기공소 전송 완료",
        description: "기공소로 정상 전송되었습니다.",
      });
      navigate("/practice/dashboard");
    } catch (error) {
      toast({
        title: "기공소 전송 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setRequestSubmitting(false);
    }
  };

  const canTempSave =
    !requestSubmitting &&
    !tempSaving &&
    tempSaveDirty &&
    combinedDisplayFiles.length > 0;

  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (combinedDisplayFiles.length === 0) missing.push("첨부 파일");
    if (!String(selectedLab?._id || "").trim()) missing.push("기공소");
    if (!normalizedPatientName) missing.push("환자명");
    if (normalizedToothWorks.length === 0) missing.push("보철물 형태");
    return missing;
  }, [combinedDisplayFiles.length, selectedLab?._id, normalizedPatientName, normalizedToothWorks.length]);

  const hasRequiredSubmitFields = missingRequiredFields.length === 0;

  useEffect(() => {
    if (!orderDate) return;
    if (skipNextArrivalAutoSyncRef.current) {
      skipNextArrivalAutoSyncRef.current = false;
      return;
    }
    setArrivalDate(addDaysToDateInput(orderDate, arrivalDefaultDays));
  }, [orderDate, arrivalDefaultDays]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (toothWorks.length > 0) return;
    if (normalizedProsthesisTypes.length === 0) return;
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);
  }, [localFormHydrated, normalizedProsthesisTypes, toothWorks.length]);

  const handleAddToothWorkRow = () => {
    setToothWorks((prev) => [
      ...prev,
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);
  };

  const handleClearRequestIntakeCache = () => {
    try {
      localStorage.removeItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
    } catch {
      // ignore
    }

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setOrderDate(todayDate);
    setArrivalDate(addDaysToDateInput(todayDate, arrivalDefaultDays));
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);
    setTempSaveDirty(true);

    toast({
      title: "의뢰 접수 캐시 삭제",
      description: "의뢰 접수 카드의 임시 입력값을 초기화했습니다.",
    });
  };

  const handleStartNewTransfer = async () => {
    try {
      localStorage.removeItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY);
    } catch {
      // ignore
    }

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setOrderDate(todayDate);
    setArrivalDate(addDaysToDateInput(todayDate, arrivalDefaultDays));
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
      },
    ]);

    // 로컬 첨부 + 임시저장 파일까지 모두 제거
    await handleClearAllTransferFiles();
    setDraftSummary(null);
    setTempSaveDirty(false);

    toast({
      title: "새로 작성",
      description: "첨부 파일을 포함해 새 기공의뢰서 작성 화면으로 초기화했습니다.",
    });
  };

  const handleSaveArrivalSettings = async () => {
    if (savingArrivalSettings) return;
    setSavingArrivalSettings(true);
    try {
      const nextDays = normalizeArrivalDefaultDays(arrivalDefaultDaysDraft);
      const ok = await savePracticeTransferSettingsToServer({
        arrivalDefaultDays: nextDays,
        prosthesisTypes: normalizedProsthesisTypes,
      });
      if (!ok) throw new Error("설정 저장에 실패했습니다.");
      setArrivalDate(addDaysToDateInput(orderDate, nextDays));
      setArrivalSettingsDialogOpen(false);
      toast({ title: "도착 기본일 설정 저장", description: `기본값을 +${nextDays}일로 저장했습니다.` });
    } catch (error) {
      toast({
        title: "설정 저장 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSavingArrivalSettings(false);
    }
  };

  const handleSaveProsthesisTypeSettings = async () => {
    if (savingProsthesisTypeSettings) return;
    setSavingProsthesisTypeSettings(true);
    try {
      const nextTypes = normalizeProsthesisTypes(prosthesisTypeCatalogDraft);
      const ok = await savePracticeTransferSettingsToServer({
        arrivalDefaultDays,
        prosthesisTypes: nextTypes,
      });
      if (!ok) throw new Error("설정 저장에 실패했습니다.");

      setToothWorks((prev) =>
        prev.map((row) => ({
          toothNumber: row.toothNumber,
          prosthesisType: nextTypes.some((type) => type === row.prosthesisType)
            ? row.prosthesisType
            : resolveDefaultProsthesisType(nextTypes),
          customAbutment: Boolean(row.customAbutment),
          bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
        })),
      );
      setProsthesisTypeSettingsDialogOpen(false);
      toast({ title: "보철물 형태 설정 저장", description: "형태 목록을 저장했습니다." });
    } catch (error) {
      toast({
        title: "설정 저장 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSavingProsthesisTypeSettings(false);
    }
  };

  const handleCopyPracticeDropzoneLink = async () => {
    try {
      await navigator.clipboard.writeText(requestorSignupLink);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "기공소 초대 링크가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인하고 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const handleCopyPracticeInviteMessage = async () => {
    const message = `안녕하세요 🙂 기공소에서 어벗츠 회원가입을 해주시면 치과에서 파일과 의뢰서를 더 쉽고 빠르게 보낼 수 있습니다.\n아래 링크에서 가입 부탁드립니다.\n${requestorSignupLink}`;
    try {
      await navigator.clipboard.writeText(message);
      setInviteMessageCopied(true);
      setTimeout(() => setInviteMessageCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "전송 안내 문구가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인하고 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const handleDismissPromoNotice = async () => {
    if (promoNoticeSaving) return;
    if (!authToken) {
      setPromoNoticeVisible(false);
      return;
    }

    setPromoNoticeSaving(true);
    try {
      const ok = await savePracticeTransferSettingsToServer({
        promoNoticeDismissedAt: new Date().toISOString(),
      });
      if (!ok) throw new Error("안내 배너 저장에 실패했습니다.");
      setPromoNoticeVisible(false);
    } catch (error) {
      toast({
        title: "안내 숨김 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setPromoNoticeSaving(false);
    }
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="h-full min-h-0"
    >
      <div className="h-full min-h-0 p-3 space-y-3">
        {promoNoticeVisible ? (
          <Alert className="border-blue-200 bg-blue-50 text-blue-900">
            <button
              type="button"
              onClick={() => void handleDismissPromoNotice()}
              disabled={promoNoticeSaving}
              className="absolute right-3 top-3 rounded p-1 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="안내 닫기"
            >
              <X className="h-4 w-4" />
            </button>
            <AlertTitle className="text-[1.3125rem] leading-snug">{PRACTICE_TRANSFER_PROMO_TITLE}</AlertTitle>
            <AlertDescription className="text-[1.3125rem] leading-snug">{PRACTICE_TRANSFER_PROMO_DESC}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
          <Card className="xl:col-span-7">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UploadCloud className="h-4 w-4 text-blue-600" />
                  기공의뢰
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void handleStartNewTransfer()}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  새로 작성
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <PracticeTransferIntakeSection
                filePaneProps={{
                  acceptedHint: PRACTICE_ACCEPTED_HINT,
                  fileInputId: "practice-file-transfer-input",
                  files: combinedDisplayFiles.map((file) => ({
                    key: file.key,
                    name: file.name,
                    size: file.size,
                    metaSuffix: file.kind === "draft" ? "임시저장됨" : undefined,
                  })),
                  totalSizeMb: combinedFilesSizeMb,
                  onPickFiles: handleIncomingFiles,
                  onRemoveFile: (key) => {
                    const target = combinedDisplayFiles.find((file) => file.key === key);
                    if (!target) return;
                    void handleRemoveCombinedFile({
                      kind: target.kind,
                      localIndex: target.kind === "local" ? target.localIndex : undefined,
                      draftIndex: target.kind === "draft" ? target.draftIndex : undefined,
                    });
                  },
                  onClearAllFiles: () => {
                    void handleClearAllTransferFiles();
                  },
                }}
                requestIntakeProps={{
                  selectedLab,
                  setSelectedLab,
                  labOpen,
                  setLabOpen,
                  labSearch,
                  setLabSearch,
                  labSearchResults,
                  labSearching,
                  recentLabs,
                  recentLabsInitialized,
                  patientName,
                  setPatientName,
                  orderDate,
                  setOrderDate,
                  arrivalDate,
                  setArrivalDate,
                  arrivalDefaultDays,
                  setArrivalDefaultDaysDraft,
                  setArrivalSettingsDialogOpen,
                  normalizedProsthesisTypes,
                  setProsthesisTypeCatalogDraft,
                  setProsthesisTypeSettingsDialogOpen,
                  toothWorks,
                  setToothWorks,
                  requestMemo,
                  setRequestMemo,
                  memoInputId: "practice-file-transfer-request-memo",
                  memoSnippets,
                  onMemoSnippetsChange: async (next) => {
                    const normalized = normalizeMemoSnippets(next);
                    setMemoSnippets(normalized);
                    try {
                      const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
                      const existing =
                        existingRaw && typeof existingRaw === "string"
                          ? (JSON.parse(existingRaw) as Record<string, unknown>)
                          : {};
                      localStorage.setItem(
                        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
                        JSON.stringify({
                          ...existing,
                          arrivalDefaultDays,
                          prosthesisTypes: normalizedProsthesisTypes,
                          memoSnippets: normalized,
                          savedAt: Date.now(),
                        }),
                      );
                      localStorage.setItem(
                        "practice_transfer_memo_snippets_v1",
                        JSON.stringify(normalized),
                      );
                    } catch {
                      // ignore
                    }
                    await savePracticeTransferSettingsToServer({ memoSnippets: normalized });
                  },
                  prosthesisTypeSelectWidthClassName: "w-[7rem]",
                  showBridgeConnections: true,
                  toothTensOptions: TOOTH_TENS_OPTIONS,
                  toothOnesOptions: TOOTH_ONES_OPTIONS,
                  onClearAll: handleClearRequestIntakeCache,
                }}
              />

              <div className="flex items-center justify-between gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          className="bg-white hover:bg-slate-400"
                          onClick={handleTempSaveDraft}
                          disabled={!canTempSave}
                        >
                          {tempSaving ? "임시저장 중..." : "업로드 후 임시저장"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      파일/의뢰 메모를 서버에 임시 저장해 다른 PC에서도 이어서 전송할 때 사용합니다.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  type="button"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void handleSubmitPracticeRequest()}
                  disabled={requestSubmitting || !hasRequiredSubmitFields}
                >
                  {requestSubmitting ? "기공소로 전송 중..." : "기공소로 전송"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 xl:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">기공소 초대 링크</CardTitle>
                <CardDescription>
                  기공소가 어벗츠에 회원가입하면 치과에서 파일 및 의뢰서를 더 쉽게 보낼 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="rounded-md border bg-background p-2.5">
                    <p className="text-xs font-mono break-all text-muted-foreground">
                      {requestorSignupLink}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyPracticeDropzoneLink()}
                      className="h-8 gap-1.5"
                    >
                      {inviteLinkCopied ? (
                        <>
                          <Copy className="h-4 w-4" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4" />
                          링크 복사
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyPracticeInviteMessage()}
                      className="h-8 gap-1.5"
                    >
                      {inviteMessageCopied ? (
                        <>
                          <Copy className="h-4 w-4" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          안내문구 복사
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  최근 전송 내역
                </CardTitle>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-start">
                    <PeriodFilter value={period} onChange={setPeriod} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "발송완료" ? "all" : "발송완료"))
                      }
                      aria-pressed={recentStatusFilter === "발송완료"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "발송완료"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "hover:bg-muted/40",
                        )}
                      >
                        발송완료 {statusCounts.sent}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "수신완료" ? "all" : "수신완료"))
                      }
                      aria-pressed={recentStatusFilter === "수신완료"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "수신완료"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "hover:bg-muted/40",
                        )}
                      >
                        수신완료 {statusCounts.read}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "다운로드완료" ? "all" : "다운로드완료"))
                      }
                      aria-pressed={recentStatusFilter === "다운로드완료"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "다운로드완료"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "hover:bg-muted/40",
                        )}
                      >
                        다운로드완료 {statusCounts.downloaded}건
                      </Badge>
                    </button>
                  </div>

                  <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={requestSearchTerm}
                      onChange={(e) => setRequestSearchTerm(e.target.value)}
                      className="pl-9"
                      placeholder="전송ID, 치과명, 파일명, 환자명 검색"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentRequestsLoading ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    최근 전송 내역을 불러오는 중입니다...
                  </div>
                ) : recentRequestsError ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-destructive">
                    {recentRequestsError}
                  </div>
                ) : displayGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {recentStatusFilter === "all"
                      ? "검색 조건에 맞는 의뢰서 전송 내역이 없습니다."
                      : `${recentStatusFilter} 상태의 의뢰서 전송 내역이 없습니다.`}
                  </div>
                ) : (
                  <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                    {displayGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const isDraftTransfer =
                        transfer.status === "임시저장" ||
                        transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;

                      return (
                        <div
                          key={`${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void handleOpenTransferDialog(transfer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void handleOpenTransferDialog(transfer);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {isDraftTransfer
                                  ? "임시저장"
                                  : transfer.transferId !== "-"
                                    ? transfer.transferId
                                    : transfer.id}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <p className="truncate text-xs text-muted-foreground">{transfer.createdAt}</p>
                                <Badge variant="outline" className="whitespace-nowrap">
                                  {transfer.status}
                                </Badge>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{targetLabText}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                파일 {transfer.fileCount}개
                                {transfer.orderDate ? ` · 주문 ${transfer.orderDate}` : ""}
                                {transfer.arrivalDate ? ` · 도착 ${transfer.arrivalDate}` : ""}
                                {String(transfer.transferMemo || "").trim()
                                  ? ` · 메모: ${String(transfer.transferMemo || "")
                                      .replace(/\s+/g, " ")
                                      .trim()}`
                                  : ""}
                              </p>
                            </div>

                            <div className="relative shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleAskDeleteTransfer(transfer);
                                }}
                                aria-label="의뢰서 전송 내역 삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              {transfer.unreadCount > 0 ? (
                                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                                  {transfer.unreadCount > 99 ? "99+" : transfer.unreadCount}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookmarkPlus className="h-4 w-4 text-slate-500" />
                  임시저장
                  {draftGroupedTransfers.length > 0 ? (
                    <Badge variant="secondary" className="ml-1">
                      {draftGroupedTransfers.length}
                    </Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {draftGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    임시저장된 의뢰가 없습니다.
                  </div>
                ) : (
                  <div className="max-h-[15.25rem] space-y-2 overflow-y-auto pr-1">
                    {draftGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";

                      return (
                        <div
                          key={`draft:${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void handleOpenTransferDialog(transfer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void handleOpenTransferDialog(transfer);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">임시저장</p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {transfer.createdAt}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {targetLabText}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                파일 {transfer.fileCount}개
                                {transfer.orderDate ? ` · 주문 ${transfer.orderDate}` : ""}
                                {transfer.arrivalDate ? ` · 도착 ${transfer.arrivalDate}` : ""}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleAskDeleteTransfer(transfer);
                              }}
                              aria-label="임시저장 삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trash2 className="h-4 w-4 text-slate-500" />
                  휴지통
                  {trashGroupedTransfers.length > 0 ? (
                    <Badge variant="secondary" className="ml-1">
                      {trashGroupedTransfers.length}
                    </Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {trashGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    휴지통이 비어 있습니다.
                  </div>
                ) : (
                  <div className="max-h-[15.25rem] space-y-2 overflow-y-auto pr-1">
                    {trashGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";

                      return (
                        <div
                          key={`trash:${transfer.id}:${transfer.createdAt}`}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {transfer.transferId !== "-"
                                  ? transfer.transferId
                                  : transfer.id}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {transfer.createdAt}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {targetLabText}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                파일 {transfer.fileCount}개
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-slate-500 hover:text-sky-700"
                              onClick={() => handleAskRestoreTransfer(transfer)}
                              aria-label="의뢰서 복구"
                              title="복구"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <PracticeTransferDetailChatDialog
          open={transferDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setTransferDialogOpen(true);
              return;
            }
            handleCloseTransferDialog();
          }}
          title="의뢰서 전송 상세 · 기공소 채팅"
          conversationTitle="기공소와의 소통"
          summaryItems={[
            {
              label: "전송ID",
              value:
                selectedTransfer?.transferId && selectedTransfer.transferId !== "-"
                  ? selectedTransfer.transferId
                  : selectedTransfer?.id || "-",
            },
            { label: "전송시각", value: selectedTransfer?.createdAt || "-" },
            { label: "기공소", value: selectedTransfer?.targetLab || "-" },
            { label: "주문일", value: selectedTransfer?.orderDate || "-" },
            { label: "도착일", value: selectedTransfer?.arrivalDate || "-" },
            { label: "파일 수", value: `${selectedTransfer?.fileCount || 0}개` },
          ] satisfies PracticeTransferDialogSummaryItem[]}
          memo={selectedTransferDisplayMemo}
          filesLabel="파일"
          files={
            (selectedTransfer?.files || []).map((file, idx) => ({
              id: `${file.s3Key}:${idx}`,
              fileName: file.fileName,
              size: Number(file.size || 0),
              s3Key: String(file.s3Key || "").trim(),
            })) satisfies PracticeTransferDialogFileItem[]
          }
          onDownloadAllFiles={() => void handleDownloadAllTransferFiles()}
          onDownloadTransferFile={(file) =>
            void handleDownloadTransferFile({
              fileName: file.fileName,
              s3Key: file.s3Key,
              size: file.size,
            })
          }
          chatLoading={chatLoading || chatMessagesLoading}
          chatError={String(chatError || chatMessagesError || "")}
          chatMessages={chatMessages}
          isMyMessage={(senderId) => myIdCandidates.has(senderId)}
          formatChatTime={formatChatTs}
          formatFileSize={formatFileSize}
          onDownloadChatAttachment={handleDownloadChatAttachment}
          chatBottomRef={chatBottomRef}
          chatAttachedFiles={chatAttachedFiles}
          onRemoveAttachedChatFile={handleRemoveAttachedChatFile}
          onAttachChatFiles={handleAttachChatFiles}
          attachmentInputId="practice-transfer-chat-attachment-input"
          chatDraft={chatDraft}
          onChangeChatDraft={setChatDraft}
          onSendChatMessage={() => void handleSendChatMessage()}
          composerPlaceholder="문의 내용을 입력하세요"
          inputDisabled={chatLoading || chatMessagesLoading || chatSending || !activeChatRoom?._id}
          sendDisabled={
            chatLoading ||
            chatMessagesLoading ||
            chatSending ||
            !activeChatRoom?._id ||
            (!String(chatDraft || "").trim() && chatAttachedFiles.length === 0)
          }
        />

        <Dialog
          open={arrivalSettingsDialogOpen}
          onOpenChange={(open) => {
            setArrivalSettingsDialogOpen(open);
            if (open) {
              setArrivalDefaultDaysDraft(arrivalDefaultDays);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>소요일 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                id="practice-arrival-default-days-dialog"
                type="number"
                min={0}
                max={365}
                value={arrivalDefaultDaysDraft}
                onChange={(e) => setArrivalDefaultDaysDraft(normalizeArrivalDefaultDays(Number(e.target.value || 0)))}
              />
              <p className="text-xs text-muted-foreground">
                주문일 기준으로 도착일이 자동 계산됩니다.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setArrivalSettingsDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveArrivalSettings()}
                disabled={savingArrivalSettings}
              >
                {savingArrivalSettings ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={prosthesisTypeSettingsDialogOpen}
          onOpenChange={(open) => {
            setProsthesisTypeSettingsDialogOpen(open);
            if (open) {
              setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>보철물 형태 항목 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {prosthesisTypeCatalogDraft.map((item, index) => (
                <div key={`${item}:${index}`} className="flex items-center gap-1.5">
                  <Input
                    value={item}
                    onChange={(e) =>
                      setProsthesisTypeCatalogDraft((prev) => {
                        const next = [...prev];
                        next[index] = e.target.value;
                        return next;
                      })
                    }
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() =>
                      setProsthesisTypeCatalogDraft((prev) => {
                        const next = prev.filter((_, i) => i !== index);
                        return next.length ? next : [...PRESET_PROSTHESIS_TYPES];
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-1.5">
                <Input
                  value={prosthesisTypeInput}
                  onChange={(e) => setProsthesisTypeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const trimmed = String(prosthesisTypeInput || "").trim();
                    if (!trimmed) return;
                    setProsthesisTypeCatalogDraft((prev) =>
                      normalizeProsthesisTypes([...prev, trimmed]),
                    );
                    setProsthesisTypeInput("");
                  }}
                  placeholder="형태 추가"
                  className="h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const trimmed = String(prosthesisTypeInput || "").trim();
                    if (!trimmed) return;
                    setProsthesisTypeCatalogDraft((prev) =>
                      normalizeProsthesisTypes([...prev, trimmed]),
                    );
                    setProsthesisTypeInput("");
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  추가
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProsthesisTypeSettingsDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveProsthesisTypeSettings()}
                disabled={savingProsthesisTypeSettings}
              >
                {savingProsthesisTypeSettings ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteConfirmOpen}
          title={
            deleteTargetTransfer?.status === "임시저장" ||
            deleteTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
              ? "임시저장을 삭제할까요?"
              : "이 의뢰서를 휴지통으로 이동할까요?"
          }
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {deleteTargetTransfer?.transferId && deleteTargetTransfer.transferId !== "-"
                  ? deleteTargetTransfer.transferId === PRACTICE_DRAFT_TRANSFER_ID
                    ? "임시저장"
                    : deleteTargetTransfer.transferId
                  : deleteTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                {deleteTargetTransfer?.status === "임시저장" ||
                deleteTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? `첨부 파일 ${deleteTargetTransfer?.fileCount || 0}건과 함께 임시저장을 삭제합니다.`
                  : `첨부 파일 ${deleteTargetTransfer?.fileCount || 0}건과 함께 휴지통으로 이동합니다. 아래에서 다시 복구할 수 있습니다.`}
              </div>
            </div>
          }
          confirmLabel={
            deletingTransfer
              ? "처리 중..."
              : deleteTargetTransfer?.status === "임시저장" ||
                  deleteTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                ? "삭제"
                : "휴지통으로 이동"
          }
          cancelLabel="취소"
          onConfirm={handleConfirmDeleteTransfer}
          onCancel={handleCancelDeleteTransfer}
        />

        <ConfirmDialog
          open={restoreConfirmOpen}
          title="이 의뢰서를 복구할까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {restoreTargetTransfer?.transferId && restoreTargetTransfer.transferId !== "-"
                  ? restoreTargetTransfer.transferId
                  : restoreTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                최근 전송 내역으로 되돌아가며, 기공소에서도 다시 확인할 수 있습니다.
              </div>
            </div>
          }
          confirmLabel={restoringTransfer ? "복구 중..." : "복구"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmRestoreTransfer()}
          onCancel={handleCancelRestoreTransfer}
        />
      </div>
    </PageFileDropZone>
  );
};
