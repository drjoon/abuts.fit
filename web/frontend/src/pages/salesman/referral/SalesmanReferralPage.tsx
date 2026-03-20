import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";

export const SalesmanReferralPage = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "dashboard">("link");

  const { isReferralEligible, referralLink, treeData, loadingTree } =
    useReferralData({
      fetchStats: false,
      fetchDirectMembers: false,
      fetchTree: activeTab === "dashboard",
    });

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
    <div className="flex flex-col h-full min-h-0">
      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex gap-8 px-4 sm:px-6">
          <button
            onClick={() => setActiveTab("link")}
            className={`py-4 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "link"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            소개 링크
          </button>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-4 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "dashboard"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            소개 대시보드
          </button>
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 소개 링크 탭 */}
        {activeTab === "link" && (
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
                        직접 소개 5% + 간접 소개 2.5% 수수료 지급
                      </p>
                    </div>

                    {/* 정책 안내 */}
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          - 직접 소개한 의뢰자의 유료 매출의 5%를 수수료로
                          지급합니다.
                        </p>
                        <p>
                          - 간접 소개한 의뢰자(직접 소개한 사람이 다시 소개한
                          의뢰자)의 유료 매출의 2.5%를 수수료로 지급합니다.
                        </p>
                        <p>
                          - 수수료는 사업자 기준으로 매일 자정(00:00)
                          업데이트됩니다.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 소개 대시보드 탭 */}
        {activeTab === "dashboard" && (
          <div className="p-3 space-y-3">
            {!isReferralEligible ? (
              <Card className="border-gray-200">
                <CardContent className="pt-6">
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    영업자 계정에서 확인할 수 있습니다.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 소개 네트워크 차트 */}
                {loadingTree ? (
                  <Card className="border-gray-200">
                    <CardHeader>
                      <CardTitle className="text-base">소개 네트워크</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-[320px]" />
                    </CardContent>
                  </Card>
                ) : (
                  <ReferralNetworkChart
                    data={treeData}
                    maxDepth={2}
                    title="내 소개 네트워크"
                    visibleRoles={["requestor", "salesman"]}
                    legendRoles={["requestor", "salesman"]}
                    chartHeight={320}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
