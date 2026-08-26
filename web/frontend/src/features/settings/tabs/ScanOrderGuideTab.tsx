// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
// - web/backend/rules.md
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ScanOrderGuideTabProps = {
  /** practice = 치과 안내, lab = 기공소 안내 */
  audience: "practice" | "lab";
};

/**
 * 3Shape 중간 플랫폼 연동 없음.
 * 스캔은 Communicate 직송, 기공의뢰서만 어벗츠.
 */
export const ScanOrderGuideTab = ({ audience }: ScanOrderGuideTabProps) => {
  const isLab = audience === "lab";

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-slate-200/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">스캔 · 기공의뢰서 안내</CardTitle>
          <CardDescription className="mt-1">
            어벗츠는 3Shape/TRIOS 스캔을 대신 받아 중계하지 않습니다. 스캔과
            의뢰서를 경로에 맞게 나눠 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-slate-700">
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-900">
              1. 3Shape / TRIOS 사용 시
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>
                <span className="font-medium">구강스캔·3D 데이터</span>는
                3Shape Communicate(또는 Unite)에서{" "}
                {isLab
                  ? "귀 기공소(어벗츠기공소 포함) 계정으로 직접 수신"
                  : "지정 기공소(어벗츠기공소 포함)로 직접 전송"}
                합니다.
              </li>
              <li>
                <span className="font-medium">기공의뢰서</span>
                (치식·메모·수가·기공소 지정 등)는 어벗츠 웹에서 작성·전송합니다.
              </li>
              <li>
                {isLab
                  ? "Communicate Inbox에서 스캔을 확인하고, 어벗츠 기공의뢰 수신함에서 의뢰 내용을 맞춰 작업하세요."
                  : "Communicate로 스캔을 보낸 뒤, 어벗츠 기공의뢰에서 같은 건의 의뢰서를 작성해 주세요."}
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-900">
              2. 3Shape을 쓰지 않는 경우
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>
                STL / PLY / OBJ 등 파일을 어벗츠 기공의뢰에{" "}
                <span className="font-medium">직접 업로드</span>해 전송합니다.
                (현행과 동일)
              </li>
              <li>
                {isLab
                  ? "수신함에서 파일과 의뢰서를 함께 확인하면 됩니다."
                  : "스캔 파일과 기공의뢰서를 한곳에서 보내면 됩니다."}
              </li>
            </ul>
          </section>

          <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            3Shape은 중간 LMS/플랫폼으로의 스캔 중계 API를 제공하지 않습니다.
            어벗츠는 기공의뢰·정산·생산 워크플로에 집중하고, TRIOS 스캔 전달은
            Communicate 기본 경로를 그대로 사용합니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
