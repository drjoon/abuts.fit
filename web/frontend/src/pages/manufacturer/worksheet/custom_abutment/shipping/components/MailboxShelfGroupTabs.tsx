// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
type MailboxShelfGroupTabsProps = {
  shelfGroups: string[][];
  selectedGroupIdx: number;
  setSelectedGroupIdx: (idx: number) => void;
};

export const MailboxShelfGroupTabs = ({
  shelfGroups,
  selectedGroupIdx,
  setSelectedGroupIdx,
}: MailboxShelfGroupTabsProps) => {
  return (
    <div className="flex flex-wrap gap-1 justify-start">
      {shelfGroups.map((group, idx) => (
        <button
          key={idx}
          onClick={() => setSelectedGroupIdx(idx)}
          className={`px-2 py-0.5 text-[11px] font-semibold rounded-full transition-colors border ${
            idx === selectedGroupIdx
              ? "bg-primary-soft text-primary-strong border-primary-muted"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >
          {group[0]}-{group[group.length - 1]}
        </button>
      ))}
    </div>
  );
};
