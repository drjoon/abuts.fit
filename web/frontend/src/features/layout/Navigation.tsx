import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import logo from "@/assets/logo.png";

export const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();

  const menuItems: { label: string; href: string }[] = [];

  const handleMenuClick = (href: string) => {
    if (href.startsWith("#")) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
    setIsOpen(false);
  };

  const handleLoginClick = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/login");
    }
  };

  const handleSignupClick = () => {
    navigate("/signup");
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 w-full z-50">
      <div className="absolute inset-0 bg-[#030711]/55 backdrop-blur-2xl border-b border-white/10" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_0%,rgba(59,130,246,0.18),transparent_60%),radial-gradient(circle_at_85%_0%,rgba(168,85,247,0.14),transparent_62%)] opacity-60" />
      <div className="container mx-auto px-4">
        <div className="relative flex items-center justify-between h-16">
          <button
            className="flex items-center gap-3 text-white transition hover:opacity-90"
            onClick={() => navigate("/")}
          >
            <img
              src={logo}
              alt="Abuts.fit"
              className="h-12 w-12 object-contain"
              style={{ backgroundColor: "transparent" }}
            />
            <span className="text-2xl font-semibold bg-gradient-to-r from-[#6E8BFF] via-[#A278FF] to-[#FF9D62] bg-clip-text text-transparent">
              abuts.fit
            </span>
          </button>

          <div className="hidden md:flex items-center space-x-8">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item.href)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-white/70">
                  안녕하세요, {user?.name}님
                </span>
                <Button
                  variant="ghost"
                  className="text-white"
                  onClick={handleLoginClick}
                >
                  대시보드
                </Button>
                <Button
                  className="bg-gradient-to-r from-[#FF9D62] via-[#FF814A] to-[#FF6B4A] text-white shadow-[0_10px_30px_rgba(255,132,74,0.35)] hover:opacity-90"
                  onClick={handleLogout}
                >
                  로그아웃
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="text-white"
                  onClick={handleLoginClick}
                >
                  로그인
                </Button>
                <Button
                  className="bg-white text-slate-900 hover:bg-white/90"
                  onClick={handleSignupClick}
                >
                  회원가입
                </Button>
              </>
            )}
          </div>

          <button
            className="md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="메뉴 토글"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden py-4 space-y-4">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item.href)}
                className="block text-muted-foreground hover:text-foreground transition-colors text-left w-full"
              >
                {item.label}
              </button>
            ))}
            <div className="pt-4 space-y-2">
              {isAuthenticated ? (
                <>
                  <div className="text-sm text-white/80 text-center mb-2">
                    안녕하세요, {user?.name}님
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full text-white"
                    onClick={handleLoginClick}
                  >
                    대시보드
                  </Button>
                  <Button
                    className="w-full bg-gradient-to-r from-[#FF9D62] via-[#FF814A] to-[#FF6B4A] text-white shadow-[0_10px_30px_rgba(255,132,74,0.35)] hover:opacity-90"
                    onClick={handleLogout}
                  >
                    로그아웃
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="w-full text-white"
                    onClick={handleLoginClick}
                  >
                    로그인
                  </Button>
                  <Button
                    className="w-full bg-white text-slate-900 hover:bg-white/90"
                    onClick={handleSignupClick}
                  >
                    회원가입
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
