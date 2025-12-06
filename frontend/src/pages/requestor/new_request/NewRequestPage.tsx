import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Plus } from "lucide-react";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import { useNewRequestPage } from "@/features/requestor/hooks/useNewRequestPage";
import ClinicAutocompleteField from "@/components/ClinicAutocompleteField";
import LabeledAutocompleteField from "@/components/LabeledAutocompleteField";

export const NewRequestPage = () => {
  const { id: existingRequestId } = useParams<{ id?: string }>();
  const {
    user,
    message,
    setMessage,
    files,
    selectedPreviewIndex,
    setSelectedPreviewIndex,
    abutDiameters,
    connectionDiameters,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleFileListWheel,
    typeOptions,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    syncSelectedConnection,
    handleSubmit,
    handleCancel,
    removeFile,
    handleDiameterComputed,
    getWorkTypeForFilename,
    aiFileInfos,
    setAiFileInfos,
    selectedRequest,
    setSelectedRequest,
    clinicPresets,
    selectedClinicId,
    handleSelectClinic,
    handleAddOrSelectClinic,
    handleDeleteClinic,
  } = useNewRequestPage(existingRequestId);
  const [clinicInput, setClinicInput] = useState("");
  const manufacturerSelectRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const selected = clinicPresets.find((c) => c.id === selectedClinicId);
    setClinicInput(selected?.name ?? "");
  }, [clinicPresets, selectedClinicId]);

  useEffect(() => {
    if (selectedPreviewIndex === null) return;
    const file = files[selectedPreviewIndex];
    if (!file) return;

    const info = aiFileInfos.find((i) => i.filename === file.name);
    if (!info?.clinicName) return;

    const name = info.clinicName.trim();
    if (!name) return;

    setClinicInput(name);
    handleAddOrSelectClinic(name);
  }, [selectedPreviewIndex, files, aiFileInfos, handleAddOrSelectClinic]);

  const patientNameOptions = (() => {
    const map = new Map<string, string>();
    aiFileInfos.forEach((info) => {
      const raw = (info.patientName || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, raw);
    });
    return Array.from(map.values()).map((name) => ({ id: name, label: name }));
  })();

  const teethOptions = (() => {
    const map = new Map<string, string>();
    aiFileInfos.forEach((info) => {
      const raw = (info.tooth || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, raw);
    });
    return Array.from(map.values()).map((t) => ({ id: t, label: t }));
  })();

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Main Message Card */}
        <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
          <CardContent className="space-y-6 mt-6 ">
            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-primary/50 bg-white/40"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground"></Upload>
              <p className="text-lg font-medium mb-2">
                어벗과 보철 STL 파일 드롭
              </p>
              <Button
                variant="outline"
                className="text-sm"
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <Plus className="mr-2 h-4 w-4" />
                파일 선택
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                파일명에 치과이름, 환자이름, 치아번호가 있으면 여러 환자의
                데이터를 섞어 업로드하셔도 됩니다.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                품질 향상을 위해 커스텀 어벗과 함께 보철 데이터도 업로드
                부탁드립니다.
              </p>
              <input
                id="file-input"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".stl"
              />
            </div>
            {/* Uploaded Files */}
            {files.length > 0 && (
              <div
                className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-blue-400 scrollbar-track-blue-100"
                onWheel={handleFileListWheel}
              >
                {files.map((file, index) => {
                  const filename = file.name;
                  const workType = getWorkTypeForFilename(filename);
                  const isSelected = selectedPreviewIndex === index;

                  const isAbutment = workType === "abutment";
                  const isProsthesis = workType === "prosthesis";

                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedPreviewIndex(index)}
                      className={`shrink-0 w-64 p-3 rounded-lg border cursor-pointer text-xs space-y-2 transition-colors ${
                        isSelected
                          ? "border-primary shadow-md"
                          : "border-gray-200 hover:border-primary/40 hover:shadow"
                      } ${
                        isAbutment
                          ? "bg-gray-300 text-gray-900" // 어벗: 조금 밝은 회색 카드
                          : isProsthesis
                          ? "bg-gray-100 text-gray-900" // 보철: 옅은 회색 카드
                          : "bg-gray-50 text-gray-900" // 미지정
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate flex-1">{filename}</span>
                        <button
                          type="button"
                          className="text-xl leading-none text-muted-foreground hover:text-destructive flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {/* 어벗 버튼: 밝은 회색 */}
                        <button
                          type="button"
                          className="flex-1 rounded py-1 border text-[11px] bg-gray-300 text-gray-900 border-gray-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPreviewIndex(index);
                            setAiFileInfos((prev) => {
                              const next = [...prev];
                              const idx = next.findIndex(
                                (i) => i.filename === filename
                              );
                              if (idx >= 0) {
                                next[idx] = {
                                  ...next[idx],
                                  workType: "abutment",
                                };
                              } else {
                                next.push({
                                  filename,
                                  clinicName: "",
                                  patientName: "",
                                  tooth: "",
                                  workType: "abutment",
                                  abutType: "",
                                });
                              }
                              return next;
                            });

                            if (
                              !implantManufacturer &&
                              !implantSystem &&
                              !implantType
                            ) {
                              const baseManufacturer = "OSSTEM";
                              const baseSystem = "Regular";
                              const baseType = "Hex";
                              setImplantManufacturer(baseManufacturer);
                              setImplantSystem(baseSystem);
                              setImplantType(baseType);
                              syncSelectedConnection(
                                baseManufacturer,
                                baseSystem,
                                baseType
                              );
                            }
                          }}
                        >
                          어벗
                        </button>
                        {/* 보철 버튼: 옅은 회색 */}
                        <button
                          type="button"
                          className="flex-1 rounded py-1 border text-[11px] bg-gray-50 text-gray-900 border-gray-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPreviewIndex(index);
                            setAiFileInfos((prev) => {
                              const next = [...prev];
                              const idx = next.findIndex(
                                (i) => i.filename === filename
                              );
                              if (idx >= 0) {
                                next[idx] = {
                                  ...next[idx],
                                  workType: "prosthesis",
                                };
                              } else {
                                next.push({
                                  filename,
                                  clinicName: "",
                                  patientName: "",
                                  tooth: "",
                                  workType: "prosthesis",
                                  abutType: "",
                                });
                              }
                              return next;
                            });
                          }}
                        >
                          보철
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedPreviewIndex !== null && files[selectedPreviewIndex] && (
              <div className="mt-4 w-full grid gap-6 lg:grid-cols-2 items-start">
                <div className="space-y-2 px-2 md:px-4">
                  <StlPreviewViewer
                    file={files[selectedPreviewIndex]}
                    onDiameterComputed={handleDiameterComputed}
                  />
                  {(() => {
                    const fname = files[selectedPreviewIndex].name;
                    const maxDiameter = abutDiameters[fname];
                    const connDiameter = connectionDiameters[fname];
                    return (
                      (maxDiameter || connDiameter) && (
                        <div className="text-sm font-medium flex flex-wrap gap-4 mt-2">
                          {maxDiameter && (
                            <span>최대 직경: {maxDiameter.toFixed(2)} mm</span>
                          )}
                          {connDiameter && (
                            <span>
                              커넥션 직경: {connDiameter.toFixed(2)} mm
                            </span>
                          )}
                        </div>
                      )
                    );
                  })()}
                </div>
                <div className="space-y-3 text-sm px-2 md:px-4">
                  {(() => {
                    const fname = files[selectedPreviewIndex].name;
                    const info = aiFileInfos.find((i) => i.filename === fname);
                    const patientName = info?.patientName || "";
                    const tooth = info?.tooth || "";

                    return (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-y-2 text-sm text-foreground">
                          <div className="flex w-full gap-2 items-start">
                            {/* 치과명 */}
                            <ClinicAutocompleteField
                              value={clinicInput}
                              onChange={setClinicInput}
                              presets={clinicPresets}
                              selectedId={selectedClinicId}
                              onSelectClinic={handleSelectClinic}
                              onAddOrSelectClinic={handleAddOrSelectClinic}
                              onDeleteClinic={handleDeleteClinic}
                            />

                            {/* 환자명 */}
                            <LabeledAutocompleteField
                              value={patientName}
                              onChange={(next) => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, patientName: next }
                                      : item
                                  )
                                );
                              }}
                              options={patientNameOptions}
                              placeholder="환자명"
                              onOptionSelect={(label) => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, patientName: label }
                                      : item
                                  )
                                );
                              }}
                              onClear={() => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, patientName: "" }
                                      : item
                                  )
                                );
                              }}
                              onDelete={() => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, patientName: "" }
                                      : item
                                  )
                                );
                              }}
                              inputClassName="h-8 text-xs w-full pr-10"
                            />

                            {/* 치아번호 */}
                            <LabeledAutocompleteField
                              value={tooth}
                              onChange={(next) => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, tooth: next }
                                      : item
                                  )
                                );
                              }}
                              options={teethOptions}
                              placeholder="치아번호"
                              onOptionSelect={(label) => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, tooth: label }
                                      : item
                                  )
                                );
                              }}
                              onClear={() => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, tooth: "" }
                                      : item
                                  )
                                );
                              }}
                              onDelete={() => {
                                setAiFileInfos((prev) =>
                                  prev.map((item) =>
                                    item.filename === fname
                                      ? { ...item, tooth: "" }
                                      : item
                                  )
                                );
                              }}
                              inputClassName="h-8 text-xs w-full pr-10"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const fname = files[selectedPreviewIndex].name;
                    const info = aiFileInfos.find((i) => i.filename === fname);
                    const isAbutment = info?.workType === "abutment";

                    return (
                      <div className="space-y-3 ">
                        {isAbutment && (
                          <div className="space-y-1">
                            <div className="flex gap-2 text-[11px]">
                              <div className="flex-1 space-y-1">
                                <Select
                                  value={implantManufacturer}
                                  onValueChange={(value) => {
                                    setImplantManufacturer(value);
                                    setImplantSystem("");
                                    setImplantType("");
                                    syncSelectedConnection(value, "", "");
                                  }}
                                >
                                  <SelectTrigger ref={manufacturerSelectRef}>
                                    <SelectValue placeholder="제조사" />
                                  </SelectTrigger>
                                </Select>
                              </div>

                              <div className="flex-1 space-y-1">
                                <Select
                                  value={implantSystem}
                                  onValueChange={(value) => {
                                    setImplantSystem(value);
                                    setImplantType("");
                                    syncSelectedConnection(
                                      implantManufacturer,
                                      value,
                                      ""
                                    );
                                  }}
                                  disabled={!implantManufacturer}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="시스템" />
                                  </SelectTrigger>
                                </Select>
                              </div>

                              <div className="flex-1 space-y-1">
                                <Select
                                  value={implantType}
                                  onValueChange={(value) => {
                                    setImplantType(value);
                                    syncSelectedConnection(
                                      implantManufacturer,
                                      implantSystem,
                                      value
                                    );
                                  }}
                                  disabled={!implantSystem}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="유형" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {typeOptions.map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 의뢰 버튼 및 결제/배송 안내 (어벗/보철 공통) */}
                        <div className="space-y-3 pt-2">
                          <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs md:text-sm leading-relaxed text-orange-900">
                            <p className="font-semibold">
                              본 서비스 비용에는 부가세(VAT)와 배송비가 포함되어
                              있지 않습니다.
                            </p>
                            <p className="mt-1 text-xs md:text-sm">
                              부가세(VAT) 및 배송비는 별도 청구되며, 비용 절감을
                              위해 묶음 배송을 권장드립니다.
                            </p>
                            <p className="mt-1 font-bold">
                              잊지 마시고 대시보드에서 배송 신청하세요!
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleSubmit}
                              size="lg"
                              className="flex-1"
                            >
                              의뢰하기
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="w-24"
                              onClick={handleCancel}
                            >
                              취소하기
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expanded Request Card Modal */}
      {selectedRequest && (
        <ExpandedRequestCard
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      )}
    </div>
  );
};
