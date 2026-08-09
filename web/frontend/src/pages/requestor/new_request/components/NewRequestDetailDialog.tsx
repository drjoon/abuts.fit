// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CircleHelp } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import type {
  CaseInfos,
  Connection,
  NewRequestProductMode,
} from "../hooks/newRequestTypes";
import { NewRequestDesignAbutmentFields } from "./NewRequestDesignAbutmentFields";
import { NewRequestPatientImplantFields } from "./NewRequestPatientImplantFields";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailIndex: number | null;
  selectedPreviewIndex: number | null;
  files: File[];
  detailFile: File | null;
  detailCaseInfos?: CaseInfos;
  setDetailCaseInfos: (updates: Partial<CaseInfos>) => void;
  handleDiameterComputed: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number,
    totalLength: number,
    taperAngle: number,
    tiltAxisVector?: { x: number; y: number; z: number } | null,
    frontPoint?: { x: number; y: number; z: number } | null,
  ) => void;
  connections: Connection[];
  familyOptions: string[];
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantBrand: string;
  setImplantBrand: (v: string) => void;
  implantFamily: string;
  setImplantFamily: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => void;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  teethOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  addTeethPreset: (label: string) => void;
  clearAllTeethPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
  highlightUnverifiedArrows: boolean;
  handleRemoveFile: (index: number) => void;
  onVerifyAndNext: (index: number) => Promise<void>;
  onSkip: () => void;
  toast: ToastFn;
};

export function NewRequestDetailDialog({
  open,
  onOpenChange,
  detailIndex,
  selectedPreviewIndex,
  files,
  detailFile,
  detailCaseInfos,
  setDetailCaseInfos,
  handleDiameterComputed,
  connections,
  familyOptions,
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantBrand,
  setImplantBrand,
  implantFamily,
  setImplantFamily,
  implantType,
  setImplantType,
  syncSelectedConnection,
  clinicNameOptions,
  patientNameOptions,
  teethOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  addTeethPreset,
  clearAllTeethPresets,
  handleAddOrSelectClinic,
  highlightUnverifiedArrows,
  handleRemoveFile,
  onVerifyAndNext,
  onSkip,
  toast,
}: Props) {
  const [showNewSystemForm, setShowNewSystemForm] = useState(false);
  const [newSystemManufacturer, setNewSystemManufacturer] = useState("");
  const [newSystemBrand, setNewSystemBrand] = useState("");
  const [newSystemFamily, setNewSystemFamily] = useState("");
  const [confirmNewSystemOpen, setConfirmNewSystemOpen] = useState(false);
  const [retentionGuideModalOpen, setRetentionGuideModalOpen] = useState(false);

  const [pendingNewSystem, setPendingNewSystem] = useState<{
    manufacturer: string;
    brand: string;
    family: string;
  } | null>(null);

  const newSystemInfoCopy = useMemo(
    () =>
      "개발을 위해 랩 아날로그와 기성 어벗먼트 샘플을 보내주세요. 무료 크레딧을 충전해드립니다.",
    [],
  );

  const resetNewSystemForm = useCallback(() => {
    setShowNewSystemForm(false);
    setNewSystemManufacturer("");
    setNewSystemBrand("");
    setNewSystemFamily("");
    setDetailCaseInfos({ newSystemRequest: undefined });
  }, [setDetailCaseInfos]);

  const handleNewSystemRequestClick = useCallback(() => {
    const manufacturer = newSystemManufacturer.trim();
    const brand = newSystemBrand.trim();
    const family = newSystemFamily.trim();

    if (!manufacturer || !brand || !family) {
      toast({
        title: "신규 임플란트 입력 필요",
        description: "Manufacturer, Brand, Family를 모두 입력해주세요.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setPendingNewSystem({ manufacturer, brand, family });
    setConfirmNewSystemOpen(true);
  }, [newSystemBrand, newSystemFamily, newSystemManufacturer, toast]);

  const persistedNewSystemRequest = detailCaseInfos?.newSystemRequest;

  useEffect(() => {
    if (persistedNewSystemRequest?.requested) {
      setShowNewSystemForm(true);
      setNewSystemManufacturer(persistedNewSystemRequest.manufacturer || "");
      setNewSystemBrand(persistedNewSystemRequest.brand || "");
      setNewSystemFamily(persistedNewSystemRequest.family || "");
    }
  }, [persistedNewSystemRequest]);

  useEffect(() => {
    if (!detailFile) return;
    if (!detailCaseInfos?.retentionGroove) {
      setDetailCaseInfos({ retentionGroove: "none" });
    }
  }, [detailFile, detailCaseInfos?.retentionGroove, setDetailCaseInfos]);

  const showImplantSelect = true;
  const productMode: NewRequestProductMode =
    detailCaseInfos?.productMode === "design_custom_abutment"
      ? "design_custom_abutment"
      : "custom_abutment";
  const isDesignCustomMode = productMode === "design_custom_abutment";

  const setProductMode = useCallback(
    (mode: NewRequestProductMode) => {
      setDetailCaseInfos({ productMode: mode });
    },
    [setDetailCaseInfos],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="new-request-page flex w-[calc(100vw-1rem)] max-h-[92vh] max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto p-4 sm:w-[1180px] sm:p-5 lg:w-[980px]">
          <DialogHeader className="relative shrink-0 space-y-0 pr-8">
            <div className="relative flex min-h-9 flex-col gap-3 sm:flex-row sm:items-center">
              <DialogTitle className="text-lg font-semibold sm:pr-[300px]">
                STL 확인 및 정보 입력
              </DialogTitle>
              <div
                role="radiogroup"
                aria-label="의뢰 유형"
                className="flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
              >
                {(
                  [
                    { value: "custom_abutment", label: "커스텀어벗" },
                    { value: "design_custom_abutment", label: "디자인+커스텀어벗" },
                  ] as const
                ).map((option) => {
                  const selected = productMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                        selected
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
                      )}
                      onClick={() => setProductMode(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogDescription className="sr-only">
              STL 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 다음 케이스로 이동합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 sm:pr-2 lg:grid-cols-[52%_48%]">
            <div className="app-glass-card app-glass-card--lg flex h-full min-h-[240px] flex-col !p-2">
              <div className="app-glass-card-content flex-1">
                {detailFile ? (
                  <StlPreviewViewer
                    file={detailFile}
                    showOverlay={false}
                    className="h-full min-h-[240px]"
                    onDiameterComputed={handleDiameterComputed}
                  />
                ) : (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                    STL Preview
                  </div>
                )}
              </div>
            </div>

            <div className="flex h-full min-h-0 flex-col">
              <div className="app-glass-card app-glass-card--lg flex h-full min-h-0 flex-col !p-2">
                <div className="app-glass-card-content flex min-h-0 flex-1 flex-col gap-2 pb-0 text-sm">
                  {isDesignCustomMode ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <NewRequestDesignAbutmentFields
                        caseInfos={detailCaseInfos}
                        setCaseInfos={setDetailCaseInfos}
                        readOnly={!detailFile}
                        clinicNameOptions={clinicNameOptions}
                        patientNameOptions={patientNameOptions}
                        addClinicPreset={addClinicPreset}
                        clearAllClinicPresets={clearAllClinicPresets}
                        addPatientPreset={addPatientPreset}
                        clearAllPatientPresets={clearAllPatientPresets}
                        handleAddOrSelectClinic={handleAddOrSelectClinic}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        임플란트/환자 정보
                      </div>

                      <NewRequestPatientImplantFields
                        caseInfos={detailCaseInfos}
                        setCaseInfos={setDetailCaseInfos}
                        showImplantSelect={showImplantSelect}
                        readOnly={!detailFile}
                        implantSelectSource="caseInfos"
                        connections={connections}
                        familyOptions={familyOptions}
                        typeOptions={typeOptions}
                        implantManufacturer={implantManufacturer}
                        setImplantManufacturer={setImplantManufacturer}
                        implantBrand={implantBrand}
                        setImplantBrand={setImplantBrand}
                        implantFamily={implantFamily}
                        setImplantFamily={setImplantFamily}
                        implantType={implantType}
                        setImplantType={setImplantType}
                        syncSelectedConnection={syncSelectedConnection}
                        clinicNameOptions={clinicNameOptions}
                        patientNameOptions={patientNameOptions}
                        teethOptions={teethOptions}
                        addClinicPreset={addClinicPreset}
                        clearAllClinicPresets={clearAllClinicPresets}
                        addPatientPreset={addPatientPreset}
                        clearAllPatientPresets={clearAllPatientPresets}
                        addTeethPreset={addTeethPreset}
                        clearAllTeethPresets={clearAllTeethPresets}
                        handleAddOrSelectClinic={handleAddOrSelectClinic}
                      />

                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex flex-row items-center justify-between">
                          <div className="text-sm font-semibold text-slate-600">유지홈</div>

                          <RadioGroup
                            value={detailCaseInfos?.retentionGroove === "deep" ? "deep" : "none"}
                            onValueChange={(value) =>
                              setDetailCaseInfos({ retentionGroove: value as "none" | "deep" })
                            }
                            className="flex items-center gap-10"
                            disabled={!detailFile}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="none" id="rg-none" className="border-slate-300 text-blue-600" />
                              <Label htmlFor="rg-none" className="text-sm text-slate-700 cursor-pointer">
                                없음
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="deep" id="rg-deep" className="border-slate-300 text-blue-600" />
                              <Label htmlFor="rg-deep" className="text-sm text-slate-700 cursor-pointer">
                                있음
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        <button
                          type="button"
                          className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800"
                          aria-label="유지홈 선택 안내"
                          onClick={() => setRetentionGuideModalOpen(true)}
                        >
                          <CircleHelp className="h-4 w-4" />
                          유지구/유지홈 비교 보기
                        </button>
                      </div>

                      <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-700">찾으시는 임플란트가 없나요?</span>
                          {!showNewSystemForm ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                              onClick={() => setShowNewSystemForm(true)}
                            >
                              신규 임플란트 요청
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" onClick={handleNewSystemRequestClick}>
                                요청
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={resetNewSystemForm}>
                                취소
                              </Button>
                            </div>
                          )}
                        </div>

                        {showNewSystemForm && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                              placeholder="Manufacturer"
                              value={newSystemManufacturer}
                              onChange={(e) => setNewSystemManufacturer(e.target.value)}
                            />
                            <Input
                              placeholder="Brand"
                              value={newSystemBrand}
                              onChange={(e) => setNewSystemBrand(e.target.value)}
                            />
                            <Input
                              placeholder="Family"
                              value={newSystemFamily}
                              onChange={(e) => setNewSystemFamily(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <DialogFooter className="mt-auto flex shrink-0 flex-col gap-2 !space-x-0 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          if (detailIndex !== null) {
                            handleRemoveFile(detailIndex);
                          }
                          onOpenChange(false);
                        }}
                      >
                        삭제
                      </Button>
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        취소
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        className={highlightUnverifiedArrows ? "animate-bounce bg-primary text-white" : undefined}
                        onClick={() => {
                          if (detailIndex !== null) {
                            void onVerifyAndNext(detailIndex);
                          }
                        }}
                      >
                        확인 & 다음
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-slate-500"
                        onClick={onSkip}
                        disabled={!files.length}
                      >
                        건너뛰기
                      </Button>
                    </div>
                  </DialogFooter>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={retentionGuideModalOpen} onOpenChange={setRetentionGuideModalOpen}>
        <DialogContent className="new-request-page w-[calc(100vw-1rem)] sm:w-[1120px] max-w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-800">유지구/유지홈 안내</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-slate-700">
              유지구를 주실 경우 각진 모서리가 있으면 생산이 불가능하니 둥글게 처리해주세요. 혹은 유지구를 제거하고 유지홈 옵션을 선택해 주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto">
            <div className="grid min-w-[960px] grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/Retention_Groove_good.jpeg"
                alt="유지구 생산 가능 예시"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                직경 2mm 이상의 둥근 유지구 <br/>(생산 가능, 적합 좋음)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/Retention_Groove_ng.png"
                alt="유지구 생산 불가능 예시"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                직경 작거나 각진 유지구 <br/>(생산 불가능)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/retention-groove-none.jpeg"
                alt="유지홈 없음 기본"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                유지홈 없음 <br/>(기본)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/retention-groove-exist.jpeg"
                alt="유지홈 있음 유지력 증강"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                유지홈 있음 <br/>(유지력 증가)
              </span>
            </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setRetentionGuideModalOpen(false)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmNewSystemOpen}
        onOpenChange={(next) => {
          if (!next) {
            setConfirmNewSystemOpen(false);
            setPendingNewSystem(null);
          }
        }}
      >
        <AlertDialogContent className="new-request-page">
          <AlertDialogHeader>
            <AlertDialogTitle>신규 임플란트 의뢰로 접수할까요?</AlertDialogTitle>
            <AlertDialogDescription>{newSystemInfoCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);
              }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingNewSystem) return;
                const { manufacturer, brand, family } = pendingNewSystem;
                const message = "랩 아날로그 샘플 한 개를 요청드립니다";

                setDetailCaseInfos({
                  implantManufacturer: manufacturer,
                  implantBrand: brand,
                  implantFamily: family,
                  newSystemRequest: {
                    requested: true,
                    manufacturer,
                    brand,
                    family,
                    message,
                    free: true,
                    tag: "신규 임플란트 의뢰",
                  },
                });

                toast({
                  title: "신규 임플란트로 접수",
                  description: "무상 처리 및 랩 아날로그 샘플 요청으로 전달됩니다.",
                  duration: 3500,
                });

                setShowNewSystemForm(false);
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);

                const nextIndex = detailIndex ?? selectedPreviewIndex;
                if (nextIndex !== null && nextIndex >= 0) {
                  await onVerifyAndNext(nextIndex);
                }
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
