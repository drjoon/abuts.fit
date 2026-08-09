// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDetailDialog.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  PracticeTransferRequestIntakePanel,
  type PracticeTransferRequestIntakePanelProps,
} from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { apiFetch } from "@/shared/api/apiClient";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import {
  normalizeAbutmentFavorites,
  normalizeImplantFavorites,
  normalizeProsthesisTypes,
  normalizeToothWorks,
  toToothMemoSortNumber,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import LabeledAutocompleteField from "@/shared/ui/forms/LabeledAutocompleteField";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";
import type { CaseInfos } from "../hooks/newRequestTypes";

const PRESET_PROSTHESIS_TYPES = ["크라운", "브리지", "Pontic", "인레이"] as const;
const TOOTH_TENS_OPTIONS = ["1", "2", "3", "4"] as const;
const TOOTH_ONES_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

const ensurePresetProsthesisTypes = (items: string[] | null | undefined) => {
  const normalized = normalizeProsthesisTypes(items || []);
  const withPontic = normalized.includes("Pontic")
    ? normalized
    : [...normalized, "Pontic"];
  return withPontic.length ? withPontic : [...PRESET_PROSTHESIS_TYPES];
};

const toothNumbersLabelFromWorks = (toothWorks: ToothWorkSelection[]) =>
  normalizeToothWorks(toothWorks)
    .map((row) => row.toothNumber)
    .sort((a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b))
    .join(", ");

type Option = { id: string; label: string };

type Props = {
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  readOnly?: boolean;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
};

export function hasDesignAbutmentProsthesis(toothWorks: ToothWorkSelection[] | undefined) {
  return normalizeToothWorks(Array.isArray(toothWorks) ? toothWorks : []).length > 0;
}

export function NewRequestDesignAbutmentFields({
  caseInfos,
  setCaseInfos,
  readOnly,
  clinicNameOptions,
  patientNameOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  handleAddOrSelectClinic,
}: Props) {
  const { token } = useAuthStore();
  const { connections: implantConnections } = useImplantConnectionCatalog(token);

  const requestMemo = String(caseInfos?.memo || "");
  const toothWorks = useMemo(
    () => (Array.isArray(caseInfos?.toothWorks) ? caseInfos.toothWorks : []),
    [caseInfos?.toothWorks],
  );
  const toothNumbersLabel = useMemo(
    () => toothNumbersLabelFromWorks(toothWorks),
    [toothWorks],
  );

  const [prosthesisModalOpen, setProsthesisModalOpen] = useState(false);
  const [prosthesisTypeCatalog, setProsthesisTypeCatalog] = useState<string[]>(() => [
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<string[]>(() => [
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [prosthesisTypeSettingsDialogOpen, setProsthesisTypeSettingsDialogOpen] = useState(false);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [implantFavorites, setImplantFavorites] = useState<PracticeImplantFavorite[]>([]);
  const [abutmentFavorites, setAbutmentFavorites] = useState<PracticeAbutmentFavorite[]>([]);

  const normalizedProsthesisTypes = useMemo(
    () => ensurePresetProsthesisTypes(prosthesisTypeCatalog),
    [prosthesisTypeCatalog],
  );

  // 기공의뢰(파일전송)와 동일: BusinessAnchor.practiceTransferSettings 에 프리셋 저장
  const loadFavoritesFromServer = useCallback(async () => {
    if (!token) {
      setImplantFavorites([]);
      setAbutmentFavorites([]);
      return;
    }
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const body =
        res.data && typeof res.data === "object" ? (res.data as { data?: unknown }) : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as {
              implantFavorites?: unknown;
              abutmentFavorites?: unknown;
            })
          : null;
      setImplantFavorites(normalizeImplantFavorites(payload?.implantFavorites));
      setAbutmentFavorites(normalizeAbutmentFavorites(payload?.abutmentFavorites));
    } catch {
      // ignore — 로컬 빈 목록 유지
    }
  }, [token]);

  useEffect(() => {
    void loadFavoritesFromServer();
  }, [loadFavoritesFromServer]);

  const saveFavoritesToServer = useCallback(
    async (patch: {
      implantFavorites?: PracticeImplantFavorite[];
      abutmentFavorites?: PracticeAbutmentFavorite[];
    }) => {
      if (!token) return;
      const jsonBody: Record<string, unknown> = {};
      if (Array.isArray(patch.implantFavorites)) {
        jsonBody.implantFavorites = normalizeImplantFavorites(patch.implantFavorites);
      }
      if (Array.isArray(patch.abutmentFavorites)) {
        jsonBody.abutmentFavorites = normalizeAbutmentFavorites(patch.abutmentFavorites);
      }
      if (Object.keys(jsonBody).length === 0) return;
      try {
        await apiFetch<unknown>({
          path: "/api/practice/transfers/settings",
          method: "POST",
          token,
          jsonBody,
        });
      } catch {
        // ignore — UI 상태는 이미 반영됨
      }
    },
    [token],
  );

  const handleImplantFavoritesChange = useCallback(
    (next: PracticeImplantFavorite[]) => {
      const normalized = normalizeImplantFavorites(next);
      setImplantFavorites(normalized);
      void saveFavoritesToServer({ implantFavorites: normalized });
    },
    [saveFavoritesToServer],
  );

  const handleAbutmentFavoritesChange = useCallback(
    (next: PracticeAbutmentFavorite[]) => {
      const normalized = normalizeAbutmentFavorites(next);
      setAbutmentFavorites(normalized);
      void saveFavoritesToServer({ abutmentFavorites: normalized });
    },
    [saveFavoritesToServer],
  );

  const setToothWorks = useCallback<Dispatch<SetStateAction<ToothWorkSelection[]>>>(
    (action) => {
      const prev = Array.isArray(caseInfos?.toothWorks) ? caseInfos.toothWorks : [];
      const next = typeof action === "function" ? action(prev) : action;
      // 디자인+커스텀어벗 치식만 갱신. 커스텀어벗 caseInfos.tooth 와 공유하지 않는다.
      setCaseInfos({ toothWorks: next });
    },
    [caseInfos?.toothWorks, setCaseInfos],
  );

  const setRequestMemo = useCallback(
    (value: string) => {
      setCaseInfos({ memo: value });
    },
    [setCaseInfos],
  );

  const setSelectedLabNoop = useCallback(
    (_value: Parameters<PracticeTransferRequestIntakePanelProps["setSelectedLab"]>[0]) => {},
    [],
  );
  const setLabOpenNoop = useCallback((_open: boolean) => {}, []);
  const setLabSearchNoop = useCallback((_value: string) => {}, []);
  const setDateNoop = useCallback((_value: string) => {}, []);
  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const intakeSharedProps = {
    selectedLab: null as null,
    setSelectedLab: setSelectedLabNoop,
    labOpen: false,
    setLabOpen: setLabOpenNoop,
    labSearch: "",
    setLabSearch: setLabSearchNoop,
    labSearchResults: [] as [],
    labSearching: false,
    recentLabs: [] as [],
    recentLabsInitialized: true,
    patientName: String(caseInfos?.patientName || ""),
    setPatientName: (value: string) => setCaseInfos({ patientName: value }),
    orderDate: today,
    setOrderDate: setDateNoop,
    arrivalDate: today,
    setArrivalDate: setDateNoop,
    arrivalDefaultDays: 7,
    normalizedProsthesisTypes,
    setProsthesisTypeCatalogDraft,
    setProsthesisTypeSettingsDialogOpen,
    toothWorks,
    setToothWorks,
    requestMemo,
    setRequestMemo,
    implantConnections,
    implantFavorites,
    onImplantFavoritesChange: handleImplantFavoritesChange,
    abutmentFavorites,
    onAbutmentFavoritesChange: handleAbutmentFavoritesChange,
    toothTensOptions: TOOTH_TENS_OPTIONS,
    toothOnesOptions: TOOTH_ONES_OPTIONS,
  } satisfies Partial<PracticeTransferRequestIntakePanelProps>;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        디자인 / 환자 정보
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 text-foreground sm:grid-cols-3">
        <div className="min-w-0">
          <LabeledAutocompleteField
            value={caseInfos?.clinicName || ""}
            onChange={(value) => {
              if (readOnly) return;
              setCaseInfos({ clinicName: value });
            }}
            options={clinicNameOptions}
            placeholder="치과명"
            onOptionSelect={(label) => {
              if (readOnly) return;
              handleAddOrSelectClinic(label);
              addClinicPreset(label);
            }}
            onClear={() => {
              if (readOnly) return;
              setCaseInfos({ clinicName: "" });
            }}
            onDelete={() => {
              if (readOnly) return;
              clearAllClinicPresets();
              setCaseInfos({ clinicName: "" });
            }}
            onBlur={() => {
              if (readOnly) return;
              if (caseInfos?.clinicName) {
                handleAddOrSelectClinic(caseInfos.clinicName);
                addClinicPreset(caseInfos.clinicName);
              }
            }}
            inputClassName="h-8 w-full pr-10 text-xs"
            disabled={readOnly}
          />
        </div>

        <div className="min-w-0">
          <LabeledAutocompleteField
            value={caseInfos?.patientName || ""}
            onChange={(value) => {
              if (readOnly) return;
              setCaseInfos({ patientName: value });
            }}
            options={patientNameOptions}
            placeholder="환자명"
            onOptionSelect={(label) => {
              if (readOnly) return;
              setCaseInfos({ patientName: label });
              addPatientPreset(label);
            }}
            onClear={() => {
              if (readOnly) return;
              setCaseInfos({ patientName: "" });
            }}
            onDelete={() => {
              if (readOnly) return;
              clearAllPatientPresets();
              setCaseInfos({ patientName: "" });
            }}
            onBlur={() => {
              if (readOnly) return;
              if (caseInfos?.patientName) {
                addPatientPreset(caseInfos.patientName);
              }
            }}
            inputClassName="h-8 w-full pr-10 text-xs"
            disabled={readOnly}
          />
        </div>

        <div className="min-w-0">
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() => setProsthesisModalOpen(true)}
            className={cn(
              "h-8 w-full justify-start overflow-hidden px-3 text-left text-xs font-normal",
              toothNumbersLabel ? "text-foreground" : "text-muted-foreground",
            )}
            title={toothNumbersLabel || "치아번호"}
          >
            <span className="block w-full truncate">
              {toothNumbersLabel || "치아번호"}
            </span>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          readOnly && "pointer-events-none opacity-60",
        )}
      >
        <PracticeTransferRequestIntakePanel
          {...intakeSharedProps}
          showHeaderFields={false}
          showProsthesisSection={false}
          showMemoSection
          variant="plain"
          hideEnlargeButton
          memoInputId="new-request-design-abutment-memo"
          memoBoxClassName="min-h-[calc(3*2.5rem+1.25rem)] flex-1 overflow-y-auto"
        />
      </div>

      <Dialog open={prosthesisModalOpen} onOpenChange={setProsthesisModalOpen}>
        <DialogContent
          className="z-[110] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 overflow-x-auto p-4 sm:p-5"
          overlayClassName="z-[110]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>보철물 전체 보기</DialogTitle>
            <DialogDescription>보철물 치식 차트를 편집합니다.</DialogDescription>
          </DialogHeader>
          <div className={readOnly ? "pointer-events-none opacity-60" : undefined}>
            <PracticeTransferRequestIntakePanel
              {...intakeSharedProps}
              showHeaderFields={false}
              showProsthesisSection
              showMemoSection={false}
              variant="plain"
              hideEnlargeButton
              toothChartDisplayMode="full"
              nestedDialogClassName="z-[130]"
              nestedDialogOverlayClassName="z-[130]"
              memoInputId="new-request-design-abutment-prosthesis-modal"
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setProsthesisModalOpen(false)}>
              확인
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
        <DialogContent className="z-[120] sm:max-w-lg" overlayClassName="z-[120]">
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
              onClick={() => {
                const next = ensurePresetProsthesisTypes(prosthesisTypeCatalogDraft);
                setProsthesisTypeCatalog(next);
                setProsthesisTypeCatalogDraft(next);
                setProsthesisTypeSettingsDialogOpen(false);
              }}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
