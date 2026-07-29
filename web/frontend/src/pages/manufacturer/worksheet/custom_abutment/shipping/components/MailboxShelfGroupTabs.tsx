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
    <div className="flex flex-wrap gap-1.5 justify-center pt-1 pb-4 px-2">
      {shelfGroups.map((group, idx) => (
        <button
          key={idx}
          onClick={() => setSelectedGroupIdx(idx)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border ${
            idx === selectedGroupIdx
              ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >
          {group[0]}-{group[group.length - 1]}
        </button>
      ))}
    </div>
  );
};
