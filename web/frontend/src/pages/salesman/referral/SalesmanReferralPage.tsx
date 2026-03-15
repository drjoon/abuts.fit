import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";

export const SalesmanReferralPage = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { isReferralEligible, referralLink } = useReferralData();

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "소개 링크가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인해주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-full p-4 bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">내 소개 링크</CardTitle>
          <p className="text-sm text-slate-600">
            이 링크를 공유하고 새로운 사업자를 소개하세요.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isReferralEligible ? (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
              영업자 또는 개발운영사 계정에서 확인할 수 있습니다.
            </div>
          ) : (
            <>
              {/* 소개 링크 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  소개 링크
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referralLink}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-600"
                  />
                  <Button
                    onClick={handleCopyLink}
                    variant="outline"
                    size="sm"
                    className="px-3"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* 혜택 안내 */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  소개 혜택
                </div>
                <p className="text-sm text-slate-600">
                  본인과 직접 소개한 사업자의 최근 30일 주문량을 합산하여 단가
                  계산
                </p>
              </div>

              {/* 정책 안내 */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs text-slate-600 space-y-1">
                  <p>- 최근 30일 사업자 주문량 기준으로 단가가 적용됩니다.</p>
                  <p>
                    - 주문량 집계는 사용자 개인이 아니라 사업자 기준으로 매일
                    자정(00:00) 업데이트됩니다.
                  </p>
                  <p>
                    - 소개 정책은 의뢰자, 영업자, 개발운영사에게 적용됩니다.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
