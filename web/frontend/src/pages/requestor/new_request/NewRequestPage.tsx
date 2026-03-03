/**
 * V2 UI + V3 동작 (로컬 스토리지 SSOT)
 * 화면은 기존 카드형 리스트/배송 선택 UI를 유지하면서,
 * 내부 로직은 useNewRequestV3 훅을 사용합니다.
 */

import React from "react";
import { useNewRequestV3 } from "./hooks/useNewRequestV3";
import { getFileKey } from "./utils/localDraftStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function NewRequestPage() {
  const {
    files,
    loading,
    selectedFileIndex,
    duplicatePrompt,
    isDragOver,
    isSubmitting,
    handleDrop,
    handleFileSelect,
    handleRemoveFile,
    setSelectedFileIndex,
    handleUpdateInfo,
    getCaseInfos,
    handleDuplicateChoice,
    setDuplicatePrompt,
    handleSubmit,
    handleDragOver,
    handleDragLeave,
  } = useNewRequestV3();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  const selectedFile =
    selectedFileIndex !== null ? files[selectedFileIndex] : null;
  const selectedFileKey = selectedFile ? getFileKey(selectedFile) : null;
  const selectedCaseInfos = selectedFileKey
    ? getCaseInfos(selectedFileKey)
    : null;

  return (
    <div className="flex flex-col h-full min-h-0 p-6">
      <div className="max-w-6xl w-full mx-auto flex flex-col gap-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">새 의뢰</h1>
        </div>

        {/* 메인 카드 */}
        <Card className="p-5 shadow-lg border border-slate-100 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 왼쪽: 파일 리스트 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">파일 ({files.length})</h2>
                <label>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".stl,.3dm,.obj"
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>파일 선택</span>
                  </Button>
                </label>
              </div>

              {/* 드롭존 */}
              <div
                className={`rounded-2xl border-2 border-dashed p-4 text-center text-sm text-slate-500 bg-slate-50/60 ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-slate-200"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                파일을 드래그하거나 파일 선택 버튼을 클릭하세요
              </div>

              {/* 파일 카드 목록 */}
              <div className="space-y-3">
                {files.map((file, index) => {
                  const fileKey = getFileKey(file);
                  const caseInfos = getCaseInfos(fileKey);
                  const isSelected = selectedFileIndex === index;

                  return (
                    <div
                      key={fileKey}
                      className={`rounded-2xl border-2 bg-white shadow-sm p-3 flex items-center justify-between transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-slate-200 hover:border-primary/40"
                      }`}
                      onClick={() => setSelectedFileIndex(index)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-slate-800">
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        {caseInfos && (
                          <p className="text-xs text-slate-500 truncate">
                            {caseInfos.clinicName} / {caseInfos.patientName} /{" "}
                            {caseInfos.tooth}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  );
                })}

                {files.length === 0 && (
                  <div className="text-center text-sm text-slate-500">
                    파일을 추가하면 목록이 표시됩니다.
                  </div>
                )}
              </div>
            </div>

            {/* 오른쪽: 정보 입력 + 배송 */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-inner">
                <h3 className="text-base font-semibold mb-3">묶음 배송</h3>
                <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                  <span>발송일:</span>
                  <div className="flex gap-1">
                    {["월", "화", "수", "목", "금"].map((day) => (
                      <button
                        key={day}
                        className="px-3 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-xs hover:border-primary"
                        type="button"
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  공휴일은 다음날 발송합니다.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={files.length === 0 || isSubmitting}
                  >
                    {isSubmitting ? "제출 중..." : "의뢰하기"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={() => window.location.reload()}
                  >
                    취소하기
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex-1 min-h-[280px]">
                <h3 className="text-base font-semibold mb-3">정보 입력</h3>

                {selectedFile && selectedFileKey ? (
                  <div className="space-y-3">
                    <Input
                      value={selectedCaseInfos?.clinicName || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          clinicName: e.target.value,
                        })
                      }
                      placeholder="치과명을 입력하세요"
                    />
                    <Input
                      value={selectedCaseInfos?.patientName || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          patientName: e.target.value,
                        })
                      }
                      placeholder="환자명을 입력하세요"
                    />
                    <Input
                      value={selectedCaseInfos?.tooth || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          tooth: e.target.value,
                        })
                      }
                      placeholder="치아번호를 입력하세요"
                    />
                    <Input
                      value={selectedCaseInfos?.implantManufacturer || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          implantManufacturer: e.target.value,
                        })
                      }
                      placeholder="임플란트 제조사"
                    />
                    <Input
                      value={selectedCaseInfos?.implantSystem || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          implantSystem: e.target.value,
                        })
                      }
                      placeholder="임플란트 시스템"
                    />
                    <Input
                      value={selectedCaseInfos?.implantType || ""}
                      onChange={(e) =>
                        handleUpdateInfo(selectedFileKey, {
                          implantType: e.target.value,
                        })
                      }
                      placeholder="임플란트 타입"
                    />
                  </div>
                ) : (
                  <div className="text-center text-sm text-slate-500 flex items-center justify-center h-full">
                    파일을 선택하여 정보를 입력하세요
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 중복 처리 모달 (V2 스타일과 유사하게 카드 형태 유지) */}
      {duplicatePrompt && duplicatePrompt.duplicates.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">
              {duplicatePrompt.mode === "tracking"
                ? "추적관리 의뢰가 이미 있습니다"
                : "진행 중인 의뢰가 이미 있습니다"}
            </h2>

            <div className="space-y-4">
              {duplicatePrompt.duplicates.map((dup) => {
                const existing = dup.existingRequest;
                return (
                  <Card key={dup.fileKey} className="p-4">
                    <div className="space-y-2">
                      <p className="font-medium">
                        {existing?.clinicName} / {existing?.patientName} /{" "}
                        {existing?.tooth}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        의뢰번호: {existing?.requestId}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleDuplicateChoice({
                              fileKey: dup.fileKey,
                              strategy: "skip",
                              existingRequestId: existing?._id,
                            })
                          }
                        >
                          건너뛰기
                        </Button>
                        {duplicatePrompt.mode !== "tracking" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleDuplicateChoice({
                                fileKey: dup.fileKey,
                                strategy: "replace",
                                existingRequestId: existing?._id,
                              })
                            }
                          >
                            교체하기
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() =>
                            handleDuplicateChoice({
                              fileKey: dup.fileKey,
                              strategy: "remake",
                              existingRequestId: existing?._id,
                            })
                          }
                        >
                          하나 더 의뢰
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setDuplicatePrompt(null)}>
                닫기
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
