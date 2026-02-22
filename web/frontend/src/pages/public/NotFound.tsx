import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <PublicPageLayout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className={`${PUBLIC_CARD_CLASS} text-center max-w-md w-full`}>
          <CardHeader>
            <CardTitle className="text-slate-900">
              페이지를 찾을 수 없습니다
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-600">
              요청하신 경로{" "}
              <span className="font-mono text-slate-900">
                {location.pathname}
              </span>{" "}
              은 존재하지 않습니다.
            </p>
            <Button
              asChild
              className="w-full rounded-full bg-slate-900 text-white hover:bg-slate-800"
            >
              <a href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> 홈으로 돌아가기
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PublicPageLayout>
  );
};

export default NotFound;
