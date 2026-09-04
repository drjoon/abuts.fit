// change-log:
// - 2026-08-12: 크레딧=기공료 선입금 FAQ 실문답 추가. 선불페이와 구분·환불/수정계산서 안내.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import {
  Search,
  HelpCircle,
  FileText,
  MessageSquare,
  Users,
  Wallet,
} from "lucide-react";
import { SUPPORT_EMAIL } from "@/shared/lib/contactInfo";
import { CREDIT_PREPAID_FAQS } from "@/shared/legal/creditPrepaidCopy";

type FaqItem = { q: string; a: string };

const FAQ_SECTIONS: {
  id: string;
  title: string;
  icon: typeof Wallet;
  items: FaqItem[];
}[] = [
  {
    id: "credit",
    title: "크레딧 · 거래 선수금",
    icon: Wallet,
    items: CREDIT_PREPAID_FAQS,
  },
  {
    id: "account",
    title: "계정",
    icon: Users,
    items: [
      {
        q: "회원가입은 어떻게 하나요?",
        a: "사업자등록번호로 가입합니다. 치과(의뢰 발신) 또는 기공소(의뢰 수신) 유형을 선택한 뒤 사업자 정보를 제출하면, 검증 후 서비스를 이용할 수 있습니다.",
      },
      {
        q: "기공소 가입 시 무료 크레딧이 생기나요?",
        a: "가입 환영 무료크레딧 자동 지급은 없습니다. 대신 기공소는 가입 후 첫 2건을 무료 테스트(의뢰·배송·제조 0원)로 진행할 수 있으며, 준비 단계에서 취소하면 횟수가 돌아옵니다.",
      },
      {
        q: "계정 해지 시 남은 크레딧은 어떻게 되나요?",
        a: "잔여 유료 크레딧(거래 선수금)은 환불 신청 후 전액 환불됩니다. 이미 월말 발행된 (세금)계산서가 있으면 필요 시 마이너스 수정으로 처리합니다. 무료·이벤트 크레딧은 환불 대상이 아닙니다.",
      },
    ],
  },
  {
    id: "request",
    title: "의뢰",
    icon: FileText,
    items: [
      {
        q: "의뢰 상태는 어디서 확인하나요?",
        a: "로그인 후 대시보드에서 준비·가공·출고 진행 상태를 확인할 수 있습니다. 상세 화면과 채팅에서 제작사와 소통할 수 있습니다.",
      },
      {
        q: "의뢰 취소는 언제 가능한가요?",
        a: "준비 단계에서만 취소할 수 있습니다. 가공이 시작된 이후에는 취소할 수 없으며, 품질 이슈는 리메이크 정책(이용약관)을 따릅니다.",
      },
    ],
  },
  {
    id: "support",
    title: "고객 지원",
    icon: MessageSquare,
    items: [
      {
        q: "세무·환불 문의는 어디로 하면 되나요?",
        a: `로그인 후 문의 메뉴에서 크레딧 유형으로 접수하거나 ${SUPPORT_EMAIL}로 연락해 주세요. 기공료 선입금·면세 계산서·환불은 위 FAQ와 이용약관 제7조를 기준으로 안내합니다.`,
      },
    ],
  },
];

export const HelpPage = () => {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const sections = useMemo(() => {
    if (!normalized) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.q.toLowerCase().includes(normalized) ||
          item.a.toLowerCase().includes(normalized),
      ),
    })).filter((section) => section.items.length > 0);
  }, [normalized]);

  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            support
          </p>
          <h1 className="text-4xl font-semibold text-white">도움말 센터</h1>
          <p className="text-white/70">
            기공료 선입금, 면세 계산서, 의뢰 이용에 대한 안내입니다
          </p>
        </div>

        <Card className={`${PUBLIC_CARD_CLASS} mb-8`}>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="기공료 선입금, 환불, 계산서…"
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/80 text-slate-900 focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>

        {sections.length === 0 ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="p-6 text-sm text-slate-600">
              검색 결과가 없습니다. 다른 키워드로 찾아보거나 {SUPPORT_EMAIL}로
              문의해 주세요.
            </CardContent>
          </Card>
        ) : (
          sections.map((section) => (
            <Card key={section.id} id={section.id} className={PUBLIC_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-900">
                  <section.icon className="h-6 w-6 text-primary" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {section.items.map((item, index) => (
                    <AccordionItem
                      key={`${section.id}-${index}`}
                      value={`${section.id}-${index}`}
                      className="border-slate-200"
                    >
                      <AccordionTrigger className="text-left text-slate-800 hover:no-underline">
                        <span className="flex items-start gap-2 pr-3">
                          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {item.q}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-slate-600 leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))
        )}

        <Card className={PUBLIC_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-slate-900">
              더 많은 도움이 필요하신가요?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-slate-900/5 p-4 text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium text-slate-900 mb-2">문의</h3>
                <p className="text-sm text-slate-600">
                  로그인 후 고객센터에서 접수
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/5 p-4 text-center">
                <FileText className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium text-slate-900 mb-2">이메일 문의</h3>
                <p className="text-sm text-slate-600">{SUPPORT_EMAIL}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicPageLayout>
  );
};
