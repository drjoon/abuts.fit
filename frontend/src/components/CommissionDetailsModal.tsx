import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Percent, Zap, Code } from "lucide-react";

interface CommissionDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommissionDetailsModal = ({
  open,
  onOpenChange,
}: CommissionDetailsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl font-bold text-center bg-gradient-hero bg-clip-text text-transparent">
            플랫폼 모델 수수료 상세
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] space-y-6 px-6 custom-scrollbar">
          <p className="text-center text-muted-foreground">
            제조사가 설정하는 수수료율에 따라{" "}
            <span className="font-semibold text-accent">차별화된 서비스</span>를
            제공합니다. <br></br>제조사 미지정 물량만 수수료율에 따라
            배정됩니다.
          </p>

          {/* 수수료별 혜택 */}
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-xl p-6">
              <div className="space-y-6">
                {/* 5% */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      5%
                    </div>
                    <div className="w-px h-8 bg-border mt-2"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <h4 className="font-semibold mb-2">기본 매칭</h4>
                    <p className="text-sm text-muted-foreground">
                      기본적인 매칭 서비스를 제공합니다.
                    </p>
                  </div>
                </div>

                {/* 10% */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      10%
                    </div>
                    <div className="w-px h-8 bg-border mt-2"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <h4 className="font-semibold mb-2">더블 매칭</h4>
                    <p className="text-sm text-muted-foreground">
                      기본 매칭보다 2배 많은 물량을 우선적으로 배정합니다.
                    </p>
                  </div>
                </div>

                {/* 15% */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-blue-700 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      15%
                    </div>
                    <div className="w-px h-8 bg-border mt-2"></div>
                  </div>
                  <div className="flex-1 pb-4">
                    <h4 className="font-semibold mb-2">트리플 매칭</h4>
                    <p className="text-sm text-muted-foreground">
                      기본 매칭보다 3배 많은 물량을 우선적으로 배정합니다.
                    </p>
                  </div>
                </div>

                {/* +5% */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-accent text-white rounded-full flex items-center justify-center font-bold text-sm">
                    +5%
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2">NC 코드 제공</h4>
                    <p className="text-sm text-muted-foreground">
                      추가 수수료 설정시 NC 코드를 제공하여 생산성을
                      극대화합니다.
                      <br></br>
                      (공구 세팅 등 사전 협의 필요)
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
