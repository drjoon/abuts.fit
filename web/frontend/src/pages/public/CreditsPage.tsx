import { Link } from "react-router-dom";

export const CreditsPage = () => {
  const contributors = [
    { name: "이준호", role: "Product & Engineering" },
    { name: "김민서", role: "Design & Brand" },
    { name: "홍승연", role: "Customer Success" },
  ];

  return (
    <div className="min-h-screen bg-[#060912] text-white">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <div className="space-y-6 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Behind Abuts.fit
          </p>
          <h1 className="text-4xl font-semibold">Credits</h1>
          <p className="text-white/70">
            치과기공 업계를 더 나은 방향으로 이끌기 위해 함께하고 있는 팀을
            소개합니다.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {contributors.map((person) => (
            <div
              key={person.name}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center"
            >
              <p className="text-lg font-semibold">{person.name}</p>
              <p className="text-sm text-white/60">{person.role}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center text-white/70">
          <p>
            서비스에 대한 제안이나 문의 사항이 있다면 언제든지
            <br />
            <Link
              to="/contact"
              className="text-white underline decoration-dotted decoration-white/40"
            >
              고객 지원팀
            </Link>
            으로 연락해주세요.
          </p>
        </div>
      </div>
    </div>
  );
};
