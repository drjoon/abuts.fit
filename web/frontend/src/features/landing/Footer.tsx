// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  MapPin,
  Instagram,
  Facebook,
  ChevronDown,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  COMPANY_ADDRESS,
  COMPANY_BUSINESS_REGISTRATION_NUMBER,
  COMPANY_CEO_NAME,
  COMPANY_NAME,
  COMPANY_PHONE,
  CONTACT_EMAIL,
} from "@/shared/lib/contactInfo";
import { landingIdentity, landingContent } from "@/features/landing/landingTheme";
import { cn } from "@/shared/ui/cn";
import { AbutsLogo } from "@/components/branding/AbutsLogo";

type FooterProps = {
  tone?: "dark" | "light";
};

type FooterLink = { label: string; href: string };

function FooterLinkGroup({
  title,
  links,
  isLight,
}: {
  title: string;
  links: FooterLink[];
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "border-t md:border-t-0",
        isLight ? "border-slate-200" : "border-white/10",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between py-3.5 text-left font-semibold md:mb-4 md:cursor-default md:pointer-events-none md:py-0"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 md:hidden",
            isLight ? "text-slate-500" : "text-white/60",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <ul
        className={cn(
          "space-y-3 pb-3.5 md:pb-0",
          open ? "block" : "hidden md:block",
        )}
      >
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.href}
              className={cn(
                "transition-colors",
                isLight
                  ? "text-slate-500 hover:text-slate-900"
                  : "text-white/60 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const Footer = ({ tone = "dark" }: FooterProps) => {
  const isLight = tone === "light";
  const { pathname } = useLocation();
  const landing = pathname === "/" || pathname.startsWith("/offer/");

  const support: FooterLink[] = [
    { label: "어벗츠 소개", href: "/" },
    { label: "도움말 센터", href: "/help" },
    { label: "이벤트", href: "/#events" },
    { label: "문의하기", href: "/contact" },
    { label: "보안 정책", href: "/security" },
  ];

  const legal: FooterLink[] = [
    { label: "이용약관", href: "/terms" },
    { label: "개인정보처리방침", href: "/privacy" },
    { label: "쿠키 정책", href: "/cookies" },
    { label: "서비스/상품 안내", href: "/service" },
    { label: "사업자 정보", href: "/business" },
  ];

  return (
    <footer
      className={cn(
        "relative mt-0 border-t backdrop-blur-3xl",
        isLight
          ? "border-slate-200 bg-white text-slate-900"
          : "border-white/10 bg-[#030711]/90 text-white",
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            "absolute -top-24 right-[-120px] h-[22rem] w-[22rem] rounded-full blur-[160px]",
            isLight ? "bg-sky-200/40" : "bg-sky-500/8",
          )}
        />
      </div>
      <div
        className={cn(
          "mx-auto w-full",
          landing ? "py-10 sm:py-14" : "py-12 md:py-16",
          landing ? landingContent : "container px-6 sm:px-10 lg:px-16",
        )}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div
              className="mb-4 flex cursor-pointer items-center md:mb-6"
              onClick={() => (window.location.href = "/")}
            >
              <AbutsLogo
                variant={isLight ? "light" : "dark"}
                iconClassName="h-8 w-8"
                wordmarkClassName="text-xl font-bold"
              />
            </div>

            <p
              className={cn(
                "mb-4 leading-relaxed md:mb-6",
                isLight ? "text-slate-600" : "text-white/70",
              )}
            >
              치과의 더 나은 진료를 위한 파트너.{" "}
              {landingIdentity.manufacturerNote}
            </p>

            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-center",
                  isLight ? "text-slate-600" : "text-white/70",
                )}
              >
                <Mail className="mr-2 h-4 w-4" />
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className={cn(
                    "transition-colors",
                    isLight ? "hover:text-slate-900" : "hover:text-white",
                  )}
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
              <div
                className={cn(
                  "flex items-center",
                  isLight ? "text-slate-600" : "text-white/70",
                )}
              >
                <Phone className="mr-2 h-4 w-4" />
                <a
                  href={`tel:${COMPANY_PHONE}`}
                  className={cn(
                    "transition-colors",
                    isLight ? "hover:text-slate-900" : "hover:text-white",
                  )}
                >
                  {COMPANY_PHONE}
                </a>
              </div>
              <div
                className={cn(
                  "flex items-start",
                  isLight ? "text-slate-600" : "text-white/70",
                )}
              >
                <MapPin className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                <span>{COMPANY_ADDRESS}</span>
              </div>
            </div>
          </div>

          <FooterLinkGroup title="고객 지원" links={support} isLight={isLight} />
          <FooterLinkGroup title="약관 및 정책" links={legal} isLight={isLight} />
        </div>

        <div
          className={cn(
            "mt-8 border-t pt-8",
            isLight ? "border-slate-200" : "border-white/10",
          )}
        >
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center space-x-4 md:mb-0">
              <Badge variant="secondary">한국어</Badge>
              <span
                className={cn(
                  "text-sm",
                  isLight ? "text-slate-500" : "text-white/60",
                )}
              >
                © 2026 어벗츠 주식회사. All rights reserved.
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <a
                href="https://www.instagram.com/abuts.fit"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isLight
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-white/60 hover:text-white",
                )}
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.facebook.com/abuts.fit"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isLight
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-white/60 hover:text-white",
                )}
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://x.com/abuts_fit"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isLight
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-white/60 hover:text-white",
                )}
                aria-label="X (Twitter)"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          <div
            className={cn(
              "mt-6 text-xs leading-relaxed",
              isLight ? "text-slate-500" : "text-white/60",
            )}
          >
            <div>
              {COMPANY_NAME} | 대표자: {COMPANY_CEO_NAME} | 사업자등록번호:{" "}
              {COMPANY_BUSINESS_REGISTRATION_NUMBER}
            </div>
            <div>
              주소: {COMPANY_ADDRESS} | 유선번호: {COMPANY_PHONE}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
