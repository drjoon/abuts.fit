/**
 * 치과병의원(practice) 파일전송 페이지.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 상단: 기간필터 + 요약(좌 2x2) + 최근 의뢰(우)
 * - 하단: 스캔 전송 섹션이 남은 영역을 채움
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/features/dashboard/DashboardHome.tsx
 * - web/frontend/src/features/layout/DashboardLayout.tsx
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  ClipboardList,
  Search,
  Trash2,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  usePracticeTransferStep1,
} from "@/pages/practice/hooks/usePracticeTransferStep1";

export const PracticeFileTransferPage = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodStore();
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const {
    files,
    totalSizeMb,
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
  } = usePracticeTransferStep1();

  const recentRequests = useMemo(
    () => [
      {
        id: "PR-2026-0012",
        createdAt: "2026-07-27 15:10",
        requestDate: "2026-07-27",
        patientName: "김민준",
        toothNumbers: ["#36", "#37"],
        targetLab: "한빛기공소",
        status: "전달완료",
      },
      {
        id: "PR-2026-0011",
        createdAt: "2026-07-26 11:48",
        requestDate: "2026-07-26",
        patientName: "박서윤",
        toothNumbers: ["#11"],
        targetLab: "미래기공소",
        status: "검토중",
      },
      {
        id: "PR-2026-0010",
        createdAt: "2026-07-25 17:22",
        requestDate: "2026-07-25",
        patientName: "이도현",
        toothNumbers: ["#46", "#47"],
        targetLab: "서울정밀기공",
        status: "접수대기",
      },
    ],
    [],
  );

  const filteredRecentRequests = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();
    if (!query) return recentRequests;

    return recentRequests.filter((request) => {
      const searchableText = [
        request.id,
        request.createdAt,
        request.requestDate,
        request.patientName,
        request.toothNumbers.join(" "),
        request.targetLab,
        request.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recentRequests, requestSearchTerm]);

  const statusCounts = useMemo(() => {
    return filteredRecentRequests.reduce(
      (acc, request) => {
        const status = String(request.status || "").trim();
        if (status === "전달완료") {
          acc.delivered += 1;
        } else if (status === "접수대기") {
          acc.waiting += 1;
        } else {
          acc.sent += 1;
        }
        return acc;
      },
      { sent: 0, waiting: 0, delivered: 0 },
    );
  }, [filteredRecentRequests]);

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="h-full min-h-0"
    >
      <div className="h-full min-h-0 p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                구강 스캔 전송
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-xl border border-dashed bg-background p-4 text-center">
                    <p className="text-base font-semibold">파일을 드래그 & 드롭하세요</p>
                    <p className="mt-1 text-sm text-muted-foreground">{PRACTICE_ACCEPTED_HINT}</p>
                    <p className="text-sm text-muted-foreground">또는 아래 버튼으로 파일 선택</p>
                    <div className="mt-3">
                      <input
                        id="practice-file-transfer-input"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          const nextFiles = Array.from(e.target.files || []);
                          if (nextFiles.length) handleIncomingFiles(nextFiles);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const input = document.getElementById(
                            "practice-file-transfer-input",
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                      >
                        파일 선택
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">
                        총 {files.length}개 파일 · 약 {totalSizeMb}MB
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void clearAllFiles()}
                        disabled={files.length === 0}
                      >
                        전체삭제
                      </Button>
                    </div>
                    {files.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                        아직 추가된 파일이 없습니다.
                      </div>
                    ) : (
                      <div className="mt-3 max-h-[18.5rem] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-2 auto-rows-[4.25rem]">
                          {files.map((file, index) => (
                            <div
                              key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                              className="flex h-[4.25rem] items-center justify-between rounded-md border px-2.5 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(file.size / (1024 * 1024)).toFixed(2)}MB
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => removeFile(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-base font-semibold">기공소 정보 & 의뢰 메모</p>

                  <div className="mt-3 space-y-2">
                    <Label className="text-sm">기공소 선택</Label>
                    <Popover open={labOpen} onOpenChange={setLabOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={labOpen}
                          className="h-11 w-full justify-between text-base"
                        >
                          <span className="truncate">
                            {selectedLab
                              ? getBusinessLabel(selectedLab)
                              : "기공소를 검색해서 선택하세요"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="기공소 검색 (사업자명/대표자명/사업자번호/주소)"
                            value={labSearch}
                            onValueChange={(v) => {
                              setLabSearch(v);
                            }}
                          />
                          <CommandList>
                            {!recentLabsInitialized ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                            ) : null}

                            {recentLabs.length > 0 ? (
                              <CommandGroup heading="최근 전송한 기공소">
                                {recentLabs.map((b) => {
                                  const selected = selectedLab?._id === b._id;
                                  const rep = String(b.representativeName || "").trim();
                                  const bn = String(b.businessNumber || "").trim();
                                  const addr = String(b.address || "").trim();
                                  const meta = [
                                    rep ? `대표: ${rep}` : "",
                                    bn ? `사업자: ${bn}` : "",
                                    addr || "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const searchValue = [b.name, rep, bn, addr]
                                    .filter(Boolean)
                                    .join(" ");

                                  return (
                                    <CommandItem
                                      key={`recent-${b._id}`}
                                      value={searchValue}
                                      onSelect={() => {
                                        setSelectedLab(b);
                                        setLabOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selected ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate text-base font-medium">
                                          {getBusinessLabel(b)}
                                        </div>
                                        {meta ? (
                                          <div className="truncate text-sm text-muted-foreground">
                                            {meta}
                                          </div>
                                        ) : null}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            ) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                최근 전송한 기공소가 없습니다.
                              </div>
                            )}

                            <CommandSeparator />

                            <CommandGroup heading="기공소 검색">
                              {labSearching ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                              ) : labSearch.trim() ? (
                                labSearchResults.length > 0 ? (
                                  labSearchResults.map((b) => {
                                    const selected = selectedLab?._id === b._id;
                                    const rep = String(b.representativeName || "").trim();
                                    const bn = String(b.businessNumber || "").trim();
                                    const addr = String(b.address || "").trim();
                                    const meta = [
                                      rep ? `대표: ${rep}` : "",
                                      bn ? `사업자: ${bn}` : "",
                                      addr || "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const searchValue = [b.name, rep, bn, addr]
                                      .filter(Boolean)
                                      .join(" ");

                                    return (
                                      <CommandItem
                                        key={b._id}
                                        value={searchValue}
                                        onSelect={() => {
                                          setSelectedLab(b);
                                          setLabOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selected ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate text-base font-medium">
                                            {getBusinessLabel(b)}
                                          </div>
                                          {meta ? (
                                            <div className="truncate text-sm text-muted-foreground">
                                              {meta}
                                            </div>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    검색 결과가 없습니다.
                                  </div>
                                )
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  검색어를 입력하면 기공소를 찾을 수 있습니다.
                                </div>
                              )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Label htmlFor="practice-file-transfer-request-memo" className="text-sm">
                      의뢰 메모
                    </Label>
                    <Textarea
                      id="practice-file-transfer-request-memo"
                      value={requestMemo}
                      onChange={(e) => setRequestMemo(e.target.value)}
                      placeholder="예: #36 커스텀 어버트먼트, 마진 라인 메모..."
                      className="min-h-36 text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => navigate("/practice/dropzone")}
                >
                  파일 전송
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              최근 전송 내역
            </CardTitle>
            <CardDescription className="space-y-2">
              <div className="flex items-center justify-start">
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">발송 {statusCounts.sent}건</Badge>
                <Badge variant="outline">전달대기 {statusCounts.waiting}건</Badge>
                <Badge variant="outline">전달 완료 {statusCounts.delivered}건</Badge>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="의뢰일/환자명/치아번호/기공소/의뢰번호 검색"
                  className="h-9 pl-9"
                  value={requestSearchTerm}
                  onChange={(event) => setRequestSearchTerm(event.target.value)}
                />
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredRecentRequests.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                검색 조건에 맞는 의뢰 내역이 없습니다.
              </div>
            ) : (
              filteredRecentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{request.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {request.createdAt} · {request.targetLab}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {request.patientName} · {request.toothNumbers.join(", ")}
                    </p>
                  </div>
                  <Badge variant="outline">{request.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </PageFileDropZone>
  );
};
