// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
import { Link } from "react-router-dom";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
  PUBLIC_PAGE_EYEBROW,
  PUBLIC_PAGE_TITLE,
  PUBLIC_PAGE_SUBTITLE,
} from "./components/PublicPageLayout";

export const CreditsPage = () => {
  const contributors = [
    { name: "이준호", role: "Product & Engineering" },
    { name: "김민서", role: "Design & Brand" },
    { name: "홍승연", role: "Customer Success" },
  ];

  return (
    <PublicPageLayout>
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2 text-center">
          <p className={PUBLIC_PAGE_EYEBROW}>Behind Abuts.fit</p>
          <h1 className={PUBLIC_PAGE_TITLE}>Credits</h1>
          <p className={PUBLIC_PAGE_SUBTITLE}>
            치과기공 업계를 더 나은 방향으로 이끌기 위해 함께하고 있는 팀을
            소개합니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {contributors.map((person) => (
            <div
              key={person.name}
              className={`${PUBLIC_CARD_CLASS} rounded-2xl px-5 py-6 text-center`}
            >
              <p className="text-lg font-semibold text-[#0b2a5c]">
                {person.name}
              </p>
              <p className="mt-1 text-sm text-slate-500">{person.role}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-2xl p-6 text-center ${PUBLIC_CARD_CLASS}`}>
          <p className="text-slate-600">
            서비스에 대한 제안이나 문의 사항이 있다면 언제든지
            <br />
            <Link
              to="/contact"
              className="text-sky-600 underline decoration-dotted underline-offset-2 hover:text-sky-700"
            >
              고객 지원팀
            </Link>
            으로 연락해주세요.
          </p>
        </div>
      </div>
    </PublicPageLayout>
  );
};
