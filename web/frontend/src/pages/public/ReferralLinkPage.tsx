import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { Copy, Check } from "lucide-react";

interface ReferralInfo {
  referrerName: string;
  referrerEmail: string;
  referrerRole: "requestor" | "salesman";
  businessName?: string;
}

export const ReferralLinkPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const referralCode = useMemo(() => {
    const ref = searchParams.get("ref");
    return ref && ref.trim().length > 0 ? ref.trim() : undefined;
  }, [searchParams]);

  const signupUrl = useMemo(() => {
    if (!referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/signup?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  useEffect(() => {
    if (!referralCode) {
      setError("유효하지 않은 소개 링크입니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    request<any>({
      path: "/api/auth/referral/validate",
      method: "POST",
      jsonBody: { value: referralCode },
    })
      .then((res) => {
        const body = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "추천인을 찾을 수 없습니다.");
        }

        setReferralInfo({
          referrerName: body.data?.referrerName || "알 수 없음",
          referrerEmail: body.data?.referrerEmail || "",
          referrerRole: body.data?.referrerRole || "requestor",
          businessName: body.data?.businessName,
        });
        setError(null);
      })
      .catch((err) => {
        setError((err as any)?.message || "소개 정보를 확인할 수 없습니다.");
        setReferralInfo(null);
      })
      .finally(() => setLoading(false));
  }, [referralCode]);

  const handleCopyLink = async () => {
    if (!signupUrl) return;
    try {
      await navigator.clipboard.writeText(signupUrl);
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

  const handleSignup = () => {
    navigate(`/signup?ref=${encodeURIComponent(referralCode || "")}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md border-slate-200">
          <CardContent className="pt-8">
            <div className="space-y-4">
              <div className="h-4 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 bg-slate-200 rounded animate-pulse w-5/6" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !referralInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">오류</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-red-800">{error}</p>
            <Button
              onClick={() => navigate("/")}
              className="w-full"
              variant="default"
            >
              홈으로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const referrerDisplay =
    referralInfo.businessName || referralInfo.referrerName;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">
            {referrerDisplay}에서 소개받으셨나요?
          </CardTitle>
          <p className="text-sm text-slate-600">
            {referralInfo.referrerRole === "requestor"
              ? "기공소에서 소개한 ABUTS.fit에 가입하고 특별한 혜택을 받으세요."
              : "영업자에게 소개받은 ABUTS.fit에 가입하고 함께 성장하세요."}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 소개자 정보 */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <div className="text-xs text-blue-600 font-medium mb-1">
              소개자
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {referrerDisplay}
            </div>
            {referralInfo.referrerEmail && (
              <div className="text-xs text-slate-500 mt-1">
                {referralInfo.referrerEmail}
              </div>
            )}
          </div>

          {/* 혜택 안내 */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              가입 시 혜택
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold mt-0.5">✓</span>
                <span>신규 가입 축하 크레딧 30,000원</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold mt-0.5">✓</span>
                <span>소개자와 함께 특별한 가격 혜택</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold mt-0.5">✓</span>
                <span>전문 기술 지원 및 상담</span>
              </li>
            </ul>
          </div>

          {/* 소개 링크 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              소개 링크
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={signupUrl}
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

          {/* CTA 버튼 */}
          <div className="space-y-2">
            <Button
              onClick={handleSignup}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              가입하기
            </Button>
            <Button
              onClick={() => navigate("/login")}
              variant="outline"
              className="w-full h-11"
            >
              이미 계정이 있으신가요? 로그인
            </Button>
          </div>

          {/* 약관 링크 */}
          <div className="text-center text-xs text-slate-500 space-y-1">
            <p>
              가입함으로써 ABUTS.fit의{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                이용약관
              </a>
              과{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                개인정보처리방침
              </a>
              에 동의합니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
