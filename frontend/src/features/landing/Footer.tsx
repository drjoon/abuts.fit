import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Instagram, Facebook } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";
import {
  COMPANY_ADDRESS,
  COMPANY_PHONE,
  CONTACT_EMAIL,
} from "@/shared/lib/contactInfo";

export const Footer = () => {
  const support = [
    { label: "도움말 센터", href: "/help" },
    { label: "문의하기", href: "/contact" },
    { label: "보안 정책", href: "/security" },
  ];

  const legal = [
    { label: "이용약관", href: "/terms" },
    { label: "개인정보처리방침", href: "/privacy" },
    { label: "쿠키 정책", href: "/cookies" },
    { label: "사업자 정보", href: "/business" },
  ];

  return (
    <footer className="bg-background border-t border-border">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2">
            <div
              className="flex items-center space-x-3 mb-6 cursor-pointer"
              onClick={() => (window.location.href = "/")}
            >
              <img src={logo} alt="Abuts.fit" className="h-8 w-8" />
              <span className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
                abuts.fit
              </span>
            </div>

            <p className="text-muted-foreground mb-6 leading-relaxed">
              어벗츠 주식회사가 제공하는 커스텀 어벗 의뢰 플랫폼입니다. 커스텀
              어벗먼트 제조는 애크로덴트가 단독으로 담당합니다.
            </p>

            <div className="space-y-3">
              <div className="flex items-center text-muted-foreground">
                <Mail className="w-4 h-4 mr-2" />
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="hover:text-foreground transition-colors"
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
              <div className="flex items-center text-muted-foreground">
                <Phone className="w-4 h-4 mr-2" />
                <a
                  href={`tel:${COMPANY_PHONE}`}
                  className="hover:text-foreground transition-colors"
                >
                  {COMPANY_PHONE}
                </a>
              </div>
              <div className="flex items-center text-muted-foreground">
                <MapPin className="w-4 h-4 mr-2" />
                <span>{COMPANY_ADDRESS}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">고객 지원</h3>
            <ul className="space-y-3">
              {support.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">약관 및 정책</h3>
            <ul className="space-y-3">
              {legal.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <Badge variant="secondary">한국어</Badge>
              <span className="text-muted-foreground text-sm">
                © 2025 어벗츠 주식회사. All rights reserved.
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <a
                href="https://www.instagram.com/abuts.fit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://www.facebook.com/abuts.fit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href="https://x.com/abuts_fit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="X (Twitter)"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
