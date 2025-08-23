import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, Package, Cog, FileText } from "lucide-react";

interface PartnershipBenefitsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PartnershipBenefitsModal = ({
  open,
  onOpenChange,
}: PartnershipBenefitsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl font-bold text-center bg-gradient-hero bg-clip-text text-transparent">
            파트너십 모델 특별 혜택
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] space-y-8 px-8 custom-scrollbar">
          {/* Section 1: 파트너십 계약 */}
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-primary">파트너십 계약</h3>
            </div>

            <div className="bg-muted/30 rounded-xl p-8 space-y-4">
              <p className="text-foreground leading-relaxed">
                제조사는{" "}
                <span className="font-semibold text-primary">
                  올인원 패키지를 무상 임대
                </span>
                받습니다.
              </p>
              <p className="text-foreground leading-relaxed">
                매 의뢰건 당 판매가의 50%를 공유합니다.
              </p>
              <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-4">
                <p className="font-medium text-primary">
                  ✓ 파트너십 계약 종료 시 패키지 반환
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Section 2: 올인원 패키지 */}
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Package className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold text-accent">
                올인원 패키지 구성
              </h3>
            </div>

            <div className="bg-muted/30 rounded-xl p-8">
              <p className="text-foreground mb-6 leading-relaxed">
                커스텀 어벗먼트 생산에 특화된{" "}
                <span className="font-semibold text-accent">
                  완전한 생산 솔루션
                </span>
                을 제공합니다.
              </p>

              <div className="grid gap-4">
                <div className="flex items-center gap-4 p-5 bg-background rounded-lg border">
                  <div className="w-2 h-2 bg-accent rounded-full"></div>
                  <div>
                    <h4 className="font-semibold">CNC 자동선반 복합기</h4>
                    <p className="text-sm text-muted-foreground">
                      고정밀 커스텀 어벗먼트 전용 장비 (어벗츠 전용, 다른 작업을
                      금함)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-background rounded-lg border">
                  <div className="w-2 h-2 bg-accent rounded-full"></div>
                  <div>
                    <h4 className="font-semibold">CAM 디자인 시스템</h4>
                    <p className="text-sm text-muted-foreground">
                      어벗츠 전용 NC 코드 생성 시스템
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-background rounded-lg border">
                  <div className="w-2 h-2 bg-accent rounded-full"></div>
                  <div>
                    <h4 className="font-semibold">통합 제어 매니저</h4>
                    <p className="text-sm text-muted-foreground">
                      장비 제어 및 작업 관리 시스템
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Section 3: 작업 프로세스 */}
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted/40 rounded-lg">
                <Cog className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold text-muted-foreground">
                자동화 작업 프로세스
              </h3>
            </div>

            <div className="bg-muted/30 rounded-xl p-8">
              <div className="space-y-6">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div className="w-px h-8 bg-border mt-2"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <h4 className="font-semibold mb-2">의뢰건 자동 배정</h4>
                    <p className="text-sm text-muted-foreground">
                      STL 파일, 임플란트 정보, 의뢰인 정보가 시스템에 자동
                      전달됩니다.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <div className="w-px h-8 bg-border mt-2"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <h4 className="font-semibold mb-2">CAM 자동 처리</h4>
                    <p className="text-sm text-muted-foreground">
                      커넥션 파트는 템플릿으로 치은 및 보철 파트는 CAM으로 자동
                      처리하여 NC 코드를 생성합니다.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2">스마트 생산 관리</h4>
                    <p className="text-sm text-muted-foreground">
                      NC 코드 전송, 대기열 관리, 에러 알림까지 모든 과정이
                      자동화됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom spacing for scroll */}
          <div className="h-4"></div>
        </div>

        <div className="pt-4 border-t">
          <Button onClick={() => onOpenChange(false)} className="w-full">
            확인했습니다
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
