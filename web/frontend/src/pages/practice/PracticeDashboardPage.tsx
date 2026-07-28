/**
 * 치과병의원(practice) 대시보드.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 스캔 전송 / 최근 의뢰 내역 2열 구성
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/features/dashboard/DashboardHome.tsx
 * - web/frontend/src/features/layout/DashboardLayout.tsx
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, ClipboardList } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";

export const PracticeDashboardPage = () => {
  const navigate = useNavigate();

  const recentRequests = useMemo(
    () => [
      {
        id: "PR-2026-0012",
        createdAt: "2026-07-27 15:10",
        targetLab: "한빛기공소",
        status: "전달완료",
      },
      {
        id: "PR-2026-0011",
        createdAt: "2026-07-26 11:48",
        targetLab: "미래기공소",
        status: "검토중",
      },
      {
        id: "PR-2026-0010",
        createdAt: "2026-07-25 17:22",
        targetLab: "서울정밀기공",
        status: "접수대기",
      },
    ],
    [],
  );

  return (
    <DashboardShell
      title="치과병의원 대시보드"
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
      stats={
        <>
          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">이번 주 의뢰</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">12건</div>
              <p className="text-xs text-muted-foreground">전주 대비 +3건</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">전달 대기</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">2건</div>
              <p className="text-xs text-muted-foreground">파일/메모 보완 필요</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">진행 중</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">7건</div>
              <p className="text-xs text-muted-foreground">기공소 확인/제작 단계</p>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">완료</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">3건</div>
              <p className="text-xs text-muted-foreground">최근 7일 기준</p>
            </CardContent>
          </Card>
        </>
      }
      mainLeft={
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-4 w-4 text-blue-600" />
              스캔 전송
            </CardTitle>
            <CardDescription>
              파일 업로드, 기공소 선택, 메모 작성 후 의뢰를 전송하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div className="rounded-xl border border-dashed bg-background p-5 text-center">
                <p className="text-base font-semibold">파일을 드래그 & 드롭하세요</p>
                <p className="mt-1 text-sm text-muted-foreground">STL만 업로드 가능</p>
                <p className="text-sm text-muted-foreground">또는 아래 버튼으로 파일 선택</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate("/practice/dropzone")}
                >
                  파일 선택
                </Button>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <p className="text-base font-semibold">총 0개 파일 · 약 0.0MB</p>
                <div className="mt-4 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  아직 추가된 파일이 없습니다.
                </div>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <p className="text-base font-semibold">기공소 정보 & 의뢰 메모</p>
                <p className="mt-4 text-sm font-medium">기공소 선택</p>
                <div className="mt-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  의뢰자 사업자를 검색해서 선택하세요
                </div>
                <p className="mt-4 text-sm font-medium">의뢰 메모</p>
                <div className="mt-2 min-h-[120px] rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  예: #36 커스텀 어버트먼트, 마진 라인 메모...
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button
                type="button"
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => navigate("/practice/dropzone")}
              >
                의뢰 보내기
              </Button>
            </div>
          </CardContent>
        </Card>
      }
      mainRight={
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              최근 의뢰 내역
            </CardTitle>
            <CardDescription>
              추후 실제 API 연동 시 실시간으로 업데이트됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{request.id}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {request.createdAt} · {request.targetLab}
                  </p>
                </div>
                <Badge variant="outline">{request.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      }
    />
  );
};
