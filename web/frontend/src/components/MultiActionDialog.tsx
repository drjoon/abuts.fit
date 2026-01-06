import type { ReactNode } from "react";
import { X } from "lucide-react";

interface DialogAction {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}

interface MultiActionDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  actions: DialogAction[];
  onClose?: () => void;
}

const getButtonClass = (variant: DialogAction["variant"]) => {
  switch (variant) {
    case "primary":
      return "bg-blue-600 hover:bg-blue-700 text-white";
    case "danger":
      return "bg-red-500 hover:bg-red-600 text-white";
    case "ghost":
      return "bg-transparent hover:bg-gray-100 text-gray-700";
    case "secondary":
    default:
      return "bg-gray-200 hover:bg-gray-300 text-gray-800";
  }
};

export const MultiActionDialog = ({
  open,
  title,
  description,
  actions,
  onClose,
}: MultiActionDialogProps) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform transition-all relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-xl font-bold mb-4 text-gray-900 flex-none">
          {title}
        </h2>
        {description && (
          <div className="text-gray-700 mb-6 text-sm sm:text-base overflow-y-auto flex-1 pr-1 custom-scrollbar">
            {description}
          </div>
        )}
        <div className="flex justify-end gap-3 flex-none pt-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              disabled={action.disabled}
              onClick={() => void action.onClick()}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${getButtonClass(
                action.variant
              )}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
