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
 * - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
 * - web/frontend/src/shared/practice/toothWorkDraft.ts
 * - web/frontend/src/shared/hooks/useS3TempUpload.ts
 * - web/frontend/src/shared/hooks/useFilePreUpload.ts
 * - 2026-08-11: 최근 전송 뱃지 「다운로드」→「의뢰수락」(requestorDownloadedAt=수락 SSOT)
 * - 2026-08-11: 생산의뢰식 레이아웃·안내문구 최소화(즉시툴팁). 프로모 카피 축소.
 * - 2026-08-11: 기공의뢰 Card 유지, [기공소로 전송]만 카드 아래. intake는 plain.
 * - 2026-08-11: 상단 뱃지 5칸 — 의뢰·수락·완료·발송·추적관리(수신 제거, 수신완료는 의뢰 집계).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

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
  Plus,
  Settings,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { useFilePreUpload } from "@/shared/hooks/useFilePreUpload";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  usePracticeTransferStep1,
  isAutoMatchLab,
  type SearchBusinessResult,
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
  PRACTICE_TRANSFER_FORM_LOCAL_KEY,
  PRACTICE_TRANSFER_TEMP_DRAFT_KEY,
  type PracticeTransferFormLocalDraft as PracticeTransferLocalFormDraft,
  adoptDropzoneDraftIntoTransferFormIfNeeded,
  clearPracticeSharedFormLocalStorage,
} from "@/shared/practice/practiceTransferFormLocal";
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
      formatPracticeTransferMemoDetail as formatPracticeTransferMemoDetailShared,
      formatTransferMemoForDisplay as formatTransferMemoForDisplayShared,
      normalizeToothWorksForSync,
      emptyToothWorkCustomSpecs,
      pickToothWorkCustomSpecs,
      normalizeImplantFavorites,
      normalizeAbutmentFavorites,
      parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
      stripPracticeTransferMessageEnvelope,
      type PracticeAbutmentFavorite,
      type PracticeImplantFavorite,
      type ToothWorkSelection as SharedToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import { kstYmdDiffDays } from "@/shared/date/kst";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type RecentRequestItem = {
  id: string; // 전송 내 파일 row 식별자(표시/그룹/optimistic 삭제용)
  requestMongoId: string; // PracticeTransfer _id (삭제 API 호출용)
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  targetLabAnchorId: string;
  status: string;
  createdAtTs: number;
  transferId: string;
  orderDate: string;
  arrivalDate: string;
  transferMemo: string;
  /** 메타 태그 포함 원본 메모 — 보철물 차트 파싱용 */
  rawTransferMemo: string;
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
  practiceUserId?: string | null;
  practiceUserLabel?: string | null;
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
  practiceUserId: string;
  practiceUserLabel: string;
  isMine: boolean;
  targetLabAnchorId: string | null;
  targetLabName: string;
  transferMemo: string;
  patientName: string;
  fileCount: number;
  files: DraftTransferFileItem[];
  updatedAt: string | null;
  createdAt: string | null;
};

const PRACTICE_DRAFT_TRANSFER_ID = "DRAFT-TEMP";

const toDraftListSummary = (
  payload: PracticeTransferDraftPayload,
  myUserId: string,
): DraftListSummary | null => {
  const files = Array.isArray(payload.files)
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

  const practiceUserId = String(payload.practiceUserId || "").trim();
  const parsed = parsePracticeTransferMemoMetaShared(String(payload.transferMemo || ""));
  // 목록 노출: 환자명·메모·기공소·파일. 치아만 있는 건은 빈 임시저장으로 보지 않는다.
  const hasFormContent =
    Boolean(String(parsed.patientName || "").trim()) ||
    Boolean(String(parsed.memo || "").trim()) ||
    Boolean(String(payload.targetLabName || "").trim()) ||
    Boolean(String(payload.targetLabAnchorId || "").trim());
  if (files.length === 0 && !hasFormContent) return null;

  return {
    id: String(payload._id || "").trim() || "draft-local",
    practiceUserId,
    practiceUserLabel: String(payload.practiceUserLabel || "").trim() || "담당자",
    isMine: Boolean(myUserId) && practiceUserId === myUserId,
    targetLabAnchorId: String(payload.targetLabAnchorId || "").trim() || null,
    targetLabName: String(payload.targetLabName || "").trim(),
    transferMemo: String(payload.transferMemo || "").trim(),
    patientName: String(parsed.patientName || "").trim(),
    fileCount: files.length,
    files,
    updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
    createdAt: payload.createdAt ? String(payload.createdAt) : null,
  };
};

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
  /** 메타 태그 포함 원본 메모 — 보철물 차트 파싱용 */
  rawTransferMemo?: string;
  unreadCount: number;
  searchBlob: string;
  practiceUserId?: string;
  practiceUserLabel?: string;
  isMineDraft?: boolean;
  draftPatientName?: string;
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

const formatTransferMemoForDisplay = (rawMemo: string) =>
  formatPracticeTransferMemoDetailShared(rawMemo, { includeDateSummary: false }) ||
  formatTransferMemoForDisplayShared(rawMemo);

const extractTransferMemoFromMessage = (message: string) =>
  extractTransferMemoFromMessageShared(message, { includeDateSummary: false });

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const PRESET_PROSTHESIS_TYPES = ["크라운", "브리지", "Pontic", "인레이", "어벗 디자인"] as const;
const PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY = "practice_transfer_settings_v1";

type ToothWorkSelection = SharedToothWorkSelection;

type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName: string;
  memo: string;
};

type PracticeTransferFormFingerprintInput = {
  targetLabAnchorId?: string | null;
  targetLabName?: string | null;
  patientName?: string | null;
  orderDate?: string | null;
  arrivalDate?: string | null;
  arrivalDefaultDays?: number | null;
  requestMemo?: string | null;
  prosthesisTypes?: string[] | null;
  toothWorks?: ToothWorkSelection[] | null;
};

const isMongoObjectIdString = (value: unknown) =>
  /^[a-f\d]{24}$/i.test(String(value || "").trim());

const normalizeFingerprintLabAnchorId = (value: unknown) => {
  const id = String(value || "").trim();
  // recent:/draft-lab: 등 로컬 임시 id는 서버에서 null로 저장되므로 fingerprint도 비운다.
  return isMongoObjectIdString(id) ? id : "";
};

const buildPracticeTransferFormFingerprint = (
  input: PracticeTransferFormFingerprintInput,
) =>
  JSON.stringify({
    targetLabAnchorId: normalizeFingerprintLabAnchorId(input.targetLabAnchorId),
    targetLabName: String(input.targetLabName || "").trim(),
    patientName: String(input.patientName || "")
      .trim()
      .normalize("NFC"),
    orderDate: String(input.orderDate || "").trim(),
    arrivalDate: String(input.arrivalDate || "").trim(),
    arrivalDefaultDays: normalizeArrivalDefaultDays(Number(input.arrivalDefaultDays || 0)),
    requestMemo: String(input.requestMemo || "").trim(),
    prosthesisTypes: ensurePresetProsthesisTypes(
      Array.isArray(input.prosthesisTypes) ? input.prosthesisTypes : [],
    ),
    toothWorks: normalizeToothWorksForSync(
      Array.isArray(input.toothWorks) ? input.toothWorks : [],
    ),
  });

const toApiLabAnchorId = (value: unknown): string | null => {
  const id = String(value || "").trim();
  return isMongoObjectIdString(id) ? id : null;
};

type PracticeTransferSettingsPayload = {
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  memoSnippets?: string[];
  implantFavorites?: PracticeImplantFavorite[];
  abutmentFavorites?: PracticeAbutmentFavorite[];
  promoNoticeDismissedAt?: string | null;
  updatedAt?: string | null;
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

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return (
    prosthesisType === "크라운" ||
    prosthesisType === "브리지" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact)
  );
};

const sanitizeProsthesisTypeLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  if (/^커스텀어벗\+?크라운$/i.test(compact)) return "크라운";
  if (/^커스텀어벗\+?브리지$/i.test(compact)) return "브리지";
  if (/^(?:커스텀)?어벗디자인$/i.test(compact)) return "어벗 디자인";
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

/** 케이스 동기화가 목록을 Pontic만으로 줄이지 않도록 프리셋을 항상 병합한다. */
const ensurePresetProsthesisTypes = (items: string[] | null | undefined) =>
  normalizeProsthesisTypes([
    ...PRESET_PROSTHESIS_TYPES,
    ...(Array.isArray(items) ? items : []),
  ]);

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
        ...pickToothWorkCustomSpecs(row, customAbutment),
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
      const implantParts = [
        row.implantManufacturer,
        row.implantBrand,
        row.implantFamily,
        row.implantType,
      ].map((v) => String(v || "").trim());
      const hasImplant = implantParts.some(Boolean);
      const abutmentParts = [
        row.abutmentManufacturer,
        row.abutmentDiameter,
        row.abutmentHeight,
      ].map((v) => String(v || "").trim());
      const hasAbutment = abutmentParts.some(Boolean);
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? `+커스텀어벗${hasImplant ? `{${implantParts.join("/")}}` : ""}${
              hasAbutment ? `[${abutmentParts.join("/")}]` : ""
            }`
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
      const rawTooth = String(toothRaw || "").trim();
      const toothNumber = !rawTooth || rawTooth === "-" ? "" : rawTooth;
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
          ...emptyToothWorkCustomSpecs(),
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;
      const abutMatch = withoutLinked.match(/\[([^\]]*)\]\s*$/);
      const abutRaw = abutMatch ? abutMatch[1] : "";
      if (abutMatch) withoutLinked = withoutLinked.replace(/\[[^\]]*\]\s*$/, "").trim();
      const abutParts = String(abutRaw || "").split("/");
      const abutment = {
        abutmentManufacturer: String(abutParts[0] || "").trim(),
        abutmentDiameter: String(abutParts[1] || "").trim(),
        abutmentHeight: abutParts.slice(2).join("/").trim(),
      };

      const implantMatch = withoutLinked.match(/\{([^}]*)\}\s*$/);
      const implantRaw = implantMatch ? implantMatch[1] : "";
      if (implantMatch) withoutLinked = withoutLinked.replace(/\{[^}]*\}\s*$/, "").trim();
      const implantParts = String(implantRaw || "").split("/");
      const implant = {
        implantManufacturer: String(implantParts[0] || "").trim(),
        implantBrand: String(implantParts[1] || "").trim(),
        implantFamily: String(implantParts[2] || "").trim(),
        implantType: implantParts.slice(3).join("/").trim(),
      };

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }
      if (
        implant.implantManufacturer ||
        implant.implantBrand ||
        implant.implantFamily ||
        implant.implantType ||
        abutment.abutmentManufacturer ||
        abutment.abutmentDiameter ||
        abutment.abutmentHeight
      ) {
        customAbutment = true;
      }
      const prosthesisType = withoutLinked;
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber && v !== "-")
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs({ ...implant, ...abutment }, customAbutment),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

const parsePracticeTransferMemoMeta = (rawMemo: string): ParsedPracticeTransferMemoMeta => {
  const source = String(rawMemo || "").trim();
  const defaultOrderDate = toKstDateInputValue(new Date());
  const defaults: ParsedPracticeTransferMemoMeta = {
    orderDate: defaultOrderDate,
    arrivalDate: addDaysToDateInput(defaultOrderDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
    arrivalDefaultDays: DEFAULT_ARRIVAL_OFFSET_DAYS,
    prosthesisTypes: [...PRESET_PROSTHESIS_TYPES],
    toothWorks: [],
    patientName: "",
    memo: source,
  };
  if (!source) return defaults;

  const parsed = parsePracticeTransferMemoMetaShared(source);
  return {
    orderDate: parsed.orderDate || defaults.orderDate,
    arrivalDate:
      parsed.arrivalDate ||
      addDaysToDateInput(parsed.orderDate || defaults.orderDate, parsed.arrivalDefaultDays),
    arrivalDefaultDays: Number.isFinite(Number(parsed.arrivalDefaultDays))
      ? normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays))
      : defaults.arrivalDefaultDays,
    prosthesisTypes: ensurePresetProsthesisTypes(parsed.prosthesisTypes),
    toothWorks: normalizeToothWorksForSync(parsed.toothWorks),
    patientName: String(parsed.patientName || "").trim(),
    memo: String(parsed.memo || ""),
  };
};

const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName?: string;
}) =>
  buildPracticeTransferMemoShared({
    ...params,
    prosthesisTypes: ensurePresetProsthesisTypes(params.prosthesisTypes),
  });

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
  if (raw === "의뢰수락" || raw === "다운로드완료") return "의뢰수락";
  if (raw === "자동매칭") return "자동매칭";
  if (raw === "작업완료") return "작업완료";

  // 레거시/과거 데이터 호환
  if (raw === "수신전" || raw === "확인전") return "발송완료";
  if (raw === "확인") return "수신완료";
  if (lowered === "downloaded" || lowered === "accepted") return "의뢰수락";
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

const PRACTICE_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const PRACTICE_TRANSFER_PROMO_TITLE = "유료 서비스 없이 기공의뢰·구강스캔 전송";
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
  } catch {
    // ignore
  }
  clearPracticeSharedFormLocalStorage();
};

const toDraftFileKey = (file: { originalName: string; size: number; s3Key: string }) =>
  `${String(file.originalName || "").trim()}:${Number(file.size || 0)}:${String(file.s3Key || "").trim()}`;

export const PracticeFileTransferPage = ({
  roleSwitcher,
}: {
  roleSwitcher?: ReactNode;
} = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [recentStatusFilter, setRecentStatusFilter] = useState<
    "all" | "발송완료" | "의뢰수락" | "작업완료" | "포장.발송" | "추적관리"
  >("all");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [tempSaving, setTempSaving] = useState(false);
  const [promoNoticeVisible, setPromoNoticeVisible] = useState(true);
  const [promoNoticeSaving, setPromoNoticeSaving] = useState(false);
  const [tempSaveDirty, setTempSaveDirty] = useState(false);
  const [lastSavedFormFingerprint, setLastSavedFormFingerprint] = useState<string | null>(null);
  const [formSyncStatus, setFormSyncStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [draftFiles, setDraftFiles] = useState<DraftTransferFileItem[]>([]);
  const [draftSummary, setDraftSummary] = useState<DraftListSummary | null>(null);
  const [practiceDraftList, setPracticeDraftList] = useState<DraftListSummary[]>([]);
  const [trashedDraftList, setTrashedDraftList] = useState<DraftListSummary[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [toothChartResetNonce, setToothChartResetNonce] = useState(0);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(false);
  const [recentRequestsError, setRecentRequestsError] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState<RecentTransferItem | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatReplyTo, setChatReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetTransfer, setDeleteTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTargetTransfer, setRestoreTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [restoringTransfer, setRestoringTransfer] = useState(false);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [localFormHydrated, setLocalFormHydrated] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatRoomResolveSeqRef = useRef(0);
  const transferDialogOpenRef = useRef(false);
  const selectedTransferIdRef = useRef("");
  const prevFileCountRef = useRef(0);
  const localFormUpdatedAtRef = useRef(0);
  const skipNextArrivalAutoSyncRef = useRef(false);
  const suppressLocalFormPersistRef = useRef(false);
  const skipFormAutosaveRef = useRef(false);
  const pendingLocalFormEditRef = useRef(false);
  const lastSavedFormFingerprintRef = useRef<string | null>(null);
  const currentFormFingerprintRef = useRef("");
  const lastAppliedServerUpdatedAtRef = useRef(0);
  const formAutosaveSeqRef = useRef(0);
  const formAutosaveTimerRef = useRef<number | null>(null);
  const draftListSeqRef = useRef(0);
  const draftListLoadedRef = useRef(false);
  /** 목록에 실제로 등장했던 activeDraftId. 저장 직후 목록 레이스로 폼을 비우지 않기 위함. */
  const activeDraftSeenInListRef = useRef<string | null>(null);
  const pendingLocalFilesRef = useRef<File[]>([]);
  const draftFilesRef = useRef<DraftTransferFileItem[]>([]);
  const draftSummaryIdRef = useRef<string | null>(null);
  const activeDraftIdRef = useRef<string | null>(null);
  /** 어벗생산의뢰 등에서 navigate state.prefilledFiles 1회만 소비 */
  const consumedPrefillLocationKeyRef = useRef<string | null>(null);
  /** 파일 업로드 동기화 중 원격 draft 적용으로 폼이 깜빡이지 않게 한다. */
  const fileSyncInFlightRef = useRef(false);
  const resetIntakeFormAfterTransferRef = useRef<() => Promise<void>>(async () => {});
  const FORM_AUTOSAVE_DEBOUNCE_MS = 200;
  const FORM_AUTOSAVE_IME_RETRY_MS = 80;
  const imeComposingRef = useRef(false);
  const pendingDraftApplyRef = useRef<
    (PracticeTransferDraftPayload & { forceResync?: boolean }) | null
  >(null);
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
    syncRecentLabsFromTransfers,
  } = usePracticeTransferStep1();
  pendingLocalFilesRef.current = files;
  draftFilesRef.current = draftFiles;
  activeDraftIdRef.current = activeDraftId;
  draftSummaryIdRef.current = String(draftSummary?.id || "").trim() || null;
  const recentLabsRef = useRef(recentLabs);
  recentLabsRef.current = recentLabs;
  const todayDate = useMemo(() => toKstDateInputValue(new Date()), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );

  const [prosthesisTypeSettingsDialogOpen, setProsthesisTypeSettingsDialogOpen] = useState(false);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [prosthesisTypeCatalog, setProsthesisTypeCatalog] = useState<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<string[]>([
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [savingProsthesisTypeSettings, setSavingProsthesisTypeSettings] = useState(false);
  const [memoSnippets, setMemoSnippets] = useState<string[]>([]);
  const [implantFavorites, setImplantFavorites] = useState<PracticeImplantFavorite[]>([]);
  const [abutmentFavorites, setAbutmentFavorites] = useState<PracticeAbutmentFavorite[]>([]);
  const [recentTransfersOpen, setRecentTransfersOpen] = useState(true);
  const [draftsOpen, setDraftsOpen] = useState(true);
  const [trashOpen, setTrashOpen] = useState(true);
  const { connections: implantConnections } = useImplantConnectionCatalog(authToken);

  const [toothWorks, setToothWorks] = useState<ToothWorkSelection[]>([]);
  const [patientName, setPatientName] = useState("");

  const normalizedProsthesisTypes = useMemo(
    () => ensurePresetProsthesisTypes(prosthesisTypeCatalog),
    [prosthesisTypeCatalog],
  );
  const normalizedToothWorks = useMemo(() => normalizeToothWorks(toothWorks), [toothWorks]);
  const syncToothWorks = useMemo(
    () => normalizeToothWorksForSync(toothWorks),
    [toothWorks],
  );
  const normalizedPatientName = useMemo(
    () => String(patientName || "").trim().normalize("NFC"),
    [patientName],
  );
  const currentFormFingerprint = useMemo(
    () =>
      buildPracticeTransferFormFingerprint({
        targetLabAnchorId: selectedLab?._id,
        targetLabName: selectedLab?.name,
        patientName: normalizedPatientName,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        requestMemo,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
      }),
    [
      selectedLab?._id,
      selectedLab?.name,
      normalizedPatientName,
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      requestMemo,
      normalizedProsthesisTypes,
      syncToothWorks,
    ],
  );
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

  const {
    ensureFilesUploaded,
    preUploadFiles,
    forgetFile,
    clearPreUploadCache,
  } = useFilePreUpload({ token: authToken });
  const { uploadFilesWithToast } = useUploadWithProgressToast({
    token: authToken,
    uploadFiles: ensureFilesUploaded,
  });
  const { rooms: chatRooms } = useChatRooms();

  useEffect(() => {
    if (!authToken || files.length === 0) return;
    preUploadFiles(files);
  }, [authToken, files, preUploadFiles]);

  const clearLocalFilesWithCache = useCallback(async () => {
    clearPreUploadCache();
    await clearAllFiles();
  }, [clearAllFiles, clearPreUploadCache]);

  const {
    messages: chatMessages,
    loading: chatMessagesLoading,
    error: chatMessagesError,
    sendMessage,
    toggleReaction,
    prefetchMessages,
    setMessages: setChatMessages,
  } = useChatMessages({ roomId: activeChatRoom?._id, autoFetch: transferDialogOpen });

  const combinedFilesSizeMb = useMemo(() => {
    const localBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const draftBytes = draftFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    return ((localBytes + draftBytes) / (1024 * 1024)).toFixed(1);
  }, [files, draftFiles]);

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
    const nextProsthesisTypes = ensurePresetProsthesisTypes(
      Array.isArray(payload.prosthesisTypes) ? payload.prosthesisTypes : [...PRESET_PROSTHESIS_TYPES],
    );
    const nextMemoSnippets = normalizeMemoSnippets(payload.memoSnippets);
    const nextImplantFavorites = normalizeImplantFavorites(payload.implantFavorites);
    const nextAbutmentFavorites = normalizeAbutmentFavorites(payload.abutmentFavorites);
    const promoDismissed = String(payload.promoNoticeDismissedAt || "").trim().length > 0;

    setArrivalDefaultDays(nextArrivalDefaultDays);
    setProsthesisTypeCatalog(nextProsthesisTypes);
    setProsthesisTypeCatalogDraft(nextProsthesisTypes);
    setMemoSnippets(nextMemoSnippets);
    setImplantFavorites(nextImplantFavorites);
    setAbutmentFavorites(nextAbutmentFavorites);
    setPromoNoticeVisible(!promoDismissed);
    setToothWorks((prev) =>
      prev.map((row) => {
        const customAbutment = Boolean(row.customAbutment);
        return {
          toothNumber: row.toothNumber,
          prosthesisType: nextProsthesisTypes.some((type) => type === row.prosthesisType)
            ? row.prosthesisType
            : resolveDefaultProsthesisType(nextProsthesisTypes),
          customAbutment,
          bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
          ...pickToothWorkCustomSpecs(row, customAbutment),
        };
      }),
    );
  }, []);

  const savePracticeTransferSettingsToServer = useCallback(
    async (params: Partial<PracticeTransferSettingsPayload>) => {
      if (!authToken) return false;

      const hasArrivalDefaultDays = typeof params.arrivalDefaultDays === "number";
      const hasProsthesisTypes = Array.isArray(params.prosthesisTypes);
      const hasMemoSnippets = Array.isArray(params.memoSnippets);
      const hasImplantFavorites = Array.isArray(params.implantFavorites);
      const hasAbutmentFavorites = Array.isArray(params.abutmentFavorites);
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
      if (hasImplantFavorites) {
        jsonBody.implantFavorites = normalizeImplantFavorites(params.implantFavorites || []);
      }
      if (hasAbutmentFavorites) {
        jsonBody.abutmentFavorites = normalizeAbutmentFavorites(params.abutmentFavorites || []);
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
            implantFavorites: normalizeImplantFavorites(
              Array.isArray(payload?.implantFavorites) ? payload?.implantFavorites : implantFavorites,
            ),
            abutmentFavorites: normalizeAbutmentFavorites(
              Array.isArray(payload?.abutmentFavorites)
                ? payload?.abutmentFavorites
                : abutmentFavorites,
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
    [applyPracticeTransferSettings, authToken, memoSnippets, implantFavorites, abutmentFavorites],
  );

  const myUserId = String(authUser?.id || (authUser as { _id?: string } | null)?._id || "").trim();

  const loadPracticeTransferDraftList = useCallback(async () => {
    if (!authToken) {
      setPracticeDraftList([]);
      setTrashedDraftList([]);
      return;
    }

    const seq = ++draftListSeqRef.current;

    try {
      const [activeRes, trashRes] = await Promise.all([
        apiFetch<unknown>({
          path: "/api/practice/transfers/drafts",
          method: "GET",
          token: authToken,
        }),
        apiFetch<unknown>({
          path: "/api/practice/transfers/drafts?trashed=1",
          method: "GET",
          token: authToken,
        }),
      ]);

      if (seq !== draftListSeqRef.current) return;

      // 목록 조회가 모두 실패하면 stale-form 검증을 돌리지 않는다(오삭제 방지)
      if (!activeRes.ok && !trashRes.ok) return;

      const parseList = (res: { ok: boolean; data?: unknown }) => {
        if (!res.ok) return [] as DraftListSummary[];
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { data?: unknown })
            : {};
        const rows = Array.isArray(body.data) ? body.data : [];
        return rows
          .map((row) =>
            row && typeof row === "object"
              ? toDraftListSummary(row as PracticeTransferDraftPayload, myUserId)
              : null,
          )
          .filter((row): row is DraftListSummary => Boolean(row));
      };

      setPracticeDraftList(parseList(activeRes));
      setTrashedDraftList(parseList(trashRes));
      if (activeRes.ok) {
        draftListLoadedRef.current = true;
      }
    } catch {
      // ignore
    }
  }, [authToken, myUserId]);

  const applyPracticeDraftPayload = useCallback(
    (
      payload: PracticeTransferDraftPayload & { forceResync?: boolean },
      options?: { keepActiveDraftIdOnEmpty?: boolean; forceResync?: boolean },
    ) => {
      if (imeComposingRef.current) {
        pendingDraftApplyRef.current = payload;
        return;
      }

      const forceResync = Boolean(options?.forceResync || payload.forceResync);

      // 파일 업로드 중에는 HTTP 응답이 SSOT. forceResync echo는 업로드 종료 후 적용.
      if (fileSyncInFlightRef.current) {
        if (forceResync) {
          pendingDraftApplyRef.current = { ...payload, forceResync: true };
        }
        return;
      }

      const keepActiveDraftIdOnEmpty = Boolean(options?.keepActiveDraftIdOnEmpty);
      const ownedPayload: PracticeTransferDraftPayload = {
        ...payload,
        practiceUserId: String(payload.practiceUserId || myUserId).trim() || myUserId,
      };
      const summary = toDraftListSummary(ownedPayload, myUserId);
      const restoredFiles = summary?.files || [];

      setDraftFiles(restoredFiles);
      if (!summary) {
        setDraftSummary(null);
        if (!keepActiveDraftIdOnEmpty) setActiveDraftId(null);
        lastSavedFormFingerprintRef.current = null;
        setLastSavedFormFingerprint(null);
        lastAppliedServerUpdatedAtRef.current = 0;
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("idle");
        if (pendingLocalFilesRef.current.length === 0) {
          setTempSaveDirty(false);
        }
        return;
      }

      setDraftSummary(summary);
      setActiveDraftId(summary.id);

      const serverUpdatedAt = payload.updatedAt
        ? new Date(String(payload.updatedAt)).getTime()
        : 0;
      const parsed = parsePracticeTransferMemoMeta(String(payload.transferMemo || ""));
      const serverFingerprint = buildPracticeTransferFormFingerprint({
        targetLabAnchorId: payload.targetLabAnchorId,
        targetLabName: payload.targetLabName,
        patientName: parsed.patientName,
        orderDate: parsed.orderDate,
        arrivalDate: parsed.arrivalDate,
        arrivalDefaultDays: parsed.arrivalDefaultDays,
        requestMemo: parsed.memo,
        prosthesisTypes: parsed.prosthesisTypes,
        toothWorks: parsed.toothWorks,
      });
      const currentFingerprint = currentFormFingerprintRef.current;
      // 서버 updatedAt 기준 LWW. 로컬 입력 중이라도 커밋된 원격 스냅샷이 더 최신이면 반영한다.
      // (같은 계정 다중 탭/창에서도 동기화가 막히지 않게 한다.)

      // 동일 내용 echo는 타임스탬프만 맞추고 폼 setState는 생략한다.
      // 파일 재동기화(forceResync)는 동료/다른 PC에 전체 스냅샷을 다시 밀어 넣는다.
      if (
        !forceResync &&
        restoredFiles.length > 0 &&
        serverFingerprint === currentFingerprint
      ) {
        lastSavedFormFingerprintRef.current = serverFingerprint;
        setLastSavedFormFingerprint(serverFingerprint);
        pendingLocalFormEditRef.current = false;
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(localFormUpdatedAtRef.current, serverUpdatedAt);
        }
        if (pendingLocalFilesRef.current.length === 0) {
          setTempSaveDirty(false);
        }
        setFormSyncStatus("saved");
        return;
      }

      // 같은 updatedAt echo(방금 HTTP로 이미 반영)는 폼을 다시 덮지 않는다.
      // forceResync는 파일 재동기화로 전체 폼을 맞춤.
      // 드롭존→대시보드 handoff 등 로컬 폼이 더 최신이면 서버 스냅샷으로 덮지 않는다.
      const shouldRestoreForm =
        restoredFiles.length > 0 &&
        (forceResync ||
          (Number.isFinite(serverUpdatedAt) &&
            serverUpdatedAt > 0 &&
            serverUpdatedAt > lastAppliedServerUpdatedAtRef.current &&
            serverUpdatedAt > localFormUpdatedAtRef.current));

      if (shouldRestoreForm) {
        suppressLocalFormPersistRef.current = true;
        skipFormAutosaveRef.current = true;
        // 주문일 setState가 도착일 자동계산 effect를 돌리기 전에 먼저 막는다.
        skipNextArrivalAutoSyncRef.current = true;

        const labId = String(payload.targetLabAnchorId || "").trim();
        const labName = String(payload.targetLabName || "").trim();
        // 서버 스냅샷이 비어 있으면 로컬/최근 기공소 캐시를 남기지 않는다.
        if (labName) {
          setSelectedLab((prev) => {
            const fromRecent =
              recentLabsRef.current.find((b) => {
                const id = String(b?._id || "").trim();
                if (labId && id === labId) return true;
                return String(b?.name || "").trim() === labName;
              }) || undefined;
            const samePrev =
              prev &&
              ((labId && String(prev._id || "").trim() === labId) ||
                String(prev.name || "").trim() === labName)
                ? prev
                : null;
            return {
              _id:
                (isMongoObjectIdString(labId) ? labId : "") ||
                (isMongoObjectIdString(fromRecent?._id) ? String(fromRecent?._id) : "") ||
                (isMongoObjectIdString(samePrev?._id) ? String(samePrev?._id) : "") ||
                `draft-lab:${labName}`,
              name: labName || String(fromRecent?.name || samePrev?.name || "").trim(),
              businessNumber: String(
                fromRecent?.businessNumber || samePrev?.businessNumber || "",
              ).trim(),
              representativeName: String(
                fromRecent?.representativeName || samePrev?.representativeName || "",
              ).trim(),
              address: String(fromRecent?.address || samePrev?.address || "").trim(),
              businessType: String(
                fromRecent?.businessType || samePrev?.businessType || "requestor",
              ).trim() || "requestor",
            };
          });
        } else {
          setSelectedLab(null);
        }

        skipNextArrivalAutoSyncRef.current = true;
        setOrderDate(todayDate);
        {
          const restoredArrival = String(parsed.arrivalDate || "").trim();
          setArrivalDate(
            restoredArrival && restoredArrival >= todayDate
              ? restoredArrival
              : addDaysToDateInput(todayDate, normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays))),
          );
        }
        if (Number.isFinite(Number(parsed.arrivalDefaultDays))) {
          const days = normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays));
          setArrivalDefaultDays(days);
        }
        {
          const types = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
          setProsthesisTypeCatalog(types);
          setProsthesisTypeCatalogDraft(types);
        }
        setPatientName(String(parsed.patientName || "").normalize("NFC"));
        setRequestMemo(String(parsed.memo || ""));

        const prosthesisTypesForRestore = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
        const fallbackToothRow = {
          toothNumber: "",
          prosthesisType: resolveDefaultProsthesisType(prosthesisTypesForRestore),
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
        };
        let nextToothWorks: ToothWorkSelection[] = [fallbackToothRow];
        if (parsed.toothWorks.length > 0) {
          const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
            prosthesisTypes: prosthesisTypesForRestore,
            isCustomAbutmentSupportedProsthesisType,
            isBridgeLikeProsthesisType,
            getAdjacentTeeth,
            fallbackProsthesisType: "크라운",
          });
          if (restoredRows.length > 0) nextToothWorks = restoredRows;
        }
        setToothWorks(nextToothWorks);

        const alignedFingerprint = buildPracticeTransferFormFingerprint({
          targetLabAnchorId: payload.targetLabAnchorId,
          targetLabName: payload.targetLabName,
          patientName: String(parsed.patientName || "").normalize("NFC"),
          orderDate: parsed.orderDate,
          arrivalDate: parsed.arrivalDate,
          arrivalDefaultDays: parsed.arrivalDefaultDays,
          requestMemo: parsed.memo,
          prosthesisTypes: prosthesisTypesForRestore,
          toothWorks: nextToothWorks,
        });
        lastSavedFormFingerprintRef.current = alignedFingerprint;
        setLastSavedFormFingerprint(alignedFingerprint);
        currentFormFingerprintRef.current = alignedFingerprint;
        pendingLocalFormEditRef.current = false;
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(localFormUpdatedAtRef.current, serverUpdatedAt);
        }
        setFormSyncStatus("saved");

        // useEffect(local persist)보다 뒤에 suppress를 풀어야
        // 반영 직후 localUpdatedAt이 Date.now()로 덮여 이후 동기화가 막히지 않는다.
        window.setTimeout(() => {
          suppressLocalFormPersistRef.current = false;
          skipFormAutosaveRef.current = false;
        }, 0);
      } else if (restoredFiles.length > 0) {
        // 서버 스냅샷은 알되, 이미 적용한 버전 이하면 로컬 유지 + 필요 시 재업로드.
        lastSavedFormFingerprintRef.current = serverFingerprint;
        setLastSavedFormFingerprint(serverFingerprint);
        if (currentFingerprint !== serverFingerprint) {
          pendingLocalFormEditRef.current = true;
          setFormSyncStatus("pending");
        } else {
          pendingLocalFormEditRef.current = false;
          setFormSyncStatus("saved");
        }
      }

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] applyDraftPayload", {
          restoredFilesCount: restoredFiles.length,
          shouldRestoreForm,
          localFormUpdatedAt: localFormUpdatedAtRef.current,
          serverUpdatedAt,
        });
      }

      if (pendingLocalFilesRef.current.length === 0) {
        setTempSaveDirty(false);
      }
    },
    [myUserId, setRequestMemo, setSelectedLab],
  );

  const loadPracticeTransferDraft = useCallback(async (options?: { draftId?: string | null }) => {
    if (!authToken) {
      setDraftFiles([]);
      setDraftSummary(null);
      setActiveDraftId(null);
      return;
    }

    const requestedDraftId = String(options?.draftId || activeDraftIdRef.current || "").trim();

    try {
      const res = await apiFetch<unknown>({
        path: requestedDraftId
          ? `/api/practice/transfers/draft?draftId=${encodeURIComponent(requestedDraftId)}`
          : "/api/practice/transfers/draft",
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
        // 요청한 draftId가 없거나(삭제/휴지통) 본인 최신도 없으면 stale id를 비운다.
        setActiveDraftId(null);
        activeDraftSeenInListRef.current = null;
        lastSavedFormFingerprintRef.current = null;
        setLastSavedFormFingerprint(null);
        lastAppliedServerUpdatedAtRef.current = 0;
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("idle");
        return;
      }

      applyPracticeDraftPayload(payload, {
        keepActiveDraftIdOnEmpty: Boolean(requestedDraftId),
      });
    } catch {
      // ignore (초안 불러오기 실패는 사용자 흐름 중단 금지)
    }
  }, [applyPracticeDraftPayload, authToken]);

  const buildOwnDraftSummary = useCallback(
    (
      payload: PracticeTransferDraftPayload | null | undefined,
      fallbackFiles: DraftTransferFileItem[],
      transferMemo: string,
    ): DraftListSummary | null => {
      const merged: PracticeTransferDraftPayload = {
        _id: String(payload?._id || draftSummary?.id || "").trim() || "draft-local",
        practiceUserId: String(payload?.practiceUserId || myUserId).trim() || myUserId,
        practiceUserLabel:
          String(payload?.practiceUserLabel || draftSummary?.practiceUserLabel || "").trim() ||
          "나",
        targetLabAnchorId:
          payload?.targetLabAnchorId ??
          (String(selectedLab?._id || "").trim() || null),
        targetLabName: String(
          payload?.targetLabName || selectedLab?.name || draftSummary?.targetLabName || "",
        ).trim(),
        transferMemo: String(payload?.transferMemo || transferMemo || "").trim(),
        files:
          Array.isArray(payload?.files) && payload.files.length > 0
            ? payload.files
            : fallbackFiles,
        updatedAt: payload?.updatedAt
          ? String(payload.updatedAt)
          : new Date().toISOString(),
        createdAt: payload?.createdAt
          ? String(payload.createdAt)
          : draftSummary?.createdAt || new Date().toISOString(),
      };
      return toDraftListSummary(merged, myUserId);
    },
    [
      draftSummary?.createdAt,
      draftSummary?.id,
      draftSummary?.practiceUserLabel,
      draftSummary?.targetLabName,
      myUserId,
      selectedLab?._id,
      selectedLab?.name,
    ],
  );

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
            implantFavorites: normalizeImplantFavorites(
              Array.isArray(payload?.implantFavorites) ? payload?.implantFavorites : [],
            ),
            abutmentFavorites: normalizeAbutmentFavorites(
              Array.isArray(payload?.abutmentFavorites) ? payload?.abutmentFavorites : [],
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
          const practiceRouting =
            ci.practiceRouting && typeof ci.practiceRouting === "object"
              ? (ci.practiceRouting as Record<string, unknown>)
              : {};
          const targetLabAnchorId = String(
            practiceRouting.targetLabAnchorId || r.targetLabAnchorId || "",
          ).trim();
          const targetLabFromRouting = String(
            practiceRouting.targetLabName || r.targetLabName || "",
          ).trim();
          const targetLab =
            targetLabFromRouting || extractLabNameFromMessage(message) || "-";
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
            targetLab,
            targetLabAnchorId,
            status: toStatusLabel(r.manufacturerStage),
            createdAtTs: new Date(createdAtRaw).getTime(),
            transferId: extractTransferIdFromMessage(message),
            orderDate,
            arrivalDate,
            transferMemo,
            rawTransferMemo: strippedTransferMemo,
            fileName: String(fileObj.originalName || fileObj.name || "").trim(),
            fileS3Key: String(fileObj.s3Key || "").trim(),
            fileSize: Number(fileObj.size || 0),
          };
        })
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

      setRecentRequests(mapped);

      const labsFromTransfers: SearchBusinessResult[] = [];
      const seenLabKeys = new Set<string>();
      for (const row of mapped) {
        const labName = String(row.targetLab || "").trim();
        if (!labName || labName === "-") continue;
        const labId = String(row.targetLabAnchorId || "").trim();
        const key = labId || `name:${labName}`;
        if (seenLabKeys.has(key)) continue;
        seenLabKeys.add(key);
        labsFromTransfers.push({
          _id: labId || `recent:${labName}`,
          name: labName,
          businessType: "requestor",
        });
      }
      if (labsFromTransfers.length > 0) {
        syncRecentLabsFromTransfers(labsFromTransfers);
      }

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
  [authToken, syncRecentLabsFromTransfers],
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
    const state = location.state as { practiceTransferSubmittedToast?: boolean } | null;
    if (!state?.practiceTransferSubmittedToast) return;

    toast({
      title: "의뢰 제출 완료",
      description:
        "기공소로 의뢰가 접수되었습니다. 작성 폼은 비워 두었으니, 다음 의뢰는 대시보드에서 작성·전송하세요.",
      duration: 10000,
      className:
        "border-2 border-primary bg-primary-soft text-primary-strong shadow-xl sm:min-w-[360px]",
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, toast]);

  useEffect(() => {
    if (consumedPrefillLocationKeyRef.current === location.key) return;

    const state =
      location.state && typeof location.state === "object"
        ? (location.state as { prefilledFiles?: unknown })
        : null;

    const incomingFiles = Array.isArray(state?.prefilledFiles)
      ? state.prefilledFiles.filter((item): item is File => item instanceof File)
      : [];

    consumedPrefillLocationKeyRef.current = location.key;

    if (incomingFiles.length === 0) return;

    handleIncomingFiles(incomingFiles);
  }, [handleIncomingFiles, location.key, location.state]);

  useEffect(() => {
    try {
      const parsed = adoptDropzoneDraftIntoTransferFormIfNeeded();
      if (!parsed) return;
      const localUpdatedAt = Number(parsed.updatedAt || 0);
      if (Number.isFinite(localUpdatedAt) && localUpdatedAt > 0) {
        localFormUpdatedAtRef.current = localUpdatedAt;
      } else {
        localFormUpdatedAtRef.current = Date.now();
      }

      const restoredOrderDate = String(parsed.orderDate || "").trim() || todayDate;
      const restoredArrivalDate = String(parsed.arrivalDate || "").trim();
      const restoredArrivalDefaultDays = normalizeArrivalDefaultDays(
        Number(parsed.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
      );
      const restoredProsthesisTypes = ensurePresetProsthesisTypes(
        Array.isArray(parsed.prosthesisTypes)
          ? parsed.prosthesisTypes
          : [...PRESET_PROSTHESIS_TYPES],
      );
      const restoredMemo = String(parsed.requestMemo || "");
      const restoredPatientName = String(parsed.patientName || "");
      const restoredActiveDraftId = String(parsed.activeDraftId || "").trim();

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] restore local form", {
          localUpdatedAt: localFormUpdatedAtRef.current,
          restoredOrderDate,
          restoredArrivalDate,
          restoredArrivalDefaultDays,
          restoredProsthesisTypes,
          restoredToothWorksCount: Array.isArray(parsed.toothWorks) ? parsed.toothWorks.length : 0,
          restoredActiveDraftId: restoredActiveDraftId || null,
        });
      }

      if (restoredArrivalDate) {
        skipNextArrivalAutoSyncRef.current = true;
      }
      setOrderDate(todayDate);
      if (restoredArrivalDate && restoredArrivalDate >= todayDate) {
        setArrivalDate(restoredArrivalDate);
      } else {
        setArrivalDate(addDaysToDateInput(todayDate, restoredArrivalDefaultDays));
      }
      setArrivalDefaultDays(restoredArrivalDefaultDays);
      setProsthesisTypeCatalog(restoredProsthesisTypes);
      setProsthesisTypeCatalogDraft(restoredProsthesisTypes);
      setRequestMemo(restoredMemo);
      setPatientName(restoredPatientName);
      if (restoredActiveDraftId) {
        setActiveDraftId(restoredActiveDraftId);
      }

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
      activeDraftId: String(activeDraftId || "").trim() || null,
      updatedAt,
    };

    try {
      localStorage.setItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY, JSON.stringify(payload));
      localFormUpdatedAtRef.current = updatedAt;
      currentFormFingerprintRef.current = currentFormFingerprint;
      if (
        lastSavedFormFingerprintRef.current !== null &&
        currentFormFingerprint !== lastSavedFormFingerprintRef.current
      ) {
        pendingLocalFormEditRef.current = true;
      }
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
    activeDraftId,
    arrivalDate,
    arrivalDefaultDays,
    currentFormFingerprint,
    localFormHydrated,
    normalizedProsthesisTypes,
    orderDate,
    requestMemo,
    patientName,
    selectedLab,
    toothWorks,
  ]);

  const persistFormDraftAutosave = useCallback(
    async (seq: number) => {
      if (seq !== formAutosaveSeqRef.current) return;
      if (!authToken) return;
      if (tempSaving || requestSubmitting || fileSyncInFlightRef.current) return;

      const filesForSave = draftFilesRef.current;
      // 파일 없이도 의뢰서 내용만으로 임시저장/동기화 가능
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
      });
      const hasLab =
        Boolean(String(selectedLab?.name || "").trim()) ||
        Boolean(toApiLabAnchorId(selectedLab?._id));
      const hasSubstantialContent =
        Boolean(normalizedPatientName) ||
        Boolean(String(requestMemo || "").trim()) ||
        hasLab ||
        filesForSave.length > 0;
      const hasToothOnlyContent = syncToothWorks.some(
        (row) =>
          String(row.toothNumber || "").trim() ||
          Boolean(row.customAbutment) ||
          String(row.implantManufacturer || "").trim(),
      );
      // 기존 draft 갱신: 치아만 바뀌어도 동기화. 신규 생성: 환자명·메모·기공소·파일 중 하나 필요.
      if (!activeDraftIdRef.current) {
        if (!hasSubstantialContent) return;
      } else if (filesForSave.length === 0 && !hasSubstantialContent && !hasToothOnlyContent) {
        return;
      }

      const fingerprintAtSend = currentFormFingerprintRef.current;
      const savedFingerprint = lastSavedFormFingerprintRef.current;
      if (savedFingerprint !== null && fingerprintAtSend === savedFingerprint) {
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("saved");
        return;
      }

      // debounce 동안 파일 동기화/원격 반영이 있었으면 stale POST로 파일 목록을 되돌리지 않는다.
      const serverUpdatedAtAtStart = lastAppliedServerUpdatedAtRef.current;
      const filesCountAtStart = filesForSave.length;

      setFormSyncStatus("saving");
      try {
        if (
          seq !== formAutosaveSeqRef.current ||
          fileSyncInFlightRef.current ||
          lastAppliedServerUpdatedAtRef.current > serverUpdatedAtAtStart ||
          draftFilesRef.current.length > filesCountAtStart
        ) {
          return;
        }

        const latestFilesForSave = draftFilesRef.current;
        const res = await apiFetch<unknown>({
          path: "/api/practice/transfers/draft",
          method: "POST",
          token: authToken,
          jsonBody: {
            draftId: activeDraftIdRef.current || undefined,
            targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
            targetLabName: String(selectedLab?.name || "").trim(),
            orderDate,
            arrivalDate,
            arrivalDefaultDays,
            transferMemo,
            files: latestFilesForSave.map((row) => ({
              fileId: row.fileId,
            })),
          },
        });

        if (seq !== formAutosaveSeqRef.current) return;

        if (!res.ok) {
          const body = asApiMessagePayload(res.data);
          throw new Error(String(body?.message || "임시저장 동기화에 실패했습니다."));
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
          : filesForSave;

        setDraftFiles(nextDraftFiles);
        {
          const nextSummary = buildOwnDraftSummary(payload, nextDraftFiles, transferMemo);
          setDraftSummary(nextSummary);
          if (nextSummary?.id) {
            setActiveDraftId(nextSummary.id);
            activeDraftSeenInListRef.current = nextSummary.id;
            setPracticeDraftList((prev) => {
              const without = prev.filter((row) => row.id !== nextSummary.id);
              return [nextSummary, ...without];
            });
          }
          void loadPracticeTransferDraftList();
        }

        const serverUpdatedAt = payload?.updatedAt
          ? new Date(String(payload.updatedAt)).getTime()
          : Date.now();
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(
            localFormUpdatedAtRef.current,
            serverUpdatedAt,
          );
        }

        if (currentFormFingerprintRef.current === fingerprintAtSend) {
          lastSavedFormFingerprintRef.current = fingerprintAtSend;
          setLastSavedFormFingerprint(fingerprintAtSend);
          pendingLocalFormEditRef.current = false;
          setFormSyncStatus("saved");
        } else {
          pendingLocalFormEditRef.current = true;
          setFormSyncStatus("pending");
        }
      } catch {
        if (seq !== formAutosaveSeqRef.current) return;
        setFormSyncStatus("error");
      }
    },
    [
      arrivalDate,
      arrivalDefaultDays,
      authToken,
      draftSummary?.createdAt,
      draftSummary?.id,
      loadPracticeTransferDraftList,
      buildOwnDraftSummary,
      normalizedPatientName,
      normalizedProsthesisTypes,
      syncToothWorks,
      orderDate,
      requestMemo,
      requestSubmitting,
      selectedLab?._id,
      selectedLab?.name,
      tempSaving,
    ],
  );

  /** 치아 선택만으로는 목록에 올리지 않음. 환자명·메모·기공소·파일이 있어야 신규 draft 생성. */
  const hasSubstantialContentForNewDraft = useMemo(() => {
    if (normalizedPatientName) return true;
    if (String(requestMemo || "").trim()) return true;
    if (String(selectedLab?._id || selectedLab?.name || "").trim()) return true;
    if (draftFiles.length > 0 || files.length > 0) return true;
    return false;
  }, [
    draftFiles.length,
    files.length,
    normalizedPatientName,
    requestMemo,
    selectedLab?._id,
    selectedLab?.name,
  ]);

  const hasMeaningfulFormInputForAutosave = useMemo(() => {
    if (hasSubstantialContentForNewDraft) return true;
    if (
      toothWorks.some(
        (row) =>
          String(row.toothNumber || "").trim() ||
          Boolean(row.customAbutment) ||
          String(row.implantManufacturer || "").trim(),
      )
    ) {
      return true;
    }
    return false;
  }, [hasSubstantialContentForNewDraft, toothWorks]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (skipFormAutosaveRef.current) return;
    if (!authToken) return;
    if (tempSaving || requestSubmitting) return;

    const fingerprintUnchanged =
      lastSavedFormFingerprint !== null &&
      currentFormFingerprint === lastSavedFormFingerprint;

    if (fingerprintUnchanged) {
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus((prev) =>
        prev === "pending" || prev === "error" || prev === "saving" ? "saved" : prev,
      );
      return;
    }

    // 신규 draft 생성(activeDraftId 없음): 환자명·메모·기공소·파일이 있을 때만.
    // 「새로 작성」후 baseline이 있어도 치아만 고르면 목록에 쌓이지 않게 한다.
    if (!activeDraftId && !hasSubstantialContentForNewDraft) {
      return;
    }

    // 기존 draft 갱신인데 내용이 전부 비면 서버 POST를 건너뛴다.
    if (activeDraftId && !hasMeaningfulFormInputForAutosave && draftFiles.length === 0) {
      return;
    }

    pendingLocalFormEditRef.current = true;
    setFormSyncStatus((prev) => (prev === "saving" ? prev : "pending"));

    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
    }
    const seq = ++formAutosaveSeqRef.current;

    const scheduleAutosave = () => {
      formAutosaveTimerRef.current = window.setTimeout(() => {
        // 한글 조합 중에는 부분 글자가 저장·원격 반영되어 입력을 깨지 않도록 미룬다.
        if (imeComposingRef.current) {
          scheduleAutosave();
          return;
        }
        void persistFormDraftAutosave(seq);
      }, imeComposingRef.current ? FORM_AUTOSAVE_IME_RETRY_MS : FORM_AUTOSAVE_DEBOUNCE_MS);
    };
    scheduleAutosave();

    return () => {
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }
    };
  }, [
    FORM_AUTOSAVE_DEBOUNCE_MS,
    FORM_AUTOSAVE_IME_RETRY_MS,
    activeDraftId,
    authToken,
    currentFormFingerprint,
    draftFiles.length,
    hasMeaningfulFormInputForAutosave,
    hasSubstantialContentForNewDraft,
    lastSavedFormFingerprint,
    localFormHydrated,
    persistFormDraftAutosave,
    requestSubmitting,
    tempSaving,
  ]);

  useEffect(() => {
    if (!localFormHydrated) return;
    void loadPracticeTransferDraft();
    void loadPracticeTransferDraftList();
  }, [localFormHydrated, loadPracticeTransferDraft, loadPracticeTransferDraftList]);

  /** 기공소 전송 성공 후 작성자·동료 모두 폼/로컬캐시를 비운다 */
  const resetIntakeFormAfterTransfer = useCallback(async () => {
    suppressLocalFormPersistRef.current = true;
    skipFormAutosaveRef.current = true;
    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setOrderDate(todayDate);
    setArrivalDate(addDaysToDateInput(todayDate, arrivalDefaultDays));
    setToothWorks([]);
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    draftSummaryIdRef.current = null;
    setTempSaveDirty(false);
    lastSavedFormFingerprintRef.current = null;
    setLastSavedFormFingerprint(null);
    lastAppliedServerUpdatedAtRef.current = 0;
    pendingLocalFormEditRef.current = false;
    setFormSyncStatus("idle");
    localFormUpdatedAtRef.current = 0;

    // selectedLab: null 을 명시적으로 남겨 remount/다른 탭 hydrate가 최근 기공소를 되살리지 않게 한다.
    try {
      localStorage.setItem(
        PRACTICE_TRANSFER_FORM_LOCAL_KEY,
        JSON.stringify({
          orderDate: todayDate,
          arrivalDate: addDaysToDateInput(todayDate, arrivalDefaultDays),
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          activeDraftId: null,
          updatedAt: Date.now(),
        } satisfies PracticeTransferLocalFormDraft),
      );
      localStorage.removeItem(PRACTICE_TRANSFER_TEMP_DRAFT_KEY);
    } catch {
      clearPracticeSharedFormLocalStorage();
    }

    await clearLocalFilesWithCache();
    await clearPracticeFileTransferCaches();

    // clearPracticeFileTransferCaches가 form local key를 지우므로, 빈 스냅샷을 다시 쓴다.
    try {
      localStorage.setItem(
        PRACTICE_TRANSFER_FORM_LOCAL_KEY,
        JSON.stringify({
          orderDate: todayDate,
          arrivalDate: addDaysToDateInput(todayDate, arrivalDefaultDays),
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          activeDraftId: null,
          updatedAt: Date.now(),
        } satisfies PracticeTransferLocalFormDraft),
      );
    } catch {
      // ignore
    }

    window.setTimeout(() => {
      suppressLocalFormPersistRef.current = false;
      skipFormAutosaveRef.current = false;
    }, 0);
  }, [
    arrivalDefaultDays,
    clearAllFiles,
    setLabOpen,
    setLabSearch,
    setRequestMemo,
    setSelectedLab,
    todayDate,
  ]);
  resetIntakeFormAfterTransferRef.current = resetIntakeFormAfterTransfer;

  // 전송/삭제로 draft가 활성 목록에서 사라진 뒤에만 폼을 비운다.
  // 파일 동기화 직후 activeDraftId만 먼저 바뀐 순간(목록 fetch 전)은 초기화하지 않는다.
  // 휴지통에만 있는 id·로컬 stale id는 작성 폼에서 분리한다(전체 초기화는 하지 않음).
  useEffect(() => {
    if (!localFormHydrated || !draftListLoadedRef.current) return;
    const activeId = String(activeDraftId || "").trim();
    if (!activeId) {
      activeDraftSeenInListRef.current = null;
      return;
    }
    const stillActive = practiceDraftList.some((row) => row.id === activeId);
    if (stillActive) {
      activeDraftSeenInListRef.current = activeId;
      return;
    }
    if (activeDraftSeenInListRef.current === activeId) {
      activeDraftSeenInListRef.current = null;
      void resetIntakeFormAfterTransferRef.current();
      return;
    }
    // 목록에 없던 stale draftId(삭제·휴지통·유실) — 폼 내용은 유지하고 id만 비운다.
    setActiveDraftId(null);
    setDraftSummary(null);
    activeDraftSeenInListRef.current = null;
  }, [activeDraftId, localFormHydrated, practiceDraftList]);

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
        const hasFile = Boolean(req.fileName && req.fileS3Key);
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
          fileCount: hasFile ? 1 : 0,
          patientCount: Math.max(1, initialPatients.size),
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: hasFile ? [req.fileName] : [],
          files: hasFile
            ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: Number(req.fileSize || 0) }]
            : [],
          transferMemo: req.transferMemo,
          rawTransferMemo: req.rawTransferMemo,
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

      if (req.fileName && req.fileS3Key) {
        existing._files.set(req.fileS3Key, {
          fileName: req.fileName,
          s3Key: req.fileS3Key,
          size: Number(req.fileSize || 0),
        });
      }
      existing.files = Array.from(existing._files.values());
      existing.fileNames = existing.files.map((f) => f.fileName).filter(Boolean);
      existing.fileCount = existing.files.length;
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

      if (!existing.transferMemo && req.transferMemo) {
        existing.transferMemo = req.transferMemo;
      }
      if (!existing.rawTransferMemo && req.rawTransferMemo) {
        existing.rawTransferMemo = req.rawTransferMemo;
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
      } else if (statusSet.has("의뢰수락") || statusSet.has("다운로드완료")) {
        existing.status = "의뢰수락";
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
        if (status === "작업완료") {
          acc.completed += 1;
        } else if (status === "의뢰수락" || status === "다운로드완료") {
          acc.accepted += 1;
        } else if (status === "자동매칭" || status === "취소") {
          // 상단 뱃지 집계 제외
        } else {
          // 발송완료·수신완료 및 기타 미수락 → 의뢰
          acc.sent += 1;
        }
        return acc;
      },
      { sent: 0, accepted: 0, completed: 0, shipping: 0, tracking: 0 },
    );
  }, [groupedTransfers]);

  const filteredGroupedTransfers = useMemo(() => {
    if (recentStatusFilter === "all") return groupedTransfers;
    return groupedTransfers.filter((transfer) => {
      const status = String(transfer.status || "").trim();
      if (recentStatusFilter === "발송완료") {
        return (
          status === "발송완료" ||
          status === "수신완료" ||
          (status !== "의뢰수락" &&
            status !== "다운로드완료" &&
            status !== "작업완료" &&
            status !== "자동매칭" &&
            status !== "취소" &&
            status !== "포장.발송" &&
            status !== "추적관리")
        );
      }
      if (recentStatusFilter === "의뢰수락") {
        return status === "의뢰수락" || status === "다운로드완료";
      }
      return status === recentStatusFilter;
    });
  }, [groupedTransfers, recentStatusFilter]);

  const draftGroupedTransfers = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    return practiceDraftList
      .map((draft): RecentTransferItem => {
        const updatedAtRaw = draft.updatedAt || draft.createdAt || new Date().toISOString();
        const createdAtTs = new Date(updatedAtRaw).getTime();
        const safeTs = Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs : Date.now();
        const targetLab = String(draft.targetLabName || "-").trim() || "-";
        const parsedMemo = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
        const displayMemo = formatTransferMemoForDisplay(String(draft.transferMemo || ""));
        const files = draft.files.map((file) => ({
          fileName: file.originalName,
          s3Key: file.s3Key,
          size: Number(file.size || 0),
        }));
        const ownerLabel = draft.isMine ? "나" : draft.practiceUserLabel || "동료";

        return {
          id: draft.id,
          transferId: PRACTICE_DRAFT_TRANSFER_ID,
          deleteTargetLabel: draft.isMine ? "내 임시저장" : `${ownerLabel} 임시저장`,
          createdAt: toDateLabel(updatedAtRaw),
          createdAtTs: safeTs,
          requestDate: toDayLabel(updatedAtRaw),
          targetLab,
          orderDate: String(parsedMemo.orderDate || "").trim(),
          arrivalDate: String(parsedMemo.arrivalDate || "").trim(),
          status: "임시저장",
          fileCount: files.length,
          patientCount: 1,
          requestIds: [],
          transferMongoIds: [],
          fileNames: files.map((file) => file.fileName).filter(Boolean),
          files,
          transferMemo: displayMemo,
          rawTransferMemo: String(draft.transferMemo || "").trim(),
          unreadCount: 0,
          practiceUserId: draft.practiceUserId,
          practiceUserLabel: ownerLabel,
          isMineDraft: draft.isMine,
          draftPatientName: draft.patientName,
          searchBlob: [
            "임시저장",
            PRACTICE_DRAFT_TRANSFER_ID,
            ownerLabel,
            draft.patientName,
            targetLab,
            displayMemo,
            ...files.map((file) => file.fileName),
          ]
            .join(" ")
            .toLowerCase(),
        };
      })
      .filter((transfer) => !query || transfer.searchBlob.includes(query));
  }, [practiceDraftList, requestSearchTerm]);

  const displayGroupedTransfers = filteredGroupedTransfers;

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
          rawTransferMemo: req.rawTransferMemo,
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
      if (!existing.rawTransferMemo && req.rawTransferMemo) {
        existing.rawTransferMemo = req.rawTransferMemo;
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }
    }

    const canceled = [...byKey.values()];

    const draftTrash = trashedDraftList.map((draft): RecentTransferItem => {
      const updatedAtRaw = draft.updatedAt || draft.createdAt || new Date().toISOString();
      const createdAtTs = new Date(updatedAtRaw).getTime();
      const safeTs = Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs : Date.now();
      const ownerLabel = draft.isMine ? "나" : draft.practiceUserLabel || "동료";
      const patientLabel = draft.patientName || "환자명 미입력";
      const parsedMemo = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
      const files = draft.files.map((file) => ({
        fileName: file.originalName,
        s3Key: file.s3Key,
        size: Number(file.size || 0),
      }));

      return {
        id: draft.id,
        transferId: PRACTICE_DRAFT_TRANSFER_ID,
        deleteTargetLabel: `임시저장 · ${patientLabel}`,
        createdAt: toDateLabel(updatedAtRaw),
        createdAtTs: safeTs,
        requestDate: toDayLabel(updatedAtRaw),
        targetLab: draft.targetLabName || "-",
        orderDate: String(parsedMemo.orderDate || "").trim(),
        arrivalDate: String(parsedMemo.arrivalDate || "").trim(),
        status: "임시저장",
        fileCount: files.length,
        patientCount: 1,
        requestIds: [],
        transferMongoIds: [],
        fileNames: files.map((f) => f.fileName),
        files,
        transferMemo: draft.transferMemo,
        rawTransferMemo: String(draft.transferMemo || "").trim(),
        unreadCount: 0,
        practiceUserId: draft.practiceUserId,
        practiceUserLabel: ownerLabel,
        isMineDraft: draft.isMine,
        draftPatientName: draft.patientName,
        searchBlob: "",
      };
    });

    return [...draftTrash, ...canceled].sort(
      (a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0),
    );
  }, [trashRecentRequests, trashedDraftList]);

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

  const selectedTransferRawMemo = useMemo(
    () =>
      String(selectedTransfer?.rawTransferMemo || selectedTransfer?.transferMemo || "").trim(),
    [selectedTransfer?.rawTransferMemo, selectedTransfer?.transferMemo],
  );

  // 상세 의 메모: 메타 태그 원본에서 자유 입력 메모만 (환자명·보철물 요약 제외)
  const selectedTransferDisplayMemo = useMemo(() => {
    const raw = String(selectedTransfer?.rawTransferMemo || "").trim();
    if (!raw) return "";
    return String(parsePracticeTransferMemoMetaShared(raw).memo || "").trim();
  }, [selectedTransfer?.rawTransferMemo]);

  const selectedTransferPatientName = useMemo(() => {
    const fromMemo = String(
      parsePracticeTransferMemoMetaShared(selectedTransferRawMemo).patientName || "",
    ).trim();
    if (fromMemo) return fromMemo;
    return String(selectedTransfer?.draftPatientName || "").trim();
  }, [selectedTransfer?.draftPatientName, selectedTransferRawMemo]);

  const selectedTransferToothWorks = useMemo(
    () => parsePracticeTransferMemoMetaShared(selectedTransferRawMemo).toothWorks,
    [selectedTransferRawMemo],
  );

  const applyDraftSummaryToForm = useCallback(
    (draft: DraftListSummary) => {
      suppressLocalFormPersistRef.current = true;
      skipFormAutosaveRef.current = true;
      formAutosaveSeqRef.current += 1;
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }

      const parsed = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
      const labId = String(draft.targetLabAnchorId || "").trim();
      const labName = String(draft.targetLabName || "").trim();
      // transferMemo가 SSOT. 목록 카드의 patientName은 stale일 수 있어 memo 빈 값에 fallback하지 않는다.
      const nextPatientName = String(parsed.patientName || "").trim().normalize("NFC");

      skipNextArrivalAutoSyncRef.current = true;

      // 케이스에 기공소가 없으면 로컬/최근 기공소 캐시를 반드시 비운다.
      if (labName) {
        const fromRecent = recentLabsRef.current.find((b) => {
          const id = String(b?._id || "").trim();
          if (labId && id === labId) return true;
          return String(b?.name || "").trim() === labName;
        });
        setSelectedLab({
          _id:
            (isMongoObjectIdString(labId) ? labId : "") ||
            (isMongoObjectIdString(fromRecent?._id) ? String(fromRecent?._id) : "") ||
            `draft-lab:${labName}`,
          name: labName,
          businessNumber: String(fromRecent?.businessNumber || "").trim(),
          representativeName: String(fromRecent?.representativeName || "").trim(),
          address: String(fromRecent?.address || "").trim(),
          businessType: "requestor",
        });
      } else {
        setSelectedLab(null);
      }
      setLabOpen(false);
      setLabSearch("");

      skipNextArrivalAutoSyncRef.current = true;
      setOrderDate(todayDate);
      {
        const restoredArrival = String(parsed.arrivalDate || "").trim();
        setArrivalDate(
          restoredArrival && restoredArrival >= todayDate
            ? restoredArrival
            : addDaysToDateInput(
                todayDate,
                normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays)),
              ),
        );
      }
      if (Number.isFinite(Number(parsed.arrivalDefaultDays))) {
        const days = normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays));
        setArrivalDefaultDays(days);
      }
      const prosthesisTypesForRestore = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
      setProsthesisTypeCatalog(prosthesisTypesForRestore);
      setProsthesisTypeCatalogDraft(prosthesisTypesForRestore);
      setPatientName(nextPatientName);
      setRequestMemo(String(parsed.memo || ""));

      const fallbackToothRow = {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(prosthesisTypesForRestore),
        customAbutment: false,
        bridgeLinkedTeeth: [] as string[],
      };
      let nextToothWorks: ToothWorkSelection[] = [fallbackToothRow];
      if (parsed.toothWorks.length > 0) {
        const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
          prosthesisTypes: prosthesisTypesForRestore,
          isCustomAbutmentSupportedProsthesisType,
          isBridgeLikeProsthesisType,
          getAdjacentTeeth,
          fallbackProsthesisType: "크라운",
        });
        if (restoredRows.length > 0) nextToothWorks = restoredRows;
      }
      setToothWorks(nextToothWorks);

      setDraftFiles(draft.files);
      setDraftSummary(draft);
      setActiveDraftId(draft.id);

      const fingerprint = buildPracticeTransferFormFingerprint({
        targetLabAnchorId: labId,
        targetLabName: labName,
        patientName: nextPatientName,
        orderDate: parsed.orderDate,
        arrivalDate: parsed.arrivalDate,
        arrivalDefaultDays: parsed.arrivalDefaultDays,
        requestMemo: parsed.memo,
        prosthesisTypes: prosthesisTypesForRestore,
        toothWorks: nextToothWorks,
      });
      currentFormFingerprintRef.current = fingerprint;
      lastSavedFormFingerprintRef.current = fingerprint;
      setLastSavedFormFingerprint(fingerprint);
      pendingLocalFormEditRef.current = false;
      const ts = draft.updatedAt ? new Date(draft.updatedAt).getTime() : Date.now();
      if (Number.isFinite(ts) && ts > 0) {
        lastAppliedServerUpdatedAtRef.current = ts;
        localFormUpdatedAtRef.current = ts;
      }
      setFormSyncStatus("saved");
      setTempSaveDirty(false);

      // 반영된(비어 있을 수 있는) 스냅샷을 localStorage에도 즉시 기록해 캐시 잔존을 막는다.
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_FORM_LOCAL_KEY,
          JSON.stringify({
            orderDate: parsed.orderDate,
            arrivalDate: parsed.arrivalDate,
            arrivalDefaultDays: parsed.arrivalDefaultDays,
            prosthesisTypes: prosthesisTypesForRestore,
            requestMemo: String(parsed.memo || ""),
            patientName: nextPatientName,
            selectedLab: labName
              ? {
                  _id:
                    (isMongoObjectIdString(labId) ? labId : "") ||
                    `draft-lab:${labName}`,
                  name: labName,
                  businessNumber: "",
                  representativeName: "",
                  address: "",
                  businessType: "requestor",
                }
              : null,
            toothWorks: nextToothWorks,
            activeDraftId: draft.id,
            updatedAt: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
          } satisfies PracticeTransferLocalFormDraft),
        );
      } catch {
        // ignore
      }

      queueMicrotask(() => {
        suppressLocalFormPersistRef.current = false;
        skipFormAutosaveRef.current = false;
      });
    },
    [setLabOpen, setLabSearch, setRequestMemo, setSelectedLab],
  );

  const handleAdoptDraftTransfer = useCallback(
    (transfer: RecentTransferItem) => {
      const draft = practiceDraftList.find((row) => row.id === transfer.id);
      if (!draft) {
        toast({
          title: "임시저장을 찾지 못했습니다",
          description: "목록을 새로고침한 뒤 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      applyDraftSummaryToForm(draft);
      // 목록 카드보다 서버 최신 스냅샷을 우선해, 빈 기공소/환자명도 정확히 맞춘다.
      void loadPracticeTransferDraft({ draftId: draft.id });
      toast({
        title: draft.isMine ? "임시저장 불러옴" : "같은 케이스로 이어쓰기",
        description: draft.isMine
          ? "작성 폼에 반영했습니다. 같은 계정·동료가 이 건을 불러오면 함께 동기화됩니다."
          : `${draft.practiceUserLabel || "동료"}의 임시저장에 참여했습니다. 입력 내용이 같은 케이스에 실시간 동기화됩니다.`,
      });
    },
    [applyDraftSummaryToForm, loadPracticeTransferDraft, practiceDraftList, toast],
  );

  const handleOpenTransferDialog = async (
    transfer: RecentTransferItem,
    options?: { fromTrash?: boolean },
  ) => {
    const fromTrash = Boolean(options?.fromTrash);
    const isDraftTransfer =
      transfer.status === "임시저장" ||
      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;

    if (isDraftTransfer && !fromTrash) {
      handleAdoptDraftTransfer(transfer);
      return;
    }

    const resolveSeq = ++chatRoomResolveSeqRef.current;

    setSelectedTransfer(transfer);
    setTransferDialogOpen(true);
    transferDialogOpenRef.current = true;
    selectedTransferIdRef.current = String(transfer.transferId || "").trim();
    setChatDraft("");
    setChatAttachedFiles([]);
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatError("");

    if (isDraftTransfer) {
      setChatError("휴지통 임시저장은 채팅방이 없습니다. 복구 후 이어서 작성할 수 있습니다.");
      return;
    }

    if (String(transfer.status || "").trim() === "취소") {
      setChatError("휴지통으로 이동된 전송은 채팅할 수 없습니다. 복구 후 다시 열어주세요.");
      return;
    }

    await resolvePracticeTransferChatRoom(String(transfer.transferId || "").trim(), resolveSeq);
  };

  const resolvePracticeTransferChatRoom = useCallback(
    async (transferIdRaw: string, resolveSeq: number) => {
      if (!authToken) {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("로그인이 필요합니다.");
        return;
      }

      const transferId = String(transferIdRaw || "").trim();
      if (!transferId || transferId === "-") {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
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

        void prefetchMessages(payload._id);
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
    },
    [authToken, chatRooms, prefetchMessages],
  );

  const handleCloseTransferDialog = () => {
    chatRoomResolveSeqRef.current += 1;
    setTransferDialogOpen(false);
    transferDialogOpenRef.current = false;
    selectedTransferIdRef.current = "";
    setSelectedTransfer(null);
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatDraft("");
    setChatReplyTo(null);
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

      const sent = await sendMessage(content, attachments, {
        replyTo: chatReplyTo?._id || null,
      });
      if (sent) {
        setChatDraft("");
        setChatReplyTo(null);
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
      const draftId = String(activeDraftIdRef.current || "").trim();
      await apiFetch<unknown>({
        path: draftId
          ? `/api/practice/transfers/draft?draftId=${encodeURIComponent(draftId)}`
          : "/api/practice/transfers/draft",
        method: "DELETE",
        token: authToken,
      });
      setDraftSummary(null);
      lastSavedFormFingerprintRef.current = null;
      setLastSavedFormFingerprint(null);
      lastAppliedServerUpdatedAtRef.current = 0;
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus("idle");
      setActiveDraftId(null);
      return;
    }

    const transferMemo = buildPracticeTransferMemo({
      memo: requestMemo,
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      toothWorks: syncToothWorks,
      patientName: normalizedPatientName,
    });

    await apiFetch<unknown>({
      path: "/api/practice/transfers/draft",
      method: "POST",
      token: authToken,
      jsonBody: {
        draftId: activeDraftIdRef.current || undefined,
        targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
        targetLabName: String(selectedLab?.name || "").trim(),
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        transferMemo,
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
      const idx = Number(target.localIndex);
      const targetFile = files[idx];
      if (targetFile) forgetFile(targetFile);
      removeFile(idx);
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
    await clearLocalFilesWithCache();
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
        const draftId = String(target.id || "").trim();
        const activeId = String(activeDraftIdRef.current || "").trim();
        await apiFetch<unknown>({
          path: draftId
            ? `/api/practice/transfers/draft?draftId=${encodeURIComponent(draftId)}`
            : "/api/practice/transfers/draft",
          method: "DELETE",
          token: authToken,
        });
        if (!activeId || target.id === activeId) {
          setDraftFiles([]);
          setDraftSummary(null);
          setActiveDraftId(null);
          lastSavedFormFingerprintRef.current = null;
          setLastSavedFormFingerprint(null);
          pendingLocalFormEditRef.current = false;
          setFormSyncStatus("idle");
        }
        await loadPracticeTransferDraftList();
        toast({
          title: "휴지통으로 이동",
          description: "임시저장을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.",
        });
      } catch (error) {
        toast({
          title: "휴지통 이동 실패",
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

    if (
      target.status === "임시저장" ||
      target.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      setRestoringTransfer(true);
      try {
        const draftId = String(target.id || "").trim();
        const res = await apiFetch<unknown>({
          path: "/api/practice/transfers/draft/restore",
          method: "POST",
          token: authToken,
          jsonBody: { draftId },
        });
        if (!res.ok) {
          const body = asApiMessagePayload(res.data);
          throw new Error(String(body?.message || "임시저장 복구에 실패했습니다."));
        }
        await loadPracticeTransferDraftList();
        toast({
          title: "임시저장 복구 완료",
          description: "임시저장 목록으로 되돌렸습니다. 카드를 눌러 이어서 작성할 수 있습니다.",
        });
      } catch (error) {
        toast({
          title: "복구 실패",
          description:
            error instanceof Error ? error.message : "임시저장 복구 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setRestoringTransfer(false);
        setRestoreConfirmOpen(false);
        setRestoreTargetTransfer(null);
      }
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

  const handleAskEmptyTrash = () => {
    if (emptyingTrash) return;
    if (trashGroupedTransfers.length === 0) return;
    setEmptyTrashConfirmOpen(true);
  };

  const handleCancelEmptyTrash = () => {
    if (emptyingTrash) return;
    setEmptyTrashConfirmOpen(false);
  };

  const handleConfirmEmptyTrash = async () => {
    if (emptyingTrash) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    setEmptyingTrash(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/trash/empty",
        method: "POST",
        token: authToken,
      });
      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "휴지통 비우기에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as {
              data?: { draftDeletedCount?: number; transferDeletedCount?: number };
            })
          : {};
      const draftDeletedCount = Number(body.data?.draftDeletedCount || 0);
      const transferDeletedCount = Number(body.data?.transferDeletedCount || 0);
      const totalDeleted = draftDeletedCount + transferDeletedCount;

      setTrashedDraftList([]);
      setRecentRequests((prev) =>
        prev.filter((row) => String(row.status || "").trim() !== "취소"),
      );
      setEmptyTrashConfirmOpen(false);

      if (
        selectedTransfer &&
        (selectedTransfer.status === "취소" ||
          selectedTransfer.status === "임시저장" ||
          selectedTransfer.transferId === PRACTICE_DRAFT_TRANSFER_ID)
      ) {
        handleCloseTransferDialog();
      }

      toast({
        title: "휴지통을 비웠습니다",
        description:
          totalDeleted > 0
            ? `임시저장 ${draftDeletedCount}건, 취소 전송 ${transferDeletedCount}건을 영구 삭제했습니다.`
            : "삭제할 항목이 없었습니다.",
      });

      void loadPracticeTransferDraftList();
      void loadRecentRequests({ silent: true });
    } catch (error) {
      toast({
        title: "휴지통 비우기 실패",
        description:
          error instanceof Error ? error.message : "휴지통 비우기 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setEmptyingTrash(false);
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
    // draft 공동 작성은 입력 포커스 중에도 즉시 반영. pendingLocalFormEditRef가 덮어쓰기 보호.
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const action = String(payload.action || "").trim().toLowerCase();
      const isDraftEvent =
        action === "draft-upserted" || action === "draft-cleared";
      const eventDraftId = String(payload.draftId || "").trim();
      const activeId = String(activeDraftIdRef.current || "").trim();
      const summaryId = String(draftSummaryIdRef.current || "").trim();
      const linkedDraftId = activeId || summaryId;
      const isLinkedCaseEvent =
        Boolean(eventDraftId) && Boolean(linkedDraftId) && eventDraftId === linkedDraftId;
      const isActiveCaseEvent = Boolean(activeId) && eventDraftId === activeId;

      if (action === "trash-emptied") {
        setTrashedDraftList([]);
        setRecentRequests((prev) =>
          prev.filter((row) => String(row.status || "").trim() !== "취소"),
        );
        void loadPracticeTransferDraftList();
        void loadRecentRequests({ silent: true });
        return;
      }

      if (isDraftEvent) {
        void loadPracticeTransferDraftList();
        if (action === "draft-cleared") {
          if (eventDraftId) {
            setPracticeDraftList((prev) => prev.filter((row) => row.id !== eventDraftId));
            setTrashedDraftList((prev) => prev.filter((row) => row.id !== eventDraftId));
          }
          if (isLinkedCaseEvent) {
            // 작성자·동료·다른 탭: activeDraftId가 유실돼도 draftSummary로 같은 케이스면 폼을 비운다
            void resetIntakeFormAfterTransferRef.current();
          }
          return;
        }
        // 같은 케이스(불러온 draftId)만 작성 폼에 반영
        if (isActiveCaseEvent && action === "draft-upserted") {
          // 같은 계정 다른 탭/창도 반영해야 하므로 editorUserId echo skip 하지 않는다.
          // 동일 내용은 applyPracticeDraftPayload 내부 fingerprint 비교로 no-op 처리.
          const hasEventSnapshot =
            typeof payload.transferMemo === "string" || Array.isArray(payload.files);
          if (hasEventSnapshot) {
            applyPracticeDraftPayload({
              _id: eventDraftId || activeId,
              practiceUserId: String(payload.practiceUserId || "").trim() || myUserId,
              practiceUserLabel: String(payload.practiceUserLabel || "").trim() || null,
              targetLabAnchorId:
                payload.targetLabAnchorId != null
                  ? String(payload.targetLabAnchorId).trim() || null
                  : null,
              targetLabName: String(payload.targetLabName || "").trim(),
              transferMemo: String(payload.transferMemo || ""),
              files: Array.isArray(payload.files)
                ? (payload.files as DraftTransferFileItem[])
                : [],
              updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
              createdAt: payload.createdAt ? String(payload.createdAt) : null,
              forceResync: Boolean(payload.forceResync),
            });
            return;
          }

          void loadPracticeTransferDraft({ draftId: activeId });
        }
        return;
      }

      void loadRecentRequests({ silent: true });
      if (String(evt?.type || "").trim() === "practice:transfer-created") {
        const clearedDraftId = String(payload.clearedDraftId || "").trim();
        if (clearedDraftId) {
          setPracticeDraftList((prev) => prev.filter((row) => row.id !== clearedDraftId));
          setTrashedDraftList((prev) => prev.filter((row) => row.id !== clearedDraftId));
          const linkedId =
            String(activeDraftIdRef.current || draftSummaryIdRef.current || "").trim();
          if (linkedId && linkedId === clearedDraftId) {
            // 동료/다른 탭: 전송된 케이스의 작성 폼·localStorage를 함께 비운다
            void resetIntakeFormAfterTransferRef.current();
          }
        }
        void loadPracticeTransferDraftList();
      }

      // 기공소 의뢰수락 시: 열려 있는 상세 모달에서 기공소명 갱신 + 채팅방 재연결
      const eventTransferId = String(payload.transferId || "").trim();
      const isAcceptChatEvent =
        action === "accepted" ||
        action === "auto-match-claimed" ||
        action === "downloaded";
      if (
        isAcceptChatEvent &&
        transferDialogOpenRef.current &&
        eventTransferId &&
        eventTransferId === selectedTransferIdRef.current
      ) {
        const labName = String(payload.targetLabName || "").trim();
        const labAnchorId = String(payload.targetLabAnchorId || "").trim();
        const stage = String(payload.manufacturerStage || "").trim();
        setSelectedTransfer((prev) => {
          if (!prev || String(prev.transferId || "").trim() !== eventTransferId) {
            return prev;
          }
          return {
            ...prev,
            ...(labName ? { targetLab: labName } : {}),
            ...(labAnchorId ? { targetLabAnchorId: labAnchorId } : {}),
            ...(stage ? { status: stage } : {}),
          };
        });
        const resolveSeq = ++chatRoomResolveSeqRef.current;
        setChatError("");
        void resolvePracticeTransferChatRoom(eventTransferId, resolveSeq);
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
      const clinicName = autoClinicName;
      const transferId = makeTransferId();
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
      });
      const autoMatch = isAutoMatchLab(selectedLab);
      const practiceRouting = {
        targetLabAnchorId: autoMatch ? null : toApiLabAnchorId(selectedLab?._id),
        targetLabName: String(selectedLab?.name || "").trim(),
        matchingMode: autoMatch ? "auto" : "direct",
      };
      const newSystemRequestBase = {
        requested: true,
        manufacturer: "",
        brand: "",
        family: "",
        message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
        free: true,
        tag: "practice_file_transfer",
      };
      const caseInfosPayload =
        transferFiles.length > 0
          ? transferFiles.map((tempFile) => {
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
                newSystemRequest: newSystemRequestBase,
                // related files:
                // - web/backend/models/practiceTransfer.model.js
                // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
                // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
                // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
                practiceRouting,
              };
            })
          : [
              {
                clinicName,
                patientName: normalizedPatientName,
                tooth: "",
                workType: "abutment",
                designSoftware: "3Shape",
                newSystemRequest: newSystemRequestBase,
                practiceRouting,
              },
            ];

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferId,
          draftId: String(activeDraftIdRef.current || draftSummary?.id || "").trim() || undefined,
          matchingMode: autoMatch ? "auto" : "direct",
          targetLabAnchorId: autoMatch ? null : toApiLabAnchorId(selectedLab?._id),
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
      skipFormAutosaveRef.current = true;
      formAutosaveSeqRef.current += 1;
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }

      const draftIdToClear = String(activeDraftIdRef.current || draftSummary?.id || "").trim();

      // 작성자 UI: transfer-created 목록 재조회가 DELETE보다 늦게 끝나 draft가 다시 붙는 레이스 방지
      if (draftIdToClear) {
        setPracticeDraftList((prev) => prev.filter((row) => row.id !== draftIdToClear));
        setTrashedDraftList((prev) => prev.filter((row) => row.id !== draftIdToClear));
      }
      rememberLab(selectedLab);

      // 전송 시 draft는 서버에서 완전 삭제됨. 휴지통(soft DELETE)으로 보내지 않는다.
      draftListSeqRef.current += 1;
      await resetIntakeFormAfterTransfer();
      await loadPracticeTransferDraftList();

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

  const formSyncStatusLabel =
    formSyncStatus === "pending"
      ? "동기화 대기…"
      : formSyncStatus === "saving"
        ? "동기화 중…"
        : formSyncStatus === "saved" && (draftFiles.length > 0 || Boolean(activeDraftId))
          ? activeDraftId
            ? "동기화됨"
            : "임시저장됨"
          : formSyncStatus === "error"
            ? "동기화 실패 · 다시 시도"
            : "";

  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!String(selectedLab?._id || "").trim()) missing.push("기공소");
    if (!normalizedPatientName) missing.push("환자명");
    if (normalizedToothWorks.length === 0) missing.push("보철물");
    return missing;
  }, [selectedLab?._id, normalizedPatientName, normalizedToothWorks.length]);

  const hasRequiredSubmitFields = missingRequiredFields.length === 0;

  useEffect(() => {
    if (!orderDate) return;
    if (skipNextArrivalAutoSyncRef.current) {
      skipNextArrivalAutoSyncRef.current = false;
      return;
    }
    setArrivalDate(addDaysToDateInput(orderDate, arrivalDefaultDays));
  }, [orderDate, arrivalDefaultDays]);

  // 주문일은 항상 오늘(KST)로 고정
  useEffect(() => {
    if (orderDate === todayDate) return;
    skipNextArrivalAutoSyncRef.current = true;
    setOrderDate(todayDate);
    setArrivalDate((prev) => {
      const current = String(prev || "").trim();
      if (current && current >= todayDate) return current;
      return addDaysToDateInput(todayDate, arrivalDefaultDays);
    });
  }, [arrivalDefaultDays, orderDate, todayDate]);

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
        ...emptyToothWorkCustomSpecs(),
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
        ...emptyToothWorkCustomSpecs(),
      },
    ]);
  };

  const handleStartNewTransfer = async () => {
    clearPracticeSharedFormLocalStorage();

    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }
    skipFormAutosaveRef.current = true;
    lastAppliedServerUpdatedAtRef.current = 0;
    pendingLocalFormEditRef.current = false;
    setFormSyncStatus("idle");

    setLabOpen(false);
    setLabSearch("");
    // 최근 기공소(localStorage + 서버 전송내역)는 드롭다운 후보로만 유지. 선택은 비워 다시 고르게 한다.
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    const nextOrderDate = todayDate;
    const nextArrivalDate = addDaysToDateInput(todayDate, arrivalDefaultDays);
    setOrderDate(nextOrderDate);
    setArrivalDate(nextArrivalDate);
    const nextToothWorks: ToothWorkSelection[] = [
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ];
    setToothWorks(nextToothWorks);

    // 화면만 비움. 서버 임시저장은 목록에 유지(삭제는 임시저장 카드에서).
    await clearLocalFilesWithCache();
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    setTempSaveDirty(false);
    setToothChartResetNonce((n) => n + 1);

    // 빈 폼 baseline — 이후 의뢰서 항목을 바꾸거나 파일을 업로드하면 그때 동기화된다.
    const baselineFingerprint = buildPracticeTransferFormFingerprint({
      targetLabAnchorId: undefined,
      targetLabName: undefined,
      patientName: "",
      orderDate: nextOrderDate,
      arrivalDate: nextArrivalDate,
      arrivalDefaultDays,
      requestMemo: "",
      prosthesisTypes: normalizedProsthesisTypes,
      toothWorks: normalizeToothWorksForSync(nextToothWorks),
    });
    lastSavedFormFingerprintRef.current = baselineFingerprint;
    setLastSavedFormFingerprint(baselineFingerprint);
    currentFormFingerprintRef.current = baselineFingerprint;

    void loadPracticeTransferDraftList();
    queueMicrotask(() => {
      skipFormAutosaveRef.current = false;
    });

    toast({
      title: "새로 작성",
      description:
        "작성 화면을 비웠습니다. 임시저장은 오른쪽 목록에 남아 다시 불러올 수 있습니다.",
    });
  };

  /** 작성 중 의뢰서를 지금 임시저장하고, 이후 수정분은 새 임시저장으로 이어간다. */
  const handleManualTempSaveSnapshot = async () => {
    if (tempSaving || fileSyncInFlightRef.current || requestSubmitting) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    // 치아만으로는 스냅샷을 만들지 않는다(빈 임시저장 목록 누적 방지).
    if (!hasSubstantialContentForNewDraft) {
      toast({
        title: "저장할 내용이 없습니다",
        description: "기공소·환자명·메모 또는 파일을 입력한 뒤 다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    setTempSaving(true);
    fileSyncInFlightRef.current = true;
    suppressLocalFormPersistRef.current = true;
    skipFormAutosaveRef.current = true;
    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }

    try {
      let nextDraftFiles = [...draftFilesRef.current];
      if (files.length > 0) {
        const uploadedTempFiles: TempUploadedFile[] = await uploadFilesWithToast(files);
        nextDraftFiles = [
          ...nextDraftFiles,
          ...uploadedTempFiles.map((f) => ({
            fileId: String(f._id || "").trim(),
            originalName: String(f.originalName || "").trim(),
            mimetype: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
            size: Number(f.size || 0),
            s3Key: String(f.key || "").trim(),
            location: String(f.location || "").trim(),
          })),
        ].filter((row) => row.fileId && row.originalName && row.s3Key);
        nextDraftFiles = Array.from(
          new Map(nextDraftFiles.map((row) => [toDraftFileKey(row), row])).values(),
        );
      }

      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
      });

      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/draft",
        method: "POST",
        token: authToken,
        jsonBody: {
          draftId: activeDraftIdRef.current || undefined,
          targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          transferMemo,
          files: nextDraftFiles.map((row) => ({
            fileId: row.fileId,
          })),
          forceResync: true,
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

      const savedDraftFiles = Array.isArray(payload?.files)
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
        : nextDraftFiles;

      const nextSummary = buildOwnDraftSummary(payload, savedDraftFiles, transferMemo);
      if (nextSummary) {
        setPracticeDraftList((prev) => {
          const without = prev.filter((row) => row.id !== nextSummary.id);
          return [nextSummary, ...without];
        });
      }
      void loadPracticeTransferDraftList();

      // 스냅샷은 목록에 남기고, 이후 수정은 새 임시저장으로 이어가도록 작성 폼을 분리한다.
      setDraftFiles(savedDraftFiles);
      setDraftSummary(null);
      setActiveDraftId(null);
      activeDraftSeenInListRef.current = null;
      setTempSaveDirty(false);
      await clearLocalFilesWithCache();

      const fingerprint = currentFormFingerprintRef.current;
      lastSavedFormFingerprintRef.current = fingerprint;
      setLastSavedFormFingerprint(fingerprint);
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus("saved");

      const serverUpdatedAt = payload?.updatedAt
        ? new Date(String(payload.updatedAt)).getTime()
        : Date.now();
      if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
        lastAppliedServerUpdatedAtRef.current = Math.max(
          lastAppliedServerUpdatedAtRef.current,
          serverUpdatedAt,
        );
        localFormUpdatedAtRef.current = Math.max(
          localFormUpdatedAtRef.current,
          serverUpdatedAt,
        );
      }

      toast({
        title: "임시 저장 완료",
        description:
          "오른쪽 목록에 저장했습니다. 내용을 바꾸면 새 임시저장 의뢰서가 만들어집니다.",
      });
    } catch (error) {
      toast({
        title: "임시 저장 실패",
        description:
          error instanceof Error ? error.message : "임시저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
      setFormSyncStatus("error");
    } finally {
      setTempSaving(false);
      fileSyncInFlightRef.current = false;
      suppressLocalFormPersistRef.current = false;
      queueMicrotask(() => {
        skipFormAutosaveRef.current = false;
      });
    }
  };

  const persistArrivalDefaultDaysFromRange = useCallback(
    (nextOrder: string, nextArrival: string) => {
      const diff = kstYmdDiffDays(nextOrder, nextArrival);
      if (diff == null) return;
      const nextDays = normalizeArrivalDefaultDays(diff);
      if (nextDays === arrivalDefaultDays) return;

      // orderDate effect가 도착일을 덮어쓰지 않도록 한 틱 스킵
      skipNextArrivalAutoSyncRef.current = true;
      setArrivalDefaultDays(nextDays);

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
            arrivalDefaultDays: nextDays,
            prosthesisTypes: normalizedProsthesisTypes,
            memoSnippets,
            implantFavorites,
            abutmentFavorites,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      void savePracticeTransferSettingsToServer({ arrivalDefaultDays: nextDays }).catch(() => {
        // 날짜 적용은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      arrivalDefaultDays,
      implantFavorites,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
    ],
  );

  const handleSaveProsthesisTypeSettings = async () => {
    if (savingProsthesisTypeSettings) return;
    setSavingProsthesisTypeSettings(true);
    try {
      const nextTypes = ensurePresetProsthesisTypes(prosthesisTypeCatalogDraft);
      const ok = await savePracticeTransferSettingsToServer({
        arrivalDefaultDays,
        prosthesisTypes: nextTypes,
      });
      if (!ok) throw new Error("설정 저장에 실패했습니다.");

      setToothWorks((prev) =>
        prev.map((row) => {
          const customAbutment = Boolean(row.customAbutment);
          return {
            toothNumber: row.toothNumber,
            prosthesisType: nextTypes.some((type) => type === row.prosthesisType)
              ? row.prosthesisType
              : resolveDefaultProsthesisType(nextTypes),
            customAbutment,
            bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
            ...pickToothWorkCustomSpecs(row, customAbutment),
          };
        }),
      );
      setProsthesisTypeSettingsDialogOpen(false);
      toast({ title: "보철물 설정 저장", description: "목록을 저장했습니다." });
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
      className="h-full min-h-0 bg-gradient-subtle"
    >
      <div className="mx-auto h-full min-h-0 max-w-6xl space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
          {promoNoticeVisible ? (
            <Alert className="relative flex items-center justify-between gap-3 border-primary-muted bg-primary-soft/80 py-2.5 text-primary-strong xl:col-span-10">
              <AlertTitle className="m-0 pr-8 text-sm font-medium leading-snug">
                {PRACTICE_TRANSFER_PROMO_TITLE}
              </AlertTitle>
              <button
                type="button"
                onClick={() => void handleDismissPromoNotice()}
                disabled={promoNoticeSaving}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-primary-strong hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="안내 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </Alert>
          ) : null}
          <div className="flex min-w-0 flex-col gap-3 xl:col-span-7">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {roleSwitcher}
                    <CardTitle className="flex min-w-0 items-center gap-2 text-xl font-bold tracking-tight">
                      <UploadCloud className="h-5 w-5 shrink-0 text-primary-strong" />
                      <span className="shrink-0">기공의뢰</span>
                      {formSyncStatusLabel ? (
                        <span
                          className={cn(
                            "truncate text-xs font-normal",
                            formSyncStatus === "error"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {formSyncStatusLabel}
                        </span>
                      ) : null}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 text-base"
                          disabled={
                            tempSaving ||
                            requestSubmitting ||
                            !hasSubstantialContentForNewDraft ||
                            (!activeDraftId &&
                              lastSavedFormFingerprint !== null &&
                              currentFormFingerprint === lastSavedFormFingerprint)
                          }
                          onClick={() => void handleManualTempSaveSnapshot()}
                        >
                          임시 저장
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        목록에 저장. 이후 수정하면 새 임시저장이 생깁니다.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 text-base"
                          onClick={() => void handleStartNewTransfer()}
                        >
                          새로 작성
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        작성 화면만 비웁니다. 임시저장은 목록에 남습니다.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <PracticeTransferIntakeSection
                  filePaneProps={{
                    acceptedHint: PRACTICE_ACCEPTED_HINT,
                    fileInputId: "practice-file-transfer-input",
                    files: combinedDisplayFiles.map((file) => ({
                      key: file.key,
                      name: file.name,
                      size: file.size,
                      metaSuffix: file.kind === "draft" ? "동기화됨" : "대기",
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
                    variant: "plain",
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
                  onOrderArrivalDatesChange: ({ arrivalDate: nextArrival }) => {
                    skipNextArrivalAutoSyncRef.current = true;
                    setOrderDate(todayDate);
                    const arrival =
                      String(nextArrival || "").trim() >= todayDate
                        ? String(nextArrival || "").trim()
                        : addDaysToDateInput(todayDate, arrivalDefaultDays);
                    setArrivalDate(arrival);
                    persistArrivalDefaultDaysFromRange(todayDate, arrival);
                  },
                  arrivalDefaultDays,
                  normalizedProsthesisTypes,
                  setProsthesisTypeCatalogDraft,
                  setProsthesisTypeSettingsDialogOpen,
                  toothWorks,
                  setToothWorks,
                  requestMemo,
                  setRequestMemo,
                  memoInputId: "practice-file-transfer-request-memo",
                  toothChartResetNonce,
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
                          implantFavorites,
                          abutmentFavorites,
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
                  implantConnections,
                  implantFavorites,
                  onImplantFavoritesChange: (next) => {
                    const normalized = normalizeImplantFavorites(next);
                    setImplantFavorites(normalized);
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
                          memoSnippets,
                          implantFavorites: normalized,
                          abutmentFavorites,
                          savedAt: Date.now(),
                        }),
                      );
                    } catch {
                      // ignore
                    }
                    void savePracticeTransferSettingsToServer({ implantFavorites: normalized });
                  },
                  abutmentFavorites,
                  onAbutmentFavoritesChange: (next) => {
                    const normalized = normalizeAbutmentFavorites(next);
                    setAbutmentFavorites(normalized);
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
                          memoSnippets,
                          implantFavorites,
                          abutmentFavorites: normalized,
                          savedAt: Date.now(),
                        }),
                      );
                    } catch {
                      // ignore
                    }
                    void savePracticeTransferSettingsToServer({ abutmentFavorites: normalized });
                  },
                  onImeComposingChange: (composing) => {
                    imeComposingRef.current = composing;
                    if (composing) return;
                    const pending = pendingDraftApplyRef.current;
                    if (!pending) return;
                    pendingDraftApplyRef.current = null;
                    applyPracticeDraftPayload(pending, {
                      forceResync: Boolean(pending.forceResync),
                    });
                  },
                  prosthesisTypeSelectWidthClassName: "w-[7rem]",
                  showBridgeConnections: true,
                }}
              />
              </CardContent>
            </Card>

            <div className="flex items-center justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      className="bg-primary-strong text-white hover:bg-primary-strong disabled:pointer-events-none"
                      onClick={() => void handleSubmitPracticeRequest()}
                      disabled={requestSubmitting || !hasRequiredSubmitFields}
                    >
                      {requestSubmitting ? "기공소로 전송 중..." : "기공소로 전송"}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-xs text-xs leading-relaxed">
                  {requestSubmitting ? (
                    <p>전송 중…</p>
                  ) : hasRequiredSubmitFields ? (
                    <p>전송 가능</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {(
                        [
                          { key: "기공소", ok: Boolean(String(selectedLab?._id || "").trim()) },
                          { key: "환자명", ok: Boolean(normalizedPatientName) },
                          { key: "보철물", ok: normalizedToothWorks.length > 0 },
                        ] as const
                      ).map((item) => (
                        <li
                          key={item.key}
                          className={item.ok ? "text-primary-muted" : "text-accent-muted"}
                        >
                          {item.key}
                          {item.ok ? " ✓" : " · 필요"}
                        </li>
                      ))}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-3 xl:col-span-3">
            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={recentTransfersOpen} onOpenChange={setRecentTransfersOpen}>
              <CardHeader className="pb-2 pt-3">
                <CollapsibleTrigger asChild>
                  <button type="button" className="mb-2 flex w-full items-center justify-between gap-2 text-left">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <ClipboardList className="h-4 w-4 text-primary-strong" />
                      최근 전송
                    </CardTitle>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${recentTransfersOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-start">
                    <PeriodFilter
                      value={period}
                      onChange={setPeriod}
                      presets={["thisMonth", "lastMonth"]}
                    />
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
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "hover:bg-muted/40",
                        )}
                      >
                        의뢰 {statusCounts.sent}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "의뢰수락" ? "all" : "의뢰수락"))
                      }
                      aria-pressed={recentStatusFilter === "의뢰수락"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "의뢰수락"
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "hover:bg-muted/40",
                        )}
                      >
                        수락 {statusCounts.accepted}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "작업완료" ? "all" : "작업완료"))
                      }
                      aria-pressed={recentStatusFilter === "작업완료"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "작업완료"
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "hover:bg-muted/40",
                        )}
                      >
                        완료 {statusCounts.completed}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "포장.발송" ? "all" : "포장.발송"))
                      }
                      aria-pressed={recentStatusFilter === "포장.발송"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "포장.발송"
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "hover:bg-muted/40",
                        )}
                      >
                        발송 {statusCounts.shipping}건
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="rounded-full"
                      onClick={() =>
                        setRecentStatusFilter((prev) => (prev === "추적관리" ? "all" : "추적관리"))
                      }
                      aria-pressed={recentStatusFilter === "추적관리"}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          recentStatusFilter === "추적관리"
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "hover:bg-muted/40",
                        )}
                      >
                        추적관리 {statusCounts.tracking}건
                      </Badge>
                    </button>
                  </div>

                  <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={requestSearchTerm}
                      onChange={(e) => setRequestSearchTerm(e.target.value)}
                      className="pl-9"
                      placeholder="전송ID, 환자명 검색"
                    />
                  </div>
                </div>
                </CollapsibleContent>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {recentRequestsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={`recent-skel-${idx}`}
                        className="rounded-lg border px-3 py-2 space-y-2"
                      >
                        <Skeleton className="h-4 w-28" />
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-40" />
                      </div>
                    ))}
                  </div>
                ) : recentRequestsError ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-destructive">
                    {recentRequestsError}
                  </div>
                ) : displayGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {recentStatusFilter === "all"
                      ? "전송 내역 없음"
                      : `${
                          recentStatusFilter === "발송완료"
                            ? "의뢰"
                            : recentStatusFilter === "포장.발송"
                              ? "발송"
                              : recentStatusFilter === "의뢰수락"
                                ? "수락"
                                : recentStatusFilter === "작업완료"
                                  ? "완료"
                                  : recentStatusFilter
                        } 없음`}
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

                            <div className="flex shrink-0 items-center gap-1.5">
                              {transfer.unreadCount > 0 ? (
                                <span
                                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-none text-white"
                                  aria-label={`읽지 않은 채팅 ${transfer.unreadCount}건`}
                                >
                                  {transfer.unreadCount > 99 ? "99+" : transfer.unreadCount}
                                </span>
                              ) : null}
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
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={draftsOpen} onOpenChange={setDraftsOpen}>
              <CardHeader className="pb-2 pt-3">
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <BookmarkPlus className="h-4 w-4 text-slate-500" />
                      임시저장
                      {draftGroupedTransfers.length > 0 ? (
                        <Badge variant="secondary" className="ml-1">
                          {draftGroupedTransfers.length}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${draftsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {draftGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    없음
                  </div>
                ) : (
                  <div className="max-h-[15.25rem] space-y-2 overflow-y-auto pr-1">
                    {draftGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const ownerLabel = transfer.isMineDraft
                        ? "나"
                        : transfer.practiceUserLabel || "동료";
                      const patientLabel =
                        String(transfer.draftPatientName || "").trim() || "환자명 미입력";

                      return (
                        <div
                          key={`draft:${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            transfer.id === activeDraftId
                              ? "border-primary/70 bg-primary-soft ring-1 ring-primary-muted"
                              : transfer.isMineDraft
                                ? "border-primary-muted bg-primary-soft/50"
                                : "border-slate-200 bg-slate-50/70",
                          )}
                          onClick={() => handleAdoptDraftTransfer(transfer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleAdoptDraftTransfer(transfer);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {patientLabel}
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  · {ownerLabel}
                                  {transfer.id === activeDraftId ? " · 작성 중" : ""}
                                </span>
                              </p>
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
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleAskDeleteTransfer(transfer);
                                    }}
                                    aria-label="임시저장을 휴지통으로"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs text-xs">
                                  휴지통으로 이동
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={trashOpen} onOpenChange={setTrashOpen}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Trash2 className="h-4 w-4 text-slate-500" />
                        휴지통
                        {trashGroupedTransfers.length > 0 ? (
                          <Badge variant="secondary" className="ml-1">
                            {trashGroupedTransfers.length}
                          </Badge>
                        ) : null}
                      </CardTitle>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${trashOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  {trashGroupedTransfers.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
                      disabled={emptyingTrash}
                      onClick={handleAskEmptyTrash}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {emptyingTrash ? "비우는 중..." : "휴지통 비우기"}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {trashGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    비어 있음
                  </div>
                ) : (
                  <div className="max-h-[18.25rem] space-y-2 overflow-y-auto pr-1">
                    {trashGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const isDraftTrash =
                        transfer.status === "임시저장" ||
                        transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;
                      const titleLabel = isDraftTrash
                        ? transfer.draftPatientName ||
                          transfer.deleteTargetLabel ||
                          "임시저장"
                        : transfer.transferId !== "-"
                          ? transfer.transferId
                          : transfer.id;

                      return (
                        <div
                          key={`trash:${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void handleOpenTransferDialog(transfer, { fromTrash: true })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void handleOpenTransferDialog(transfer, { fromTrash: true });
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {titleLabel}
                                {isDraftTrash ? (
                                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                    · 임시저장
                                    {transfer.practiceUserLabel
                                      ? ` · ${transfer.practiceUserLabel}`
                                      : ""}
                                  </span>
                                ) : null}
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

                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-slate-500 hover:text-primary-strong"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAskRestoreTransfer(transfer);
                                    }}
                                    aria-label={isDraftTrash ? "임시저장 복구" : "의뢰서 복구"}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                                  {isDraftTrash
                                    ? "임시저장 목록으로 되돌립니다. 복구 후 카드를 눌러 이어서 작성할 수 있습니다."
                                    : "최근 전송 내역으로 되돌립니다. 기공소에서도 다시 확인할 수 있습니다."}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
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
            { label: "환자명", value: selectedTransferPatientName || "-" },
            { label: "주문일", value: selectedTransfer?.orderDate || "-" },
            { label: "도착일", value: selectedTransfer?.arrivalDate || "-" },
            { label: "파일 수", value: `${selectedTransfer?.fileCount || 0}개` },
          ] satisfies PracticeTransferDialogSummaryItem[]}
          memo={selectedTransferDisplayMemo}
          toothWorks={selectedTransferToothWorks}
          toothWorksKey={
            selectedTransfer?.transferId && selectedTransfer.transferId !== "-"
              ? selectedTransfer.transferId
              : selectedTransfer?.id || "practice-transfer"
          }
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
          currentUserId={String(authUser?.id || (authUser as { _id?: string } | null)?._id || "").trim()}
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
          replyTo={chatReplyTo}
          onReplyToMessage={(message) => {
            setChatReplyTo({
              _id: String(message._id),
              sender: {
                name: String(message.sender?.name || "").trim() || "알 수 없음",
                role: String(message.sender?.role || "").trim(),
              },
              content: String(message.content || "").trim() || "(내용 없음)",
            });
          }}
          onCancelReply={() => setChatReplyTo(null)}
          onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
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
              <DialogTitle>보철물 항목 설정</DialogTitle>
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
              ? "임시저장을 휴지통으로 옮길까요?"
              : "이 의뢰서를 휴지통으로 이동할까요?"
          }
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {deleteTargetTransfer?.transferId && deleteTargetTransfer.transferId !== "-"
                  ? deleteTargetTransfer.transferId === PRACTICE_DRAFT_TRANSFER_ID
                    ? deleteTargetTransfer.deleteTargetLabel || "임시저장"
                    : deleteTargetTransfer.transferId
                  : deleteTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                {deleteTargetTransfer?.status === "임시저장" ||
                deleteTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? `첨부 파일 ${deleteTargetTransfer?.fileCount || 0}건과 함께 휴지통으로 이동합니다. 아래에서 다시 복구할 수 있습니다.`
                  : `첨부 파일 ${deleteTargetTransfer?.fileCount || 0}건과 함께 휴지통으로 이동합니다. 아래에서 다시 복구할 수 있습니다.`}
              </div>
            </div>
          }
          confirmLabel={
            deletingTransfer
              ? "처리 중..."
              : "휴지통으로 이동"
          }
          cancelLabel="취소"
          onConfirm={handleConfirmDeleteTransfer}
          onCancel={handleCancelDeleteTransfer}
        />

        <ConfirmDialog
          open={restoreConfirmOpen}
          title={
            restoreTargetTransfer?.status === "임시저장" ||
            restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
              ? "임시저장을 복구할까요?"
              : "이 의뢰서를 복구할까요?"
          }
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? restoreTargetTransfer.deleteTargetLabel || "임시저장"
                  : restoreTargetTransfer?.transferId && restoreTargetTransfer.transferId !== "-"
                    ? restoreTargetTransfer.transferId
                    : restoreTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                {restoreTargetTransfer?.status === "임시저장" ||
                restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? "임시저장 목록으로 되돌아가며, 카드를 눌러 이어서 작성할 수 있습니다."
                  : "최근 전송 내역으로 되돌아가며, 기공소에서도 다시 확인할 수 있습니다."}
              </div>
            </div>
          }
          confirmLabel={restoringTransfer ? "복구 중..." : "복구"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmRestoreTransfer()}
          onCancel={handleCancelRestoreTransfer}
        />

        <ConfirmDialog
          open={emptyTrashConfirmOpen}
          title="휴지통을 비울까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                휴지통의 임시저장·취소된 전송을 모두 영구 삭제합니다.
                {trashGroupedTransfers.length > 0
                  ? ` (현재 목록 ${trashGroupedTransfers.length}건)`
                  : ""}
              </div>
              <div className="text-sm text-muted-foreground">
                이 작업은 되돌릴 수 없습니다.
              </div>
            </div>
          }
          confirmLabel={emptyingTrash ? "비우는 중..." : "영구 삭제"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmEmptyTrash()}
          onCancel={handleCancelEmptyTrash}
        />
      </div>
    </PageFileDropZone>
  );
};
