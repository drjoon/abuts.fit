import type { ReactNode } from "react";

type MailboxStickyHeaderProps = {
  children: ReactNode;
};

export const MailboxStickyHeader = ({ children }: MailboxStickyHeaderProps) => {
  return (
    <div className="flex-shrink-0 w-full sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      {children}
    </div>
  );
};
