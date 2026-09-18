// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/Index.tsx
import { Navigate } from "react-router-dom";

/** 레거시 `/about` → 브랜드 랜딩 `/` */
export const AboutPage = () => <Navigate to="/" replace />;
