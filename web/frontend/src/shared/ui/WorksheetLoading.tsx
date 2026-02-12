import type { ReactNode } from "react";

export const WorksheetLoading = ({
  message = "Loading...",
  children,
}: {
  message?: string;
  children?: ReactNode;
}) => {
  return (
    <div className="flex justify-center py-8 text-slate-500">
      {children ?? message}
    </div>
  );
};
