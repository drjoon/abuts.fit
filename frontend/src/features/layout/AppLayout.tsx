import type { ReactNode } from "react";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <main>{children}</main>
    </div>
  );
};
