interface TypingIndicatorProps {
  userName?: string;
  show: boolean;
}

export function TypingIndicator({ userName, show }: TypingIndicatorProps) {
  if (!show) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
      <div className="flex gap-1">
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span>{userName || "상대방"}이(가) 입력 중...</span>
    </div>
  );
}
